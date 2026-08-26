from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import BigInteger, CheckConstraint, Integer, String
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import MediaAsset


class MediaAssetModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_immutable_media_asset_contract(self) -> None:
        table = MediaAsset.__table__

        self.assertEqual(table.name, "media_assets")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id",
                "storage_key",
                "mime_type",
                "original_filename",
                "size_bytes",
                "sha256",
                "width_px",
                "height_px",
                "created_at",
                "updated_at",
                "deleted_at",
            },
        )

        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)
        self.assertFalse(table.c.id.nullable)
        self.assertFalse(table.c.created_at.nullable)
        self.assertFalse(table.c.updated_at.nullable)
        self.assertTrue(table.c.deleted_at.nullable)

        self.assertIsInstance(table.c.storage_key.type, String)
        self.assertEqual(table.c.storage_key.type.length, 1024)
        self.assertFalse(table.c.storage_key.nullable)
        self.assertTrue(table.c.storage_key.unique)

        self.assertIsInstance(table.c.mime_type.type, String)
        self.assertEqual(table.c.mime_type.type.length, 100)
        self.assertFalse(table.c.mime_type.nullable)

        self.assertIsInstance(table.c.original_filename.type, String)
        self.assertEqual(table.c.original_filename.type.length, 255)
        self.assertTrue(table.c.original_filename.nullable)

        self.assertIsInstance(table.c.size_bytes.type, BigInteger)
        self.assertFalse(table.c.size_bytes.nullable)

        self.assertIsInstance(table.c.sha256.type, String)
        self.assertEqual(table.c.sha256.type.length, 64)
        self.assertFalse(table.c.sha256.nullable)
        self.assertFalse(bool(table.c.sha256.unique))
        self.assertFalse(table.c.sha256.index)

        for dimension in (table.c.width_px, table.c.height_px):
            self.assertIsInstance(dimension.type, Integer)
            self.assertTrue(dimension.nullable)

        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks,
            {
                "ck_media_assets_storage_key_not_blank":
                    "char_length(btrim(storage_key)) > 0",
                "ck_media_assets_mime_type_not_blank":
                    "char_length(btrim(mime_type)) > 0",
                "ck_media_assets_size_bytes_positive": "size_bytes > 0",
                "ck_media_assets_sha256_length": "char_length(sha256) = 64",
                "ck_media_assets_width_px_positive":
                    "width_px IS NULL OR width_px > 0",
                "ck_media_assets_height_px_positive":
                    "height_px IS NULL OR height_px > 0",
            },
        )
        self.assertFalse(
            any("~" in expression for expression in checks.values())
        )

        self.assertTrue(
            {
                "status", "upload_status", "processing_status", "is_ready",
                "format_version", "source_format", "media_kind", "owner_id",
                "user_id", "question_revision_id", "content_block_id",
                "caption", "alt_text", "ai_status", "ai_proposal_id",
                "ocr_confidence", "source_document_id", "parent_asset_id",
                "derived_from_asset_id", "version_number", "blob", "data",
                "public_url", "signed_url", "absolute_path",
            }.isdisjoint(table.c.keys())
        )
        self.assertEqual(
            set(MediaAsset.__mapper__.relationships.keys()),
            {"image_block_contents"},
        )
        self.assertEqual(len(table.foreign_keys), 0)

        expected_tables = {
            "question_types",
            "question_families",
            "question_forms",
            "question_revisions",
            "question_revision_related_topics",
            "question_revision_purposes",
            "content_blocks",
            "text_block_contents",
            "formula_block_contents",
            "media_assets",
            "image_block_contents",
        }
        self.assertTrue(expected_tables.issubset(Base.metadata.tables))

        for excluded_table in {
            "graph_block_contents", "table_block_contents", "table_rows",
            "table_cells", "diagram_block_contents",
            "solutions", "hints", "rubrics",
            "situation_contexts", "matching_items", "assessment_rules",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
