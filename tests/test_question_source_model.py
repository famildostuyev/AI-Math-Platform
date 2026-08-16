from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.models import QuestionSource


class QuestionSourceModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_reusable_soft_deleted_catalog_contract(self) -> None:
        table = QuestionSource.__table__

        self.assertEqual(table.name, "question_sources")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "name", "display_name", "description", "sort_order",
                "is_active", "created_at", "updated_at", "deleted_at",
            },
        )
        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)
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
        self.assertEqual(table.c.sort_order.default.arg, 0)
        self.assertEqual(str(table.c.sort_order.server_default.arg), "0")
        self.assertFalse(table.c.sort_order.nullable)
        self.assertIsInstance(table.c.is_active.type, Boolean)
        self.assertTrue(table.c.is_active.default.arg)
        self.assertEqual(str(table.c.is_active.server_default.arg), "true")
        self.assertFalse(table.c.is_active.nullable)
        self.assertIsInstance(table.c.created_at.type, DateTime)
        self.assertFalse(table.c.created_at.nullable)
        self.assertIsInstance(table.c.updated_at.type, DateTime)
        self.assertFalse(table.c.updated_at.nullable)
        self.assertIsInstance(table.c.deleted_at.type, DateTime)
        self.assertTrue(table.c.deleted_at.nullable)

    def test_relationship_does_not_cascade_question_form_deletion(self) -> None:
        relationship = QuestionSource.__mapper__.relationships.question_forms

        self.assertTrue(relationship.uselist)
        self.assertTrue(relationship.passive_deletes)
        self.assertNotIn("delete", relationship.cascade)
        self.assertNotIn("delete-orphan", relationship.cascade)


if __name__ == "__main__":
    unittest.main()
