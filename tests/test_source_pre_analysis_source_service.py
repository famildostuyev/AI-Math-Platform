from __future__ import annotations

import io
import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.exc import OperationalError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.services.source_pre_analysis_source_service import (
    SourcePreAnalysisSourceMetadataError,
    SourcePreAnalysisSourceMetadataNotFoundError,
    SourcePreAnalysisSourceResolutionError,
    SourcePreAnalysisSourceService,
    SourcePreAnalysisSourceValidationError,
    SourcePreAnalysisStoredBinaryNotFoundError,
)
from app.storage.media_storage import MediaStorageError


class TrackingStream(io.BytesIO):
    close_count = 0

    def close(self) -> None:
        self.close_count += 1
        super().close()


class SourcePreAnalysisSourceServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.storage = MagicMock()
        self.run_id = uuid.uuid4()
        self.document_id = uuid.uuid4()
        self.media_id = uuid.uuid4()
        self.run = SimpleNamespace(
            id=self.run_id, source_document_id=self.document_id,
        )
        self.document = SimpleNamespace(
            id=self.document_id, media_asset_id=self.media_id,
        )
        self.media = SimpleNamespace(
            id=self.media_id, storage_key="sources/2026/08/book.pdf",
            mime_type="application/pdf", original_filename="book.pdf",
            size_bytes=6, width_px=None, height_px=None,
        )
        self.db.execute.return_value.first.return_value = (
            self.run, self.document, self.media,
        )

    def _service(self) -> SourcePreAnalysisSourceService:
        return SourcePreAnalysisSourceService(self.db, storage=self.storage)

    def test_constructor_stores_dependencies(self) -> None:
        service = self._service()
        self.assertIs(service.db, self.db)
        self.assertIs(service.storage, self.storage)

    def test_resolution_projects_exact_safe_metadata_and_readable_stream(self) -> None:
        stream = TrackingStream(b"source")
        self.storage.open_key.return_value = stream
        with self._service().open_for_run(run_id=self.run_id) as source:
            self.assertEqual(source.source_document_id, self.document_id)
            self.assertEqual(source.media_asset_id, self.media_id)
            self.assertEqual(source.mime_type, "application/pdf")
            self.assertEqual(source.original_filename, "book.pdf")
            self.assertEqual(source.size_bytes, 6)
            self.assertIsNone(source.width_px)
            self.assertIsNone(source.height_px)
            self.assertEqual(source.stream.read(), b"source")
            for forbidden in ("storage_key", "path", "sha256", "db"):
                self.assertFalse(hasattr(source, forbidden))
            self.assertFalse(stream.closed)
        self.storage.open_key.assert_called_once_with(
            "sources/2026/08/book.pdf"
        )
        self.assertTrue(stream.closed)
        self.assertEqual(stream.close_count, 1)

    def test_image_dimensions_and_persisted_mime_are_preserved(self) -> None:
        self.media.mime_type = "image/webp"
        self.media.original_filename = None
        self.media.width_px = 800
        self.media.height_px = 600
        self.storage.open_key.return_value = TrackingStream(b"image")
        with self._service().open_for_run(run_id=self.run_id) as source:
            self.assertEqual(source.mime_type, "image/webp")
            self.assertIsNone(source.original_filename)
            self.assertEqual((source.width_px, source.height_px), (800, 600))

    def test_stream_closes_when_consumer_raises(self) -> None:
        stream = TrackingStream(b"source")
        self.storage.open_key.return_value = stream
        failure = RuntimeError("consumer failed")
        with self.assertRaises(RuntimeError) as raised:
            with self._service().open_for_run(run_id=self.run_id):
                raise failure
        self.assertIs(raised.exception, failure)
        self.assertTrue(stream.closed)
        self.assertEqual(stream.close_count, 1)

    def test_run_id_is_strict_uuid_before_database_or_storage_access(self) -> None:
        for run_id in ("bad", 1, True, None):
            with self.subTest(run_id=run_id), self.assertRaises(
                SourcePreAnalysisSourceValidationError
            ):
                with self._service().open_for_run(run_id=run_id):  # type: ignore[arg-type]
                    pass
        self.db.execute.assert_not_called()
        self.storage.open_key.assert_not_called()

    def test_query_is_exact_active_joined_and_never_locked(self) -> None:
        self.storage.open_key.return_value = TrackingStream(b"source")
        with self._service().open_for_run(run_id=self.run_id):
            pass
        statement = self.db.execute.call_args.args[0]
        sql = str(statement)
        self.assertIn("source_pre_analysis_runs.id", sql)
        self.assertIn("source_pre_analysis_runs.source_document_id", sql)
        self.assertIn("source_documents.media_asset_id", sql)
        self.assertIn("JOIN source_documents", sql)
        self.assertIn("JOIN media_assets", sql)
        self.assertIn("source_pre_analysis_runs.deleted_at IS NULL", sql)
        self.assertIn("source_documents.deleted_at IS NULL", sql)
        self.assertIn("media_assets.deleted_at IS NULL", sql)
        self.assertNotIn("FOR UPDATE", sql)
        params = statement.compile().params
        self.assertIn(self.run_id, params.values())

    def test_missing_or_deleted_metadata_is_unavailable(self) -> None:
        self.db.execute.return_value.first.return_value = None
        with self.assertRaises(SourcePreAnalysisSourceMetadataNotFoundError):
            with self._service().open_for_run(run_id=self.run_id):
                pass
        self.storage.open_key.assert_not_called()

    def test_inconsistent_relationships_are_rejected_before_storage(self) -> None:
        cases = (
            (uuid.uuid4(), self.media_id),
            (self.document_id, uuid.uuid4()),
        )
        for run_document_id, document_media_id in cases:
            with self.subTest(ids=(run_document_id, document_media_id)):
                self.run.source_document_id = run_document_id
                self.document.media_asset_id = document_media_id
                with self.assertRaises(SourcePreAnalysisSourceMetadataError):
                    with self._service().open_for_run(run_id=self.run_id):
                        pass
                self.storage.open_key.assert_not_called()
                self.run.source_document_id = self.document_id
                self.document.media_asset_id = self.media_id

    def test_invalid_persisted_metadata_is_rejected(self) -> None:
        for attribute, value in (
            ("mime_type", ""), ("mime_type", " "), ("mime_type", None),
            ("size_bytes", 0), ("size_bytes", -1),
            ("size_bytes", True), ("size_bytes", "6"),
        ):
            original = getattr(self.media, attribute)
            setattr(self.media, attribute, value)
            with self.subTest(attribute=attribute, value=value), self.assertRaises(
                SourcePreAnalysisSourceMetadataError
            ):
                with self._service().open_for_run(run_id=self.run_id):
                    pass
            setattr(self.media, attribute, original)
        self.storage.open_key.assert_not_called()

    def test_storage_failure_is_translated_without_sensitive_details(self) -> None:
        self.storage.open_key.side_effect = MediaStorageError(
            "C:/secret/media/sources/book.pdf"
        )
        with self.assertRaises(
            SourcePreAnalysisStoredBinaryNotFoundError
        ) as raised:
            with self._service().open_for_run(run_id=self.run_id):
                pass
        self.assertNotIn("secret", str(raised.exception))
        self.assertIsInstance(raised.exception.__cause__, MediaStorageError)

    def test_database_failure_is_typed_without_sensitive_details(self) -> None:
        failure = OperationalError(
            "SELECT secret", {}, RuntimeError("database secret"),
        )
        self.db.execute.side_effect = failure
        with self.assertRaises(SourcePreAnalysisSourceResolutionError) as raised:
            with self._service().open_for_run(run_id=self.run_id):
                pass
        self.assertNotIn("secret", str(raised.exception))
        self.assertIs(raised.exception.__cause__, failure)
        self.storage.open_key.assert_not_called()
        self.db.rollback.assert_not_called()

    def test_service_is_read_only_and_has_no_lifecycle_or_processor_boundary(self) -> None:
        self.storage.open_key.return_value = TrackingStream(b"source")
        with self._service().open_for_run(run_id=self.run_id):
            pass
        self.db.add.assert_not_called()
        self.db.add_all.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()
        module = Path(
            BACKEND_DIR / "app/services/source_pre_analysis_source_service.py"
        ).read_text(encoding="utf-8")
        for forbidden in (
            "SourceDocumentPage", "start_run", "finalize_success",
            "mark_failed", ".process(", "execute_run", "with_for_update",
        ):
            self.assertNotIn(forbidden, module)


if __name__ == "__main__":
    unittest.main()
