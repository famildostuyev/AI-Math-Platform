from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import AIAuthoringProposalStatus
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.question_revision import QuestionRevision
from app.services.ai_authoring_proposal_service import (
    AIAuthoringProposalRevisionConflictError,
    AIAuthoringProposalRevisionNotFoundError,
    AIAuthoringProposalRequestMessageInvalidError,
    AIAuthoringProposalService,
    AIAuthoringProposalValidationError,
)


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


def envelope() -> dict[str, object]:
    return {
        "schema_version": 1,
        "actions": [
            {"action_type": "delete_block", "block_id": str(uuid.uuid4())},
            {"action_type": "create_formula_block", "payload": {
                "source_latex": r"\frac{1}{2}", "format_version": 1,
            }},
        ],
    }


class AIAuthoringProposalServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.revision = QuestionRevision(id=uuid.uuid4(), updated_at=NOW)
        self.requester_id = uuid.uuid4()
        self.db.scalar.side_effect = [self.revision, self.requester_id]
        self.service = AIAuthoringProposalService(self.db)

    def create(self, **overrides: object) -> AIAuthoringProposal:
        values = {
            "source_revision_id": self.revision.id,
            "expected_revision_updated_at": NOW,
            "action_envelope": envelope(),
            "provider_name": "openai",
            "model_name": "gpt-5-mini",
            "prompt_version": "authoring-v1",
            "provider_schema_version": 1,
            "requested_by_user_id": self.requester_id,
        }
        values.update(overrides)
        return self.service.create_pending_proposal(**values)

    def test_create_pending_preserves_snapshot_order_and_provenance(self) -> None:
        proposal = self.create()
        self.assertEqual(proposal.status, AIAuthoringProposalStatus.PENDING)
        self.assertEqual(proposal.source_revision_id, self.revision.id)
        self.assertEqual(proposal.source_revision_updated_at, NOW)
        self.assertEqual(proposal.action_schema_version, 1)
        self.assertEqual(
            [action["action_type"] for action in proposal.actions["actions"]],
            ["delete_block", "create_formula_block"],
        )
        self.assertEqual(
            (proposal.provider_name, proposal.model_name, proposal.prompt_version,
             proposal.provider_schema_version, proposal.requested_by_user_id),
            ("openai", "gpt-5-mini", "authoring-v1", 1, self.requester_id),
        )
        self.assertTrue({"raw_response", "api_key", "credential"}.isdisjoint(
            proposal.__table__.c.keys()
        ))
        self.db.add.assert_called_once_with(proposal)
        self.db.commit.assert_called_once()
        self.db.refresh.assert_called_once_with(proposal)

    def test_invalid_or_soft_deleted_revision_is_rejected_without_write(self) -> None:
        for revision in (None, None):
            with self.subTest(revision=revision):
                db = MagicMock()
                db.scalar.return_value = revision
                service = AIAuthoringProposalService(db)
                with self.assertRaises(AIAuthoringProposalRevisionNotFoundError):
                    service.create_pending_proposal(
                        source_revision_id=uuid.uuid4(),
                        expected_revision_updated_at=NOW,
                        action_envelope=envelope(),
                        provider_name="openai",
                        model_name="model",
                        prompt_version="v1",
                        provider_schema_version=1,
                        requested_by_user_id=uuid.uuid4(),
                    )
                db.add.assert_not_called()
                db.commit.assert_not_called()

    def test_stale_snapshot_is_rejected_without_write(self) -> None:
        with self.assertRaises(AIAuthoringProposalRevisionConflictError):
            self.create(expected_revision_updated_at=NOW + timedelta(seconds=1))
        self.db.add.assert_not_called()
        self.db.commit.assert_not_called()

    def test_invalid_actions_and_provenance_are_rejected_before_write(self) -> None:
        invalid = (
            {"action_envelope": {"schema_version": 1, "actions": []}},
            {"provider_name": " "},
            {"provider_schema_version": 0},
        )
        for overrides in invalid:
            with self.subTest(overrides=overrides):
                db = MagicMock()
                service = AIAuthoringProposalService(db)
                self.service = service
                with self.assertRaises(AIAuthoringProposalValidationError):
                    self.create(**overrides)
                db.add.assert_not_called()
                db.commit.assert_not_called()

    def test_creation_has_no_canonical_revision_or_block_mutation(self) -> None:
        before = dict(self.revision.__dict__)
        proposal = self.create()
        self.assertEqual(self.revision.__dict__, before)
        self.assertIsInstance(self.db.add.call_args.args[0], AIAuthoringProposal)
        self.assertNotEqual(proposal.source_revision, self.revision)

    def test_request_message_provenance_is_validated_and_preserved(self) -> None:
        message_id = uuid.uuid4()
        self.db.scalar.side_effect = [self.revision, self.requester_id, message_id]
        proposal = self.create(request_message_id=message_id)
        self.assertEqual(proposal.request_message_id, message_id)
        statements = [str(call.args[0]) for call in self.db.scalar.call_args_list]
        self.assertIn("ai_authoring_messages", statements[-1])

        db = MagicMock()
        db.scalar.side_effect = [self.revision, self.requester_id, None]
        self.service = AIAuthoringProposalService(db)
        with self.assertRaises(AIAuthoringProposalRequestMessageInvalidError):
            self.create(request_message_id=message_id)
        db.add.assert_not_called()

    def test_get_proposal_returns_only_active_record(self) -> None:
        proposal = AIAuthoringProposal(id=uuid.uuid4())
        db = MagicMock()
        db.scalar.return_value = proposal
        service = AIAuthoringProposalService(db)

        self.assertIs(
            service.get_proposal(proposal_id=proposal.id),
            proposal,
        )
        statement = db.scalar.call_args.args[0]
        self.assertIn("deleted_at IS NULL", str(statement))


if __name__ == "__main__":
    unittest.main()
