from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import QuestionType


class QuestionTypeModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_admin_catalog_contract(self) -> None:
        table = QuestionType.__table__

        self.assertEqual(table.name, "question_types")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id",
                "name",
                "display_name",
                "description",
                "sort_order",
                "is_active",
                "created_at",
                "updated_at",
                "deleted_at",
            },
        )

        self.assertIsInstance(table.c.name.type, String)
        self.assertEqual(table.c.name.type.length, 100)
        self.assertFalse(table.c.name.nullable)
        self.assertTrue(table.c.name.unique)
        self.assertTrue(table.c.name.index)

        self.assertIsInstance(table.c.display_name.type, String)
        self.assertEqual(table.c.display_name.type.length, 150)
        self.assertFalse(table.c.display_name.nullable)

        self.assertIsInstance(table.c.description.type, Text)
        self.assertTrue(table.c.description.nullable)

        self.assertIsInstance(table.c.sort_order.type, Integer)
        self.assertFalse(table.c.sort_order.nullable)
        self.assertEqual(table.c.sort_order.default.arg, 0)
        self.assertEqual(str(table.c.sort_order.server_default.arg), "0")

        self.assertIsInstance(table.c.is_active.type, Boolean)
        self.assertFalse(table.c.is_active.nullable)
        self.assertTrue(table.c.is_active.default.arg)
        self.assertEqual(str(table.c.is_active.server_default.arg), "true")

        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)
        self.assertIsInstance(table.c.created_at.type, DateTime)
        self.assertFalse(table.c.created_at.nullable)
        self.assertIsInstance(table.c.updated_at.type, DateTime)
        self.assertFalse(table.c.updated_at.nullable)
        self.assertIsInstance(table.c.deleted_at.type, DateTime)
        self.assertTrue(table.c.deleted_at.nullable)

        name_indexes = [
            index for index in table.indexes
            if "name" in index.columns
        ]
        self.assertEqual(len(name_indexes), 1)
        self.assertTrue(name_indexes[0].unique)
        self.assertIsNone(
            name_indexes[0].dialect_options["postgresql"]["where"]
        )

        self.assertTrue(
            {
                "has_options",
                "requires_context",
                "supports_hints",
                "requires_solution",
                "option_count",
                "open_response_mode",
            }.isdisjoint(table.c.keys())
        )
        self.assertEqual(len(QuestionType.__mapper__.relationships), 0)

        expected_phase_one_tables = {
            "question_types",
            "question_families",
            "question_forms",
            "question_revisions",
            "question_revision_related_topics",
            "question_revision_purposes",
            "question_sources",
        }
        self.assertEqual(
            {
                name for name in Base.metadata.tables
                if name.startswith("question_")
            },
            expected_phase_one_tables,
        )

        for excluded_table in {
            "answer_options",
            "accepted_answers",
            "solutions",
            "hints",
            "rubrics",
            "media",
            "situation_contexts",
            "matching_items",
            "assessment_rules",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
