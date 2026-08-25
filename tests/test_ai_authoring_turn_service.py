from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import AIAuthoringProposalStatus, QuestionRevisionStatus
from app.models.ai_authoring_message import AIAuthoringMessage
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.services.ai_authoring_conversation_service import (
    AIAuthoringConversationClosedError,
    AIAuthoringConversationNotFoundError,
    AIAuthoringConversationUserNotFoundError,
    AIAuthoringMessageValidationError,
)
from app.services.ai_authoring_proposal_service import (
    AIAuthoringProposalRevisionConflictError,
)
from app.services.ai_authoring_turn_service import (
    AIAuthoringTurnRevisionNotEditableError,
    AIAuthoringTurnService,
    AIAuthoringTurnStaleContextError,
)
from app.services.authoring_action import AuthoringActionEnvelope
from app.services.authoring_assistant_provider import (
    AuthoringAssistantAPIError,
    AuthoringAssistantInvalidActionTargetError,
    AuthoringAssistantInvalidResponseError,
    AuthoringAssistantNetworkError,
    AuthoringAssistantRateLimitError,
    AuthoringAssistantResult,
    AuthoringAssistantTimeoutError,
)
from app.services.question_authoring_context import (
    AuthoringContextRevisionNotFoundError,
)


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


def action_envelope() -> AuthoringActionEnvelope:
    return AuthoringActionEnvelope.model_validate({
        "schema_version": 1,
        "actions": [{
            "action_type": "create_formula_block",
            "payload": {"source_latex": "x^2", "format_version": 1},
        }],
    })


class FakeProvider:
    def __init__(self, *, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[dict[str, object]] = []

    def propose_actions(self, **kwargs: object) -> AuthoringAssistantResult:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return AuthoringAssistantResult(
            action_envelope=action_envelope(),
            provider_name="fake-provider",
            model_name="fake-model",
            prompt_version="question-authoring-v1",
            provider_schema_version=1,
        )


class AIAuthoringTurnServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.conversation_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.message = AIAuthoringMessage(
            id=uuid.uuid4(),
            conversation_id=self.conversation_id,
            sequence_number=1,
            content="Change the numbers",
            created_by_user_id=self.user_id,
        )
        self.context = SimpleNamespace(
            revision_id=uuid.uuid4(),
            revision_updated_at=NOW,
            revision_status=QuestionRevisionStatus.DRAFT,
        )
        self.proposal = AIAuthoringProposal(
            id=uuid.uuid4(),
            source_revision_id=self.context.revision_id,
            source_revision_updated_at=NOW,
            request_message_id=self.message.id,
            status=AIAuthoringProposalStatus.PENDING,
        )

    def submit(self, provider: FakeProvider):
        return AIAuthoringTurnService(self.db, provider=provider).submit_user_turn(
            conversation_id=self.conversation_id,
            user_id=self.user_id,
            instruction=self.message.content,
        )

    @patch("app.services.ai_authoring_turn_service.AIAuthoringProposalService")
    @patch("app.services.ai_authoring_turn_service.QuestionAuthoringContextService")
    @patch("app.services.ai_authoring_turn_service.AIAuthoringConversationService")
    def test_successful_turn_persists_message_builds_context_and_one_proposal(
        self, conversation_cls, context_cls, proposal_cls
    ) -> None:
        conversation_cls.return_value.add_user_message.return_value = self.message
        context_cls.return_value.build_for_conversation.return_value = self.context
        proposal_cls.return_value.create_pending_proposal.return_value = self.proposal
        provider = FakeProvider()

        result = self.submit(provider)

        conversation_cls.return_value.add_user_message.assert_called_once_with(
            conversation_id=self.conversation_id,
            user_id=self.user_id,
            content=self.message.content,
        )
        context_cls.return_value.build_for_conversation.assert_called_once_with(
            conversation_id=self.conversation_id
        )
        self.assertEqual(provider.calls, [{
            "instruction": self.message.content,
            "context": self.context,
        }])
        proposal_cls.return_value.create_pending_proposal.assert_called_once_with(
            source_revision_id=self.context.revision_id,
            expected_revision_updated_at=NOW,
            action_envelope=action_envelope(),
            provider_name="fake-provider",
            model_name="fake-model",
            prompt_version="question-authoring-v1",
            provider_schema_version=1,
            requested_by_user_id=self.user_id,
            request_message_id=self.message.id,
        )
        self.assertIs(result.user_message, self.message)
        self.assertIs(result.proposal, self.proposal)
        self.db.rollback.assert_called_once()

    @patch("app.services.ai_authoring_turn_service.AIAuthoringProposalService")
    @patch("app.services.ai_authoring_turn_service.QuestionAuthoringContextService")
    @patch("app.services.ai_authoring_turn_service.AIAuthoringConversationService")
    def test_provider_failures_leave_message_but_create_no_proposal_or_assistant(
        self, conversation_cls, context_cls, proposal_cls
    ) -> None:
        errors = (
            AuthoringAssistantTimeoutError("safe"),
            AuthoringAssistantRateLimitError("safe"),
            AuthoringAssistantNetworkError("safe"),
            AuthoringAssistantAPIError("safe"),
            AuthoringAssistantInvalidResponseError("safe"),
            AuthoringAssistantInvalidActionTargetError("safe"),
        )
        for error in errors:
            with self.subTest(error=type(error).__name__):
                conversation_cls.reset_mock()
                context_cls.reset_mock()
                proposal_cls.reset_mock()
                conversation_cls.return_value.add_user_message.return_value = self.message
                context_cls.return_value.build_for_conversation.return_value = self.context
                with self.assertRaises(type(error)):
                    self.submit(FakeProvider(error=error))
                conversation_cls.return_value.add_user_message.assert_called_once()
                self.assertFalse(hasattr(conversation_cls.return_value, "add_assistant_message") and conversation_cls.return_value.add_assistant_message.called)
                proposal_cls.return_value.create_pending_proposal.assert_not_called()

    @patch("app.services.ai_authoring_turn_service.AIAuthoringProposalService")
    @patch("app.services.ai_authoring_turn_service.QuestionAuthoringContextService")
    @patch("app.services.ai_authoring_turn_service.AIAuthoringConversationService")
    def test_stale_revision_after_provider_creates_no_actionable_proposal(
        self, conversation_cls, context_cls, proposal_cls
    ) -> None:
        conversation_cls.return_value.add_user_message.return_value = self.message
        context_cls.return_value.build_for_conversation.return_value = self.context
        proposal_cls.return_value.create_pending_proposal.side_effect = (
            AIAuthoringProposalRevisionConflictError("private")
        )
        with self.assertRaises(AIAuthoringTurnStaleContextError):
            self.submit(FakeProvider())
        proposal_cls.return_value.create_pending_proposal.assert_called_once()

    @patch("app.services.ai_authoring_turn_service.AIAuthoringProposalService")
    @patch("app.services.ai_authoring_turn_service.QuestionAuthoringContextService")
    @patch("app.services.ai_authoring_turn_service.AIAuthoringConversationService")
    def test_non_draft_revision_rejects_before_provider_and_proposal(
        self, conversation_cls, context_cls, proposal_cls
    ) -> None:
        conversation_cls.return_value.add_user_message.return_value = self.message
        context_cls.return_value.build_for_conversation.return_value = SimpleNamespace(
            revision_status=QuestionRevisionStatus.APPROVED
        )
        provider = FakeProvider()
        with self.assertRaises(AIAuthoringTurnRevisionNotEditableError):
            self.submit(provider)
        self.assertEqual(provider.calls, [])
        proposal_cls.return_value.create_pending_proposal.assert_not_called()

    @patch("app.services.ai_authoring_turn_service.AIAuthoringConversationService")
    def test_message_validation_and_conversation_preconditions_are_reused(
        self, conversation_cls
    ) -> None:
        errors = (
            AIAuthoringMessageValidationError("invalid"),
            AIAuthoringConversationClosedError("closed"),
            AIAuthoringConversationNotFoundError("deleted"),
            AIAuthoringConversationUserNotFoundError("inactive"),
        )
        for error in errors:
            with self.subTest(error=type(error).__name__):
                conversation_cls.return_value.add_user_message.side_effect = error
                with self.assertRaises(type(error)):
                    self.submit(FakeProvider())

    @patch("app.services.ai_authoring_turn_service.QuestionAuthoringContextService")
    @patch("app.services.ai_authoring_turn_service.AIAuthoringConversationService")
    def test_invalid_revision_stops_before_provider(self, conversation_cls, context_cls) -> None:
        conversation_cls.return_value.add_user_message.return_value = self.message
        context_cls.return_value.build_for_conversation.side_effect = (
            AuthoringContextRevisionNotFoundError("missing")
        )
        provider = FakeProvider()
        with self.assertRaises(AuthoringContextRevisionNotFoundError):
            self.submit(provider)
        self.assertEqual(provider.calls, [])

    def test_service_has_no_manual_mutation_or_decision_dependencies(self) -> None:
        module = sys.modules[AIAuthoringTurnService.__module__]
        names = set(vars(module))
        self.assertNotIn("QuestionEditorService", names)
        self.assertNotIn("apply_action_set", names)
        self.assertNotIn("accept_proposal", names)
        self.assertNotIn("reject_proposal", names)


if __name__ == "__main__":
    unittest.main()
