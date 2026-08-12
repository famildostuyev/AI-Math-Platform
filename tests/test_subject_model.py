from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, Integer, String, Text


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.models.subject import Subject


class SubjectModelMetadataTest(unittest.TestCase):
    def test_subject_metadata_matches_catalog_contract(self) -> None:
        table = Subject.__table__

        self.assertEqual(table.name, "subjects")
        self.assertEqual(
            set(table.columns),
            {
                table.c.id,
                table.c.name,
                table.c.display_name,
                table.c.description,
                table.c.sort_order,
                table.c.is_active,
                table.c.created_at,
                table.c.updated_at,
                table.c.deleted_at,
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

        self.assertTrue(table.c.deleted_at.nullable)
        self.assertEqual(len(table.foreign_keys), 0)
        self.assertEqual(len(Subject.__mapper__.relationships), 0)


if __name__ == "__main__":
    unittest.main()
