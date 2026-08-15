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
    TextBlockCreate,
    TextBlockRead,
    TextBlockUpdate,
)
from app.services.question_editor_service import (
    ContentBlockOrderConflictError,
    EditorBlockContentMissingError,
    EditorBlockNotFoundError,
    EditorBlockTypeMismatchError,
    PurposeNotFoundError,
    QuestionTypeNotFoundError,
    RevisionNotFoundError,
    RevisionConflictError,
    RevisionNotEditableError,
    TopicNotFoundError,
)
from app.services.structured_text_service import (
    UnsupportedStructuredTextVersionError,
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

    def _document(self) -> dict[str, object]:
        return {
            "type": "document",
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": "Solve this"}],
            }],
        }

    def _text_create_request(self) -> dict[str, object]:
        return {
            "block_type": "text",
            "payload": {
                "document": self._document(),
                "format_version": 1,
            },
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _text_update_request(self) -> dict[str, object]:
        return {
            "document": self._document(),
            "format_version": 1,
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _text_response(self) -> TextBlockRead:
        return TextBlockRead.model_validate({
            "id": uuid.uuid4(),
            "block_type": "text",
            "sort_order": 1000,
            "payload": {
                "source_text": "Solve this",
                "document": self._document(),
                "format_version": 1,
            },
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

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_creates_text_block_with_validated_request(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        expected = self._text_response()
        service_class.return_value.create_text_block.return_value = expected
        response = self.client.post(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/text",
            json=self._text_create_request(),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        service_class.assert_called_once_with(self.db)
        call = service_class.return_value.create_text_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertIsInstance(call.kwargs["request"], TextBlockCreate)
        self.assertEqual(
            call.kwargs["request"].expected_revision_updated_at, NOW,
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_text_rejects_invalid_path_and_strict_body_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        valid = self._text_create_request()
        cases = (
            ("not-a-uuid", valid),
            (str(revision_id), {"block_type": "text"}),
            (str(revision_id), {**valid, "source_text": "client value"}),
            (str(revision_id), {**valid, "sort_order": 1000}),
            (str(revision_id), {**valid, "revision_id": str(revision_id)}),
        )
        for path_id, body in cases:
            with self.subTest(path_id=path_id, body=body):
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{path_id}/blocks/text",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_text_maps_known_service_errors(
        self, service_class: MagicMock,
    ) -> None:
        cases = (
            (RevisionNotFoundError(), 404, "Question revision was not found."),
            (RevisionNotEditableError(), 409, "Question revision is not editable."),
            (
                RevisionConflictError(), 409,
                "Question revision was modified by another request.",
            ),
            (
                ContentBlockOrderConflictError(), 409,
                "Content block order conflict.",
            ),
            (
                UnsupportedStructuredTextVersionError(), 422,
                "Structured text format version is unsupported.",
            ),
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.create_text_block.side_effect = error
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/text",
                    json=self._text_create_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_updates_text_block_with_validated_ids_and_request(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        expected = self._text_response()
        service_class.return_value.update_text_block.return_value = expected
        response = self.client.patch(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}/text",
            json=self._text_update_request(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = service_class.return_value.update_text_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertEqual(call.kwargs["block_id"], block_id)
        self.assertIsInstance(call.kwargs["request"], TextBlockUpdate)
        self.assertEqual(
            call.kwargs["request"].expected_revision_updated_at, NOW,
        )
        self.assertEqual(
            set(response.json()), {"id", "block_type", "sort_order", "payload"},
        )
        self.assertEqual(
            set(response.json()["payload"]),
            {"source_text", "document", "format_version"},
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_text_rejects_invalid_path_and_strict_body_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        valid = self._text_update_request()
        cases = (
            ("not-a-uuid", str(block_id), valid),
            (str(revision_id), "not-a-uuid", valid),
            (str(revision_id), str(block_id), {}),
            (str(revision_id), str(block_id), {**valid, "block_type": "text"}),
            (str(revision_id), str(block_id), {**valid, "source_text": "client"}),
            (str(revision_id), str(block_id), {**valid, "sort_order": 2000}),
            (str(revision_id), str(block_id), {**valid, "deleted_at": NOW.isoformat()}),
        )
        for revision_path, block_path, body in cases:
            with self.subTest(body=body):
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{revision_path}/blocks/{block_path}/text",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_text_maps_known_service_errors(
        self, service_class: MagicMock,
    ) -> None:
        cases = (
            (RevisionNotFoundError(), 404, "Question revision was not found."),
            (RevisionNotEditableError(), 409, "Question revision is not editable."),
            (
                RevisionConflictError(), 409,
                "Question revision was modified by another request.",
            ),
            (EditorBlockNotFoundError(), 404, "Content block was not found."),
            (
                EditorBlockTypeMismatchError(), 409,
                "Content block type does not match the requested operation.",
            ),
            (
                EditorBlockContentMissingError(), 409,
                "Content block payload is unavailable.",
            ),
            (
                UnsupportedStructuredTextVersionError(), 422,
                "Structured text format version is unsupported.",
            ),
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.update_text_block.side_effect = error
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/text",
                    json=self._text_update_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_text_routes_require_authentication_before_service(
        self, service_class: MagicMock,
    ) -> None:
        del app.dependency_overrides[get_current_active_user]
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        responses = (
            self.client.post(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/text",
                json=self._text_create_request(),
            ),
            self.client.patch(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}/text",
                json=self._text_update_request(),
            ),
        )
        self.assertTrue(all(response.status_code == 401 for response in responses))
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_text_routes_reject_non_admin_before_service(
        self, service_class: MagicMock,
    ) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        responses = (
            self.client.post(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/text",
                json=self._text_create_request(),
            ),
            self.client.patch(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}/text",
                json=self._text_update_request(),
            ),
        )
        self.assertTrue(all(response.status_code == 403 for response in responses))
        service_class.assert_not_called()

    def test_router_contains_only_step_6e_a_and_b_routes(self) -> None:
        route_methods = {
            (method, route.path)
            for route in question_editor_router.routes
            for method in getattr(route, "methods", set())
        }
        self.assertEqual(route_methods, {
            ("POST", "/question-editor/drafts"),
            ("GET", "/question-editor/revisions/{revision_id}"),
            ("POST", "/question-editor/revisions/{revision_id}/blocks/text"),
            (
                "PATCH",
                "/question-editor/revisions/{revision_id}/blocks/{block_id}/text",
            ),
        })


if __name__ == "__main__":
    unittest.main()
