from __future__ import annotations

import json
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import httpx
from openai import APIConnectionError, APIError, APITimeoutError, RateLimitError
from openai.lib._parsing._responses import type_to_text_format_param
from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import (
    ContentBlockType,
    QuestionRevisionProvenanceKind,
    QuestionRevisionStatus,
)
from app.schemas.structured_text import StructuredTextDocument
from app.services.authoring_assistant_provider import (
    AuthoringAssistantAPIError,
    AuthoringAssistantInvalidActionTargetError,
    AuthoringAssistantInvalidInstructionError,
    AuthoringAssistantInvalidResponseError,
    AuthoringAssistantNetworkError,
    AuthoringAssistantRateLimitError,
    AuthoringAssistantTimeoutError,
    AuthoringAssistantUnknownProviderError,
)
from app.services.openai_authoring_assistant_provider import (
    AUTHORING_ASSISTANT_INSTRUCTIONS,
    AUTHORING_INSTRUCTION_MAX_LENGTH,
    AUTHORING_PROMPT_VERSION,
    _OpenAIAuthoringEnvelope,
    _OpenAICreateFormulaAction,
    _OpenAICreateTextAction,
    _OpenAIDeleteAction,
    _OpenAIFormulaPayload,
    _OpenAIParagraphNode,
    _OpenAIReorderAction,
    _OpenAIStructuredTextDocument,
    _OpenAITextNode,
    _OpenAITextPayload,
    _OpenAIUpdateFormulaAction,
    _OpenAIUpdateTextAction,
    OpenAIAuthoringAssistantProvider,
)
from app.services.question_authoring_context import (
    AuthoringFormulaBlockContext,
    AuthoringRevisionContext,
    AuthoringSourceContext,
    AuthoringTextBlockContext,
)


class FakeResponses:
    def __init__(self, output_parsed: object = None) -> None:
        self.output_parsed = output_parsed
        self.error: Exception | None = None
        self.calls: list[dict[str, object]] = []

    def parse(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return SimpleNamespace(output_parsed=self.output_parsed)


class FakeClient:
    def __init__(self, output_parsed: object = None) -> None:
        self.responses = FakeResponses(output_parsed)


TEXT_ID = uuid.UUID("00000000-0000-0000-0000-000000000011")
FORMULA_ID = uuid.UUID("00000000-0000-0000-0000-000000000012")


def context() -> AuthoringRevisionContext:
    document = StructuredTextDocument.model_validate({
        "type": "document",
        "content": [{
            "type": "paragraph",
            "content": [{"type": "text", "text": "Find x"}],
        }],
    })
    return AuthoringRevisionContext(
        revision_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        revision_number=1,
        revision_status=QuestionRevisionStatus.DRAFT,
        revision_updated_at=datetime(2026, 8, 25, tzinfo=timezone.utc),
        provenance_kind=QuestionRevisionProvenanceKind.HUMAN_AUTHORED,
        question_family_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        question_form_id=uuid.UUID("00000000-0000-0000-0000-000000000003"),
        question_type_id=uuid.UUID("00000000-0000-0000-0000-000000000004"),
        primary_topic_id=None,
        related_topic_ids=(),
        purpose_ids=(),
        difficulty=None,
        source=AuthoringSourceContext(
            source_id=None, display_name="source-secret-text", detail=None
        ),
        blocks=(
            AuthoringTextBlockContext(
                block_type=ContentBlockType.TEXT,
                block_id=TEXT_ID,
                order=1000,
                source_text="question-secret-text",
                document=document,
                format_version=1,
            ),
            AuthoringFormulaBlockContext(
                block_type=ContentBlockType.FORMULA,
                block_id=FORMULA_ID,
                order=2000,
                source_latex=r"\frac{1}{2}",
                format_version=1,
            ),
        ),
    )


def text_payload(text: str = "Updated") -> _OpenAITextPayload:
    return _OpenAITextPayload(
        document=_OpenAIStructuredTextDocument(
            type="document",
            content=[_OpenAIParagraphNode(
                type="paragraph",
                attrs=None,
                content=[_OpenAITextNode(type="text", text=text, marks=[])],
            )],
        ),
        format_version=1,
    )


def envelope(*actions) -> _OpenAIAuthoringEnvelope:
    return _OpenAIAuthoringEnvelope(schema_version=1, actions=list(actions))


class OpenAIAuthoringAssistantProviderTest(unittest.TestCase):
    def provider(self, client: FakeClient) -> OpenAIAuthoringAssistantProvider:
        return OpenAIAuthoringAssistantProvider(
            client=client,
            model="gpt-5-mini",
            timeout_seconds=60.0,
            max_retries=0,
        )

    def propose(self, parsed: object, instruction: str = "Update this"):
        client = FakeClient(parsed)
        result = self.provider(client).propose_actions(
            instruction=instruction,
            context=context(),
        )
        return result, client

    def test_update_text_and_formula_actions_parse(self) -> None:
        result, _ = self.propose(envelope(
            _OpenAIUpdateTextAction(
                action_type="update_text_block", block_id=TEXT_ID, payload=text_payload()
            ),
            _OpenAIUpdateFormulaAction(
                action_type="update_formula_block",
                block_id=FORMULA_ID,
                payload=_OpenAIFormulaPayload(source_latex="x^2", format_version=1),
            ),
        ))
        self.assertEqual(
            [action.action_type for action in result.action_envelope.actions],
            ["update_text_block", "update_formula_block"],
        )

    def test_create_text_and_formula_actions_parse(self) -> None:
        result, _ = self.propose(envelope(
            _OpenAICreateTextAction(action_type="create_text_block", payload=text_payload("New")),
            _OpenAICreateFormulaAction(
                action_type="create_formula_block",
                payload=_OpenAIFormulaPayload(source_latex=r"\sqrt{x}", format_version=1),
            ),
        ))
        self.assertEqual(len(result.action_envelope.actions), 2)

    def test_delete_and_reorder_actions_parse_in_order(self) -> None:
        result, _ = self.propose(envelope(
            _OpenAIDeleteAction(action_type="delete_block", block_id=FORMULA_ID),
            _OpenAIReorderAction(action_type="reorder_blocks", ordered_block_ids=[TEXT_ID]),
        ))
        self.assertEqual(
            [action.action_type for action in result.action_envelope.actions],
            ["delete_block", "reorder_blocks"],
        )

    def test_unknown_extra_and_malformed_structured_output_reject(self) -> None:
        invalid = (
            {"schema_version": 1, "actions": [{"action_type": "unknown"}]},
            {
                "schema_version": 1,
                "actions": [{
                    "action_type": "delete_block",
                    "block_id": str(TEXT_ID),
                    "secret": "forbidden",
                }],
            },
        )
        for payload in invalid:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                _OpenAIAuthoringEnvelope.model_validate(payload)
        with self.assertRaises(AuthoringAssistantInvalidResponseError):
            self.propose({"not": "parsed"})

    def test_unavailable_update_delete_and_invalid_reorder_targets_reject(self) -> None:
        unknown = uuid.uuid4()
        cases = (
            _OpenAIUpdateTextAction(
                action_type="update_text_block", block_id=unknown, payload=text_payload()
            ),
            _OpenAIDeleteAction(action_type="delete_block", block_id=unknown),
            _OpenAIReorderAction(action_type="reorder_blocks", ordered_block_ids=[TEXT_ID]),
        )
        for action in cases:
            with self.subTest(action=action.action_type), self.assertRaises(
                AuthoringAssistantInvalidActionTargetError
            ):
                self.propose(envelope(action))

    def test_wrong_block_type_target_rejects(self) -> None:
        with self.assertRaises(AuthoringAssistantInvalidActionTargetError):
            self.propose(envelope(_OpenAIUpdateFormulaAction(
                action_type="update_formula_block",
                block_id=TEXT_ID,
                payload=_OpenAIFormulaPayload(source_latex="x", format_version=1),
            )))

    def test_instruction_validation_uses_shared_ten_thousand_limit(self) -> None:
        self.assertEqual(AUTHORING_INSTRUCTION_MAX_LENGTH, 10_000)
        for instruction in ("", "   ", "x" * 10_001):
            with self.subTest(length=len(instruction)), self.assertRaises(
                AuthoringAssistantInvalidInstructionError
            ):
                self.provider(FakeClient()).propose_actions(
                    instruction=instruction, context=context()
                )

    def test_result_contains_only_typed_actions_and_safe_provenance(self) -> None:
        result, _ = self.propose(envelope(
            _OpenAIDeleteAction(action_type="delete_block", block_id=TEXT_ID),
            _OpenAIReorderAction(action_type="reorder_blocks", ordered_block_ids=[FORMULA_ID]),
        ))
        self.assertEqual(result.provider_name, "openai")
        self.assertEqual(result.model_name, "gpt-5-mini")
        self.assertEqual(result.prompt_version, AUTHORING_PROMPT_VERSION)
        self.assertEqual(result.provider_schema_version, 1)
        self.assertEqual(result.action_envelope.schema_version, 1)
        self.assertTrue({"raw_response", "api_key"}.isdisjoint(type(result).model_fields))

    def test_request_serialization_is_deterministic_and_preserves_block_order(self) -> None:
        parsed = envelope(
            _OpenAIDeleteAction(action_type="delete_block", block_id=TEXT_ID),
            _OpenAIReorderAction(action_type="reorder_blocks", ordered_block_ids=[FORMULA_ID]),
        )
        _, first = self.propose(parsed)
        _, second = self.propose(parsed)
        first_input = first.responses.calls[0]["input"]
        self.assertEqual(first_input, second.responses.calls[0]["input"])
        serialized = first_input[0]["content"][0]["text"]
        self.assertLess(serialized.index(str(TEXT_ID)), serialized.index(str(FORMULA_ID)))
        self.assertNotIn("storage_key", serialized)
        self.assertNotIn("base64", serialized)

    def test_timeout_rate_limit_network_and_api_errors_map(self) -> None:
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        cases = (
            (APITimeoutError(request=request), AuthoringAssistantTimeoutError),
            (
                RateLimitError("secret", response=httpx.Response(429, request=request), body=None),
                AuthoringAssistantRateLimitError,
            ),
            (APIConnectionError(request=request), AuthoringAssistantNetworkError),
            (APIError("secret", request, body=None), AuthoringAssistantAPIError),
            (RuntimeError("secret"), AuthoringAssistantUnknownProviderError),
        )
        for error, expected in cases:
            with self.subTest(expected=expected.__name__):
                client = FakeClient()
                client.responses.error = error
                with self.assertRaises(expected):
                    self.provider(client).propose_actions(
                        instruction="Safe instruction", context=context()
                    )

    def test_validation_logging_contains_only_safe_metadata(self) -> None:
        parsed = envelope(_OpenAIReorderAction(
            action_type="reorder_blocks", ordered_block_ids=[TEXT_ID, TEXT_ID]
        ))
        with self.assertLogs(
            "app.services.openai_authoring_assistant_provider", level="WARNING"
        ) as captured, self.assertRaises(AuthoringAssistantInvalidResponseError):
            self.propose(parsed, instruction="instruction-secret")
        output = " ".join(captured.output)
        self.assertIn("validation_error_count=", output)
        for secret in (
            "instruction-secret", "question-secret-text", "source-secret-text",
            r"\frac{1}{2}", "api-key-secret",
        ):
            self.assertNotIn(secret, output)

    def test_strict_schema_uses_anyof_without_discriminator_oneof_or_defaults(self) -> None:
        schema = type_to_text_format_param(_OpenAIAuthoringEnvelope)["schema"]
        serialized = json.dumps(schema, sort_keys=True)
        self.assertIn('"anyOf"', serialized)
        self.assertNotIn('"oneOf"', serialized)
        self.assertNotIn('"discriminator"', serialized)
        def keys(value: object) -> set[str]:
            if isinstance(value, dict):
                return set(value).union(*(keys(item) for item in value.values()))
            if isinstance(value, list):
                return set().union(*(keys(item) for item in value))
            return set()

        self.assertNotIn("default", keys(schema))
        self.assertIn('"additionalProperties": false', serialized)
        for definition in schema.get("$defs", {}).values():
            if definition.get("type") == "object":
                properties = definition.get("properties", {})
                self.assertEqual(set(definition.get("required", [])), set(properties))

    def test_prompt_contains_manual_editor_and_safety_rules(self) -> None:
        prompt = AUTHORING_ASSISTANT_INSTRUCTIONS.casefold()
        for phrase in ("manual question editor", "never invent", "action order", "delete", "latex", "never"):
            self.assertIn(phrase, prompt)
        self.assertNotIn("api key", prompt)
        self.assertNotIn("authorization", prompt)

    def test_provider_has_no_database_or_mutation_dependencies(self) -> None:
        provider = self.provider(FakeClient())
        self.assertFalse(hasattr(provider, "db"))
        module = sys.modules[provider.__class__.__module__]
        names = set(vars(module))
        self.assertNotIn("QuestionEditorService", names)
        self.assertNotIn("AIAuthoringProposalService", names)


if __name__ == "__main__":
    unittest.main()
