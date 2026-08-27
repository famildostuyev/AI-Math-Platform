from __future__ import annotations

import uuid
import logging
from enum import Enum
from typing import Literal, Protocol, TypeAlias, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from pydantic_core import PydanticCustomError

from app.core.enums import RoleName
from app.services.admin_ai_capability_registry import (
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


class StrictOrchestratorModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AdminAIFinalResultStrategy(str, Enum):
    COMBINE_INFORMATIONAL = "combine_informational"


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
    """Strict provider planning outcome; unsupported prose is backend-owned."""

    schema_version: Literal[1]
    outcome_kind: Literal["plan", "unsupported"]
    plan: AdminAICapabilityPlan | None
    unsupported_code: Literal["capability_unavailable"] | None

    @model_validator(mode="after")
    def outcome_is_consistent(self) -> "AdminAIPlannerResponse":
        if self.outcome_kind == "plan":
            if self.plan is None or self.unsupported_code is not None:
                raise PydanticCustomError("unsupported_response_invalid", "Plan outcome fields are inconsistent.")
        elif self.plan is not None or self.unsupported_code is None:
            raise PydanticCustomError("unsupported_response_invalid", "Unsupported outcome fields are inconsistent.")
        return self


AdminAIPlannerResult: TypeAlias = AdminAICapabilityPlan | AdminAIPlannerResponse


class AdminAIPlanningRequest(StrictOrchestratorModel):
    instruction: str = Field(min_length=1, max_length=ADMIN_AI_MAX_INSTRUCTION_CHARS)
    current_revision_id: uuid.UUID | None = None
    current_question_type_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def current_type_requires_revision(self) -> "AdminAIPlanningRequest":
        if self.current_question_type_id is not None and self.current_revision_id is None:
            raise ValueError("Current question type requires current revision identity.")
        return self


class AdminAICapabilityManifestEntry(StrictOrchestratorModel):
    capability_name: str
    capability_version: int
    classification: Literal[CapabilityClassification.READ_ONLY]
    safe_description: str
    effect_scope: str
    input_schema: dict[str, object]
    result_limit: int


@runtime_checkable
class AdminAIPlanner(Protocol):
    def plan(
        self, *, request: AdminAIPlanningRequest,
        capability_manifest: tuple[AdminAICapabilityManifestEntry, ...],
        catalog_grounding: AdminAIPlannerCatalogGrounding,
    ) -> AdminAIPlannerResult:
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
    envelope: AdminAIResultEnvelope
    execution_trace: tuple[AdminAICallExecutionTrace, ...]


class AdminAIOrchestratorError(Exception):
    pass


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
        catalog_grounding: AdminAIPlannerCatalogGrounding | None = None,
        current_revision_service: AdminAIPlannerCurrentRevisionService | None = None,
    ) -> None:
        self._planner = planner
        self._registry = registry
        self._read_executor = read_executor
        self._catalog_grounding = catalog_grounding or AdminAIPlannerCatalogGrounding()
        self._current_revision_service = current_revision_service
        self.last_failure_diagnostic: AdminAIValidationDiagnostic | None = None

    def run(
        self, *, actor_role: RoleName, instruction: str,
        current_revision_id: uuid.UUID | None = None,
    ) -> AdminAIOrchestrationResult:
        self._require_admin(actor_role)
        current_question_type_id: uuid.UUID | None = None
        if current_revision_id is not None and self._current_revision_service is not None:
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
        )
        manifest = build_safe_capability_manifest(self._registry)
        raw_planning_result = self._planner.plan(
            request=request, capability_manifest=manifest,
            catalog_grounding=self._catalog_grounding,
        )
        try:
            if isinstance(raw_planning_result, AdminAIPlannerResponse) or (
                isinstance(raw_planning_result, dict) and "outcome_kind" in raw_planning_result
            ):
                planning_result = AdminAIPlannerResponse.model_validate(raw_planning_result)
                if planning_result.outcome_kind == "unsupported":
                    return AdminAIOrchestrationResult(
                        envelope=AdminAIResultEnvelope(
                            schema_version=1, result_kind="unsupported",
                            capability_results=(), source_snapshots=(), warnings=(),
                            unsupported_reason="Requested operation is not available in read-only Admin AI.",
                        ), execution_trace=(),
                    )
                assert planning_result.plan is not None
                plan = planning_result.plan
            else:
                plan = AdminAICapabilityPlan.model_validate(raw_planning_result)
        except ValidationError as exc:
            diagnostic = self._schema_diagnostic(exc)
            self._record_failure(diagnostic)
            raise AdminAIPlanValidationError(diagnostic) from exc
        self._validate_complete_plan(plan, actor_role=actor_role)

        results: list[AdminAICapabilityResult] = []
        snapshots: list[AdminAISourceSnapshot] = []
        warnings: list[AdminAIWarning] = []
        trace: list[AdminAICallExecutionTrace] = []
        for call in plan.calls:
            try:
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
        return AdminAIOrchestrationResult(
            envelope=AdminAIResultEnvelope(
                schema_version=1, result_kind="informational",
                capability_results=tuple(results),
                source_snapshots=tuple(snapshots), warnings=tuple(warnings),
            ), execution_trace=tuple(trace),
        )

    def _validate_complete_plan(self, plan: AdminAICapabilityPlan, *, actor_role: RoleName) -> None:
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
        self._require_admin(actor_role)

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
        elif "unsupported_response_invalid" in error_types:
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
