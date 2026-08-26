from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, Enum as SQLEnum, Integer
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import ContentBlock, QuestionRevision


class ContentBlockModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_content_block_foundation_contract(self) -> None:
        table = ContentBlock.__table__

        self.assertEqual(table.name, "content_blocks")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "question_revision_id", "block_type", "sort_order",
                "created_at", "updated_at", "deleted_at",
            },
        )

        revision_column = table.c.question_revision_id
        self.assertIsInstance(revision_column.type, UUID)
        self.assertFalse(revision_column.nullable)
        revision_fk = next(iter(revision_column.foreign_keys))
        self.assertEqual(revision_fk.target_fullname, "question_revisions.id")
        self.assertEqual(revision_fk.ondelete, "RESTRICT")

        self.assertFalse(table.c.block_type.nullable)
        self.assertIsInstance(table.c.block_type.type, SQLEnum)
        self.assertFalse(table.c.block_type.type.native_enum)
        self.assertTrue(table.c.block_type.type.create_constraint)
        self.assertEqual(
            table.c.block_type.type.enums,
            ["text", "formula", "image", "geometry", "graph", "table", "diagram"],
        )

        self.assertIsInstance(table.c.sort_order.type, Integer)
        self.assertFalse(table.c.sort_order.nullable)
        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks["ck_content_blocks_sort_order_non_negative"],
            "sort_order >= 0",
        )

        ordered_index = next(
            index for index in table.indexes
            if index.name == "ix_content_blocks_revision_sort_order"
        )
        self.assertFalse(ordered_index.unique)
        self.assertEqual(
            [column.name for column in ordered_index.columns],
            ["question_revision_id", "sort_order"],
        )

        active_order_index = next(
            index for index in table.indexes
            if index.name == "uq_content_blocks_active_revision_sort_order"
        )
        self.assertTrue(active_order_index.unique)
        self.assertEqual(
            [column.name for column in active_order_index.columns],
            ["question_revision_id", "sort_order"],
        )
        self.assertEqual(
            str(active_order_index.dialect_options["postgresql"]["where"]),
            "deleted_at IS NULL",
        )
        self.assertTrue(table.c.deleted_at.nullable)
        self.assertNotIn("is_active", table.c)

        relationships = ContentBlock.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {
                "question_revision",
                "text_content",
                "formula_content",
                "image_content",
                "geometry_content",
            },
        )
        self.assertFalse(relationships.question_revision.uselist)
        self.assertEqual(
            relationships.question_revision.back_populates,
            "content_blocks",
        )
        for model_relationship in relationships:
            self.assertNotIn("delete", model_relationship.cascade)
            self.assertNotIn("delete-orphan", model_relationship.cascade)

        revision_relationship = QuestionRevision.__mapper__.relationships.content_blocks
        self.assertTrue(revision_relationship.uselist)
        self.assertEqual(revision_relationship.back_populates, "question_revision")
        self.assertTrue(revision_relationship.passive_deletes)
        self.assertEqual(list(revision_relationship.order_by), [table.c.sort_order])
        self.assertNotIn("delete", revision_relationship.cascade)
        self.assertNotIn("delete-orphan", revision_relationship.cascade)

        self.assertTrue(
            {
                "content", "body", "source_text", "source_format", "payload",
                "rendered_markup", "asset_id", "approval_status", "approved_by",
                "ai_status", "ai_proposal_id", "question_type_id", "topic_id",
                "purpose_id", "grade_id", "section_id", "curriculum_course_id",
                "subject_id",
            }.isdisjoint(table.c.keys())
        )

        expected_phase_one_tables = {
            "question_types", "question_families", "question_forms",
            "question_revisions", "question_revision_related_topics",
            "question_revision_purposes",
        }
        self.assertTrue(expected_phase_one_tables.issubset(Base.metadata.tables))
        self.assertIn("content_blocks", Base.metadata.tables)

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
