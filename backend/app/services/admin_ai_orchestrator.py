from __future__ import annotations

import json
import re
import uuid
import logging
from enum import Enum
from typing import Literal, Protocol, TypeAlias, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic_core import PydanticCustomError

from app.core.enums import RoleName
from app.services.admin_ai_capability_registry import (
    AdminAIExecutionRequirement,
    AdminAICapabilityRegistry,
    CapabilityAuthorizationPolicy,
)
from app.services.admin_ai_read_capabilities import (
    AdminAIReadCapabilityExecutor,
    AggregateQuestionStatisticsInput,
    InspectCurrentQuestionInput,
    SearchQuestionsInput,
)
from app.services.admin_ai_planner_grounding import (
    AdminAIPlannerCatalogGrounding,
    AdminAIPlannerCurrentRevisionService,
    AdminAIPlannerCurrentRevisionGroundingError,
)
from app.services.admin_ai_validation_diagnostic import (
    AdminAIValidationCategory,
    AdminAIValidationDiagnostic,
    AdminAIValidationStage,
)
from app.services.admin_ai_capability_registry import UnknownAdminAICapabilityError


logger = logging.getLogger(__name__)
from app.services.admin_ai_result import (
    AdminAICapabilityResult,
    AdminAIResultEnvelope,
    AdminAISourceSnapshot,
    AdminAIWarning,
    CapabilityClassification,
)

ADMIN_AI_MAX_PLAN_CALLS = 8
ADMIN_AI_MAX_READ_CALLS = 8
ADMIN_AI_MAX_DECLARED_RESULT_BUDGET = 400
ADMIN_AI_MAX_INSTRUCTION_CHARS = 10_000
ADMIN_AI_MAX_ANSWER_CHARS = 20_000
ADMIN_AI_MAX_CONVERSATION_TURNS = 8
ADMIN_AI_MAX_CONVERSATION_TURN_CHARS = 4_000
ADMIN_AI_MAX_CONVERSATION_CHARS = 24_000
ADMIN_AI_MAX_HOST_CONTEXT_BYTES = 64_000

_RAW_MATH_DELIMITER_PATTERN = re.compile(
    r"\\\(|\\\)|\\\[|\\\]|\$\$[^$]+\$\$|(?<!\$)\$[^$\r\n]+\$(?!\$)"
)
_RAW_MATH_COMMAND_PATTERN = re.compile(
    r"\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|lim|begin|end)\s*(?:\{|_)"
)


def _contains_raw_user_visible_math(value: str) -> bool:
    return bool(
        _RAW_MATH_DELIMITER_PATTERN.search(value)
        or _RAW_MATH_COMMAND_PATTERN.search(value)
    )


def _validate_plain_assistant_text(value: str) -> str:
    if _contains_raw_user_visible_math(value):
        raise ValueError("Assistant prose must place mathematical notation in math segments.")
    return value


def _validate_assistant_fallback_text(
    value: str, structured_content: "AdminAIAssistantContent | None",
) -> str:
    # Legacy answer_text is not rendered when canonical structured content exists.
    # Keep it strict whenever it is the actual user-visible fallback.
    if structured_content is None:
        _validate_plain_assistant_text(value)
    return value


class StrictOrchestratorModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AdminAIFinalResultStrategy(str, Enum):
    COMBINE_INFORMATIONAL = "combine_informational"


class AdminAIContextRequirement(str, Enum):
    NONE = "none"
    CURRENT_QUESTION = "current_question"


class AdminAIAssistantTextSegment(StrictOrchestratorModel):
    type: Literal["text"]
    text: str = Field(min_length=1, max_length=10_000)

    @model_validator(mode="after")
    def text_contains_no_provider_markup(self) -> "AdminAIAssistantTextSegment":
        if "&#" in self.text or "```" in self.text:
            raise ValueError("Assistant text cannot contain encoded HTML or code fences.")
        _validate_plain_assistant_text(self.text)
        return self


class AdminAIAssistantMathSegment(StrictOrchestratorModel):
    type: Literal["math"]
    latex: str = Field(min_length=1, max_length=10_000)
    source_text: str = Field(min_length=1, max_length=10_000)
    display_mode: bool

    @model_validator(mode="after")
    def math_is_safe_serialized_latex(self) -> "AdminAIAssistantMathSegment":
        if any(token in self.latex for token in ("<", ">", "&#", "```")):
            raise ValueError("Assistant math must be safe serialized LaTeX.")
        if "$" in self.latex or any(
            delimiter in self.latex for delimiter in (r"\(", r"\)", r"\[", r"\]")
        ):
            raise ValueError("Assistant math segments cannot contain LaTeX delimiters.")
        return self


AdminAIAssistantSegment: TypeAlias = AdminAIAssistantTextSegment | AdminAIAssistantMathSegment


class AdminAIAssistantContent(StrictOrchestratorModel):
    format_version: Literal[1]
    segments: tuple[AdminAIAssistantSegment, ...] = Field(min_length=1, max_length=100)


class AdminAIConversationTurn(StrictOrchestratorModel):
    role: Literal["admin", "assistant"]
    content: str = Field(min_length=1, max_length=ADMIN_AI_MAX_CONVERSATION_TURN_CHARS)


class AdminAIConversationContext(StrictOrchestratorModel):
    turns: tuple[AdminAIConversationTurn, ...] = Field(max_length=ADMIN_AI_MAX_CONVERSATION_TURNS)
    referenced_draft: "AdminAIGeneratedDraft | None" = None

    @model_validator(mode="after")
    def total_content_is_bounded(self) -> "AdminAIConversationContext":
        if sum(len(turn.content) for turn in self.turns) > ADMIN_AI_MAX_CONVERSATION_CHARS:
            raise ValueError("Conversation context exceeds the total content limit.")
        return self


class AdminAIHostContext(StrictOrchestratorModel):
    context_type: Literal["question_revision"]
    revision_id: uuid.UUID
    question_type_id: uuid.UUID
    question_type_name: str = Field(min_length=1, max_length=100)
    inspect_result: AdminAICapabilityResult

    @model_validator(mode="after")
    def inspect_result_matches_host(self) -> "AdminAIHostContext":
        if self.inspect_result.capability_name != "admin_ai.inspect_current_question":
            raise ValueError("Host context must use the canonical inspect projection.")
        serialized = json.dumps(
            self.inspect_result.model_dump(mode="json"), ensure_ascii=False,
            sort_keys=True, separators=(",", ":"),
        )
        if len(serialized.encode("utf-8")) > ADMIN_AI_MAX_HOST_CONTEXT_BYTES:
            raise ValueError("Host context exceeds the bounded payload limit.")
        return self


class AdminAIDraftAnswerOption(StrictOrchestratorModel):
    label: str = Field(min_length=1, max_length=20)
    text: str = Field(min_length=1, max_length=2_000)
    content: AdminAIAssistantContent | None

    @model_validator(mode="after")
    def fallback_text_has_no_raw_math(self) -> "AdminAIDraftAnswerOption":
        _validate_plain_assistant_text(self.text)
        return self


class AdminAIGeneratedDraft(StrictOrchestratorModel):
    draft_kind: Literal["question", "explanation", "solution", "lesson_fragment", "other"]
    format_hint: Literal["free_form", "multiple_choice"]
    title: str | None = Field(max_length=500)
    content: AdminAIAssistantContent
    answer_options: tuple[AdminAIDraftAnswerOption, ...] = Field(max_length=20)
    correct_option_labels: tuple[str, ...] = Field(max_length=20)
    explanation: AdminAIAssistantContent | None
    is_canonical: Literal[False]

    @model_validator(mode="after")
    def draft_is_internally_consistent(self) -> "AdminAIGeneratedDraft":
        labels = [option.label for option in self.answer_options]
        if len(labels) != len(set(labels)):
            raise ValueError("Draft answer-option labels must be unique.")
        if any(label not in set(labels) for label in self.correct_option_labels):
            raise ValueError("Draft correct-option labels must reference draft options.")
        if self.format_hint == "multiple_choice":
            if len(self.answer_options) < 2 or len(self.correct_option_labels) != 1:
                raise ValueError("Multiple-choice drafts require options and exactly one correct label.")
        elif self.answer_options or self.correct_option_labels:
            raise ValueError("Free-form drafts cannot contain multiple-choice fields.")
        return self


AdminAIConversationContext.model_rebuild()


class AdminAICapabilityPlanCall(StrictOrchestratorModel):
    call_id: str = Field(pattern=r"^call_[1-9][0-9]{0,2}$")
    capability_name: str = Field(pattern=r"^[a-z][a-z0-9_.]{0,99}$")
    capability_version: int = Field(gt=0)
    input_payload: InspectCurrentQuestionInput | SearchQuestionsInput | AggregateQuestionStatisticsInput
    depends_on: tuple[str, ...] = ()


class AdminAICapabilityPlan(StrictOrchestratorModel):
    schema_version: Literal[1] = 1
    calls: tuple[AdminAICapabilityPlanCall, ...] = Field(
        min_length=1, max_length=ADMIN_AI_MAX_PLAN_CALLS,
    )
    final_result_strategy: Literal[AdminAIFinalResultStrategy.COMBINE_INFORMATIONAL]

    @model_validator(mode="after")
    def validate_ordered_dependencies(self) -> "AdminAICapabilityPlan":
        identifiers = [call.call_id for call in self.calls]
        if len(identifiers) != len(set(identifiers)):
            raise PydanticCustomError("duplicate_call_id", "Plan call IDs must be unique.")
        completed: set[str] = set()
        for call in self.calls:
            if len(call.depends_on) != len(set(call.depends_on)):
                raise PydanticCustomError("dependency_order_invalid", "Plan dependencies must be unique.")
            if any(dependency not in completed for dependency in call.depends_on):
                raise PydanticCustomError("dependency_order_invalid", "Dependencies must reference earlier calls only.")
            completed.add(call.call_id)
        return self


class AdminAIPlannerResponse(StrictOrchestratorModel):
    """Strict provider decision; tools are optional and never self-authorizing."""

    schema_version: Literal[1]
    outcome_kind: Literal["direct_answer", "plan", "mutation_proposal", "unsupported"]
    context_requirement: AdminAIContextRequirement
    requirements: tuple[AdminAIExecutionRequirement, ...] = Field(min_length=1, max_length=8)
    answer_text: str | None = Field(min_length=1, max_length=ADMIN_AI_MAX_ANSWER_CHARS)
    assistant_content: AdminAIAssistantContent | None = None
    generated_draft: AdminAIGeneratedDraft | None = None
    plan: AdminAICapabilityPlan | None
    mutation_code: Literal["admin_approval_required"] | None
    unsupported_code: Literal["capability_unavailable"] | None

    @model_validator(mode="after")
    def outcome_is_consistent(self) -> "AdminAIPlannerResponse":
        if len(self.requirements) != len(set(self.requirements)):
            raise PydanticCustomError("requirements_invalid", "Execution requirements must be unique.")
        has_current_requirement = AdminAIExecutionRequirement.CURRENT_QUESTION_CONTENT in self.requirements
        if has_current_requirement != (self.context_requirement == AdminAIContextRequirement.CURRENT_QUESTION):
            raise PydanticCustomError("requirements_invalid", "Current-question requirement fields are inconsistent.")
        has_mutation_requirement = AdminAIExecutionRequirement.PLATFORM_MUTATION in self.requirements
        if has_mutation_requirement != (self.outcome_kind == "mutation_proposal"):
            raise PydanticCustomError("requirements_invalid", "Mutation requirement fields are inconsistent.")
        if self.outcome_kind == "plan":
            if self.plan is None or any((self.answer_text, self.mutation_code, self.unsupported_code)):
                raise PydanticCustomError("plan_outcome_invalid", "Plan outcome fields are inconsistent.")
        elif self.outcome_kind == "direct_answer":
            if self.answer_text is None or any((self.plan, self.mutation_code, self.unsupported_code)):
                raise PydanticCustomError("direct_answer_outcome_invalid", "Direct-answer fields are inconsistent.")
        elif self.outcome_kind == "mutation_proposal":
            if self.answer_text is None:
                raise PydanticCustomError("mutation_proposal_answer_missing", "Mutation-proposal fields are inconsistent.")
            if self.mutation_code is None:
                raise PydanticCustomError("mutation_proposal_code_missing", "Mutation-proposal fields are inconsistent.")
            if self.plan is not None:
                raise PydanticCustomError("mutation_proposal_plan_present", "Mutation-proposal fields are inconsistent.")
            if self.unsupported_code is not None:
                raise PydanticCustomError("mutation_proposal_unsupported_present", "Mutation-proposal fields are inconsistent.")
        elif self.plan is not None or self.unsupported_code is None or self.answer_text is not None or self.mutation_code is not None:
            raise PydanticCustomError("unsupported_outcome_invalid", "Unsupported outcome fields are inconsistent.")
        if self.answer_text is not None:
            _validate_assistant_fallback_text(self.answer_text, self.assistant_content)
        return self


AdminAIPlannerResult: TypeAlias = AdminAICapabilityPlan | AdminAIPlannerResponse


class AdminAIPlanningRequest(StrictOrchestratorModel):
    instruction: str = Field(min_length=1, max_length=ADMIN_AI_MAX_INSTRUCTION_CHARS)
    current_revision_id: uuid.UUID | None = None
    current_question_type_id: uuid.UUID | None = None
    host_context: AdminAIHostContext | None = None
    conversation_context: AdminAIConversationContext | None = None

    @model_validator(mode="after")
    def current_type_requires_revision(self) -> "AdminAIPlanningRequest":
        if self.current_question_type_id is not None and self.current_revision_id is None:
            raise ValueError("Current question type requires current revision identity.")
        if self.host_context is not None and self.host_context.revision_id != self.current_revision_id:
            raise ValueError("Host context must match the current revision identity.")
        return self


class AdminAICapabilityManifestEntry(StrictOrchestratorModel):
    capability_name: str
    capability_version: int
    classification: Literal[CapabilityClassification.READ_ONLY]
    safe_description: str
    effect_scope: str
    input_schema: dict[str, object]
    result_limit: int
    satisfies_requirements: tuple[AdminAIExecutionRequirement, ...]


@runtime_checkable
class AdminAIPlanner(Protocol):
    def plan(
        self, *, request: AdminAIPlanningRequest,
        capability_manifest: tuple[AdminAICapabilityManifestEntry, ...],
        catalog_grounding: AdminAIPlannerCatalogGrounding,
    ) -> AdminAIPlannerResult:
        ...


class AdminAIAnswerSynthesisRequest(StrictOrchestratorModel):
    instruction: str = Field(min_length=1, max_length=ADMIN_AI_MAX_INSTRUCTION_CHARS)
    capability_results: tuple[AdminAICapabilityResult, ...] = Field(
        min_length=1, max_length=ADMIN_AI_MAX_READ_CALLS,
    )
    unmet_requirements: tuple[AdminAIExecutionRequirement, ...] = ()
    host_context: AdminAIHostContext | None = None
    conversation_context: AdminAIConversationContext | None = None


class AdminAIAnswerSynthesis(StrictOrchestratorModel):
    schema_version: Literal[1]
    answer_text: str = Field(min_length=1, max_length=ADMIN_AI_MAX_ANSWER_CHARS)
    assistant_content: AdminAIAssistantContent | None = None
    generated_draft: AdminAIGeneratedDraft | None = None

    @model_validator(mode="after")
    def fallback_text_has_no_raw_math(self) -> "AdminAIAnswerSynthesis":
        _validate_assistant_fallback_text(self.answer_text, self.assistant_content)
        return self


class AdminAIAnswerFallbackRequest(StrictOrchestratorModel):
    instruction: str = Field(min_length=1, max_length=ADMIN_AI_MAX_INSTRUCTION_CHARS)
    grounding_results: tuple[AdminAICapabilityResult, ...] = Field(max_length=ADMIN_AI_MAX_READ_CALLS)
    host_context: AdminAIHostContext | None = None
    conversation_context: AdminAIConversationContext | None = None


class AdminAIAnswerFallbackResponse(StrictOrchestratorModel):
    schema_version: Literal[1]
    outcome_kind: Literal["direct_answer", "mutation_proposal"]
    requirements: tuple[AdminAIExecutionRequirement, ...] = Field(min_length=1, max_length=8)
    context_requirement: AdminAIContextRequirement
    answer_text: str = Field(min_length=1, max_length=ADMIN_AI_MAX_ANSWER_CHARS)
    assistant_content: AdminAIAssistantContent | None = None
    generated_draft: AdminAIGeneratedDraft | None = None
    mutation_code: Literal["admin_approval_required"] | None

    @model_validator(mode="after")
    def fallback_shape_is_consistent(self) -> "AdminAIAnswerFallbackResponse":
        if len(self.requirements) != len(set(self.requirements)):
            raise ValueError("Fallback requirements must be unique.")
        has_mutation = AdminAIExecutionRequirement.PLATFORM_MUTATION in self.requirements
        if has_mutation != (self.outcome_kind == "mutation_proposal"):
            raise ValueError("Fallback mutation fields are inconsistent.")
        if (self.mutation_code is not None) != has_mutation:
            raise ValueError("Fallback mutation code is inconsistent.")
        has_current = AdminAIExecutionRequirement.CURRENT_QUESTION_CONTENT in self.requirements
        if has_current != (self.context_requirement == AdminAIContextRequirement.CURRENT_QUESTION):
            raise ValueError("Fallback current-question fields are inconsistent.")
        if self.generated_draft is not None and AdminAIExecutionRequirement.CONTENT_GENERATION not in self.requirements:
            raise ValueError("Generated drafts require content generation.")
        _validate_assistant_fallback_text(self.answer_text, self.assistant_content)
        return self


@runtime_checkable
class AdminAIAnswerSynthesizer(Protocol):
    def synthesize(self, *, request: AdminAIAnswerSynthesisRequest) -> AdminAIAnswerSynthesis:
        ...


@runtime_checkable
class AdminAIAnswerFallbackProvider(Protocol):
    def answer_without_tools(
        self, *, request: AdminAIAnswerFallbackRequest,
    ) -> AdminAIAnswerFallbackResponse:
        ...


@runtime_checkable
class AdminAIMutationProposalPersister(Protocol):
    def create_from_generated_draft(
        self, *, host_context: AdminAIHostContext, draft: AdminAIGeneratedDraft,
        requested_by_user_id: uuid.UUID,
    ) -> object:
        ...


class AdminAIExecutionOutcome(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class AdminAICallExecutionTrace(StrictOrchestratorModel):
    call_id: str
    capability_name: str
    capability_version: int
    outcome: AdminAIExecutionOutcome
    result_item_count: int | None = Field(default=None, ge=0)


class AdminAIOrchestrationResult(StrictOrchestratorModel):
    response_kind: Literal["direct_answer", "tool_assisted_answer", "mutation_proposal", "unsupported"]
    assistant_text: str = Field(min_length=1, max_length=ADMIN_AI_MAX_ANSWER_CHARS)
    assistant_content: AdminAIAssistantContent | None
    generated_draft: AdminAIGeneratedDraft | None
    limitation_code: Literal["capability_unavailable"] | None
    fulfillment_status: Literal["complete", "partial", "unavailable"]
    unmet_requirements: tuple[AdminAIExecutionRequirement, ...]
    envelope: AdminAIResultEnvelope
    execution_trace: tuple[AdminAICallExecutionTrace, ...]
    proposal_id: uuid.UUID | None = None
    proposal_status: Literal["pending", "accepted", "rejected", "obsolete"] | None = None
    persistent_draft_id: uuid.UUID | None = None
    persistent_draft_status: Literal["active", "promoted", "discarded"] | None = None


class AdminAIOrchestratorError(Exception):
    pass


class AdminAIOptionalPlanningError(Exception):
    """A provider decision-shape failure that carries no executable authority."""


class AdminAIPlanValidationError(AdminAIOrchestratorError):
    def __init__(self, diagnostic: AdminAIValidationDiagnostic) -> None:
        super().__init__("Admin AI capability plan is invalid.")
        self.diagnostic = diagnostic


class AdminAIOrchestrationAuthorizationError(AdminAIOrchestratorError):
    pass


class AdminAIOrchestrationExecutionError(AdminAIOrchestratorError):
    def __init__(self, message: str, *, execution_trace: tuple[AdminAICallExecutionTrace, ...]) -> None:
        super().__init__(message)
        self.execution_trace = execution_trace


def build_safe_capability_manifest(
    registry: AdminAICapabilityRegistry,
) -> tuple[AdminAICapabilityManifestEntry, ...]:
    return tuple(
        AdminAICapabilityManifestEntry(
            capability_name=definition.name,
            capability_version=definition.version,
            classification=CapabilityClassification.READ_ONLY,
            safe_description=definition.safe_description,
            effect_scope=definition.effect_scope.value,
            input_schema=definition.input_schema.model_json_schema(),
            result_limit=definition.result_limit or 1,
            satisfies_requirements=definition.satisfies_requirements,
        )
        for definition in registry.definitions()
        if definition.classification == CapabilityClassification.READ_ONLY
        and definition.execution_handler_id is not None
    )


class AdminAIOrchestrator:
    """Validates a complete read-only plan before explicit allowlisted dispatch."""

    def __init__(
        self, *, planner: AdminAIPlanner, registry: AdminAICapabilityRegistry,
        read_executor: AdminAIReadCapabilityExecutor,
        synthesizer: AdminAIAnswerSynthesizer | None = None,
        catalog_grounding: AdminAIPlannerCatalogGrounding | None = None,
        current_revision_service: AdminAIPlannerCurrentRevisionService | None = None,
        mutation_proposal_persister: AdminAIMutationProposalPersister | None = None,
    ) -> None:
        self._planner = planner
        self._registry = registry
        self._read_executor = read_executor
        self._synthesizer = synthesizer
        self._catalog_grounding = catalog_grounding or AdminAIPlannerCatalogGrounding()
        self._current_revision_service = current_revision_service
        self._mutation_proposal_persister = mutation_proposal_persister
        self.last_failure_diagnostic: AdminAIValidationDiagnostic | None = None

    def run(
        self, *, actor_role: RoleName, instruction: str,
        current_revision_id: uuid.UUID | None = None,
        conversation_context: AdminAIConversationContext | None = None,
        actor_user_id: uuid.UUID | None = None,
    ) -> AdminAIOrchestrationResult:
        self._require_admin(actor_role)
        current_question_type_id: uuid.UUID | None = None
        host_context: AdminAIHostContext | None = None
        host_envelope: AdminAIResultEnvelope | None = None
        hydrate_host = getattr(type(self._read_executor), "hydrate_question_revision_host_context", None)
        if current_revision_id is not None and hydrate_host is not None:
            try:
                host_envelope = hydrate_host(
                    self._read_executor, actor_role=actor_role, revision_id=current_revision_id,
                )
                host_result = host_envelope.capability_results[0]
                raw_type_id = host_result.payload.get("question_type_id")
                current_question_type_id = uuid.UUID(str(raw_type_id))
                grounded_type = next(
                    entry for entry in self._catalog_grounding.question_types
                    if entry.id == current_question_type_id
                )
                host_context = AdminAIHostContext(
                    context_type="question_revision", revision_id=current_revision_id,
                    question_type_id=current_question_type_id,
                    question_type_name=grounded_type.name, inspect_result=host_result,
                )
            except Exception as exc:
                self._fail(
                    AdminAIValidationCategory.GROUNDING_MISSING,
                    AdminAIValidationStage.GROUNDING_VALIDATION,
                    cause=exc,
                )
        elif current_revision_id is not None and self._current_revision_service is not None:
            try:
                current = self._current_revision_service.resolve(revision_id=current_revision_id)
            except AdminAIPlannerCurrentRevisionGroundingError as exc:
                self._fail(
                    AdminAIValidationCategory.GROUNDING_MISSING,
                    AdminAIValidationStage.GROUNDING_VALIDATION,
                    cause=exc,
                )
            current_question_type_id = current.question_type_id
            if current_question_type_id not in {entry.id for entry in self._catalog_grounding.question_types}:
                self._fail(
                    AdminAIValidationCategory.GROUNDING_ID_INVALID,
                    AdminAIValidationStage.GROUNDING_VALIDATION,
                )
        request = AdminAIPlanningRequest(
            instruction=instruction, current_revision_id=current_revision_id,
            current_question_type_id=current_question_type_id,
            host_context=host_context, conversation_context=conversation_context,
        )
        manifest = build_safe_capability_manifest(self._registry)
        try:
            raw_planning_result = self._planner.plan(
                request=request, capability_manifest=manifest,
                catalog_grounding=self._catalog_grounding,
            )
        except AdminAIOptionalPlanningError as exc:
            fallback = self._try_answer_fallback(
                instruction=instruction,
                grounding_results=((host_context.inspect_result,) if host_context else ()),
                host_context=host_context, conversation_context=conversation_context,
                source_snapshots=(host_envelope.source_snapshots if host_envelope else ()),
                actor_user_id=actor_user_id,
            )
            if fallback is not None:
                return fallback
            raise exc
        declared_requirements: tuple[AdminAIExecutionRequirement, ...] = ()
        try:
            if isinstance(raw_planning_result, AdminAIPlannerResponse) or (
                isinstance(raw_planning_result, dict) and "outcome_kind" in raw_planning_result
            ):
                planning_result = AdminAIPlannerResponse.model_validate(raw_planning_result)
                declared_requirements = planning_result.requirements
                requires_current_question = (
                    planning_result.context_requirement == AdminAIContextRequirement.CURRENT_QUESTION
                )
                if requires_current_question and current_revision_id is None:
                    self._fail(
                        AdminAIValidationCategory.GROUNDING_MISSING,
                        AdminAIValidationStage.GROUNDING_VALIDATION,
                    )
                if planning_result.outcome_kind == "direct_answer" and not requires_current_question:
                    if any(
                        requirement not in {
                            AdminAIExecutionRequirement.MODEL_REASONING,
                            AdminAIExecutionRequirement.CONTENT_GENERATION,
                        }
                        for requirement in planning_result.requirements
                    ):
                        self._fail(
                            AdminAIValidationCategory.CAPABILITY_INPUT_INVALID,
                            AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION,
                        )
                    self._validate_generated_draft_requirement(
                        requirements=planning_result.requirements,
                        generated_draft=planning_result.generated_draft,
                    )
                    assert planning_result.answer_text is not None
                    return AdminAIOrchestrationResult(
                        response_kind="direct_answer", assistant_text=planning_result.answer_text,
                        assistant_content=planning_result.assistant_content,
                        generated_draft=planning_result.generated_draft,
                        limitation_code=None,
                        fulfillment_status="complete", unmet_requirements=(),
                        envelope=AdminAIResultEnvelope(
                            schema_version=1, result_kind="informational",
                            capability_results=(), source_snapshots=(), warnings=(),
                        ), execution_trace=(),
                    )
                if planning_result.outcome_kind == "mutation_proposal" and not requires_current_question:
                    assert planning_result.answer_text is not None
                    return AdminAIOrchestrationResult(
                        response_kind="mutation_proposal", assistant_text=planning_result.answer_text,
                        assistant_content=planning_result.assistant_content,
                        generated_draft=planning_result.generated_draft,
                        limitation_code="capability_unavailable",
                        fulfillment_status="unavailable",
                        unmet_requirements=(AdminAIExecutionRequirement.PLATFORM_MUTATION,),
                        envelope=AdminAIResultEnvelope(
                            schema_version=1, result_kind="unsupported",
                            capability_results=(), source_snapshots=(), warnings=(),
                            unsupported_reason="Dəyişiklik üçün Admin tərəfindən yoxlanılan təklif axını hələ qoşulmayıb.",
                        ), execution_trace=(),
                    )
                if planning_result.outcome_kind == "unsupported":
                    globally_available = self._globally_available_requirements()
                    unavailable_requirements = tuple(
                        requirement for requirement in planning_result.requirements
                        if requirement not in globally_available
                    )
                    if not unavailable_requirements:
                        self._fail(
                            AdminAIValidationCategory.CAPABILITY_INPUT_INVALID,
                            AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION,
                        )
                    return AdminAIOrchestrationResult(
                        response_kind="unsupported",
                        assistant_text="Bu əməliyyatı mövcud imkanlarla təhlükəsiz şəkildə yerinə yetirmək mümkün deyil.",
                        assistant_content=None, generated_draft=None,
                        limitation_code="capability_unavailable",
                        fulfillment_status="unavailable",
                        unmet_requirements=unavailable_requirements,
                        envelope=AdminAIResultEnvelope(
                            schema_version=1, result_kind="unsupported",
                            capability_results=(), source_snapshots=(), warnings=(),
                            unsupported_reason="Bu əməliyyatı mövcud imkanlarla təhlükəsiz şəkildə yerinə yetirmək mümkün deyil.",
                        ), execution_trace=(),
                    )
                if planning_result.outcome_kind in {"direct_answer", "mutation_proposal"}:
                    assert current_revision_id is not None
                    plan = AdminAICapabilityPlan(
                        schema_version=1,
                        calls=(AdminAICapabilityPlanCall(
                            call_id="call_1",
                            capability_name="admin_ai.inspect_current_question",
                            capability_version=1,
                            input_payload=InspectCurrentQuestionInput(revision_id=current_revision_id),
                            depends_on=(),
                        ),),
                        final_result_strategy=AdminAIFinalResultStrategy.COMBINE_INFORMATIONAL,
                    )
                    requested_response_kind = planning_result.outcome_kind
                else:
                    assert planning_result.plan is not None
                    plan = planning_result.plan
                    requested_response_kind = "plan"
            else:
                plan = AdminAICapabilityPlan.model_validate(raw_planning_result)
                requires_current_question = False
                requested_response_kind = "plan"
        except ValidationError as exc:
            fallback = (
                self._try_answer_fallback(
                    instruction=instruction,
                    grounding_results=((host_context.inspect_result,) if host_context else ()),
                    host_context=host_context, conversation_context=conversation_context,
                    source_snapshots=(host_envelope.source_snapshots if host_envelope else ()),
                    actor_user_id=actor_user_id,
                )
                if self._raw_decision_permits_fallback(raw_planning_result)
                else None
            )
            if fallback is not None:
                return fallback
            diagnostic = self._schema_diagnostic(exc)
            self._record_failure(diagnostic)
            raise AdminAIPlanValidationError(diagnostic) from exc
        self._validate_complete_plan(
            plan, actor_role=actor_role,
            required_current_revision_id=(current_revision_id if requires_current_question else None),
        )
        unmet_requirements = self._resolve_requirement_availability(
            requirements=declared_requirements,
            plan=plan,
        )

        results: list[AdminAICapabilityResult] = []
        snapshots: list[AdminAISourceSnapshot] = []
        warnings: list[AdminAIWarning] = []
        trace: list[AdminAICallExecutionTrace] = []
        for call in plan.calls:
            try:
                if (
                    host_envelope is not None
                    and call.capability_name == "admin_ai.inspect_current_question"
                    and isinstance(call.input_payload, InspectCurrentQuestionInput)
                    and call.input_payload.revision_id == current_revision_id
                ):
                    envelope = host_envelope
                else:
                    envelope = self._dispatch(call, actor_role=actor_role)
                if (
                    envelope.result_kind.value != "informational"
                    or len(envelope.capability_results) != 1
                    or envelope.capability_results[0].capability_name != call.capability_name
                    or envelope.capability_results[0].capability_version != call.capability_version
                ):
                    self._fail(AdminAIValidationCategory.RESULT_CONTRACT_INVALID, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION, call=call)
                self._registry.validate_envelope(envelope)
            except Exception as exc:
                trace.append(AdminAICallExecutionTrace(
                    call_id=call.call_id, capability_name=call.capability_name,
                    capability_version=call.capability_version,
                    outcome=AdminAIExecutionOutcome.FAILED,
                ))
                raise AdminAIOrchestrationExecutionError(
                    "A required Admin AI capability call failed.",
                    execution_trace=tuple(trace),
                ) from exc
            result_count = self._safe_result_count(envelope.capability_results[0])
            trace.append(AdminAICallExecutionTrace(
                call_id=call.call_id, capability_name=call.capability_name,
                capability_version=call.capability_version,
                outcome=AdminAIExecutionOutcome.SUCCEEDED,
                result_item_count=result_count,
            ))
            results.extend(envelope.capability_results)
            snapshots.extend(envelope.source_snapshots)
            warnings.extend(envelope.warnings)
        combined_results = tuple(results)
        if self._synthesizer is not None:
            try:
                synthesis = self._synthesizer.synthesize(request=AdminAIAnswerSynthesisRequest(
                    instruction=instruction, capability_results=combined_results,
                    unmet_requirements=unmet_requirements,
                    host_context=host_context, conversation_context=conversation_context,
                ))
            except Exception:
                fallback_result = self._try_answer_fallback(
                    instruction=instruction, grounding_results=combined_results,
                    unmet_requirements=unmet_requirements,
                    execution_trace=tuple(trace),
                    source_snapshots=tuple(snapshots), warnings=tuple(warnings),
                    host_context=host_context, conversation_context=conversation_context,
                    actor_user_id=actor_user_id,
                )
                if fallback_result is not None:
                    return fallback_result
                raise
            assistant_text = synthesis.answer_text
            assistant_content = synthesis.assistant_content
            generated_draft = synthesis.generated_draft
        else:
            assistant_text = "Sorğu üzrə platforma məlumatları yoxlanıldı; ətraflı nəticələr aşağıda göstərilir."
            assistant_content = None
            generated_draft = None
        response_kind = (
            "mutation_proposal" if requested_response_kind == "mutation_proposal"
            else "tool_assisted_answer"
        )
        self._validate_generated_draft_requirement(
            requirements=declared_requirements,
            generated_draft=generated_draft,
        )
        proposal_id: uuid.UUID | None = None
        proposal_status: Literal["pending"] | None = None
        if response_kind == "mutation_proposal" and generated_draft is not None:
            if host_context is None or actor_user_id is None or self._mutation_proposal_persister is None:
                raise AdminAIOrchestrationExecutionError(
                    "Mutation proposal persistence is unavailable.", execution_trace=tuple(trace),
                )
            try:
                proposal = self._mutation_proposal_persister.create_from_generated_draft(
                    host_context=host_context, draft=generated_draft,
                    requested_by_user_id=actor_user_id,
                )
            except Exception as exc:
                raise AdminAIOrchestrationExecutionError(
                    "Mutation proposal could not be persisted.",
                    execution_trace=tuple(trace),
                ) from exc
            proposal_id = uuid.UUID(str(getattr(proposal, "id")))
            proposal_status = "pending"
        return AdminAIOrchestrationResult(
            response_kind=response_kind, assistant_text=assistant_text,
            assistant_content=assistant_content, generated_draft=generated_draft,
            limitation_code=None,
            fulfillment_status=("partial" if unmet_requirements else "complete"),
            unmet_requirements=unmet_requirements,
            envelope=AdminAIResultEnvelope(
                schema_version=1, result_kind="informational",
                capability_results=combined_results,
                source_snapshots=tuple(snapshots), warnings=tuple(warnings),
            ), execution_trace=tuple(trace), proposal_id=proposal_id,
            proposal_status=proposal_status,
        )

    def _validate_complete_plan(
        self, plan: AdminAICapabilityPlan, *, actor_role: RoleName,
        required_current_revision_id: uuid.UUID | None = None,
    ) -> None:
        if len(plan.calls) > ADMIN_AI_MAX_READ_CALLS:
            self._fail(AdminAIValidationCategory.CALL_LIMIT_EXCEEDED, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION)
        budget = 0
        for call_index, call in enumerate(plan.calls):
            try:
                definition = self._registry.resolve(
                    name=call.capability_name, version=call.capability_version,
                )
                if definition.classification != CapabilityClassification.READ_ONLY:
                    self._fail(AdminAIValidationCategory.CAPABILITY_NOT_READ_ONLY, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION, call=call, call_index=call_index)
                if definition.authorization_policy != CapabilityAuthorizationPolicy.ADMIN_ONLY:
                    self._fail(AdminAIValidationCategory.AUTHORIZATION_POLICY_INVALID, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION, call=call, call_index=call_index)
                if definition.execution_handler_id is None:
                    self._fail(AdminAIValidationCategory.EXECUTION_HANDLER_NOT_ALLOWED, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION, call=call, call_index=call_index)
                self._registry.validate_input(
                    name=call.capability_name, version=call.capability_version,
                    payload=call.input_payload,
                )
                question_type_id = getattr(call.input_payload, "filters", None)
                question_type_id = getattr(question_type_id, "question_type_id", None)
                allowed_question_type_ids = {
                    entry.id for entry in self._catalog_grounding.question_types
                }
                if (
                    question_type_id is not None
                    and question_type_id not in allowed_question_type_ids
                ):
                    self._fail(AdminAIValidationCategory.GROUNDING_ID_INVALID, AdminAIValidationStage.GROUNDING_VALIDATION, call=call, call_index=call_index)
            except AdminAIPlanValidationError:
                raise
            except UnknownAdminAICapabilityError as exc:
                known_name = any(item.name == call.capability_name for item in self._registry.definitions())
                category = (
                    AdminAIValidationCategory.UNSUPPORTED_CAPABILITY_VERSION
                    if known_name else AdminAIValidationCategory.UNKNOWN_CAPABILITY
                )
                self._fail(category, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION, call=call, call_index=call_index, cause=exc)
            except Exception as exc:
                self._fail(AdminAIValidationCategory.CAPABILITY_INPUT_INVALID, AdminAIValidationStage.CAPABILITY_INPUT_VALIDATION, call=call, call_index=call_index, cause=exc)
            budget += definition.result_limit or 1
        if budget > ADMIN_AI_MAX_DECLARED_RESULT_BUDGET:
            self._fail(AdminAIValidationCategory.RESULT_BUDGET_EXCEEDED, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION)
        if required_current_revision_id is not None:
            grounded_inspections = [
                call for call in plan.calls
                if call.capability_name == "admin_ai.inspect_current_question"
                and call.capability_version == 1
                and isinstance(call.input_payload, InspectCurrentQuestionInput)
                and call.input_payload.revision_id == required_current_revision_id
            ]
            if not grounded_inspections:
                self._fail(
                    AdminAIValidationCategory.GROUNDING_MISSING,
                    AdminAIValidationStage.GROUNDING_VALIDATION,
                )
        self._require_admin(actor_role)

    def _resolve_requirement_availability(
        self, *, requirements: tuple[AdminAIExecutionRequirement, ...],
        plan: AdminAICapabilityPlan,
    ) -> tuple[AdminAIExecutionRequirement, ...]:
        intrinsic = self._intrinsic_requirements()
        executable_definitions = tuple(
            definition for definition in self._registry.definitions()
            if definition.execution_handler_id is not None
            and definition.classification == CapabilityClassification.READ_ONLY
        )
        globally_available = intrinsic | {
            requirement
            for definition in executable_definitions
            for requirement in definition.satisfies_requirements
        }
        used_definitions = tuple(
            self._registry.resolve(name=call.capability_name, version=call.capability_version)
            for call in plan.calls
        )
        satisfied = intrinsic | {
            requirement
            for definition in used_definitions
            for requirement in definition.satisfies_requirements
        }
        requested = set(requirements)
        missing_available = (requested & globally_available) - satisfied
        if missing_available:
            self._fail(
                AdminAIValidationCategory.CAPABILITY_INPUT_INVALID,
                AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION,
            )
        return tuple(requirement for requirement in requirements if requirement not in globally_available)

    @staticmethod
    def _intrinsic_requirements() -> set[AdminAIExecutionRequirement]:
        return {
            AdminAIExecutionRequirement.MODEL_REASONING,
            AdminAIExecutionRequirement.CONTENT_GENERATION,
        }

    def _globally_available_requirements(self) -> set[AdminAIExecutionRequirement]:
        return self._intrinsic_requirements() | {
            requirement
            for definition in self._registry.definitions()
            if definition.execution_handler_id is not None
            and definition.classification == CapabilityClassification.READ_ONLY
            for requirement in definition.satisfies_requirements
        }

    @staticmethod
    def _validate_generated_draft_requirement(
        *, requirements: tuple[AdminAIExecutionRequirement, ...],
        generated_draft: AdminAIGeneratedDraft | None,
    ) -> None:
        if generated_draft is not None and AdminAIExecutionRequirement.CONTENT_GENERATION not in requirements:
            raise AdminAIOrchestrationExecutionError(
                "Generated draft was not semantically requested.", execution_trace=(),
            )

    def _try_answer_fallback(
        self, *, instruction: str,
        grounding_results: tuple[AdminAICapabilityResult, ...],
        unmet_requirements: tuple[AdminAIExecutionRequirement, ...] = (),
        execution_trace: tuple[AdminAICallExecutionTrace, ...] = (),
        source_snapshots: tuple[AdminAISourceSnapshot, ...] = (),
        warnings: tuple[AdminAIWarning, ...] = (),
        host_context: AdminAIHostContext | None = None,
        conversation_context: AdminAIConversationContext | None = None,
        actor_user_id: uuid.UUID | None = None,
    ) -> AdminAIOrchestrationResult | None:
        provider = self._synthesizer if isinstance(self._synthesizer, AdminAIAnswerFallbackProvider) else None
        if provider is None:
            return None
        fallback = provider.answer_without_tools(request=AdminAIAnswerFallbackRequest(
            instruction=instruction, grounding_results=grounding_results,
            host_context=host_context, conversation_context=conversation_context,
        ))
        response_kind = fallback.outcome_kind
        allowed = self._intrinsic_requirements()
        if response_kind == "mutation_proposal":
            allowed.add(AdminAIExecutionRequirement.PLATFORM_MUTATION)
        if grounding_results:
            allowed.add(AdminAIExecutionRequirement.CURRENT_QUESTION_CONTENT)
        if any(requirement not in allowed for requirement in fallback.requirements):
            return None
        needs_current = AdminAIExecutionRequirement.CURRENT_QUESTION_CONTENT in fallback.requirements
        has_inspect = any(
            result.capability_name == "admin_ai.inspect_current_question"
            for result in grounding_results
        )
        if needs_current and not has_inspect:
            return None
        if fallback.generated_draft is not None and AdminAIExecutionRequirement.CONTENT_GENERATION not in fallback.requirements:
            return None
        if (
            response_kind == "mutation_proposal"
            and AdminAIExecutionRequirement.CONTENT_GENERATION not in fallback.requirements
        ):
            return None
        proposal_id: uuid.UUID | None = None
        proposal_status: Literal["pending"] | None = None
        if response_kind == "mutation_proposal":
            if (
                host_context is None or actor_user_id is None
                or (
                    fallback.generated_draft is None
                    and (conversation_context is None or conversation_context.referenced_draft is None)
                )
                or self._mutation_proposal_persister is None
            ):
                return None
            try:
                proposal_draft = fallback.generated_draft or conversation_context.referenced_draft
                assert proposal_draft is not None
                proposal = self._mutation_proposal_persister.create_from_generated_draft(
                    host_context=host_context, draft=proposal_draft,
                    requested_by_user_id=actor_user_id,
                )
            except Exception as exc:
                raise AdminAIOrchestrationExecutionError(
                    "Mutation proposal could not be persisted.",
                    execution_trace=execution_trace,
                ) from exc
            proposal_id = uuid.UUID(str(getattr(proposal, "id")))
            proposal_status = "pending"
        status = "partial" if unmet_requirements else "complete"
        logger.warning(
            "admin_ai_answer_fallback_selected",
            extra={
                "grounded": bool(grounding_results),
                "fulfillment_status": status,
                "capability_result_count": len(grounding_results),
                "outcome_kind": response_kind,
                "requirement_types": tuple(item.value for item in fallback.requirements),
                "proposal_persisted": proposal_id is not None,
            },
        )
        return AdminAIOrchestrationResult(
            response_kind=response_kind,
            assistant_text=fallback.answer_text,
            assistant_content=fallback.assistant_content,
            generated_draft=(
                fallback.generated_draft
                or (conversation_context.referenced_draft if response_kind == "mutation_proposal" and conversation_context else None)
            ),
            limitation_code=None,
            fulfillment_status=status,
            unmet_requirements=unmet_requirements,
            envelope=AdminAIResultEnvelope(
                schema_version=1, result_kind="informational",
                capability_results=grounding_results,
                source_snapshots=source_snapshots, warnings=warnings,
            ),
            execution_trace=execution_trace, proposal_id=proposal_id,
            proposal_status=proposal_status,
        )

    def _raw_decision_permits_fallback(self, value: object) -> bool:
        if not isinstance(value, dict):
            return False
        if value.get("outcome_kind") != "direct_answer" or value.get("context_requirement") != "none":
            return False
        raw_requirements = value.get("requirements")
        if not isinstance(raw_requirements, (list, tuple)):
            return False
        try:
            requirements = {AdminAIExecutionRequirement(item) for item in raw_requirements}
        except (TypeError, ValueError):
            return False
        return bool(requirements) and requirements <= self._intrinsic_requirements()

    def _dispatch(
        self, call: AdminAICapabilityPlanCall, *, actor_role: RoleName,
    ) -> AdminAIResultEnvelope:
        if call.capability_name == "admin_ai.inspect_current_question" and call.capability_version == 1:
            return self._read_executor.inspect_current_question(
                actor_role=actor_role, request=call.input_payload,
            )
        if call.capability_name == "admin_ai.search_questions" and call.capability_version == 1:
            return self._read_executor.search_questions(
                actor_role=actor_role, request=call.input_payload,
            )
        if call.capability_name == "admin_ai.aggregate_question_statistics" and call.capability_version == 1:
            return self._read_executor.aggregate_question_statistics(
                actor_role=actor_role, request=call.input_payload,
            )
        self._fail(AdminAIValidationCategory.EXECUTION_HANDLER_NOT_ALLOWED, AdminAIValidationStage.CAPABILITY_PLAN_VALIDATION, call=call)

    def _fail(self, category: AdminAIValidationCategory, stage: AdminAIValidationStage, *, call: AdminAICapabilityPlanCall | None = None, call_index: int | None = None, cause: Exception | None = None) -> None:
        diagnostic = AdminAIValidationDiagnostic(
            category=category, stage=stage,
            capability_name=call.capability_name if call else None,
            capability_version=call.capability_version if call else None,
            call_index=call_index,
        )
        self._record_failure(diagnostic)
        error = AdminAIPlanValidationError(diagnostic)
        if cause is not None:
            raise error from cause
        raise error

    def _record_failure(self, diagnostic: AdminAIValidationDiagnostic) -> None:
        self.last_failure_diagnostic = diagnostic
        logger.warning("admin_ai_plan_validation_failed", extra=diagnostic.model_dump(mode="json"))

    @staticmethod
    def _schema_diagnostic(exc: ValidationError) -> AdminAIValidationDiagnostic:
        errors = exc.errors(include_input=False, include_url=False)
        error_types = {str(item.get("type")) for item in errors}
        if "duplicate_call_id" in error_types:
            category = AdminAIValidationCategory.DUPLICATE_CALL_ID
        elif "dependency_order_invalid" in error_types:
            category = AdminAIValidationCategory.DEPENDENCY_ORDER_INVALID
        elif "too_long" in error_types:
            category = AdminAIValidationCategory.CALL_LIMIT_EXCEEDED
        elif error_types.intersection({
            "plan_outcome_invalid",
            "direct_answer_outcome_invalid",
            "mutation_proposal_answer_missing",
            "mutation_proposal_code_missing",
            "mutation_proposal_plan_present",
            "mutation_proposal_unsupported_present",
            "unsupported_outcome_invalid",
        }):
            category = AdminAIValidationCategory.UNSUPPORTED_RESPONSE_INVALID
        elif any("input_payload" in item.get("loc", ()) for item in errors):
            category = AdminAIValidationCategory.CAPABILITY_INPUT_INVALID
        else:
            category = AdminAIValidationCategory.PLAN_SCHEMA_INVALID
        return AdminAIValidationDiagnostic(
            category=category,
            stage=(
                AdminAIValidationStage.CAPABILITY_INPUT_VALIDATION
                if category == AdminAIValidationCategory.CAPABILITY_INPUT_INVALID
                else AdminAIValidationStage.PLANNER_RESPONSE_VALIDATION
            ),
        )

    @staticmethod
    def _require_admin(actor_role: RoleName) -> None:
        if actor_role != RoleName.ADMIN:
            raise AdminAIOrchestrationAuthorizationError("Admin authorization is required.")

    @staticmethod
    def _safe_result_count(result: AdminAICapabilityResult) -> int | None:
        for field in ("items", "groups"):
            value = result.payload.get(field)
            if isinstance(value, list):
                return len(value)
        return 1 if result.capability_name == "admin_ai.inspect_current_question" else None
