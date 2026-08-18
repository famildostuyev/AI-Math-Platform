from __future__ import annotations

import io
import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch


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

from sqlalchemy.exc import IntegrityError

from app.models.media_asset import MediaAsset
from app.models.source_document import SourceDocument
from app.schemas.source_document import SourceDocumentRead
from app.services.source_binary_service import (
    PreparedSourceBinary,
    SourceBinaryCleanupError,
    SourceBinaryTooLargeError,
)
from app.services.source_ingestion_service import (
    SourceIngestionCompensationError,
    SourceIngestionPersistenceConflictError,
    SourceIngestionQuestionSourceNotFoundError,
    SourceIngestionService,
    SourceIngestionUploaderNotFoundError,
    SourceIngestionValidationError,
)


NOW = datetime(2026, 8, 18, 17, 0, tzinfo=timezone.utc)


class SourceIngestionServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.binary_service = MagicMock()
        self.uploader_id = uuid.uuid4()
        self.prepared = PreparedSourceBinary(
            original_filename="book.pdf",
            mime_type="application/pdf",
            size_bytes=321,
            sha256="a" * 64,
            storage_key=f"sources/2026/08/{uuid.uuid4()}.pdf",
            width_px=None,
            height_px=None,
        )
        self.binary_service.prepare_source_binary.return_value = self.prepared
        self.db.scalar.return_value = self.uploader_id
        self.events: list[object] = []
        self.added: list[object] = []

        def add(model: object) -> None:
            self.events.append(("add", type(model)))
            self.added.append(model)

        def flush() -> None:
            self.events.append("flush")
            model = self.added[-1]
            model.id = uuid.uuid4()
            model.created_at = NOW

        def commit() -> None:
            self.events.append("commit")

        self.db.add.side_effect = add
        self.db.flush.side_effect = flush
        self.db.commit.side_effect = commit

    def _service(self) -> SourceIngestionService:
        return SourceIngestionService(
            self.db,
            binary_service=self.binary_service,
        )

    def _create(
        self,
        *,
        question_source_id: uuid.UUID | None = None,
        uploaded_by_user_id: object | None = None,
    ) -> SourceDocumentRead:
        return self._service().create_source_document(
            upload=io.BytesIO(b"source"),
            original_filename="unsafe/../book.pdf",
            submitted_mime_type="application/octet-stream",
            question_source_id=question_source_id,
            uploaded_by_user_id=(
                self.uploader_id
                if uploaded_by_user_id is None
                else uploaded_by_user_id
            ),  # type: ignore[arg-type]
        )

    def test_success_without_question_source_maps_exact_models_and_response(self) -> None:
        response = self._create()

        self.assertIsInstance(response, SourceDocumentRead)
        self.assertEqual(self.db.scalar.call_count, 1)
        self.binary_service.prepare_source_binary.assert_called_once_with(
            upload=unittest.mock.ANY,
            original_filename="unsafe/../book.pdf",
            submitted_mime_type="application/octet-stream",
        )
        self.assertEqual(len(self.added), 2)
        media, source = self.added
        self.assertIsInstance(media, MediaAsset)
        self.assertEqual(media.storage_key, self.prepared.storage_key)
        self.assertEqual(media.original_filename, self.prepared.original_filename)
        self.assertEqual(media.mime_type, self.prepared.mime_type)
        self.assertEqual(media.size_bytes, self.prepared.size_bytes)
        self.assertEqual(media.sha256, self.prepared.sha256)
        self.assertEqual((media.width_px, media.height_px), (None, None))
        self.assertIsInstance(source, SourceDocument)
        self.assertEqual(source.media_asset_id, media.id)
        self.assertIsNone(source.question_source_id)
        self.assertEqual(source.uploaded_by_user_id, self.uploader_id)
        self.assertEqual(self.events, [
            ("add", MediaAsset), "flush", ("add", SourceDocument),
            "flush", "commit",
        ])
        self.assertEqual(self.db.flush.call_count, 2)
        self.db.commit.assert_called_once_with()
        self.db.rollback.assert_not_called()
        self.binary_service.cleanup_prepared.assert_not_called()
        self.assertEqual(response.id, source.id)
        self.assertEqual(response.media_asset_id, media.id)
        self.assertEqual(response.media_asset.id, media.id)
        self.assertEqual(response.media_asset.original_filename, "book.pdf")
        self.assertFalse(hasattr(response.media_asset, "storage_key"))
        self.assertFalse(hasattr(response.media_asset, "sha256"))

    def test_active_question_source_is_queried_and_mapped(self) -> None:
        question_source_id = uuid.uuid4()
        self.db.scalar.side_effect = [self.uploader_id, question_source_id]

        response = self._create(question_source_id=question_source_id)

        self.assertEqual(self.db.scalar.call_count, 2)
        query = str(self.db.scalar.call_args_list[1].args[0])
        self.assertIn("question_sources.id", query)
        self.assertIn("question_sources.is_active IS true", query)
        self.assertIn("question_sources.deleted_at IS NULL", query)
        self.assertEqual(response.question_source_id, question_source_id)

    def test_scalar_ids_are_strictly_validated_before_queries_or_preparation(self) -> None:
        cases = (
            {"uploaded_by_user_id": "not-a-uuid", "question_source_id": None},
            {"uploaded_by_user_id": self.uploader_id, "question_source_id": "bad"},
        )
        for arguments in cases:
            with self.subTest(arguments=arguments):
                self.db.reset_mock()
                self.binary_service.reset_mock()
                with self.assertRaises(SourceIngestionValidationError):
                    self._service().create_source_document(
                        upload=io.BytesIO(b"source"), original_filename=None,
                        submitted_mime_type=None, **arguments,
                    )
                self.db.scalar.assert_not_called()
                self.binary_service.prepare_source_binary.assert_not_called()
                self.db.rollback.assert_called_once_with()

    def test_unavailable_uploader_is_rejected_before_preparation(self) -> None:
        for state in ("missing", "inactive", "deleted"):
            with self.subTest(state=state):
                self.db.reset_mock()
                self.binary_service.reset_mock()
                self.db.scalar.return_value = None
                with self.assertRaises(SourceIngestionUploaderNotFoundError):
                    self._create()
                query = str(self.db.scalar.call_args.args[0])
                self.assertIn("users.is_active IS true", query)
                self.assertIn("users.deleted_at IS NULL", query)
                self.binary_service.prepare_source_binary.assert_not_called()
                self.db.rollback.assert_called_once_with()

    def test_unavailable_question_source_is_rejected_before_preparation(self) -> None:
        for state in ("missing", "inactive", "deleted"):
            with self.subTest(state=state):
                self.db.reset_mock()
                self.binary_service.reset_mock()
                self.db.scalar.side_effect = [self.uploader_id, None]
                with self.assertRaises(SourceIngestionQuestionSourceNotFoundError):
                    self._create(question_source_id=uuid.uuid4())
                self.binary_service.prepare_source_binary.assert_not_called()
                self.db.rollback.assert_called_once_with()

    def test_binary_preparation_error_rolls_back_without_duplicate_cleanup(self) -> None:
        failure = SourceBinaryTooLargeError("too large")
        self.binary_service.prepare_source_binary.side_effect = failure

        with self.assertRaises(SourceBinaryTooLargeError) as raised:
            self._create()

        self.assertIs(raised.exception, failure)
        self.db.rollback.assert_called_once_with()
        self.binary_service.cleanup_prepared.assert_not_called()
        self.db.add.assert_not_called()

    def test_media_flush_integrity_error_rolls_back_cleans_and_translates(self) -> None:
        failure = IntegrityError("flush", {}, Exception("conflict"))
        self.db.flush.side_effect = failure

        with self.assertRaises(SourceIngestionPersistenceConflictError) as raised:
            self._create()

        self.assertIs(raised.exception.__cause__, failure)
        self.db.rollback.assert_called_once_with()
        self.binary_service.cleanup_prepared.assert_called_once_with(self.prepared)
        self.db.commit.assert_not_called()

    def test_source_add_generic_failure_rolls_back_cleans_and_propagates(self) -> None:
        failure = RuntimeError("source add failed")

        def add(model: object) -> None:
            if isinstance(model, SourceDocument):
                raise failure
            self.added.append(model)

        self.db.add.side_effect = add

        with self.assertRaises(RuntimeError) as raised:
            self._create()

        self.assertIs(raised.exception, failure)
        self.db.rollback.assert_called_once_with()
        self.binary_service.cleanup_prepared.assert_called_once_with(self.prepared)

    def test_commit_failure_rolls_back_and_cleans(self) -> None:
        failure = RuntimeError("commit failed")
        self.db.commit.side_effect = failure

        with self.assertRaises(RuntimeError) as raised:
            self._create()

        self.assertIs(raised.exception, failure)
        self.db.rollback.assert_called_once_with()
        self.binary_service.cleanup_prepared.assert_called_once_with(self.prepared)

    def test_cleanup_failure_surfaces_compensation_with_both_errors(self) -> None:
        original = RuntimeError("commit failed")
        cleanup = SourceBinaryCleanupError("cleanup failed")
        self.db.commit.side_effect = original
        self.binary_service.cleanup_prepared.side_effect = cleanup

        with self.assertRaises(SourceIngestionCompensationError) as raised:
            self._create()

        self.assertIs(raised.exception.original_error, original)
        self.assertIs(raised.exception.cleanup_error, cleanup)
        self.assertIs(raised.exception.__cause__, cleanup)
        self.db.rollback.assert_called_once_with()

    def test_successful_commit_is_not_compensated_and_response_is_prebuilt(self) -> None:
        response = self._create()

        self.db.commit.assert_called_once_with()
        self.binary_service.cleanup_prepared.assert_not_called()
        self.assertEqual(response.created_at, NOW)
        self.assertEqual(response.media_asset.created_at, NOW)

    def test_separate_ingestions_prepare_new_binary_each_time(self) -> None:
        first_service = self._service()
        second_service = self._service()
        first_service.create_source_document(
            upload=io.BytesIO(b"same"), original_filename=None,
            submitted_mime_type=None, question_source_id=None,
            uploaded_by_user_id=self.uploader_id,
        )
        second_service.create_source_document(
            upload=io.BytesIO(b"same"), original_filename=None,
            submitted_mime_type=None, question_source_id=None,
            uploaded_by_user_id=self.uploader_id,
        )
        self.assertEqual(self.binary_service.prepare_source_binary.call_count, 2)

    def test_boundary_contains_no_pages_runs_parser_ocr_ai_or_media_service(self) -> None:
        with patch("app.services.source_ingestion_service.MediaAsset") as media_class, patch(
            "app.services.source_ingestion_service.SourceDocument"
        ) as source_class:
            media = SimpleNamespace(id=uuid.uuid4(), created_at=NOW, **{
                "original_filename": self.prepared.original_filename,
                "mime_type": self.prepared.mime_type,
                "size_bytes": self.prepared.size_bytes,
                "width_px": None,
                "height_px": None,
            })
            source = SimpleNamespace(
                id=uuid.uuid4(), media_asset_id=media.id,
                question_source_id=None, uploaded_by_user_id=self.uploader_id,
                created_at=NOW,
            )
            media_class.return_value = media
            source_class.return_value = source
            self._create()
            media_class.assert_called_once()
            source_class.assert_called_once()

        module_text = Path(
            BACKEND_DIR / "app/services/source_ingestion_service.py"
        ).read_text(encoding="utf-8")
        for forbidden in (
            "SourceDocumentPage", "SourcePreAnalysisRun", "MediaAssetService",
            "create_image_asset", "ocr", "openai", "parser", "candidate",
        ):
            self.assertNotIn(forbidden, module_text)


if __name__ == "__main__":
    unittest.main()
