from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, Integer, String, Text


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import app.models  # noqa: F401
from app.models.curriculum_course import CurriculumCourse
from app.models.curriculum_program import CurriculumProgram
from app.models.grade import Grade
from app.models.subject import Subject


class CurriculumCourseModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_curriculum_identity_contract(self) -> None:
        table = CurriculumCourse.__table__

        self.assertEqual(table.name, "curriculum_courses")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "curriculum_program_id", "subject_id", "grade_id",
                "display_name", "description", "sort_order", "is_active",
                "created_at", "updated_at", "deleted_at",
            },
        )
        self.assertTrue(table.c.id.primary_key)
        self.assertTrue(table.c.deleted_at.nullable)

        expected_foreign_keys = {
            "curriculum_program_id": ("curriculum_programs.id", False),
            "subject_id": ("subjects.id", False),
            "grade_id": ("grades.id", True),
        }
        for column_name, (target, nullable) in expected_foreign_keys.items():
            column = table.c[column_name]
            foreign_key = next(iter(column.foreign_keys))
            self.assertEqual(foreign_key.target_fullname, target)
            self.assertEqual(column.nullable, nullable)
            self.assertTrue(column.index)
            self.assertEqual(foreign_key.ondelete, "RESTRICT")

        self.assertIsInstance(table.c.display_name.type, String)
        self.assertEqual(table.c.display_name.type.length, 150)
        self.assertTrue(table.c.display_name.nullable)
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

        indexes = {index.name: index for index in table.indexes}
        grade_identity = indexes[
            "uq_curriculum_courses_program_subject_grade"
        ]
        no_grade_identity = indexes[
            "uq_curriculum_courses_program_subject_no_grade"
        ]
        self.assertTrue(grade_identity.unique)
        self.assertEqual(
            [column.name for column in grade_identity.columns],
            ["curriculum_program_id", "subject_id", "grade_id"],
        )
        self.assertEqual(
            str(grade_identity.dialect_options["postgresql"]["where"]),
            "grade_id IS NOT NULL",
        )
        self.assertTrue(no_grade_identity.unique)
        self.assertEqual(
            [column.name for column in no_grade_identity.columns],
            ["curriculum_program_id", "subject_id"],
        )
        self.assertEqual(
            str(no_grade_identity.dialect_options["postgresql"]["where"]),
            "grade_id IS NULL",
        )
        self.assertNotIn("deleted_at", str(grade_identity))
        self.assertNotIn("deleted_at", str(no_grade_identity))

        relationships = CurriculumCourse.__mapper__.relationships
        self.assertEqual(relationships.program.back_populates, "courses")
        self.assertEqual(relationships.subject.back_populates, "courses")
        self.assertEqual(
            relationships.grade.back_populates,
            "curriculum_courses",
        )
        self.assertEqual(
            CurriculumProgram.__mapper__.relationships.courses.back_populates,
            "program",
        )
        self.assertEqual(
            Subject.__mapper__.relationships.courses.back_populates,
            "subject",
        )
        self.assertEqual(
            Grade.__mapper__.relationships.curriculum_courses.back_populates,
            "grade",
        )
        for relationship in (
            relationships.program,
            relationships.subject,
            relationships.grade,
            CurriculumProgram.__mapper__.relationships.courses,
            Subject.__mapper__.relationships.courses,
            Grade.__mapper__.relationships.curriculum_courses,
        ):
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertTrue(
            {"name", "purpose_id", "workflow", "ksq", "bsq"}
            .isdisjoint(table.c.keys())
        )
        self.assertEqual(relationships.sections.back_populates, "course")
        self.assertNotIn("delete", relationships.sections.cascade)
        self.assertNotIn("delete-orphan", relationships.sections.cascade)
        self.assertNotIn("topics", relationships)


if __name__ == "__main__":
    unittest.main()
