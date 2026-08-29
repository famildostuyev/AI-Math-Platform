from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.question_revision import QuestionRevision


class AIAuthoringProposalModelTest(unittest.TestCase):
    def test_metadata_matches_pending_proposal_foundation(self) -> None:
        table = AIAuthoringProposal.__table__
        self.assertEqual(table.name, "ai_authoring_proposals")
        self.assertEqual(set(table.columns.keys()), {
            "id", "source_revision_id", "source_revision_updated_at", "status", "proposal_kind",
            "result_kind", "action_schema_version", "actions", "capability_bundle_schema_version",
            "capability_bundle", "capability_bundle_hash", "provider_name", "model_name",
            "prompt_version", "provider_schema_version", "requested_by_user_id",
            "request_message_id",
            "accepted_by_user_id", "rejected_by_user_id", "accepted_at",
            "rejected_at", "created_at", "updated_at", "deleted_at",
        })
        self.assertIsInstance(table.c.actions.type, JSONB)
        self.assertTrue(table.c.actions.type.none_as_null)
        self.assertIsInstance(table.c.capability_bundle.type, JSONB)
        self.assertTrue(table.c.capability_bundle.type.none_as_null)
        self.assertIsInstance(table.c.status.type, SQLEnum)
        self.assertIsInstance(table.c.proposal_kind.type, SQLEnum)
        self.assertEqual(
            table.c.proposal_kind.type.enums,
            ["authoring_actions", "capability_bundle"],
        )
        self.assertEqual(table.c.result_kind.type.enums, ["informational", "mutation_proposal", "unsupported"])
        self.assertEqual(
            table.c.status.type.enums,
            ["pending", "accepted", "rejected", "obsolete"],
        )
        self.assertIsInstance(table.c.source_revision_updated_at.type, DateTime)
        self.assertTrue(table.c.source_revision_updated_at.type.timezone)

    def test_foreign_keys_constraints_and_safe_field_surface(self) -> None:
        table = AIAuthoringProposal.__table__
        expected = {
            "source_revision_id": ("question_revisions.id", "RESTRICT"),
            "requested_by_user_id": ("users.id", "SET NULL"),
            "request_message_id": ("ai_authoring_messages.id", "SET NULL"),
            "accepted_by_user_id": ("users.id", "SET NULL"),
            "rejected_by_user_id": ("users.id", "SET NULL"),
        }
        for name, (target, ondelete) in expected.items():
            fk = next(iter(table.c[name].foreign_keys))
            self.assertEqual(fk.target_fullname, target)
            self.assertEqual(fk.ondelete, ondelete)
        checks = {
            item.name: str(item.sqltext) for item in table.constraints
            if isinstance(item, CheckConstraint)
        }
        self.assertIn("pending", checks["ck_ai_authoring_proposals_lifecycle_consistent"])
        self.assertIn("provider_name", checks["ck_ai_authoring_proposals_provenance_nonblank"])
        self.assertIn("capability_bundle_hash", checks["ck_ai_authoring_proposals_payload_kind_consistent"])
        self.assertIn("64", checks["ck_ai_authoring_proposals_bundle_hash_sha256"])
        self.assertTrue({
            "raw_provider_response", "prompt_text", "api_key", "credential",
        }.isdisjoint(table.c.keys()))

    def test_existing_question_revision_contract_is_not_extended(self) -> None:
        self.assertNotIn(
            "ai_authoring_proposals",
            QuestionRevision.__mapper__.relationships.keys(),
        )
        self.assertTrue({
            "ai_proposal_id", "provider_name", "model_name", "prompt_version",
        }.isdisjoint(QuestionRevision.__table__.c.keys()))


if __name__ == "__main__":
    unittest.main()
