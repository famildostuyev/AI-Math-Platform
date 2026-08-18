from __future__ import annotations

import json
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.source_document import (
    SourceDocumentMediaAssetRead,
    SourceDocumentRead,
)


NOW = datetime(2026, 8, 18, 17, 0, tzinfo=timezone.utc)


class SourceDocumentSchemaTest(unittest.TestCase):
    @staticmethod
    def _media(
        *,
        original_filename: str | None = "book.pdf",
        width_px: int | None = None,
        height_px: int | None = None,
    ) -> SourceDocumentMediaAssetRead:
        return SourceDocumentMediaAssetRead(
            id=uuid.uuid4(),
            original_filename=original_filename,
            mime_type="application/pdf",
            size_bytes=123,
            width_px=width_px,
            height_px=height_px,
            created_at=NOW,
        )

    def test_exact_class_names_fields_and_strict_config(self) -> None:
        self.assertEqual(set(SourceDocumentMediaAssetRead.model_fields), {
            "id", "original_filename", "mime_type", "size_bytes",
            "width_px", "height_px", "created_at",
        })
        self.assertEqual(set(SourceDocumentRead.model_fields), {
            "id", "media_asset_id", "question_source_id",
            "uploaded_by_user_id", "created_at", "media_asset",
        })
        for model in (SourceDocumentMediaAssetRead, SourceDocumentRead):
            self.assertEqual(model.model_config["extra"], "forbid")
            self.assertTrue(model.model_config["from_attributes"])

        payload = self._media().model_dump()
        payload["storage_key"] = "private/key"
        with self.assertRaises(ValidationError):
            SourceDocumentMediaAssetRead.model_validate(payload)

    def test_nested_uuid_datetime_and_nullable_contract_serializes_exactly(self) -> None:
        media = self._media(original_filename=None)
        source = SourceDocumentRead(
            id=uuid.uuid4(),
            media_asset_id=media.id,
            question_source_id=None,
            uploaded_by_user_id=None,
            created_at=NOW,
            media_asset=media,
        )
        body = json.loads(source.model_dump_json())

        self.assertEqual(body["id"], str(source.id))
        self.assertEqual(body["media_asset_id"], str(media.id))
        self.assertEqual(body["created_at"], NOW.isoformat().replace("+00:00", "Z"))
        self.assertIsNone(body["question_source_id"])
        self.assertIsNone(body["uploaded_by_user_id"])
        self.assertIsNone(body["media_asset"]["original_filename"])
        self.assertIsNone(body["media_asset"]["width_px"])
        self.assertIsNone(body["media_asset"]["height_px"])

    def test_image_dimensions_and_optional_ids_are_preserved(self) -> None:
        media = self._media(width_px=640, height_px=480)
        question_source_id = uuid.uuid4()
        uploader_id = uuid.uuid4()
        source = SourceDocumentRead(
            id=uuid.uuid4(), media_asset_id=media.id,
            question_source_id=question_source_id,
            uploaded_by_user_id=uploader_id, created_at=NOW,
            media_asset=media,
        )

        self.assertEqual((source.media_asset.width_px, source.media_asset.height_px), (640, 480))
        self.assertEqual(source.question_source_id, question_source_id)
        self.assertEqual(source.uploaded_by_user_id, uploader_id)

    def test_public_contract_exposes_no_storage_or_internal_fields(self) -> None:
        fields = set(SourceDocumentMediaAssetRead.model_fields) | set(
            SourceDocumentRead.model_fields,
        )
        self.assertTrue(fields.isdisjoint({
            "storage_key", "path", "absolute_path", "sha256", "deleted_at",
            "updated_at", "raw_bytes", "storage", "provider_credentials",
        }))


if __name__ == "__main__":
    unittest.main()
