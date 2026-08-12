from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, Integer, String, Text, UniqueConstraint


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import app.models  # noqa: F401
from app.models.curriculum_course import CurriculumCourse
from app.models.section import Section


class SectionModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_curriculum_section_contract(self) -> None:
        table = Section.__table__

        self.assertEqual(table.name, "sections")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "curriculum_course_id", "name", "display_name",
                "description", "sort_order", "is_active", "created_at",
                "updated_at", "deleted_at",
            },
        )
        self.assertTrue(table.c.id.primary_key)
        self.assertIn("created_at", table.c)
        self.assertIn("updated_at", table.c)
        self.assertTrue(table.c.deleted_at.nullable)

        course_column = table.c.curriculum_course_id
        course_fk = next(iter(course_column.foreign_keys))
        self.assertFalse(course_column.nullable)
        self.assertTrue(course_column.index)
        self.assertEqual(course_fk.target_fullname, "curriculum_courses.id")
        self.assertEqual(course_fk.ondelete, "RESTRICT")

        self.assertIsInstance(table.c.name.type, String)
        self.assertEqual(table.c.name.type.length, 100)
        self.assertFalse(table.c.name.nullable)
        self.assertFalse(bool(table.c.name.unique))
        self.assertFalse(bool(table.c.name.index))
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

        unique_constraints = {
            constraint.name: constraint
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        identity = unique_constraints[
            "uq_sections_curriculum_course_id_name"
        ]
        self.assertEqual(
            [column.name for column in identity.columns],
            ["curriculum_course_id", "name"],
        )
        self.assertNotIn("deleted_at", identity.columns)

        relationships = Section.__mapper__.relationships
        self.assertEqual(set(relationships.keys()), {"course"})
        self.assertEqual(relationships.course.back_populates, "sections")
        self.assertEqual(
            CurriculumCourse.__mapper__.relationships.sections.back_populates,
            "course",
        )
        for relationship in (
            relationships.course,
            CurriculumCourse.__mapper__.relationships.sections,
        ):
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertTrue(
            {
                "purpose_id", "workflow", "ksq", "bsq", "selection_limit",
                "embedding", "semantic_tags", "learning_objectives",
                "prerequisites", "difficulty", "ai_score",
            }.isdisjoint(table.c.keys())
        )
        self.assertNotIn("topics", relationships)


if __name__ == "__main__":
    unittest.main()
