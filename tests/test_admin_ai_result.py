from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.admin_ai_result import AdminAIResultEnvelope, admin_ai_result_hash


class AdminAIResultEnvelopeTest(unittest.TestCase):
    def test_informational_unsupported_and_mutation_envelopes(self) -> None:
        informational = AdminAIResultEnvelope.model_validate({
            "schema_version": 1, "result_kind": "informational",
            "capability_results": [{
                "capability_name": "admin_ai.informational", "capability_version": 1,
                "classification": "read_only", "effect_scope": "none",
                "payload": {"summary": "Analysis complete."},
            }],
        })
        unsupported = AdminAIResultEnvelope.model_validate({
            "schema_version": 1, "result_kind": "unsupported",
            "unsupported_reason": "This capability is not available.",
        })
        mutation = AdminAIResultEnvelope.model_validate({
            "schema_version": 1, "result_kind": "mutation_proposal",
            "capability_results": [{
                "capability_name": "question.create_new", "capability_version": 1,
                "classification": "mutation_preparation", "effect_scope": "new_question",
                "payload": {},
            }],
        })
        self.assertEqual((informational.result_kind.value, unsupported.result_kind.value, mutation.result_kind.value), ("informational", "unsupported", "mutation_proposal"))

    def test_unknown_kind_extra_fields_and_inconsistent_shapes_reject(self) -> None:
        invalid = (
            {"schema_version": 1, "result_kind": "other"},
            {"schema_version": 1, "result_kind": "unsupported", "unsupported_reason": "No", "extra": 1},
            {"schema_version": 1, "result_kind": "informational", "capability_results": []},
        )
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AdminAIResultEnvelope.model_validate(value)

    def test_serialization_and_hash_are_deterministic_and_change_with_payload(self) -> None:
        def envelope(summary: str) -> AdminAIResultEnvelope:
            return AdminAIResultEnvelope.model_validate({
                "schema_version": 1, "result_kind": "informational",
                "capability_results": [{
                    "capability_name": "admin_ai.informational", "capability_version": 1,
                    "classification": "read_only", "effect_scope": "none",
                    "payload": {"summary": summary},
                }],
            })
        first, same, changed = envelope("Result"), envelope("Result"), envelope("Changed")
        self.assertEqual(first.model_dump_json(), same.model_dump_json())
        self.assertEqual(admin_ai_result_hash(first), admin_ai_result_hash(same))
        self.assertNotEqual(admin_ai_result_hash(first), admin_ai_result_hash(changed))


if __name__ == "__main__":
    unittest.main()
