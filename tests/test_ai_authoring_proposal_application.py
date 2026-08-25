from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import AIAuthoringProposalStatus, QuestionRevisionStatus
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.question_revision import QuestionRevision
from app.services.ai_authoring_proposal_service import (
    AIAuthoringProposalActionApplicationError,
    AIAuthoringProposalNotPendingError,
    AIAuthoringProposalObsoleteError,
    AIAuthoringProposalService,
)
from app.services.question_editor_service import InvalidAuthoringActionTargetError


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


def action_envelope() -> dict[str, object]:
    return {
        "schema_version": 1,
        "actions": [{
            "action_type": "create_formula_block",
            "payload": {"source_latex": "x^2", "format_version": 1},
        }],
    }


def pending_proposal(revision: QuestionRevision) -> AIAuthoringProposal:
    return AIAuthoringProposal(
        id=uuid.uuid4(),
        source_revision_id=revision.id,
        source_revision_updated_at=NOW,
        status=AIAuthoringProposalStatus.PENDING,
        action_schema_version=1,
        actions=action_envelope(),
    )


class AIAuthoringProposalApplicationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.actor_id = uuid.uuid4()
        self.revision = QuestionRevision(
            id=uuid.uuid4(),
            updated_at=NOW,
            status=QuestionRevisionStatus.DRAFT,
        )
        self.proposal = pending_proposal(self.revision)
        self.db = MagicMock()
        self.db.scalar.side_effect = [self.proposal, self.actor_id, self.revision]
        self.service = AIAuthoringProposalService(self.db)

    @patch("app.services.ai_authoring_proposal_service.QuestionEditorService")
    def test_accept_applies_all_actions_and_status_in_one_commit(self, editor_cls) -> None:
        result = self.service.accept_proposal(
            proposal_id=self.proposal.id,
            accepted_by_user_id=self.actor_id,
        )

        editor_cls.return_value.apply_action_set.assert_called_once()
        self.assertEqual(result.status, AIAuthoringProposalStatus.ACCEPTED)
        self.assertEqual(result.accepted_by_user_id, self.actor_id)
        self.assertIsNotNone(result.accepted_at)
        self.assertEqual(result.actions, action_envelope())
        self.db.commit.assert_called_once()
        self.db.rollback.assert_not_called()

    def test_action_failure_rolls_back_and_does_not_accept(self) -> None:
        with patch(
            "app.services.ai_authoring_proposal_service.QuestionEditorService.apply_action_set",
            side_effect=InvalidAuthoringActionTargetError("private detail"),
        ), self.assertRaises(AIAuthoringProposalActionApplicationError):
            self.service.accept_proposal(
                proposal_id=self.proposal.id,
                accepted_by_user_id=self.actor_id,
            )

        self.assertEqual(self.proposal.status, AIAuthoringProposalStatus.PENDING)
        self.db.commit.assert_not_called()
        self.db.rollback.assert_called_once()

    def test_stale_revision_becomes_obsolete_without_action_application(self) -> None:
        self.revision.updated_at = NOW + timedelta(seconds=1)
        with patch(
            "app.services.ai_authoring_proposal_service.QuestionEditorService.apply_action_set"
        ) as apply, self.assertRaises(AIAuthoringProposalObsoleteError):
            self.service.accept_proposal(
                proposal_id=self.proposal.id,
                accepted_by_user_id=self.actor_id,
            )

        apply.assert_not_called()
        self.assertEqual(self.proposal.status, AIAuthoringProposalStatus.OBSOLETE)
        self.db.commit.assert_called_once()

    def test_reject_records_decision_without_editor_mutation(self) -> None:
        self.db.scalar.side_effect = [self.proposal, self.actor_id]
        with patch(
            "app.services.ai_authoring_proposal_service.QuestionEditorService.apply_action_set"
        ) as apply:
            result = self.service.reject_proposal(
                proposal_id=self.proposal.id,
                rejected_by_user_id=self.actor_id,
            )

        apply.assert_not_called()
        self.assertEqual(result.status, AIAuthoringProposalStatus.REJECTED)
        self.assertEqual(result.rejected_by_user_id, self.actor_id)
        self.assertIsNotNone(result.rejected_at)
        self.db.commit.assert_called_once()

    def test_terminal_proposal_cannot_be_decided_again(self) -> None:
        for status in (
            AIAuthoringProposalStatus.ACCEPTED,
            AIAuthoringProposalStatus.REJECTED,
            AIAuthoringProposalStatus.OBSOLETE,
        ):
            with self.subTest(status=status):
                proposal = pending_proposal(self.revision)
                proposal.status = status
                db = MagicMock()
                db.scalar.return_value = proposal
                with self.assertRaises(AIAuthoringProposalNotPendingError):
                    AIAuthoringProposalService(db).accept_proposal(
                        proposal_id=proposal.id,
                        accepted_by_user_id=self.actor_id,
                    )
                db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
