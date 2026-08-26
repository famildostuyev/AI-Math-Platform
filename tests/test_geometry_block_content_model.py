from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import ContentBlock, GeometryBlockContent


class GeometryBlockContentModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_canonical_geometry_payload_contract(self) -> None:
        table = GeometryBlockContent.__table__

        self.assertEqual(table.name, "geometry_block_contents")
        self.assertEqual(
            set(table.columns.keys()),
            {"content_block_id", "source_data", "format_version"},
        )

        content_block_column = table.c.content_block_id
        self.assertIsInstance(content_block_column.type, UUID)
        self.assertTrue(content_block_column.primary_key)
        self.assertFalse(content_block_column.nullable)
        content_block_fk = next(iter(content_block_column.foreign_keys))
        self.assertEqual(content_block_fk.target_fullname, "content_blocks.id")
        self.assertEqual(content_block_fk.ondelete, "RESTRICT")

        self.assertIsInstance(table.c.source_data.type, JSONB)
        self.assertFalse(table.c.source_data.nullable)

        self.assertIsInstance(table.c.format_version.type, Integer)
        self.assertFalse(table.c.format_version.nullable)
        self.assertEqual(table.c.format_version.default.arg, 1)
        self.assertEqual(str(table.c.format_version.server_default.arg), "1")

        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks,
            {
                "ck_geometry_block_contents_format_version_positive":
                    "format_version > 0",
                "ck_geometry_block_contents_source_data_object":
                    "jsonb_typeof(source_data) = 'object'",
            },
        )

        self.assertTrue(
            {
                "id", "created_at", "updated_at", "deleted_at", "is_active",
                "question_revision_id", "block_type", "sort_order",
                "media_asset_id", "source_asset_id", "preview_asset_id",
                "rendered_svg", "renderer_version", "editor_state", "status",
                "approval_status", "approved_by", "ai_status",
                "ai_proposal_id", "ocr_confidence", "source_document_id",
            }.isdisjoint(table.c.keys())
        )

        relationships = GeometryBlockContent.__mapper__.relationships
        self.assertEqual(set(relationships.keys()), {"content_block"})
        self.assertFalse(relationships.content_block.uselist)
        self.assertEqual(
            relationships.content_block.back_populates,
            "geometry_content",
        )
        self.assertNotIn("delete", relationships.content_block.cascade)
        self.assertNotIn("delete-orphan", relationships.content_block.cascade)

        geometry_relationship = (
            ContentBlock.__mapper__.relationships.geometry_content
        )
        self.assertFalse(geometry_relationship.uselist)
        self.assertEqual(geometry_relationship.back_populates, "content_block")
        self.assertTrue(geometry_relationship.passive_deletes)
        self.assertNotIn("delete", geometry_relationship.cascade)
        self.assertNotIn("delete-orphan", geometry_relationship.cascade)

        # Parent block-type compatibility remains a service invariant.
        self.assertNotIn("block_type", table.c)
        self.assertFalse(
            any("block_type" in expression for expression in checks.values())
        )

        for primitive_table in {
            "geometry_points", "geometry_segments", "geometry_angles",
            "geometry_labels", "geometry_objects",
        }:
            self.assertNotIn(primitive_table, Base.metadata.tables)

        expected_tables = {
            "question_types", "question_families", "question_forms",
            "question_revisions", "question_revision_related_topics",
            "question_revision_purposes", "content_blocks",
            "text_block_contents", "formula_block_contents", "media_assets",
            "image_block_contents", "geometry_block_contents",
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
