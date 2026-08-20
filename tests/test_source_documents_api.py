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
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.source_documents import router as source_documents_router
from app.core.enums import RoleName
from app.database.session import get_db
from app.main import app
from app.schemas.source_document import (
    SourceDocumentMediaAssetRead,
    SourceDocumentRead,
)
from app.services.source_binary_service import (
    EmptySourceBinaryError,
    InvalidSourceBinaryError,
    SourceBinaryCleanupError,
    SourceBinaryImageDimensionsError,
    SourceBinaryStorageError,
    SourceBinaryTooLargeError,
    UnsafeSourceBinaryError,
    UnsupportedSourceBinaryError,
)
from app.services.source_ingestion_service import (
    SourceIngestionCompensationError,
    SourceIngestionPersistenceConflictError,
    SourceIngestionQuestionSourceNotFoundError,
    SourceIngestionUploaderNotFoundError,
    SourceIngestionValidationError,
)


NOW = datetime(2026, 8, 18, 18, 0, tzinfo=timezone.utc)


class SourceDocumentsApiTest(unittest.TestCase):
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

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @staticmethod
    def _response(
        *, question_source_id: uuid.UUID | None = None,
    ) -> SourceDocumentRead:
        media_id = uuid.uuid4()
        return SourceDocumentRead(
            id=uuid.uuid4(),
            media_asset_id=media_id,
            question_source_id=question_source_id,
            uploaded_by_user_id=uuid.uuid4(),
            created_at=NOW,
            media_asset=SourceDocumentMediaAssetRead(
                id=media_id,
                original_filename="book.pdf",
                mime_type="application/pdf",
                size_bytes=321,
                width_px=None,
                height_px=None,
                created_at=NOW,
            ),
        )

    def test_router_and_production_openapi_have_exact_source_routes(self) -> None:
        routes = [
            route for route in source_documents_router.routes
            if isinstance(route, APIRoute)
        ]
        self.assertEqual(len(routes), 2)
        self.assertEqual(
            {(route.path, frozenset(route.methods)) for route in routes},
            {
                ("/sources", frozenset({"GET"})),
                ("/sources", frozenset({"POST"})),
            },
        )

        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        paths = response.json()["paths"]
        source_paths = {
            path: {
                method.upper()
                for method in operations
                if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}
            }
            for path, operations in paths.items()
            if path.startswith("/api/v1/sources")
        }
        self.assertEqual(source_paths, {
            "/api/v1/sources": {"GET", "POST"},
            "/api/v1/sources/{source_document_id}/pre-analysis/runs": {"POST"},
            "/api/v1/sources/{source_document_id}/pre-analysis": {"GET"},
            "/api/v1/sources/{source_document_id}/question-extraction/runs": {"POST"},
            "/api/v1/sources/{source_document_id}/question-extraction": {"GET"},
        })
        operation = paths["/api/v1/sources"]["post"]
        self.assertEqual(
            set(operation["requestBody"]["content"]),
            {"multipart/form-data"},
        )
        self.assertNotIn("application/json", operation["requestBody"]["content"])

    @patch("app.api.source_documents.SourceIngestionService")
    def test_admin_upload_delegates_stream_identity_and_returns_exact_shape(
        self,
        service_class: MagicMock,
    ) -> None:
        expected = self._response()
        expected.uploaded_by_user_id = self.current_user.id
        service_class.return_value.create_source_document.return_value = expected

        response = self.client.post(
            "/api/v1/sources",
            files={"file": ("book.pdf", b"source bytes", "application/pdf")},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        service_class.assert_called_once_with(self.db)
        service_class.return_value.create_source_document.assert_called_once()
        arguments = service_class.return_value.create_source_document.call_args.kwargs
        self.assertTrue(hasattr(arguments["upload"], "read"))
        self.assertEqual(arguments["original_filename"], "book.pdf")
        self.assertEqual(arguments["submitted_mime_type"], "application/pdf")
        self.assertIsNone(arguments["question_source_id"])
        self.assertEqual(arguments["uploaded_by_user_id"], self.current_user.id)
        self.assertEqual(set(response.json()), {
            "id", "media_asset_id", "question_source_id",
            "uploaded_by_user_id", "created_at", "media_asset",
        })
        self.assertEqual(set(response.json()["media_asset"]), {
            "id", "original_filename", "mime_type", "size_bytes",
            "width_px", "height_px", "created_at",
        })
        for forbidden in ("storage_key", "sha256", "deleted_at", "path"):
            self.assertNotIn(forbidden, response.text)

    @patch("app.api.source_documents.SourceIngestionService")
    def test_question_source_uuid_is_typed_and_delegated_exactly(
        self,
        service_class: MagicMock,
    ) -> None:
        question_source_id = uuid.uuid4()
        service_class.return_value.create_source_document.return_value = (
            self._response(question_source_id=question_source_id)
        )

        response = self.client.post(
            "/api/v1/sources",
            files={"file": ("book.docx", b"bytes", "application/octet-stream")},
            data={"question_source_id": str(question_source_id)},
        )

        self.assertEqual(response.status_code, 201)
        arguments = service_class.return_value.create_source_document.call_args.kwargs
        self.assertEqual(arguments["question_source_id"], question_source_id)

    @patch("app.api.source_documents.SourceIngestionService")
    def test_client_control_fields_cannot_change_service_arguments(
        self,
        service_class: MagicMock,
    ) -> None:
        expected = self._response()
        service_class.return_value.create_source_document.return_value = expected

        response = self.client.post(
            "/api/v1/sources",
            files={"file": ("book.pdf", b"bytes", "application/pdf")},
            data={
                "uploaded_by_user_id": str(uuid.uuid4()),
                "media_asset_id": str(uuid.uuid4()),
                "source_document_id": str(uuid.uuid4()),
                "storage_key": "attacker/key",
                "sha256": "bad",
                "start_pre_analysis": "true",
            },
        )

        self.assertEqual(response.status_code, 201)
        arguments = service_class.return_value.create_source_document.call_args.kwargs
        self.assertEqual(set(arguments), {
            "upload", "original_filename", "submitted_mime_type",
            "question_source_id", "uploaded_by_user_id",
        })
        self.assertEqual(arguments["uploaded_by_user_id"], self.current_user.id)
        self.assertIsNone(arguments["question_source_id"])

    @patch("app.api.source_documents.SourceIngestionService")
    def test_multipart_validation_rejects_missing_file_or_bad_uuid_before_service(
        self,
        service_class: MagicMock,
    ) -> None:
        missing = self.client.post("/api/v1/sources")
        malformed = self.client.post(
            "/api/v1/sources",
            files={"file": ("book.pdf", b"bytes", "application/pdf")},
            data={"question_source_id": "not-a-uuid"},
        )
        self.assertEqual(missing.status_code, 422)
        self.assertEqual(malformed.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.source_documents.SourceIngestionService")
    def test_binary_errors_map_to_exact_stable_responses(
        self,
        service_class: MagicMock,
    ) -> None:
        cases = (
            (EmptySourceBinaryError("internal"), 422,
             "Uploaded source file is empty."),
            (SourceBinaryTooLargeError("internal"), 413,
             "Uploaded source file exceeds the allowed size."),
            (UnsupportedSourceBinaryError("internal"), 422,
             "Uploaded source file type is unsupported."),
            (InvalidSourceBinaryError("internal"), 422,
             "Uploaded source file is invalid."),
            (UnsafeSourceBinaryError("internal"), 422,
             "Uploaded source file cannot be processed safely."),
            (SourceBinaryImageDimensionsError("internal"), 422,
             "Uploaded image dimensions exceed the allowed limit."),
            (SourceBinaryStorageError("internal"), 503,
             "Source storage is temporarily unavailable."),
            (SourceBinaryCleanupError("internal"), 503,
             "Source storage cleanup requires attention."),
        )
        self._assert_error_cases(service_class, cases)

    @patch("app.api.source_documents.SourceIngestionService")
    def test_ingestion_errors_map_to_exact_stable_responses(
        self,
        service_class: MagicMock,
    ) -> None:
        cleanup = SourceBinaryCleanupError("cleanup internal")
        compensation = SourceIngestionCompensationError(
            "internal", original_error=RuntimeError("original"),
            cleanup_error=cleanup,
        )
        cases = (
            (SourceIngestionValidationError("internal"), 422,
             "Source document request is invalid."),
            (SourceIngestionQuestionSourceNotFoundError("internal"), 422,
             "Question source is unavailable."),
            (SourceIngestionUploaderNotFoundError("internal"), 409,
             "Authenticated uploading user is unavailable."),
            (SourceIngestionPersistenceConflictError("internal"), 409,
             "Source document could not be registered due to a persistence "
             "conflict."),
            (compensation, 503,
             "Source document registration failed and storage cleanup "
             "requires attention."),
        )
        self._assert_error_cases(service_class, cases)

    def _assert_error_cases(
        self,
        service_class: MagicMock,
        cases: tuple[tuple[Exception, int, str], ...],
    ) -> None:
        for exception, expected_status, expected_detail in cases:
            with self.subTest(exception=type(exception).__name__):
                service_class.reset_mock()
                service_class.return_value.create_source_document.side_effect = exception
                response = self.client.post(
                    "/api/v1/sources",
                    files={"file": ("source.bin", b"bytes", "application/octet-stream")},
                )
                self.assertEqual(response.status_code, expected_status)
                self.assertEqual(response.json(), {"detail": expected_detail})
                self.assertNotIn("internal", response.text)
                service_class.return_value.create_source_document.side_effect = None

    @patch("app.api.source_documents.SourceIngestionService")
    def test_authentication_and_admin_role_precede_ingestion_service(
        self,
        service_class: MagicMock,
    ) -> None:
        del app.dependency_overrides[get_current_active_user]
        unauthenticated = self.client.post(
            "/api/v1/sources",
            files={"file": ("book.pdf", b"bytes", "application/pdf")},
        )
        self.assertEqual(unauthenticated.status_code, 401)
        service_class.assert_not_called()

        app.dependency_overrides[get_current_active_user] = lambda: self.current_user
        self.db.scalar.return_value = RoleName.TEACHER.value
        forbidden = self.client.post(
            "/api/v1/sources",
            files={"file": ("book.pdf", b"bytes", "application/pdf")},
        )
        self.assertEqual(forbidden.status_code, 403)
        service_class.assert_not_called()

    def test_route_source_is_thin_and_has_no_lifecycle_or_model_work(self) -> None:
        module_text = Path(
            BACKEND_DIR / "app/api/source_documents.py"
        ).read_text(encoding="utf-8")
        for forbidden in (
            "MediaAsset(", "SourceDocument(", "db.add", "db.flush",
            "db.commit", "SourcePreAnalysisService", "create_run(",
            "start_run(", "finalize_success(", "mark_failed(", "PdfReader",
            "ZipFile", "Image.open", "sha256(",
        ):
            self.assertNotIn(forbidden, module_text)


if __name__ == "__main__":
    unittest.main()

