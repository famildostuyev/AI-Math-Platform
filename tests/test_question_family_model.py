from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, Enum as SQLEnum


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.models import QuestionFamily, QuestionType


class QuestionFamilyModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_lineage_contract(self) -> None:
        table = QuestionFamily.__table__

        self.assertEqual(table.name, "question_families")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id",
                "source_family_id",
                "origin_kind",
                "created_by_user_id",
                "is_active",
                "created_at",
                "updated_at",
                "deleted_at",
            },
        )

        self.assertTrue(table.c.source_family_id.nullable)
        self.assertTrue(table.c.source_family_id.index)
        source_fk = next(iter(table.c.source_family_id.foreign_keys))
        self.assertEqual(source_fk.target_fullname, "question_families.id")
        self.assertEqual(source_fk.ondelete, "RESTRICT")

        self.assertTrue(table.c.created_by_user_id.nullable)
        self.assertTrue(table.c.created_by_user_id.index)
        creator_fk = next(iter(table.c.created_by_user_id.foreign_keys))
        self.assertEqual(creator_fk.target_fullname, "users.id")
        self.assertEqual(creator_fk.ondelete, "SET NULL")

        self.assertFalse(table.c.origin_kind.nullable)
        self.assertIsInstance(table.c.origin_kind.type, SQLEnum)
        self.assertFalse(table.c.origin_kind.type.native_enum)
        self.assertTrue(table.c.origin_kind.type.create_constraint)
        self.assertEqual(
            table.c.origin_kind.type.enums,
            ["authored", "imported", "ai_generated_similar"],
        )

        self.assertFalse(table.c.is_active.nullable)
        self.assertTrue(table.c.is_active.default.arg)
        self.assertEqual(str(table.c.is_active.server_default.arg), "true")

        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks["ck_question_families_source_not_self"],
            "source_family_id IS NULL OR source_family_id <> id",
        )

        relationships = QuestionFamily.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {"source_family", "derived_families", "created_by_user"},
        )
        self.assertFalse(relationships.source_family.uselist)
        self.assertTrue(relationships.derived_families.uselist)
        self.assertEqual(
            relationships.source_family.remote_side,
            {table.c.id},
        )
        self.assertTrue(relationships.derived_families.passive_deletes)

        for relationship in relationships:
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertEqual(QuestionType.__table__.name, "question_types")
        self.assertNotIn("question_forms", relationships)
        self.assertNotIn("question_revisions", relationships)


if __name__ == "__main__":
    unittest.main()
