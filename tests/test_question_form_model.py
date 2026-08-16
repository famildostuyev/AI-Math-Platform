from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, Enum as SQLEnum, Text


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import QuestionFamily, QuestionForm, QuestionSource, QuestionType


class QuestionFormModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_structural_form_contract(self) -> None:
        table = QuestionForm.__table__

        self.assertEqual(table.name, "question_forms")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id",
                "question_family_id",
                "question_type_id",
                "source_form_id",
                "source_id",
                "source_detail",
                "derivation_kind",
                "open_response_mode",
                "is_original",
                "is_active",
                "created_at",
                "updated_at",
                "deleted_at",
            },
        )

        expected_fks = {
            "question_family_id": ("question_families.id", "RESTRICT", False),
            "question_type_id": ("question_types.id", "RESTRICT", False),
            "source_form_id": ("question_forms.id", "RESTRICT", True),
            "source_id": ("question_sources.id", "RESTRICT", True),
        }
        for column_name, (target, ondelete, nullable) in expected_fks.items():
            column = table.c[column_name]
            self.assertEqual(column.nullable, nullable)
            self.assertTrue(column.index)
            foreign_key = next(iter(column.foreign_keys))
            self.assertEqual(foreign_key.target_fullname, target)
            self.assertEqual(foreign_key.ondelete, ondelete)

        self.assertFalse(table.c.derivation_kind.nullable)
        self.assertIsInstance(table.c.source_detail.type, Text)
        self.assertTrue(table.c.source_detail.nullable)
        self.assertIsInstance(table.c.derivation_kind.type, SQLEnum)
        self.assertFalse(table.c.derivation_kind.type.native_enum)
        self.assertTrue(table.c.derivation_kind.type.create_constraint)
        self.assertEqual(
            table.c.derivation_kind.type.enums,
            ["original", "transformed"],
        )

        self.assertTrue(table.c.open_response_mode.nullable)
        self.assertIsInstance(table.c.open_response_mode.type, SQLEnum)
        self.assertFalse(table.c.open_response_mode.type.native_enum)
        self.assertTrue(table.c.open_response_mode.type.create_constraint)
        self.assertEqual(
            table.c.open_response_mode.type.enums,
            ["short_answer", "detailed_solution"],
        )

        self.assertFalse(table.c.is_original.nullable)
        self.assertFalse(table.c.is_original.default.arg)
        self.assertEqual(str(table.c.is_original.server_default.arg), "false")
        self.assertFalse(table.c.is_active.nullable)
        self.assertTrue(table.c.is_active.default.arg)
        self.assertEqual(str(table.c.is_active.server_default.arg), "true")

        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks["ck_question_forms_source_not_self"],
            "source_form_id IS NULL OR source_form_id <> id",
        )
        self.assertIn(
            "derivation_kind = 'original' AND source_form_id IS NULL",
            checks["ck_question_forms_derivation_source_consistent"],
        )
        self.assertIn(
            "derivation_kind = 'transformed' AND source_form_id IS NOT NULL",
            checks["ck_question_forms_derivation_source_consistent"],
        )
        self.assertEqual(
            checks["ck_question_forms_original_kind_consistent"],
            "is_original = (derivation_kind = 'original')",
        )

        original_index = next(
            index
            for index in table.indexes
            if index.name == "uq_question_forms_one_original_per_family"
        )
        self.assertTrue(original_index.unique)
        self.assertEqual(
            [column.name for column in original_index.columns],
            ["question_family_id"],
        )
        self.assertEqual(
            str(original_index.dialect_options["postgresql"]["where"]),
            "is_original = true",
        )

        relationships = QuestionForm.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {
                "question_family", "question_type", "source", "source_form",
                "derived_forms",
            },
        )
        self.assertFalse(relationships.question_family.uselist)
        self.assertFalse(relationships.question_type.uselist)
        self.assertFalse(relationships.source.uselist)
        self.assertFalse(relationships.source_form.uselist)
        self.assertTrue(relationships.derived_forms.uselist)
        self.assertEqual(relationships.source_form.remote_side, {table.c.id})
        self.assertTrue(relationships.derived_forms.passive_deletes)
        for relationship in relationships:
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertEqual(QuestionType.__table__.name, "question_types")
        self.assertEqual(QuestionFamily.__table__.name, "question_families")
        self.assertEqual(QuestionSource.__table__.name, "question_sources")
        for excluded_table in {
            "answer_options",
            "accepted_answers",
            "solutions",
            "hints",
            "rubrics",
            "media",
            "situation_contexts",
            "matching_items",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
