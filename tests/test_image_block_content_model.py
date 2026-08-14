from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, Text
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import ContentBlock, ImageBlockContent, MediaAsset


class ImageBlockContentModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_contextual_image_payload_contract(self) -> None:
        table = ImageBlockContent.__table__

        self.assertEqual(table.name, "image_block_contents")
        self.assertEqual(
            set(table.columns.keys()),
            {"content_block_id", "media_asset_id", "alt_text"},
        )

        content_block_column = table.c.content_block_id
        self.assertIsInstance(content_block_column.type, UUID)
        self.assertTrue(content_block_column.primary_key)
        self.assertFalse(content_block_column.nullable)
        content_block_fk = next(iter(content_block_column.foreign_keys))
        self.assertEqual(content_block_fk.target_fullname, "content_blocks.id")
        self.assertEqual(content_block_fk.ondelete, "RESTRICT")

        media_asset_column = table.c.media_asset_id
        self.assertIsInstance(media_asset_column.type, UUID)
        self.assertFalse(media_asset_column.nullable)
        self.assertTrue(media_asset_column.index)
        self.assertFalse(bool(media_asset_column.unique))
        media_asset_fk = next(iter(media_asset_column.foreign_keys))
        self.assertEqual(media_asset_fk.target_fullname, "media_assets.id")
        self.assertEqual(media_asset_fk.ondelete, "RESTRICT")

        self.assertIsInstance(table.c.alt_text.type, Text)
        self.assertIsNone(table.c.alt_text.type.length)
        self.assertTrue(table.c.alt_text.nullable)

        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(checks, {})

        self.assertTrue(
            {
                "id", "created_at", "updated_at", "deleted_at", "is_active",
                "question_revision_id", "block_type", "sort_order", "caption",
                "title", "display_width", "display_height", "alignment",
                "crop", "rotation", "format_version", "storage_key",
                "mime_type", "original_filename", "size_bytes", "sha256",
                "width_px", "height_px", "status", "upload_status",
                "processing_status", "ai_status", "ai_proposal_id",
                "ocr_confidence", "source_document_id",
            }.isdisjoint(table.c.keys())
        )

        relationships = ImageBlockContent.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {"content_block", "media_asset"},
        )
        for relationship_name in ("content_block", "media_asset"):
            relationship = relationships[relationship_name]
            self.assertFalse(relationship.uselist)
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)
        self.assertEqual(
            relationships.content_block.back_populates,
            "image_content",
        )
        self.assertEqual(
            relationships.media_asset.back_populates,
            "image_block_contents",
        )

        image_relationship = ContentBlock.__mapper__.relationships.image_content
        self.assertFalse(image_relationship.uselist)
        self.assertEqual(image_relationship.back_populates, "content_block")
        self.assertTrue(image_relationship.passive_deletes)
        self.assertNotIn("delete", image_relationship.cascade)
        self.assertNotIn("delete-orphan", image_relationship.cascade)

        asset_relationship = (
            MediaAsset.__mapper__.relationships.image_block_contents
        )
        self.assertTrue(asset_relationship.uselist)
        self.assertEqual(asset_relationship.back_populates, "media_asset")
        self.assertTrue(asset_relationship.passive_deletes)
        self.assertNotIn("delete", asset_relationship.cascade)
        self.assertNotIn("delete-orphan", asset_relationship.cascade)

        # Parent discriminator and asset eligibility are service invariants.
        self.assertNotIn("block_type", table.c)
        self.assertFalse(
            any("block_type" in expression for expression in checks.values())
        )

        expected_tables = {
            "question_types", "question_families", "question_forms",
            "question_revisions", "question_revision_related_topics",
            "question_revision_purposes", "content_blocks",
            "text_block_contents", "formula_block_contents", "media_assets",
            "image_block_contents",
        }
        self.assertTrue(expected_tables.issubset(Base.metadata.tables))

        for excluded_table in {
            "graph_block_contents",
            "table_block_contents", "table_rows", "table_cells",
            "diagram_block_contents", "answer_options", "accepted_answers",
            "solutions", "hints", "rubrics", "situation_contexts",
            "matching_items", "assessment_rules",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
