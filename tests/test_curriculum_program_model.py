from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, Integer, String, Text


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.models.curriculum_program import CurriculumProgram


class CurriculumProgramModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_standalone_catalog_contract(self) -> None:
        table = CurriculumProgram.__table__
        expected_columns = {
            "id", "name", "display_name", "description", "sort_order",
            "is_active", "created_at", "updated_at", "deleted_at",
        }

        self.assertEqual(table.name, "curriculum_programs")
        self.assertEqual(set(table.columns.keys()), expected_columns)
        self.assertTrue(table.c.id.primary_key)

        self.assertIsInstance(table.c.name.type, String)
        self.assertEqual(table.c.name.type.length, 100)
        self.assertFalse(table.c.name.nullable)
        self.assertTrue(table.c.name.unique)
        self.assertTrue(table.c.name.index)

        self.assertIsInstance(table.c.display_name.type, String)
        self.assertEqual(table.c.display_name.type.length, 150)
        self.assertFalse(table.c.display_name.nullable)
        self.assertFalse(bool(table.c.display_name.unique))

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

        self.assertIn("created_at", table.c)
        self.assertIn("updated_at", table.c)
        self.assertTrue(table.c.deleted_at.nullable)
        self.assertEqual(len(table.foreign_keys), 0)
        self.assertEqual(
            set(CurriculumProgram.__mapper__.relationships.keys()),
            {"courses"},
        )

        self.assertTrue(
            {"version", "effective_from", "effective_to", "academic_year"}
            .isdisjoint(table.c.keys())
        )
        self.assertTrue(
            {"purpose_id", "purpose_name", "workflow"}.isdisjoint(table.c.keys())
        )


if __name__ == "__main__":
    unittest.main()
