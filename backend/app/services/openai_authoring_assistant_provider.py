from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Literal, Protocol

from openai import APIConnectionError, APIError, APITimeoutError, OpenAI, RateLimitError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.models.ai_authoring_message import AI_AUTHORING_MESSAGE_MAX_LENGTH
from app.core.enums import AnswerPolicy
from app.schemas.structured_text import StructuredTextDocument
from app.schemas.structured_text import project_source_text
from app.services.authoring_action import AuthoringActionEnvelope
from app.services.authoring_assistant_provider import (
    AuthoringAssistantAPIError,
    AuthoringAssistantInvalidActionTargetError,
    AuthoringAssistantInvalidContextError,
    AuthoringAssistantInvalidInstructionError,
    AuthoringAssistantInvalidResponseError,
    AuthoringAssistantNetworkError,
    AuthoringAssistantRateLimitError,
    AuthoringAssistantResult,
    AuthoringAssistantTimeoutError,
    AuthoringAssistantUnknownProviderError,
)
from app.services.question_authoring_context import (
    AuthoringAcceptedAnswerContext,
    AuthoringAnswerOptionContext,
    AuthoringRevisionContext,
    AuthoringTextBlockContext,
    AuthoringFormulaBlockContext,
    AuthoringSolutionFormulaBlockContext,
    AuthoringSolutionTextBlockContext,
)


OPENAI_AUTHORING_PROVIDER_NAME = "openai"
AUTHORING_PROMPT_VERSION = "question-authoring-v1"
AUTHORING_PROVIDER_SCHEMA_VERSION = 1
AUTHORING_INSTRUCTION_MAX_LENGTH = AI_AUTHORING_MESSAGE_MAX_LENGTH
VALIDATION_LOG_MAX_ERRORS = 5
VALIDATION_LOG_MAX_PATH_LENGTH = 160
VALIDATION_LOG_MAX_COMPONENT_LENGTH = 64
_SAFE_COMPONENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_SAFE_ERROR_TYPE = re.compile(r"^[a-z][a-z0-9_]*$")
logger = logging.getLogger(__name__)

SOLUTION_ACTION_TYPES = frozenset({
    "create_solution", "delete_solution",
    "create_solution_text_block", "update_solution_text_block",
    "create_solution_formula_block", "update_solution_formula_block",
    "delete_solution_block", "reorder_solution_blocks",
})
_SOLUTION_INTENT_PATTERNS = tuple(re.compile(pattern, re.IGNORECASE) for pattern in (
    r"\b(?:bu\s+)?(?:məsələni|sualı)\s+həll\s+et\b",
    r"\bhəllini\s+(?:yaz|hazırla)\b",
    r"\bəsas\s+həlli\s+hazırla\b",
    r"\bhəlli\s+(?:yaxşılaşdır|redaktə\s+et|sil)\b",
))
_DISPLAY_LINEAR_FRACTION = re.compile(
    r"\([^()\n]{1,80}\)\s*/\s*\([^()\n]{1,80}\)"
)


def is_solution_intent(instruction: str) -> bool:
    normalized = " ".join(instruction.casefold().strip().split())
    return any(pattern.search(normalized) for pattern in _SOLUTION_INTENT_PATTERNS)

AUTHORING_ASSISTANT_INSTRUCTIONS = """
Return only a typed authoring action envelope compatible with the canonical
manual Question Editor. Propose only changes explicitly requested by the admin;
do not broaden the instruction or alter the source meaning without necessity.
Use existing block IDs only from the supplied context and never invent target
IDs. Preserve action order because it is semantically significant. Do not
modify unrelated blocks. Propose delete actions only when deletion is explicitly
requested. Preserve valid LaTeX for formula changes. Always return canonical
structured-text payloads for text actions. The output is a proposal only: never
claim that a database, revision, block, or canonical question was mutated.
For answer changes, obey answer_policy and change only the answer portion the
admin requested. Reuse active option/accepted-answer IDs for update, delete,
reorder, and correctness actions. Correctness always uses option IDs, never
labels. Keep labels separate from structured content and do not touch unrelated
options. Do not invent a correct answer; do not change correctness unless the
admin explicitly requests it. Deletion must be an explicit action.
For requests to solve the problem, propose one concise, step-by-step ADF-1
solution using solution actions only. Use the question data to derive a correct
result and valid serialized LaTeX for formula steps. If no solution exists,
create_solution must precede all solution-block actions. If a solution exists,
update its active blocks or add steps without needless delete-and-recreate.
Delete a solution only when explicitly requested. Never modify unrelated
question blocks or answers while authoring a solution.
Use solution text blocks primarily for natural-language explanation and
transitions. Put display-style or structurally meaningful mathematics in
solution formula blocks, preserving a semantic text/formula sequence. Fractions,
roots, powers, subscripts, equations, and proportions should use valid serialized
LaTeX formula actions whenever they are substantial; do not flatten expressions
such as (a-b)/(c-d) into linear plain text. Do not over-fragment the solution:
short, simple inline expressions may remain in explanatory text.
Write solution narrative in natural, terminologically correct Azerbaijani. Use
"Bucaq əmsalı" and "Bucaq əmsalı düsturu"; never use the incorrect form
"Bucağ əmsalı". Keep the explanation concise, clear, and pedagogically natural.
""".strip()


class _StrictOpenAIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _OpenAIBoldMark(_StrictOpenAIModel):
    type: Literal["bold"]


class _OpenAIItalicMark(_StrictOpenAIModel):
    type: Literal["italic"]


class _OpenAIUnderlineMark(_StrictOpenAIModel):
    type: Literal["underline"]


class _OpenAIFontFamilyMark(_StrictOpenAIModel):
    type: Literal["font_family"]
    value: Literal["default", "serif", "sans", "math-compatible"]


class _OpenAIFontSizeMark(_StrictOpenAIModel):
    type: Literal["font_size"]
    value: Literal["small", "normal", "large", "x-large"]


_OpenAITextMark = (
    _OpenAIBoldMark
    | _OpenAIItalicMark
    | _OpenAIUnderlineMark
    | _OpenAIFontFamilyMark
    | _OpenAIFontSizeMark
)


class _OpenAITextNode(_StrictOpenAIModel):
    type: Literal["text"]
    text: str
    marks: list[_OpenAITextMark]


class _OpenAIInlineMathNode(_StrictOpenAIModel):
    type: Literal["inline_math"]
    latex: str


class _OpenAIHardBreakNode(_StrictOpenAIModel):
    type: Literal["hard_break"]


_OpenAIInlineNode = _OpenAITextNode | _OpenAIInlineMathNode | _OpenAIHardBreakNode


class _OpenAIParagraphAttrs(_StrictOpenAIModel):
    alignment: Literal["start", "center", "end", "justify"]


class _OpenAIParagraphNode(_StrictOpenAIModel):
    type: Literal["paragraph"]
    attrs: _OpenAIParagraphAttrs | None
    content: list[_OpenAIInlineNode]


class _OpenAIListItemNode(_StrictOpenAIModel):
    type: Literal["list_item"]
    content: list[_OpenAIParagraphNode] = Field(min_length=1)


class _OpenAIBulletListNode(_StrictOpenAIModel):
    type: Literal["bullet_list"]
    content: list[_OpenAIListItemNode]


class _OpenAIOrderedListNode(_StrictOpenAIModel):
    type: Literal["ordered_list"]
    content: list[_OpenAIListItemNode]


_OpenAIBlockNode = _OpenAIParagraphNode | _OpenAIBulletListNode | _OpenAIOrderedListNode


class _OpenAIStructuredTextDocument(_StrictOpenAIModel):
    type: Literal["document"]
    content: list[_OpenAIBlockNode]


class _OpenAITextPayload(_StrictOpenAIModel):
    document: _OpenAIStructuredTextDocument
    format_version: Literal[1]


class _OpenAIFormulaPayload(_StrictOpenAIModel):
    source_latex: str
    format_version: Literal[1]


class _OpenAIUpdateTextAction(_StrictOpenAIModel):
    action_type: Literal["update_text_block"]
    block_id: uuid.UUID
    payload: _OpenAITextPayload


class _OpenAIUpdateFormulaAction(_StrictOpenAIModel):
    action_type: Literal["update_formula_block"]
    block_id: uuid.UUID
    payload: _OpenAIFormulaPayload


class _OpenAICreateTextAction(_StrictOpenAIModel):
    action_type: Literal["create_text_block"]
    payload: _OpenAITextPayload


class _OpenAICreateFormulaAction(_StrictOpenAIModel):
    action_type: Literal["create_formula_block"]
    payload: _OpenAIFormulaPayload


class _OpenAIDeleteAction(_StrictOpenAIModel):
    action_type: Literal["delete_block"]
    block_id: uuid.UUID


class _OpenAIReorderAction(_StrictOpenAIModel):
    action_type: Literal["reorder_blocks"]
    ordered_block_ids: list[uuid.UUID] = Field(min_length=1)


class _OpenAICreateAnswerOptionAction(_StrictOpenAIModel):
    action_type: Literal["create_answer_option"]
    label: str | None
    payload: _OpenAITextPayload


class _OpenAIUpdateAnswerOptionAction(_StrictOpenAIModel):
    action_type: Literal["update_answer_option"]
    option_id: uuid.UUID
    label: str | None
    payload: _OpenAITextPayload


class _OpenAIDeleteAnswerOptionAction(_StrictOpenAIModel):
    action_type: Literal["delete_answer_option"]
    option_id: uuid.UUID


class _OpenAIReorderAnswerOptionsAction(_StrictOpenAIModel):
    action_type: Literal["reorder_answer_options"]
    ordered_option_ids: list[uuid.UUID]


class _OpenAISetCorrectAnswersAction(_StrictOpenAIModel):
    action_type: Literal["set_correct_answers"]
    option_ids: list[uuid.UUID]


class _OpenAICreateAcceptedAnswerAction(_StrictOpenAIModel):
    action_type: Literal["create_accepted_answer"]
    payload: _OpenAITextPayload


class _OpenAIUpdateAcceptedAnswerAction(_StrictOpenAIModel):
    action_type: Literal["update_accepted_answer"]
    answer_id: uuid.UUID
    payload: _OpenAITextPayload


class _OpenAIDeleteAcceptedAnswerAction(_StrictOpenAIModel):
    action_type: Literal["delete_accepted_answer"]
    answer_id: uuid.UUID


class _OpenAIReorderAcceptedAnswersAction(_StrictOpenAIModel):
    action_type: Literal["reorder_accepted_answers"]
    ordered_answer_ids: list[uuid.UUID]


class _OpenAICreateSolutionAction(_StrictOpenAIModel):
    action_type: Literal["create_solution"]


class _OpenAIDeleteSolutionAction(_StrictOpenAIModel):
    action_type: Literal["delete_solution"]


class _OpenAICreateSolutionTextBlockAction(_StrictOpenAIModel):
    action_type: Literal["create_solution_text_block"]
    payload: _OpenAITextPayload


class _OpenAIUpdateSolutionTextBlockAction(_StrictOpenAIModel):
    action_type: Literal["update_solution_text_block"]
    solution_block_id: uuid.UUID
    payload: _OpenAITextPayload


class _OpenAICreateSolutionFormulaBlockAction(_StrictOpenAIModel):
    action_type: Literal["create_solution_formula_block"]
    payload: _OpenAIFormulaPayload


class _OpenAIUpdateSolutionFormulaBlockAction(_StrictOpenAIModel):
    action_type: Literal["update_solution_formula_block"]
    solution_block_id: uuid.UUID
    payload: _OpenAIFormulaPayload


class _OpenAIDeleteSolutionBlockAction(_StrictOpenAIModel):
    action_type: Literal["delete_solution_block"]
    solution_block_id: uuid.UUID


class _OpenAIReorderSolutionBlocksAction(_StrictOpenAIModel):
    action_type: Literal["reorder_solution_blocks"]
    ordered_solution_block_ids: list[uuid.UUID]


_OpenAIAuthoringAction = (
    _OpenAIUpdateTextAction
    | _OpenAIUpdateFormulaAction
    | _OpenAICreateTextAction
    | _OpenAICreateFormulaAction
    | _OpenAIDeleteAction
    | _OpenAIReorderAction
    | _OpenAICreateAnswerOptionAction
    | _OpenAIUpdateAnswerOptionAction
    | _OpenAIDeleteAnswerOptionAction
    | _OpenAIReorderAnswerOptionsAction
    | _OpenAISetCorrectAnswersAction
    | _OpenAICreateAcceptedAnswerAction
    | _OpenAIUpdateAcceptedAnswerAction
    | _OpenAIDeleteAcceptedAnswerAction
    | _OpenAIReorderAcceptedAnswersAction
    | _OpenAICreateSolutionAction
    | _OpenAIDeleteSolutionAction
    | _OpenAICreateSolutionTextBlockAction
    | _OpenAIUpdateSolutionTextBlockAction
    | _OpenAICreateSolutionFormulaBlockAction
    | _OpenAIUpdateSolutionFormulaBlockAction
    | _OpenAIDeleteSolutionBlockAction
    | _OpenAIReorderSolutionBlocksAction
)


class _OpenAIAuthoringEnvelope(_StrictOpenAIModel):
    schema_version: Literal[1]
    actions: list[_OpenAIAuthoringAction] = Field(min_length=1)


class _ResponsesResource(Protocol):
    def parse(self, **kwargs: object) -> object:
        ...


class _OpenAIClient(Protocol):
    responses: _ResponsesResource


class OpenAIAuthoringAssistantProvider:
    def __init__(
        self,
        *,
        client: _OpenAIClient | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int | None = None,
        prompt_version: str = AUTHORING_PROMPT_VERSION,
        schema_version: int = AUTHORING_PROVIDER_SCHEMA_VERSION,
        instructions: str = AUTHORING_ASSISTANT_INSTRUCTIONS,
    ) -> None:
        if model is None or timeout_seconds is None or max_retries is None or (
            client is None and api_key is None
        ):
            from app.core.config import settings

            model = model or settings.AI_AUTHORING_MODEL
            timeout_seconds = (
                settings.AI_AUTHORING_TIMEOUT_SECONDS
                if timeout_seconds is None
                else timeout_seconds
            )
            max_retries = (
                settings.AI_AUTHORING_MAX_RETRIES
                if max_retries is None
                else max_retries
            )
            api_key = settings.OPENAI_API_KEY if api_key is None else api_key
        if not model or not model.strip():
            raise AuthoringAssistantInvalidContextError("Authoring model is unavailable.")
        if timeout_seconds is None or timeout_seconds <= 0:
            raise AuthoringAssistantInvalidContextError("Authoring timeout is invalid.")
        if max_retries is None or max_retries < 0:
            raise AuthoringAssistantInvalidContextError("Authoring retry policy is invalid.")
        if not instructions.strip():
            raise AuthoringAssistantInvalidContextError("Authoring instructions are unavailable.")
        managed_client = client is None
        if client is None:
            if api_key is None or not api_key.strip():
                raise AuthoringAssistantInvalidContextError(
                    "Authoring provider credentials are unavailable."
                )
            client = OpenAI(
                api_key=api_key,
                timeout=timeout_seconds,
                max_retries=max_retries,
            )
        self._client = client
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries
        self._retry_count = max_retries if managed_client else None
        self._prompt_version = prompt_version
        self._schema_version = schema_version
        self._instructions = instructions

    def propose_actions(
        self,
        *,
        instruction: str,
        context: AuthoringRevisionContext,
    ) -> AuthoringAssistantResult:
        self._validate_instruction(instruction)
        if not isinstance(context, AuthoringRevisionContext):
            raise AuthoringAssistantInvalidContextError("Authoring context is invalid.")
        request_input = self._serialize_request(instruction=instruction, context=context)
        try:
            response = self._client.responses.parse(
                model=self._model,
                instructions=self._instructions,
                input=request_input,
                text_format=_OpenAIAuthoringEnvelope,
                timeout=self._timeout_seconds,
                store=False,
            )
        except APITimeoutError as exc:
            self._log_failure("timeout")
            raise AuthoringAssistantTimeoutError("Authoring provider timed out.") from exc
        except RateLimitError as exc:
            self._log_failure("rate_limit")
            raise AuthoringAssistantRateLimitError("Authoring provider rate limit was exceeded.") from exc
        except APIConnectionError as exc:
            self._log_failure("network_error")
            raise AuthoringAssistantNetworkError("Authoring provider network request failed.") from exc
        except APIError as exc:
            self._log_failure("api_error", exc)
            raise AuthoringAssistantAPIError("Authoring provider request failed.") from exc
        except ValidationError as exc:
            self._log_validation_failure(exc)
            raise AuthoringAssistantInvalidResponseError("Authoring provider response is invalid.") from exc
        except Exception as exc:
            self._log_failure("unknown_provider_error", exc)
            raise AuthoringAssistantUnknownProviderError("Authoring provider request failed.") from exc

        parsed = getattr(response, "output_parsed", None)
        if not isinstance(parsed, _OpenAIAuthoringEnvelope):
            self._log_failure("invalid_response")
            raise AuthoringAssistantInvalidResponseError(
                "Authoring provider response is invalid."
            )
        try:
            envelope = self._map_envelope(parsed)
            self._validate_targets(
                envelope=envelope,
                context=context,
                solution_intent=is_solution_intent(instruction),
            )
        except AuthoringAssistantInvalidActionTargetError:
            raise
        except ValidationError as exc:
            self._log_validation_failure(exc)
            raise AuthoringAssistantInvalidResponseError(
                "Authoring provider response is invalid."
            ) from exc
        except (TypeError, ValueError) as exc:
            self._log_failure("invalid_response")
            raise AuthoringAssistantInvalidResponseError(
                "Authoring provider response is invalid."
            ) from exc
        return AuthoringAssistantResult(
            action_envelope=envelope,
            provider_name=OPENAI_AUTHORING_PROVIDER_NAME,
            model_name=self._model,
            prompt_version=self._prompt_version,
            provider_schema_version=self._schema_version,
        )

    @staticmethod
    def _validate_instruction(instruction: str) -> None:
        if not isinstance(instruction, str) or not instruction.strip():
            raise AuthoringAssistantInvalidInstructionError(
                "Authoring instruction must not be blank."
            )
        if len(instruction) > AUTHORING_INSTRUCTION_MAX_LENGTH:
            raise AuthoringAssistantInvalidInstructionError(
                "Authoring instruction exceeds the maximum length."
            )

    @staticmethod
    def _serialize_request(
        *, instruction: str, context: AuthoringRevisionContext
    ) -> list[dict[str, object]]:
        context_json = json.dumps(
            context.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return [{
            "role": "user",
            "content": [{
                "type": "input_text",
                "text": f"Admin instruction:\n{instruction}\nRevision context:\n{context_json}",
            }],
        }]

    @staticmethod
    def _map_envelope(parsed: _OpenAIAuthoringEnvelope) -> AuthoringActionEnvelope:
        raw = parsed.model_dump(mode="json")
        for action in raw["actions"]:
            payload = action.get("payload")
            if payload is not None and "document" in payload:
                document = StructuredTextDocument.model_validate(payload["document"])
                payload["document"] = document.model_dump(mode="json")
        return AuthoringActionEnvelope.model_validate(raw)

    @staticmethod
    def _validate_targets(
        *, envelope: AuthoringActionEnvelope, context: AuthoringRevisionContext,
        solution_intent: bool = False,
    ) -> None:
        if solution_intent:
            wrong_domain = [
                action.action_type for action in envelope.actions
                if action.action_type not in SOLUTION_ACTION_TYPES
            ]
            if wrong_domain:
                raise AuthoringAssistantInvalidActionTargetError(
                    "Only solution-domain actions are permitted for a solution instruction."
                )
            if context.solution is None and envelope.actions[0].action_type != "create_solution":
                raise AuthoringAssistantInvalidActionTargetError(
                    "A solution instruction must create the missing solution first."
                )
            for action in envelope.actions:
                if action.action_type in {
                    "create_solution_text_block", "update_solution_text_block",
                }:
                    source_text = project_source_text(action.payload.document)
                    if _DISPLAY_LINEAR_FRACTION.search(source_text):
                        raise AuthoringAssistantInvalidActionTargetError(
                            "Structured display mathematics must use a solution formula action."
                        )
        block_by_id = {block.block_id: block for block in context.blocks}
        active_ids = set(block_by_id)
        solution_active = context.solution is not None
        solution_blocks = (
            {} if context.solution is None
            else {block.block_id: block for block in context.solution.blocks}
        )
        for action in envelope.actions:
            action_type = action.action_type
            if action_type in {"update_text_block", "update_formula_block", "delete_block"}:
                block_id = action.block_id
                if block_id not in active_ids:
                    raise AuthoringAssistantInvalidActionTargetError(
                        "Authoring action targets an unavailable block."
                    )
                block = block_by_id[block_id]
                if action_type == "update_text_block" and not isinstance(block, AuthoringTextBlockContext):
                    raise AuthoringAssistantInvalidActionTargetError(
                        "Authoring action targets the wrong block type."
                    )
                if action_type == "update_formula_block" and not isinstance(block, AuthoringFormulaBlockContext):
                    raise AuthoringAssistantInvalidActionTargetError(
                        "Authoring action targets the wrong block type."
                    )
                if action_type == "delete_block":
                    active_ids.remove(block_id)
            elif action_type == "reorder_blocks":
                if set(action.ordered_block_ids) != active_ids:
                    raise AuthoringAssistantInvalidActionTargetError(
                        "Authoring block order does not match canonical context."
                    )
            elif action_type in {
                "create_answer_option", "update_answer_option", "delete_answer_option",
                "reorder_answer_options", "set_correct_answers",
            }:
                if context.answer_policy not in {AnswerPolicy.OPTION_SINGLE, AnswerPolicy.OPTION_MULTIPLE}:
                    raise AuthoringAssistantInvalidActionTargetError("Answer option action violates canonical answer policy.")
                option_ids = {item.option_id for item in context.answer_options}
                if action_type in {"update_answer_option", "delete_answer_option"} and action.option_id not in option_ids:
                    raise AuthoringAssistantInvalidActionTargetError("Answer option action targets an unavailable option.")
                if action_type == "reorder_answer_options" and set(action.ordered_option_ids) != option_ids:
                    raise AuthoringAssistantInvalidActionTargetError("Answer option order does not match canonical context.")
                if action_type == "set_correct_answers" and not set(action.option_ids).issubset(option_ids):
                    raise AuthoringAssistantInvalidActionTargetError("Correct answer targets an unavailable option.")
                if action_type == "set_correct_answers" and context.answer_policy == AnswerPolicy.OPTION_SINGLE and len(action.option_ids) > 1:
                    raise AuthoringAssistantInvalidActionTargetError("Single-answer policy permits at most one correct option.")
            elif action_type in {
                "create_accepted_answer", "update_accepted_answer",
                "delete_accepted_answer", "reorder_accepted_answers",
            }:
                if context.answer_policy != AnswerPolicy.ACCEPTED_ANSWER:
                    raise AuthoringAssistantInvalidActionTargetError("Accepted-answer action violates canonical answer policy.")
                answer_ids = {item.answer_id for item in context.accepted_answers}
                if action_type in {"update_accepted_answer", "delete_accepted_answer"} and action.answer_id not in answer_ids:
                    raise AuthoringAssistantInvalidActionTargetError("Accepted-answer action targets an unavailable answer.")
                if action_type == "reorder_accepted_answers" and set(action.ordered_answer_ids) != answer_ids:
                    raise AuthoringAssistantInvalidActionTargetError("Accepted-answer order does not match canonical context.")
            elif action_type == "create_solution":
                if solution_active:
                    raise AuthoringAssistantInvalidActionTargetError("An active solution already exists.")
                solution_active = True
            elif action_type == "delete_solution":
                if not solution_active:
                    raise AuthoringAssistantInvalidActionTargetError("Active solution is unavailable.")
                solution_active = False
                solution_blocks.clear()
            elif action_type in {"create_solution_text_block", "create_solution_formula_block"}:
                if not solution_active:
                    raise AuthoringAssistantInvalidActionTargetError("Create solution before creating solution blocks.")
            elif action_type in {"update_solution_text_block", "update_solution_formula_block", "delete_solution_block"}:
                if not solution_active:
                    raise AuthoringAssistantInvalidActionTargetError("Active solution is unavailable.")
                target = solution_blocks.get(action.solution_block_id)
                if target is None:
                    raise AuthoringAssistantInvalidActionTargetError("Solution block target is unavailable.")
                if action_type == "update_solution_text_block" and not isinstance(target, AuthoringSolutionTextBlockContext):
                    raise AuthoringAssistantInvalidActionTargetError("Solution block has the wrong type.")
                if action_type == "update_solution_formula_block" and not isinstance(target, AuthoringSolutionFormulaBlockContext):
                    raise AuthoringAssistantInvalidActionTargetError("Solution block has the wrong type.")
                if action_type == "delete_solution_block":
                    del solution_blocks[action.solution_block_id]
            elif action_type == "reorder_solution_blocks":
                if not solution_active or set(action.ordered_solution_block_ids) != set(solution_blocks):
                    raise AuthoringAssistantInvalidActionTargetError("Solution block order does not match canonical context.")

    def _log_validation_failure(self, exception: ValidationError) -> None:
        errors = exception.errors(include_input=False, include_url=False, include_context=False)
        paths: list[str] = []
        error_types: list[str] = []
        for error in errors[:VALIDATION_LOG_MAX_ERRORS]:
            components: list[str] = []
            for component in error.get("loc", ()):
                if type(component) is int:
                    components.append(str(component))
                elif type(component) is str and len(component) <= VALIDATION_LOG_MAX_COMPONENT_LENGTH and _SAFE_COMPONENT.fullmatch(component):
                    components.append(component)
                else:
                    components.append("field")
            paths.append((".".join(components) or "root")[:VALIDATION_LOG_MAX_PATH_LENGTH])
            error_type = error.get("type")
            error_types.append(
                error_type
                if type(error_type) is str and len(error_type) <= VALIDATION_LOG_MAX_COMPONENT_LENGTH and _SAFE_ERROR_TYPE.fullmatch(error_type)
                else "validation_error"
            )
        logger.warning(
            "authoring_assistant_provider_failure provider=%s category=invalid_response "
            "model=%s exception_type=ValidationError validation_error_count=%s "
            "validation_paths=%s validation_types=%s",
            OPENAI_AUTHORING_PROVIDER_NAME,
            self._model,
            len(errors),
            ",".join(paths),
            ",".join(error_types),
        )

    def _log_failure(self, category: str, exception: Exception | None = None) -> None:
        status_code = getattr(exception, "status_code", None) if exception else None
        logger.warning(
            "authoring_assistant_provider_failure provider=%s category=%s model=%s "
            "exception_type=%s status_code=%s retry_count=%s",
            OPENAI_AUTHORING_PROVIDER_NAME,
            category,
            self._model,
            type(exception).__name__ if exception else "none",
            status_code if type(status_code) is int else "unknown",
            self._retry_count if type(self._retry_count) is int else "unknown",
        )
