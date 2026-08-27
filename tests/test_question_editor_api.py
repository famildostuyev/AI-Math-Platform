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
    BlockOrderRequest,
    FormulaBlockCreate,
    FormulaBlockRead,
    FormulaBlockUpdate,
    GeometryBlockCreate,
    GeometryBlockRead,
    GeometryBlockUpdate,
    ImageBlockCreate,
    ImageBlockRead,
    ImageBlockUpdate,
    QuestionDraftCreate,
    QuestionDraftRead,
    QuestionRevisionEditorRead,
    TextBlockCreate,
    TextBlockRead,
    TextBlockUpdate,
)
from app.services.question_editor_service import (
    BlockOrderSetMismatchError,
    ContentBlockOrderConflictError,
    EditorBlockContentMissingError,
    EditorBlockNotFoundError,
    EditorBlockTypeMismatchError,
    MediaAssetNotFoundError,
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
            "source_id": None,
            "source_detail": None,
            "source_display_name": None,
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

    def _formula_create_request(
        self, source_latex: str = "  x^2 + 1  ",
    ) -> dict[str, object]:
        return {
            "block_type": "formula",
            "payload": {
                "source_latex": source_latex,
                "format_version": 1,
            },
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _formula_update_request(
        self, source_latex: str = "  y^2 - 1  ",
    ) -> dict[str, object]:
        return {
            "source_latex": source_latex,
            "format_version": 1,
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _formula_response(
        self, source_latex: str = "  x^2 + 1  ",
    ) -> FormulaBlockRead:
        return FormulaBlockRead.model_validate({
            "id": uuid.uuid4(),
            "block_type": "formula",
            "sort_order": 1000,
            "payload": {
                "source_latex": source_latex,
                "format_version": 1,
            },
        })

    def _geometry_create_request(
        self,
        source_data: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return {
            "block_type": "geometry",
            "payload": {
                "source_data": {} if source_data is None else source_data,
                "format_version": 1,
            },
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _geometry_response(
        self,
        source_data: dict[str, object] | None = None,
    ) -> GeometryBlockRead:
        return GeometryBlockRead.model_validate({
            "id": uuid.uuid4(),
            "block_type": "geometry",
            "sort_order": 1000,
            "payload": {
                "source_data": {} if source_data is None else source_data,
                "format_version": 1,
            },
        })

    def _geometry_update_request(
        self,
        source_data: dict[str, object] | None = None,
    ) -> dict[str, object]:
        return {
            "source_data": {} if source_data is None else source_data,
            "format_version": 1,
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _image_create_request(
        self,
        media_asset_id: uuid.UUID | None = None,
        alt_text: str | None = "Coordinate graph",
    ) -> dict[str, object]:
        return {
            "block_type": "image",
            "payload": {
                "media_asset_id": str(media_asset_id or uuid.uuid4()),
                "alt_text": alt_text,
            },
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _image_update_request(
        self,
        media_asset_id: uuid.UUID | None = None,
        alt_text: str | None = "Updated graph",
    ) -> dict[str, object]:
        return {
            "media_asset_id": str(media_asset_id or uuid.uuid4()),
            "alt_text": alt_text,
            "expected_revision_updated_at": NOW.isoformat(),
        }

    def _image_response(
        self,
        media_asset_id: uuid.UUID,
        alt_text: str | None,
    ) -> ImageBlockRead:
        return ImageBlockRead.model_validate({
            "id": uuid.uuid4(),
            "block_type": "image",
            "sort_order": 1000,
            "payload": {
                "media_asset_id": media_asset_id,
                "alt_text": alt_text,
            },
        })

    def _reorder_request(
        self,
        block_ids: list[uuid.UUID] | None = None,
    ) -> dict[str, object]:
        return {
            "block_ids": [str(block_id) for block_id in (block_ids or [])],
            "expected_revision_updated_at": NOW.isoformat(),
        }

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

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_creates_formula_with_exact_source_and_concurrency_token(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        source_latex = "  \\frac{x}{2} + y  "
        expected = self._formula_response(source_latex)
        service_class.return_value.create_formula_block.return_value = expected
        response = self.client.post(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/formula",
            json=self._formula_create_request(source_latex),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = service_class.return_value.create_formula_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertIsInstance(call.kwargs["request"], FormulaBlockCreate)
        self.assertEqual(call.kwargs["request"].payload.source_latex, source_latex)
        self.assertEqual(
            call.kwargs["request"].expected_revision_updated_at, NOW,
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_formula_accepts_empty_source_latex(
        self, service_class: MagicMock,
    ) -> None:
        service_class.return_value.create_formula_block.return_value = (
            self._formula_response("")
        )
        response = self.client.post(
            f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/formula",
            json=self._formula_create_request(""),
        )
        self.assertEqual(response.status_code, 201)
        request = service_class.return_value.create_formula_block.call_args.kwargs[
            "request"
        ]
        self.assertEqual(request.payload.source_latex, "")

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_formula_rejects_invalid_path_and_internal_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        valid = self._formula_create_request()
        cases = (
            ("not-a-uuid", valid),
            (str(revision_id), {"block_type": "formula"}),
            (str(revision_id), {**valid, "sort_order": 1000}),
            (str(revision_id), {**valid, "revision_id": str(revision_id)}),
            (str(revision_id), {**valid, "rendered_html": "<math />"}),
            (str(revision_id), {**valid, "rendered_svg": "<svg />"}),
            (str(revision_id), {**valid, "rendered_mathml": "<math />"}),
            (str(revision_id), {**valid, "deleted_at": NOW.isoformat()}),
        )
        for path_id, body in cases:
            with self.subTest(path_id=path_id, body=body):
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{path_id}/blocks/formula",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_formula_maps_known_service_errors(
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
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.create_formula_block.side_effect = error
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/formula",
                    json=self._formula_create_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_updates_formula_with_exact_source_and_ids(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        source_latex = "  y = mx + b  "
        expected = self._formula_response(source_latex)
        service_class.return_value.update_formula_block.return_value = expected
        response = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{revision_id}/blocks/{block_id}/formula",
            json=self._formula_update_request(source_latex),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = service_class.return_value.update_formula_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertEqual(call.kwargs["block_id"], block_id)
        self.assertIsInstance(call.kwargs["request"], FormulaBlockUpdate)
        self.assertEqual(call.kwargs["request"].source_latex, source_latex)
        self.assertEqual(call.kwargs["request"].expected_revision_updated_at, NOW)
        self.assertEqual(
            set(response.json()), {"id", "block_type", "sort_order", "payload"},
        )
        self.assertEqual(
            set(response.json()["payload"]), {"source_latex", "format_version"},
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_formula_accepts_empty_source_latex(
        self, service_class: MagicMock,
    ) -> None:
        service_class.return_value.update_formula_block.return_value = (
            self._formula_response("")
        )
        response = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/formula",
            json=self._formula_update_request(""),
        )
        self.assertEqual(response.status_code, 200)
        request = service_class.return_value.update_formula_block.call_args.kwargs[
            "request"
        ]
        self.assertEqual(request.source_latex, "")

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_formula_rejects_invalid_paths_and_internal_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        valid = self._formula_update_request()
        cases = (
            ("not-a-uuid", str(block_id), valid),
            (str(revision_id), "not-a-uuid", valid),
            (str(revision_id), str(block_id), {}),
            (str(revision_id), str(block_id), {**valid, "block_type": "formula"}),
            (str(revision_id), str(block_id), {**valid, "sort_order": 1000}),
            (str(revision_id), str(block_id), {**valid, "block_id": str(block_id)}),
            (str(revision_id), str(block_id), {**valid, "revision_id": str(revision_id)}),
            (str(revision_id), str(block_id), {**valid, "deleted_at": NOW.isoformat()}),
            (str(revision_id), str(block_id), {**valid, "rendered_html": "html"}),
            (str(revision_id), str(block_id), {**valid, "rendered_svg": "svg"}),
            (str(revision_id), str(block_id), {**valid, "rendered_mathml": "mathml"}),
        )
        for revision_path, block_path, body in cases:
            with self.subTest(body=body):
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{revision_path}/blocks/{block_path}/formula",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_formula_maps_known_service_errors(
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
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.update_formula_block.side_effect = error
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/formula",
                    json=self._formula_update_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_formula_routes_enforce_authentication_and_admin_role(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        del app.dependency_overrides[get_current_active_user]
        unauthenticated = (
            self.client.post(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/formula",
                json=self._formula_create_request(),
            ),
            self.client.patch(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}/formula",
                json=self._formula_update_request(),
            ),
        )
        self.assertTrue(all(item.status_code == 401 for item in unauthenticated))
        app.dependency_overrides[get_current_active_user] = lambda: self.current_user
        self.db.scalar.return_value = RoleName.TEACHER.value
        forbidden = (
            self.client.post(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/formula",
                json=self._formula_create_request(),
            ),
            self.client.patch(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}/formula",
                json=self._formula_update_request(),
            ),
        )
        self.assertTrue(all(item.status_code == 403 for item in forbidden))
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_deletes_block_with_aware_query_token_and_empty_response(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        response = self.client.delete(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}",
            params={"expected_revision_updated_at": NOW.isoformat()},
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        service_class.assert_called_once_with(self.db)
        service_class.return_value.delete_block.assert_called_once_with(
            revision_id=revision_id,
            block_id=block_id,
            expected_revision_updated_at=NOW,
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_delete_validates_ids_required_timestamp_and_timezone(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        cases = (
            ("not-a-uuid", str(block_id), {"expected_revision_updated_at": NOW.isoformat()}, None),
            (str(revision_id), "not-a-uuid", {"expected_revision_updated_at": NOW.isoformat()}, None),
            (str(revision_id), str(block_id), {}, None),
            (str(revision_id), str(block_id), {"expected_revision_updated_at": "bad"}, None),
            (
                str(revision_id), str(block_id),
                {"expected_revision_updated_at": "2026-08-16T12:00:00"},
                "Concurrency timestamp must include a timezone.",
            ),
        )
        for revision_path, block_path, params, detail in cases:
            with self.subTest(params=params):
                response = self.client.delete(
                    "/api/v1/question-editor/revisions/"
                    f"{revision_path}/blocks/{block_path}",
                    params=params,
                )
                self.assertEqual(response.status_code, 422)
                if detail is not None:
                    self.assertEqual(response.json(), {"detail": detail})
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_delete_maps_known_service_errors(
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
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.delete_block.side_effect = error
                response = self.client.delete(
                    "/api/v1/question-editor/revisions/"
                    f"{uuid.uuid4()}/blocks/{uuid.uuid4()}",
                    params={"expected_revision_updated_at": NOW.isoformat()},
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_reorders_exact_ids_and_empty_set_with_204(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        response = self.client.put(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/order",
            json=self._reorder_request(block_ids),
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        call = service_class.return_value.reorder_blocks.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertIsInstance(call.kwargs["request"], BlockOrderRequest)
        self.assertEqual(call.kwargs["request"].block_ids, block_ids)
        self.assertEqual(call.kwargs["request"].expected_revision_updated_at, NOW)

        service_class.reset_mock()
        response = self.client.put(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/order",
            json=self._reorder_request([]),
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(
            service_class.return_value.reorder_blocks.call_args.kwargs[
                "request"
            ].block_ids,
            [],
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_reorder_rejects_invalid_path_body_and_extra_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        valid = self._reorder_request([block_id])
        cases = (
            ("not-a-uuid", valid),
            (
                str(revision_id),
                self._reorder_request([block_id, block_id]),
            ),
            (
                str(revision_id),
                {**valid, "expected_revision_updated_at": "2026-08-16T12:00:00"},
            ),
            (
                str(revision_id),
                {**valid, "expected_revision_updated_at": "bad"},
            ),
            (str(revision_id), {**valid, "sort_order": 1000}),
            (str(revision_id), {**valid, "payload": {}}),
        )
        for revision_path, body in cases:
            with self.subTest(body=body):
                response = self.client.put(
                    f"/api/v1/question-editor/revisions/{revision_path}/blocks/order",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_reorder_maps_known_service_errors(
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
                BlockOrderSetMismatchError(), 409,
                "Block order does not match the active block set.",
            ),
            (
                ContentBlockOrderConflictError(), 409,
                "Content block order conflict.",
            ),
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.reorder_blocks.side_effect = error
                response = self.client.put(
                    f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/order",
                    json=self._reorder_request([]),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_delete_and_reorder_require_authentication_before_service(
        self, service_class: MagicMock,
    ) -> None:
        del app.dependency_overrides[get_current_active_user]
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        responses = (
            self.client.delete(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}",
                params={"expected_revision_updated_at": NOW.isoformat()},
            ),
            self.client.put(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/order",
                json=self._reorder_request([]),
            ),
        )
        self.assertTrue(all(response.status_code == 401 for response in responses))
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_delete_and_reorder_reject_non_admin_before_service(
        self, service_class: MagicMock,
    ) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        responses = (
            self.client.delete(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}",
                params={"expected_revision_updated_at": NOW.isoformat()},
            ),
            self.client.put(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/order",
                json=self._reorder_request([]),
            ),
        )
        self.assertTrue(all(response.status_code == 403 for response in responses))
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_creates_image_with_exact_public_contract(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        media_asset_id = uuid.uuid4()
        expected = self._image_response(media_asset_id, "  Graph  ")
        service_class.return_value.create_image_block.return_value = expected
        response = self.client.post(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/image",
            json=self._image_create_request(media_asset_id, "  Graph  "),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = service_class.return_value.create_image_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertIsInstance(call.kwargs["request"], ImageBlockCreate)
        self.assertEqual(call.kwargs["request"].payload.media_asset_id, media_asset_id)
        self.assertEqual(call.kwargs["request"].payload.alt_text, "  Graph  ")
        self.assertEqual(call.kwargs["request"].expected_revision_updated_at, NOW)
        self.assertEqual(
            set(response.json()), {"id", "block_type", "sort_order", "payload"},
        )
        self.assertEqual(
            set(response.json()["payload"]), {"media_asset_id", "alt_text"},
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_image_accepts_none_and_empty_alt_text(
        self, service_class: MagicMock,
    ) -> None:
        for alt_text in (None, ""):
            with self.subTest(alt_text=alt_text):
                service_class.reset_mock()
                media_asset_id = uuid.uuid4()
                service_class.return_value.create_image_block.return_value = (
                    self._image_response(media_asset_id, alt_text)
                )
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/image",
                    json=self._image_create_request(media_asset_id, alt_text),
                )
                self.assertEqual(response.status_code, 201)
                request = service_class.return_value.create_image_block.call_args.kwargs[
                    "request"
                ]
                self.assertEqual(request.payload.alt_text, alt_text)

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_image_rejects_invalid_and_internal_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        valid = self._image_create_request()
        payload = valid["payload"]
        cases = (
            ("not-a-uuid", valid),
            (str(revision_id), {**valid, "payload": {"alt_text": None}}),
            (str(revision_id), {**valid, "payload": {**payload, "media_asset_id": "bad"}}),
            (str(revision_id), {**valid, "block_type": "formula"}),
            (str(revision_id), {**valid, "sort_order": 1000}),
            (str(revision_id), {**valid, "revision_id": str(revision_id)}),
            (str(revision_id), {**valid, "deleted_at": None}),
            (str(revision_id), {**valid, "payload": {**payload, "storage_key": "secret"}}),
            (str(revision_id), {**valid, "payload": {**payload, "mime_type": "image/png"}}),
            (str(revision_id), {**valid, "payload": {**payload, "upload": "bytes"}}),
            (str(revision_id), {**valid, "payload": {**payload, "url": "https://x"}}),
            (str(revision_id), {**valid, "payload": {**payload, "path": "local"}}),
        )
        for path_id, body in cases:
            with self.subTest(body=body):
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{path_id}/blocks/image",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_image_maps_known_service_errors(
        self, service_class: MagicMock,
    ) -> None:
        cases = (
            (RevisionNotFoundError(), 404, "Question revision was not found."),
            (RevisionNotEditableError(), 409, "Question revision is not editable."),
            (
                RevisionConflictError(), 409,
                "Question revision was modified by another request.",
            ),
            (MediaAssetNotFoundError(), 404, "Media asset was not found."),
            (
                ContentBlockOrderConflictError(), 409,
                "Content block order conflict.",
            ),
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.create_image_block.side_effect = error
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/image",
                    json=self._image_create_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_updates_image_with_exact_public_contract(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        media_asset_id = uuid.uuid4()
        expected = self._image_response(media_asset_id, "Replacement")
        service_class.return_value.update_image_block.return_value = expected
        response = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{revision_id}/blocks/{block_id}/image",
            json=self._image_update_request(media_asset_id, "Replacement"),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = service_class.return_value.update_image_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertEqual(call.kwargs["block_id"], block_id)
        self.assertIsInstance(call.kwargs["request"], ImageBlockUpdate)
        self.assertEqual(call.kwargs["request"].media_asset_id, media_asset_id)
        self.assertEqual(call.kwargs["request"].alt_text, "Replacement")
        self.assertEqual(call.kwargs["request"].expected_revision_updated_at, NOW)
        self.assertEqual(
            set(response.json()["payload"]), {"media_asset_id", "alt_text"},
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_image_accepts_none_and_empty_alt_text(
        self, service_class: MagicMock,
    ) -> None:
        for alt_text in (None, ""):
            with self.subTest(alt_text=alt_text):
                service_class.reset_mock()
                media_asset_id = uuid.uuid4()
                service_class.return_value.update_image_block.return_value = (
                    self._image_response(media_asset_id, alt_text)
                )
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/image",
                    json=self._image_update_request(media_asset_id, alt_text),
                )
                self.assertEqual(response.status_code, 200)
                request = service_class.return_value.update_image_block.call_args.kwargs[
                    "request"
                ]
                self.assertEqual(request.alt_text, alt_text)

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_image_rejects_invalid_and_internal_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        valid = self._image_update_request()
        cases = (
            ("not-a-uuid", str(block_id), valid),
            (str(revision_id), "not-a-uuid", valid),
            (str(revision_id), str(block_id), {**valid, "media_asset_id": "bad"}),
            (str(revision_id), str(block_id), {**valid, "block_type": "image"}),
            (str(revision_id), str(block_id), {**valid, "storage_key": "secret"}),
            (str(revision_id), str(block_id), {**valid, "sort_order": 1000}),
            (str(revision_id), str(block_id), {**valid, "deleted_at": None}),
            (str(revision_id), str(block_id), {**valid, "mime_type": "image/png"}),
            (str(revision_id), str(block_id), {**valid, "checksum": "hash"}),
            (str(revision_id), str(block_id), {**valid, "upload": "bytes"}),
            (str(revision_id), str(block_id), {**valid, "url": "https://x"}),
            (str(revision_id), str(block_id), {**valid, "path": "local"}),
        )
        for revision_path, block_path, body in cases:
            with self.subTest(body=body):
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{revision_path}/blocks/{block_path}/image",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_image_maps_known_service_errors(
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
            (MediaAssetNotFoundError(), 404, "Media asset was not found."),
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.update_image_block.side_effect = error
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/image",
                    json=self._image_update_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_image_routes_enforce_authentication_and_admin_role(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        del app.dependency_overrides[get_current_active_user]
        unauthenticated = (
            self.client.post(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/image",
                json=self._image_create_request(),
            ),
            self.client.patch(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}/image",
                json=self._image_update_request(),
            ),
        )
        self.assertTrue(all(item.status_code == 401 for item in unauthenticated))
        app.dependency_overrides[get_current_active_user] = lambda: self.current_user
        self.db.scalar.return_value = RoleName.TEACHER.value
        forbidden = (
            self.client.post(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/image",
                json=self._image_create_request(),
            ),
            self.client.patch(
                f"/api/v1/question-editor/revisions/{revision_id}/blocks/{block_id}/image",
                json=self._image_update_request(),
            ),
        )
        self.assertTrue(all(item.status_code == 403 for item in forbidden))
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_create_geometry_delegates_exact_public_contract(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        source_data = {
            "objects": [{"type": "future-shape", "points": [0, 1.5, -2]}],
            "metadata": {"visible": True, "optional": None},
        }
        expected = self._geometry_response(source_data)
        service_class.return_value.create_geometry_block.return_value = expected
        response = self.client.post(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/geometry",
            json=self._geometry_create_request(source_data),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = service_class.return_value.create_geometry_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertIsInstance(call.kwargs["request"], GeometryBlockCreate)
        self.assertEqual(call.kwargs["request"].payload.source_data, source_data)
        self.assertEqual(call.kwargs["request"].payload.format_version, 1)
        self.assertEqual(
            call.kwargs["request"].expected_revision_updated_at, NOW,
        )
        self.assertEqual(
            set(response.json()), {"id", "block_type", "sort_order", "payload"},
        )
        self.assertEqual(
            set(response.json()["payload"]), {"source_data", "format_version"},
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_geometry_accepts_empty_source_data(
        self, service_class: MagicMock,
    ) -> None:
        expected = self._geometry_response({})
        service_class.return_value.create_geometry_block.return_value = expected
        response = self.client.post(
            f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/geometry",
            json=self._geometry_create_request({}),
        )
        self.assertEqual(response.status_code, 201)
        request = service_class.return_value.create_geometry_block.call_args.kwargs[
            "request"
        ]
        self.assertEqual(request.payload.source_data, {})
        self.assertEqual(response.json()["payload"]["source_data"], {})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_geometry_preserves_opaque_nested_and_inert_strings(
        self, service_class: MagicMock,
    ) -> None:
        source_data = {
            "future": [{"data": [True, None, {"value": 2.75}]}],
            "svg": "<svg><script>alert(1)</script></svg>",
            "html": "<b>inert</b>",
        }
        expected = self._geometry_response(source_data)
        service_class.return_value.create_geometry_block.return_value = expected
        response = self.client.post(
            f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/geometry",
            json=self._geometry_create_request(source_data),
        )
        self.assertEqual(response.status_code, 201)
        request = service_class.return_value.create_geometry_block.call_args.kwargs[
            "request"
        ]
        self.assertEqual(request.payload.source_data, source_data)
        self.assertEqual(response.json()["payload"]["source_data"], source_data)

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_geometry_rejects_invalid_and_internal_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        valid = self._geometry_create_request({"objects": []})
        payload = valid["payload"]
        cases = (
            ("not-a-uuid", valid),
            (str(revision_id), {**valid, "block_type": "formula"}),
            (str(revision_id), {key: value for key, value in valid.items() if key != "block_type"}),
            (str(revision_id), {**valid, "payload": {**payload, "source_data": []}}),
            (str(revision_id), {**valid, "payload": {**payload, "format_version": 2}}),
            (
                str(revision_id),
                {**valid, "expected_revision_updated_at": "2026-08-15T12:00:00"},
            ),
            (
                str(revision_id),
                {
                    key: value for key, value in valid.items()
                    if key != "expected_revision_updated_at"
                },
            ),
            (str(revision_id), {key: value for key, value in valid.items() if key != "payload"}),
            (str(revision_id), {**valid, "sort_order": 1000}),
            (str(revision_id), {**valid, "revision_id": str(revision_id)}),
            (str(revision_id), {**valid, "deleted_at": None}),
            (str(revision_id), {**valid, "rendered_svg": "<svg />"}),
            (str(revision_id), {**valid, "payload": {**payload, "preview": {}}}),
        )
        for path_id, body in cases:
            with self.subTest(path_id=path_id, body=body):
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{path_id}/blocks/geometry",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_geometry_maps_known_service_errors(
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
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.create_geometry_block.side_effect = error
                response = self.client.post(
                    f"/api/v1/question-editor/revisions/{uuid.uuid4()}/blocks/geometry",
                    json=self._geometry_create_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_create_geometry_enforces_authentication_and_admin_role(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        del app.dependency_overrides[get_current_active_user]
        unauthenticated = self.client.post(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/geometry",
            json=self._geometry_create_request(),
        )
        self.assertEqual(unauthenticated.status_code, 401)
        app.dependency_overrides[get_current_active_user] = lambda: self.current_user
        self.db.scalar.return_value = RoleName.TEACHER.value
        forbidden = self.client.post(
            f"/api/v1/question-editor/revisions/{revision_id}/blocks/geometry",
            json=self._geometry_create_request(),
        )
        self.assertEqual(forbidden.status_code, 403)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_admin_update_geometry_delegates_exact_public_contract(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        source_data = {
            "objects": [{"type": "future-shape", "points": [0, 1.5, -2]}],
            "metadata": {"visible": True, "optional": None},
        }
        expected = self._geometry_response(source_data)
        service_class.return_value.update_geometry_block.return_value = expected
        response = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{revision_id}/blocks/{block_id}/geometry",
            json=self._geometry_update_request(source_data),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        call = service_class.return_value.update_geometry_block.call_args
        self.assertEqual(call.kwargs["revision_id"], revision_id)
        self.assertEqual(call.kwargs["block_id"], block_id)
        self.assertIsInstance(call.kwargs["request"], GeometryBlockUpdate)
        self.assertEqual(call.kwargs["request"].source_data, source_data)
        self.assertEqual(call.kwargs["request"].format_version, 1)
        self.assertEqual(
            call.kwargs["request"].expected_revision_updated_at, NOW,
        )
        self.assertEqual(
            set(response.json()), {"id", "block_type", "sort_order", "payload"},
        )
        self.assertEqual(
            set(response.json()["payload"]), {"source_data", "format_version"},
        )

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_geometry_accepts_empty_source_data(
        self, service_class: MagicMock,
    ) -> None:
        expected = self._geometry_response({})
        service_class.return_value.update_geometry_block.return_value = expected
        response = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/geometry",
            json=self._geometry_update_request({}),
        )
        self.assertEqual(response.status_code, 200)
        request = service_class.return_value.update_geometry_block.call_args.kwargs[
            "request"
        ]
        self.assertEqual(request.source_data, {})
        self.assertEqual(response.json()["payload"]["source_data"], {})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_geometry_preserves_opaque_nested_and_inert_strings(
        self, service_class: MagicMock,
    ) -> None:
        source_data = {
            "future": [{"data": [True, None, {"value": 2.75}]}],
            "svg": "<svg><script>alert(1)</script></svg>",
            "html": "<b>inert</b>",
        }
        expected = self._geometry_response(source_data)
        service_class.return_value.update_geometry_block.return_value = expected
        response = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/geometry",
            json=self._geometry_update_request(source_data),
        )
        self.assertEqual(response.status_code, 200)
        request = service_class.return_value.update_geometry_block.call_args.kwargs[
            "request"
        ]
        self.assertEqual(request.source_data, source_data)
        self.assertEqual(response.json()["payload"]["source_data"], source_data)

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_geometry_rejects_invalid_and_internal_fields(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        valid = self._geometry_update_request({"objects": []})
        cases = (
            ("not-a-uuid", str(block_id), valid),
            (str(revision_id), "not-a-uuid", valid),
            (str(revision_id), str(block_id), {**valid, "source_data": []}),
            (str(revision_id), str(block_id), {**valid, "format_version": 2}),
            (
                str(revision_id), str(block_id),
                {**valid, "expected_revision_updated_at": "2026-08-15T12:00:00"},
            ),
            (
                str(revision_id), str(block_id),
                {key: value for key, value in valid.items() if key != "source_data"},
            ),
            (
                str(revision_id), str(block_id),
                {
                    key: value for key, value in valid.items()
                    if key != "expected_revision_updated_at"
                },
            ),
            (str(revision_id), str(block_id), {**valid, "block_type": "geometry"}),
            (str(revision_id), str(block_id), {**valid, "sort_order": 1000}),
            (str(revision_id), str(block_id), {**valid, "revision_id": str(revision_id)}),
            (str(revision_id), str(block_id), {**valid, "deleted_at": None}),
            (str(revision_id), str(block_id), {**valid, "rendered_svg": "<svg />"}),
        )
        for revision_path, block_path, body in cases:
            with self.subTest(body=body):
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{revision_path}/blocks/{block_path}/geometry",
                    json=body,
                )
                self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_geometry_maps_known_service_errors(
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
        )
        for error, status_code, detail in cases:
            with self.subTest(error=type(error).__name__):
                service_class.reset_mock()
                service_class.return_value.update_geometry_block.side_effect = error
                response = self.client.patch(
                    "/api/v1/question-editor/revisions/"
                    f"{uuid.uuid4()}/blocks/{uuid.uuid4()}/geometry",
                    json=self._geometry_update_request(),
                )
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.json(), {"detail": detail})

    @patch("app.api.question_editor.QuestionEditorService")
    def test_update_geometry_enforces_authentication_and_admin_role(
        self, service_class: MagicMock,
    ) -> None:
        revision_id = uuid.uuid4()
        block_id = uuid.uuid4()
        del app.dependency_overrides[get_current_active_user]
        unauthenticated = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{revision_id}/blocks/{block_id}/geometry",
            json=self._geometry_update_request(),
        )
        self.assertEqual(unauthenticated.status_code, 401)
        app.dependency_overrides[get_current_active_user] = lambda: self.current_user
        self.db.scalar.return_value = RoleName.TEACHER.value
        forbidden = self.client.patch(
            "/api/v1/question-editor/revisions/"
            f"{revision_id}/blocks/{block_id}/geometry",
            json=self._geometry_update_request(),
        )
        self.assertEqual(forbidden.status_code, 403)
        service_class.assert_not_called()

    def test_router_contains_editor_and_answer_routes(self) -> None:
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
            ("POST", "/question-editor/revisions/{revision_id}/blocks/formula"),
            (
                "PATCH",
                "/question-editor/revisions/{revision_id}/blocks/{block_id}/formula",
            ),
            (
                "DELETE",
                "/question-editor/revisions/{revision_id}/blocks/{block_id}",
            ),
            ("PUT", "/question-editor/revisions/{revision_id}/blocks/order"),
            ("POST", "/question-editor/revisions/{revision_id}/blocks/image"),
            ("POST", "/question-editor/revisions/{revision_id}/blocks/geometry"),
            (
                "PATCH",
                "/question-editor/revisions/{revision_id}/blocks/{block_id}/geometry",
            ),
            (
                "PATCH",
                "/question-editor/revisions/{revision_id}/blocks/{block_id}/image",
            ),
            ("POST", "/question-editor/revisions/{revision_id}/answer-options"),
            ("PATCH", "/question-editor/revisions/{revision_id}/answer-options/{option_id}"),
            ("DELETE", "/question-editor/revisions/{revision_id}/answer-options/{option_id}"),
            ("PUT", "/question-editor/revisions/{revision_id}/answer-options/actions/order"),
            ("PUT", "/question-editor/revisions/{revision_id}/answer-options/actions/correct"),
            ("POST", "/question-editor/revisions/{revision_id}/accepted-answers"),
            ("PATCH", "/question-editor/revisions/{revision_id}/accepted-answers/{answer_id}"),
            ("DELETE", "/question-editor/revisions/{revision_id}/accepted-answers/{answer_id}"),
            ("PUT", "/question-editor/revisions/{revision_id}/accepted-answers/actions/order"),
            ("GET", "/question-editor/revisions/{revision_id}/solution"),
            ("POST", "/question-editor/revisions/{revision_id}/solution"),
            ("DELETE", "/question-editor/revisions/{revision_id}/solution"),
            ("POST", "/question-editor/revisions/{revision_id}/solution/blocks/text"),
            ("PATCH", "/question-editor/revisions/{revision_id}/solution/blocks/{block_id}/text"),
            ("POST", "/question-editor/revisions/{revision_id}/solution/blocks/formula"),
            ("PATCH", "/question-editor/revisions/{revision_id}/solution/blocks/{block_id}/formula"),
            ("DELETE", "/question-editor/revisions/{revision_id}/solution/blocks/{block_id}"),
            ("PUT", "/question-editor/revisions/{revision_id}/solution/blocks/actions/order"),
        })


if __name__ == "__main__":
    unittest.main()

