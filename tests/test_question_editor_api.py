from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = (
    "test-refresh-token-hash-key-000001"
)
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.question_editor import router as question_editor_router
from app.core.enums import RoleName
from app.database.session import get_db
from app.main import app
from app.schemas.question_editor import (
    QuestionDraftCreate,
    QuestionDraftRead,
    QuestionRevisionEditorRead,
)
from app.services.question_editor_service import (
    PurposeNotFoundError,
    QuestionTypeNotFoundError,
    RevisionNotFoundError,
    TopicNotFoundError,
)


NOW = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)


class QuestionEditorApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        self.current_user = SimpleNamespace(
            id=uuid.uuid4(),
            last_active_role_id=uuid.uuid4(),
        )

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_active_user] = (
            lambda: self.current_user
        )
        self.client = TestClient(app)

        self.question_type_id = uuid.uuid4()
        self.primary_topic_id = uuid.uuid4()
        self.related_topic_id = uuid.uuid4()
        self.purpose_id = uuid.uuid4()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _draft_request(self) -> dict[str, object]:
        return {
            "question_type_id": str(self.question_type_id),
            "primary_topic_id": str(self.primary_topic_id),
            "related_topic_ids": [str(self.related_topic_id)],
            "purpose_ids": [str(self.purpose_id)],
        }

    def _draft_response(self) -> QuestionDraftRead:
        return QuestionDraftRead.model_validate({
            "question_family_id": uuid.uuid4(),
            "question_form_id": uuid.uuid4(),
            "revision_id": uuid.uuid4(),
            "revision_number": 1,
            "status": "draft",
            "question_type_id": self.question_type_id,
            "primary_topic_id": self.primary_topic_id,
            "related_topic_ids": [self.related_topic_id],
            "purpose_ids": [self.purpose_id],
            "difficulty": None,
            "updated_at": NOW,
        })

    def _revision_response(self) -> QuestionRevisionEditorRead:
        return QuestionRevisionEditorRead.model_validate({
            **self._draft_response().model_dump(),
            "blocks": [],
        })

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_creates_draft_with_validated_request_and_actor(
        self, service_class: MagicMock,
    ) -> None:
        expected = self._draft_response()
        service_class.return_value.create_draft.return_value = expected

        response = self.client.post(
            "/api/v1/question-editor/drafts",
            json=self._draft_request(),
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["revision_id"], str(expected.revision_id))
        service_class.assert_called_once_with(self.db)
        call = service_class.return_value.create_draft.call_args
        self.assertIsInstance(call.kwargs["draft"], QuestionDraftCreate)
        self.assertEqual(call.kwargs["draft"].question_type_id, self.question_type_id)
        self.assertEqual(call.kwargs["actor_id"], self.current_user.id)

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_response_has_only_public_shape(
        self, service_class: MagicMock,
    ) -> None:
        expected = self._draft_response()
        service_class.return_value.create_draft.return_value = expected
        response = self.client.post(
            "/api/v1/question-editor/drafts", json=self._draft_request(),
        )
        self.assertEqual(set(response.json()), set(expected.model_dump()))
        self.assertNotIn("deleted_at", response.json())
        self.assertNotIn("created_by_user_id", response.json())

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_rejects_malformed_or_server_owned_fields_before_service(
        self, service_class: MagicMock,
    ) -> None:
        cases = (
            {},
            {**self._draft_request(), "revision_id": str(uuid.uuid4())},
            {**self._draft_request(), "question_type_id": "not-a-uuid"},
        )
        for request in cases:
            with self.subTest(request=request):
                response = self.client.post(
                    "/api/v1/question-editor/drafts", json=request,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_domain_errors_map_to_stable_422_responses(
        self, service_class: MagicMock,
    ) -> None:
        cases = (
            (QuestionTypeNotFoundError(), "Question type is unavailable."),
            (TopicNotFoundError(), "Topic is unavailable."),
            (PurposeNotFoundError(), "Purpose is unavailable."),
        )
        for error, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.create_draft.side_effect = error
                response = self.client.post(
                    "/api/v1/question-editor/drafts",
                    json=self._draft_request(),
                )
                self.assertEqual(response.status_code, 422)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_unauthenticated_requests_return_401_without_service_call(
        self, service_class: MagicMock,
    ) -> None:
        del app.dependency_overrides[get_current_active_user]
        responses = (
            self.client.post(
                "/api/v1/question-editor/drafts", json=self._draft_request(),
            ),
            self.client.get(
                f"/api/v1/question-editor/revisions/{uuid.uuid4()}"
            ),
        )
        self.assertTrue(all(response.status_code == 401 for response in responses))
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_non_admin_active_role_returns_403_without_service_call(
        self, service_class: MagicMock,
    ) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        response = self.client.post(
            "/api/v1/question-editor/drafts", json=self._draft_request(),
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"detail": "You do not have permission to access this resource."},
        )
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_reads_revision_and_delegates_uuid(
        self, service_class: MagicMock,
    ) -> None:
        expected = self._revision_response()
        service_class.return_value.get_revision_for_editor.return_value = expected
        response = self.client.get(
            f"/api/v1/question-editor/revisions/{expected.revision_id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["revision_id"], str(expected.revision_id))
        self.assertEqual(response.json()["blocks"], [])
        self.assertNotIn("deleted_at", response.json())
        service_class.assert_called_once_with(self.db)
        service_class.return_value.get_revision_for_editor.assert_called_once_with(
            revision_id=expected.revision_id,
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_revision_not_found_maps_to_404(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        service_class.return_value.get_revision_for_editor.side_effect = (
            RevisionNotFoundError()
        )
        response = self.client.get(
            f"/api/v1/question-editor/revisions/{revision_id}"
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(),
            {"detail": "Question revision was not found."},
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_malformed_revision_uuid_returns_422_before_service(
        self, service_class: MagicMock,
    ) -> None:
        response = self.client.get(
            "/api/v1/question-editor/revisions/not-a-uuid"
        )
        self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    def test_router_contains_only_step_6e_a_question_editor_routes(self) -> None:
        route_methods = {
            (method, route.path)
            for route in question_editor_router.routes
            for method in getattr(route, "methods", set())
        }
        self.assertEqual(route_methods, {
            ("POST", "/question-editor/drafts"),
            ("GET", "/question-editor/revisions/{revision_id}"),
        })


if __name__ == "__main__":
    unittest.main()
