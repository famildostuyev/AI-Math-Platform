from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import ContentBlock, TextBlockContent


class TextBlockContentModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_canonical_text_contract(self) -> None:
        table = TextBlockContent.__table__

        self.assertEqual(table.name, "text_block_contents")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "content_block_id", "source_text", "document_data",
                "format_version",
            },
        )

        content_block_column = table.c.content_block_id
        self.assertIsInstance(content_block_column.type, UUID)
        self.assertTrue(content_block_column.primary_key)
        self.assertFalse(content_block_column.nullable)
        content_block_fk = next(iter(content_block_column.foreign_keys))
        self.assertEqual(content_block_fk.target_fullname, "content_blocks.id")
        self.assertEqual(content_block_fk.ondelete, "RESTRICT")

        self.assertIsInstance(table.c.source_text.type, Text)
        self.assertIsNone(table.c.source_text.type.length)
        self.assertFalse(table.c.source_text.nullable)

        self.assertIsInstance(table.c.document_data.type, JSONB)
        self.assertTrue(table.c.document_data.nullable)
        self.assertIsNone(table.c.document_data.default)
        self.assertIsNone(table.c.document_data.server_default)

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
                "ck_text_block_contents_format_version_positive":
                    "format_version > 0",
                "ck_text_block_contents_document_data_object_or_null":
                    "document_data IS NULL OR "
                    "jsonb_typeof(document_data) = 'object'",
            },
        )
        self.assertFalse(
            any("source_text" in expression for expression in checks.values())
        )

        self.assertTrue(
            {
                "id", "created_at", "updated_at", "deleted_at", "is_active",
                "question_revision_id", "block_type", "sort_order",
                "revision_number", "status", "approved_by", "reviewed_by",
                "rendered_html", "editor_state", "editor_json", "payload",
                "ai_status", "ai_proposal_id", "source_document_id",
                "ocr_confidence", "rendered_markdown", "html", "css",
                "style_json", "font_family", "font_size", "alignment",
                "marks", "paragraphs", "nodes", "ast_version",
                "schema_version", "source_format", "rich_text", "is_rich",
                "legacy_mode",
            }.isdisjoint(table.c.keys())
        )

        relationships = TextBlockContent.__mapper__.relationships
        self.assertEqual(set(relationships.keys()), {"content_block"})
        self.assertFalse(relationships.content_block.uselist)
        self.assertEqual(
            relationships.content_block.back_populates,
            "text_content",
        )
        self.assertNotIn("delete", relationships.content_block.cascade)
        self.assertNotIn("delete-orphan", relationships.content_block.cascade)

        text_relationship = ContentBlock.__mapper__.relationships.text_content
        self.assertFalse(text_relationship.uselist)
        self.assertEqual(text_relationship.back_populates, "content_block")
        self.assertTrue(text_relationship.passive_deletes)
        self.assertNotIn("delete", text_relationship.cascade)
        self.assertNotIn("delete-orphan", text_relationship.cascade)

        # Parent block-type compatibility is a cross-table service invariant;
        # this table deliberately has no duplicated discriminator or local CHECK.
        self.assertNotIn("block_type", table.c)
        self.assertFalse(
            any("block_type" in expression for expression in checks.values())
        )

        expected_tables = {
            "question_types", "question_families", "question_forms",
            "question_revisions", "question_revision_related_topics",
            "question_revision_purposes", "content_blocks",
            "text_block_contents",
        }
        self.assertTrue(expected_tables.issubset(Base.metadata.tables))

        for excluded_table in {
            "graph_block_contents",
            "table_block_contents", "table_rows", "table_cells",
            "diagram_block_contents",
            "solutions", "hints", "rubrics", "media", "situation_contexts",
            "matching_items", "assessment_rules",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
