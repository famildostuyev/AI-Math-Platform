from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Enum as SQLEnum, UniqueConstraint


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import QuestionFamily, QuestionForm, QuestionRevision, QuestionType


class QuestionRevisionModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_revision_governance_contract(self) -> None:
        table = QuestionRevision.__table__

        self.assertEqual(table.name, "question_revisions")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "question_form_id", "revision_number",
                "based_on_revision_id", "status", "provenance_kind",
                "difficulty", "primary_topic_id", "created_by_user_id",
                "reviewed_by_user_id", "reviewed_at",
                "is_current_approved", "created_at", "updated_at",
                "deleted_at",
            },
        )

        expected_fks = {
            "question_form_id": ("question_forms.id", "RESTRICT", False),
            "based_on_revision_id": ("question_revisions.id", "RESTRICT", True),
            "primary_topic_id": ("topics.id", "RESTRICT", True),
            "created_by_user_id": ("users.id", "SET NULL", True),
            "reviewed_by_user_id": ("users.id", "SET NULL", True),
        }
        for column_name, (target, ondelete, nullable) in expected_fks.items():
            column = table.c[column_name]
            self.assertEqual(column.nullable, nullable)
            self.assertTrue(column.index)
            foreign_key = next(iter(column.foreign_keys))
            self.assertEqual(foreign_key.target_fullname, target)
            self.assertEqual(foreign_key.ondelete, ondelete)

        enum_contracts = {
            "status": ["draft", "proposed", "approved", "rejected"],
            "provenance_kind": [
                "human_authored", "imported", "ai_generated",
                "ai_transformed", "admin_edited",
            ],
            "difficulty": ["easy", "medium", "hard"],
        }
        for column_name, values in enum_contracts.items():
            column = table.c[column_name]
            self.assertIsInstance(column.type, SQLEnum)
            self.assertFalse(column.type.native_enum)
            self.assertTrue(column.type.create_constraint)
            self.assertEqual(column.type.enums, values)
        self.assertFalse(table.c.status.nullable)
        self.assertFalse(table.c.provenance_kind.nullable)
        self.assertTrue(table.c.difficulty.nullable)

        self.assertTrue(table.c.reviewed_at.nullable)
        self.assertIsInstance(table.c.reviewed_at.type, DateTime)
        self.assertTrue(table.c.reviewed_at.type.timezone)
        self.assertFalse(table.c.is_current_approved.nullable)
        self.assertFalse(table.c.is_current_approved.default.arg)
        self.assertEqual(
            str(table.c.is_current_approved.server_default.arg),
            "false",
        )

        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks["ck_question_revisions_number_positive"],
            "revision_number > 0",
        )
        self.assertEqual(
            checks["ck_question_revisions_base_not_self"],
            "based_on_revision_id IS NULL OR based_on_revision_id <> id",
        )
        self.assertIn(
            "NOT is_current_approved OR status = 'approved'",
            checks["ck_question_revisions_current_requires_approved"],
        )
        approval_check = checks["ck_question_revisions_approved_complete"]
        for requirement in {
            "primary_topic_id IS NOT NULL", "difficulty IS NOT NULL",
            "reviewed_by_user_id IS NOT NULL", "reviewed_at IS NOT NULL",
        }:
            self.assertIn(requirement, approval_check)

        unique_constraints = {
            constraint.name: tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        self.assertEqual(
            unique_constraints["uq_question_revisions_form_id_number"],
            ("question_form_id", "revision_number"),
        )
        current_index = next(
            index for index in table.indexes
            if index.name == "uq_question_revisions_one_current_approved_per_form"
        )
        self.assertTrue(current_index.unique)
        self.assertEqual(
            [column.name for column in current_index.columns],
            ["question_form_id"],
        )
        self.assertEqual(
            str(current_index.dialect_options["postgresql"]["where"]),
            "is_current_approved = true",
        )

        relationships = QuestionRevision.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {
                "question_form", "primary_topic", "created_by_user",
                "reviewed_by_user", "based_on_revision", "derived_revisions",
            },
        )
        for scalar_name in {
            "question_form", "primary_topic", "created_by_user",
            "reviewed_by_user", "based_on_revision",
        }:
            self.assertFalse(relationships[scalar_name].uselist)
        self.assertTrue(relationships.derived_revisions.uselist)
        self.assertEqual(relationships.based_on_revision.remote_side, {table.c.id})
        self.assertTrue(relationships.derived_revisions.passive_deletes)
        for relationship in relationships:
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertTrue(
            {"grade_id", "section_id", "curriculum_course_id", "subject_id"}
            .isdisjoint(table.c.keys())
        )
        self.assertEqual(QuestionType.__table__.name, "question_types")
        self.assertEqual(QuestionFamily.__table__.name, "question_families")
        self.assertEqual(QuestionForm.__table__.name, "question_forms")
        for excluded_table in {
            "answer_options", "accepted_answers", "solutions", "hints",
            "rubrics", "media", "situation_contexts", "matching_items",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
