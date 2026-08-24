from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

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

from app.models.media_asset import MediaAsset
from app.models.source_document import SourceDocument
from app.services.source_document_read_service import (
    SourceDocumentReadService,
)


NOW = datetime(2026, 8, 20, 16, 0, tzinfo=timezone.utc)


class SourceDocumentReadServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.service = SourceDocumentReadService(self.db)

    @staticmethod
    def _row(
        *,
        source_id: uuid.UUID | None = None,
        media_id: uuid.UUID | None = None,
        created_at: datetime = NOW,
        filename: str = "book.pdf",
        mime_type: str = "application/pdf",
    ) -> tuple[SimpleNamespace, SimpleNamespace]:
        source_id = source_id or uuid.uuid4()
        media_id = media_id or uuid.uuid4()

        source = SimpleNamespace(
            id=source_id,
            media_asset_id=media_id,
            question_source_id=uuid.uuid4(),
            uploaded_by_user_id=uuid.uuid4(),
            created_at=created_at,
        )

        media = SimpleNamespace(
            id=media_id,
            original_filename=filename,
            mime_type=mime_type,
            size_bytes=321,
            width_px=None,
            height_px=None,
            created_at=created_at,
        )

        return source, media

    def test_list_documents_returns_empty_tuple_when_no_rows(self) -> None:
        self.db.execute.return_value.all.return_value = []

        result = self.service.list_documents()

        self.assertEqual(result, ())
        self.db.execute.assert_called_once()

    def test_list_documents_maps_source_and_media_asset(self) -> None:
        source, media = self._row()

        self.db.execute.return_value.all.return_value = [
            (source, media),
        ]

        result = self.service.list_documents()

        self.assertEqual(len(result), 1)
        item = result[0]

        self.assertEqual(item.id, source.id)
        self.assertEqual(item.media_asset_id, media.id)
        self.assertEqual(
            item.question_source_id,
            source.question_source_id,
        )
        self.assertEqual(
            item.uploaded_by_user_id,
            source.uploaded_by_user_id,
        )
        self.assertEqual(item.created_at, source.created_at)

        self.assertEqual(item.media_asset.id, media.id)
        self.assertEqual(
            item.media_asset.original_filename,
            media.original_filename,
        )
        self.assertEqual(
            item.media_asset.mime_type,
            media.mime_type,
        )
        self.assertEqual(
            item.media_asset.size_bytes,
            media.size_bytes,
        )

    def test_list_documents_preserves_database_order(self) -> None:
        newer_source, newer_media = self._row(
            created_at=NOW,
            filename="newer.pdf",
        )
        older_source, older_media = self._row(
            created_at=NOW - timedelta(days=1),
            filename="older.pdf",
        )

        self.db.execute.return_value.all.return_value = [
            (newer_source, newer_media),
            (older_source, older_media),
        ]

        result = self.service.list_documents()

        self.assertEqual(
            [item.id for item in result],
            [newer_source.id, older_source.id],
        )
        self.assertEqual(
            [item.media_asset.original_filename for item in result],
            ["newer.pdf", "older.pdf"],
        )

    def test_list_documents_returns_strict_schema_objects(self) -> None:
        source, media = self._row()

        self.db.execute.return_value.all.return_value = [
            (source, media),
        ]

        result = self.service.list_documents()

        self.assertEqual(type(result), tuple)
        self.assertEqual(type(result[0]).__name__, "SourceDocumentRead")
        self.assertEqual(
            type(result[0].media_asset).__name__,
            "SourceDocumentMediaAssetRead",
        )


if __name__ == "__main__":
    unittest.main()