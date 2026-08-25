from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = "test-verification-code-hash-key-01"

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from app.api.ai_authoring import get_authoring_assistant_provider
from app.api.deps import get_current_active_user
from app.core.enums import (
    AIAuthoringConversationStatus,
    AIAuthoringMessageRole,
    AIAuthoringProposalStatus,
    RoleName,
)
from app.database.session import get_db
from app.main import app
from app.models.ai_authoring_conversation import AIAuthoringConversation
from app.models.ai_authoring_message import AIAuthoringMessage
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.services.ai_authoring_conversation_service import (
    AIAuthoringConversationClosedError,
)
from app.services.ai_authoring_proposal_preview_service import (
    AuthoringProposalPreview,
)
from app.services.ai_authoring_proposal_service import (
    AIAuthoringProposalNotPendingError,
    AIAuthoringProposalObsoleteError,
)
from app.services.ai_authoring_turn_service import AIAuthoringTurnStaleContextError
from app.services.authoring_assistant_provider import (
    AuthoringAssistantInvalidResponseError,
    AuthoringAssistantTimeoutError,
)


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


class FakeProvider:
    pass


def conversation(*, status=AIAuthoringConversationStatus.ACTIVE):
    return AIAuthoringConversation(
        id=uuid.uuid4(),
        active_revision_id=uuid.uuid4(),
        created_by_user_id=uuid.uuid4(),
        status=status,
        created_at=NOW,
        updated_at=NOW,
    )


def message(conversation_id: uuid.UUID, user_id: uuid.UUID):
    return AIAuthoringMessage(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role=AIAuthoringMessageRole.USER,
        sequence_number=1,
        content="Change the numbers",
        created_by_user_id=user_id,
        created_at=NOW,
    )


def proposal(*, status=AIAuthoringProposalStatus.PENDING):
    return AIAuthoringProposal(
        id=uuid.uuid4(),
        source_revision_id=uuid.uuid4(),
        source_revision_updated_at=NOW,
        status=status,
        action_schema_version=1,
        actions={
            "schema_version": 1,
            "actions": [{
                "action_type": "create_formula_block",
                "payload": {"source_latex": "x^2", "format_version": 1},
            }],
        },
        provider_name="fake",
        model_name="fake-model",
        prompt_version="question-authoring-v1",
        provider_schema_version=1,
        requested_by_user_id=uuid.uuid4(),
        request_message_id=uuid.uuid4(),
        accepted_by_user_id=None,
        rejected_by_user_id=None,
        accepted_at=None,
        rejected_at=None,
        created_at=NOW,
    )


class AIAuthoringApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        self.user = SimpleNamespace(id=uuid.uuid4(), last_active_role_id=uuid.uuid4())

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_active_user] = lambda: self.user
        app.dependency_overrides[get_authoring_assistant_provider] = lambda: FakeProvider()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @patch("app.api.ai_authoring.AIAuthoringConversationService")
    def test_create_get_list_and_close_conversation(self, service_cls) -> None:
        item = conversation()
        item.created_by_user_id = self.user.id
        service_cls.return_value.create_conversation.return_value = item
        service_cls.return_value.get_conversation.return_value = item
        service_cls.return_value.list_messages.return_value = [message(item.id, self.user.id)]
        closed = conversation(status=AIAuthoringConversationStatus.CLOSED)
        closed.id = item.id
        service_cls.return_value.close_conversation.return_value = closed

        created = self.client.post(
            f"/api/v1/questions/revisions/{item.active_revision_id}/ai-authoring/conversations"
        )
        fetched = self.client.get(f"/api/v1/ai-authoring/conversations/{item.id}")
        messages = self.client.get(f"/api/v1/ai-authoring/conversations/{item.id}/messages")
        close = self.client.post(f"/api/v1/ai-authoring/conversations/{item.id}/close")

        self.assertEqual((created.status_code, fetched.status_code, messages.status_code, close.status_code), (201, 200, 200, 200))
        self.assertEqual(messages.json()[0]["role"], "user")
        service_cls.return_value.create_conversation.assert_called_once_with(
            active_revision_id=item.active_revision_id,
            created_by_user_id=self.user.id,
        )

    def test_anonymous_create_is_rejected(self) -> None:
        app.dependency_overrides.pop(get_current_active_user)
        response = self.client.post(
            f"/api/v1/questions/revisions/{uuid.uuid4()}/ai-authoring/conversations"
        )
        self.assertIn(response.status_code, (401, 403))

    @patch("app.api.ai_authoring.AIAuthoringTurnService")
    def test_submit_returns_message_pending_proposal_and_safe_provenance(self, turn_cls) -> None:
        item = proposal()
        msg = message(uuid.uuid4(), self.user.id)
        turn_cls.return_value.submit_user_turn.return_value = SimpleNamespace(
            user_message=msg, proposal=item
        )
        response = self.client.post(
            f"/api/v1/ai-authoring/conversations/{msg.conversation_id}/messages",
            json={"instruction": msg.content},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user_message"]["content"], msg.content)
        self.assertEqual(body["proposal"]["status"], "pending")
        self.assertEqual(body["proposal"]["provider_name"], "fake")
        self.assertNotIn("raw_response", repr(body))
        self.assertNotIn("api_key", repr(body))
        provider = turn_cls.call_args.kwargs["provider"]
        self.assertIsInstance(provider, FakeProvider)
        turn_cls.return_value.submit_user_turn.assert_called_once_with(
            conversation_id=msg.conversation_id,
            user_id=self.user.id,
            instruction=msg.content,
        )

    @patch("app.api.ai_authoring.AIAuthoringTurnService")
    def test_submit_errors_have_safe_http_mapping(self, turn_cls) -> None:
        cases = (
            (AuthoringAssistantTimeoutError("provider-secret"), 504),
            (AuthoringAssistantInvalidResponseError("source-secret"), 502),
            (AIAuthoringConversationClosedError("private"), 409),
            (AIAuthoringTurnStaleContextError("private"), 409),
        )
        for error, expected in cases:
            with self.subTest(expected=expected):
                turn_cls.return_value.submit_user_turn.side_effect = error
                response = self.client.post(
                    f"/api/v1/ai-authoring/conversations/{uuid.uuid4()}/messages",
                    json={"instruction": "Safe request"},
                )
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("secret", response.text)
                self.assertNotIn("private", response.text)

    @patch("app.api.ai_authoring.AIAuthoringProposalService")
    def test_get_proposal_exposes_typed_envelope_without_internal_payload(self, service_cls) -> None:
        item = proposal()
        service_cls.return_value.get_proposal.return_value = item
        response = self.client.get(f"/api/v1/ai-authoring/proposals/{item.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["action_envelope"]["schema_version"], 1)
        self.assertNotIn("raw_provider", response.text)

    @patch("app.api.ai_authoring.AIAuthoringProposalPreviewService")
    def test_preview_returns_stale_warning_and_change_contract(self, service_cls) -> None:
        item = proposal()
        service_cls.return_value.build_preview.return_value = AuthoringProposalPreview(
            proposal_id=item.id,
            source_revision_id=item.source_revision_id,
            source_revision_updated_at=NOW - timedelta(seconds=1),
            current_revision_updated_at=NOW,
            proposal_status=AIAuthoringProposalStatus.PENDING,
            is_stale=True,
            action_count=1,
            changes=(),
            warnings=("stale_revision",),
        )
        response = self.client.get(f"/api/v1/ai-authoring/proposals/{item.id}/preview")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_stale"])
        self.assertEqual(response.json()["warnings"], ["stale_revision"])

    @patch("app.api.ai_authoring.AIAuthoringProposalService")
    def test_accept_and_reject_delegate_only_to_canonical_decisions(self, service_cls) -> None:
        accepted = proposal(status=AIAuthoringProposalStatus.ACCEPTED)
        accepted.accepted_by_user_id = self.user.id
        accepted.accepted_at = NOW
        rejected = proposal(status=AIAuthoringProposalStatus.REJECTED)
        rejected.rejected_by_user_id = self.user.id
        rejected.rejected_at = NOW
        service_cls.return_value.accept_proposal.return_value = accepted
        service_cls.return_value.reject_proposal.return_value = rejected

        accept = self.client.post(f"/api/v1/ai-authoring/proposals/{accepted.id}/accept")
        reject = self.client.post(f"/api/v1/ai-authoring/proposals/{rejected.id}/reject")
        self.assertEqual((accept.status_code, reject.status_code), (200, 200))
        service_cls.return_value.accept_proposal.assert_called_once_with(
            proposal_id=accepted.id, accepted_by_user_id=self.user.id
        )
        service_cls.return_value.reject_proposal.assert_called_once_with(
            proposal_id=rejected.id, rejected_by_user_id=self.user.id
        )

    @patch("app.api.ai_authoring.AIAuthoringProposalService")
    def test_terminal_and_stale_decisions_map_to_conflict(self, service_cls) -> None:
        service_cls.return_value.accept_proposal.side_effect = AIAuthoringProposalObsoleteError("private")
        service_cls.return_value.reject_proposal.side_effect = AIAuthoringProposalNotPendingError("private")
        accept = self.client.post(f"/api/v1/ai-authoring/proposals/{uuid.uuid4()}/accept")
        reject = self.client.post(f"/api/v1/ai-authoring/proposals/{uuid.uuid4()}/reject")
        self.assertEqual((accept.status_code, reject.status_code), (409, 409))

    def test_submit_route_has_no_manual_mutation_dependency(self) -> None:
        import app.api.ai_authoring as module

        names = set(vars(module))
        self.assertNotIn("QuestionEditorService", names)
        self.assertNotIn("apply_action_set", names)


if __name__ == "__main__":
    unittest.main()
