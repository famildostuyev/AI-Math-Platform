from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_result import AdminAICapabilityResult
from app.services.new_question_capability import NewQuestionProposalPayload, new_question_fingerprint


def document(text: str) -> dict[str, object]:
    return {"type": "document", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


def payload(**changes: object) -> dict[str, object]:
    value: dict[str, object] = {
        "schema_version": 1, "generation_mode": "similar",
        "source_revision_id": str(uuid.uuid4()), "question_type_id": str(uuid.uuid4()),
        "answer_policy": "option_single",
        "content_blocks": [{"block_type": "text", "local_key": "block_1", "payload": {"document": document("Find x."), "format_version": 1}}],
        "answer_options": [
            {"local_key": "option_1", "label": "A", "document": document("1")},
            {"local_key": "option_2", "label": "B", "document": document("2")},
        ],
        "correct_option_key": "option_2",
    }
    value.update(changes)
    return value


class NewQuestionCapabilityTest(unittest.TestCase):
    def test_similar_v1_and_foundation_registry_validation_pass(self) -> None:
        result = NewQuestionProposalPayload.model_validate(payload())
        registry = build_admin_ai_foundation_registry()
        validated = registry.validate_result(AdminAICapabilityResult(
            capability_name="question.create_new", capability_version=1,
            classification="mutation_preparation", effect_scope="new_question",
            payload=result.model_dump(mode="json"),
        ))
        self.assertEqual(validated.generation_mode.value, "similar")
        self.assertEqual([item.local_key for item in validated.answer_options], ["option_1", "option_2"])

    def test_unsupported_mode_missing_source_and_unsupported_policy_reject(self) -> None:
        missing_source = payload(); missing_source.pop("source_revision_id")
        for value in (payload(generation_mode="transformed"), missing_source, payload(answer_policy="accepted_answer")):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                NewQuestionProposalPayload.model_validate(value)

    def test_fingerprint_preserves_previous_semantics(self) -> None:
        first = NewQuestionProposalPayload.model_validate(payload())
        same = NewQuestionProposalPayload.model_validate(payload(
            source_revision_id=str(uuid.uuid4()), question_type_id=str(uuid.uuid4()),
            correct_option_key="option_1",
        ))
        changed = NewQuestionProposalPayload.model_validate(payload(
            content_blocks=[{"block_type": "text", "local_key": "block_1", "payload": {"document": document("Find y."), "format_version": 1}}],
        ))
        self.assertEqual(new_question_fingerprint(first), new_question_fingerprint(same))
        self.assertNotEqual(new_question_fingerprint(first), new_question_fingerprint(changed))


if __name__ == "__main__":
    unittest.main()
