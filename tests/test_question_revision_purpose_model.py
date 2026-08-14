from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import (
    QuestionFamily,
    QuestionForm,
    QuestionRevision,
    QuestionRevisionPurpose,
    QuestionRevisionRelatedTopic,
    QuestionType,
)


class QuestionRevisionPurposeModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_purpose_classification_contract(self) -> None:
        table = QuestionRevisionPurpose.__table__

        self.assertEqual(table.name, "question_revision_purposes")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "question_revision_id", "purpose_id",
                "created_at", "updated_at", "deleted_at",
            },
        )

        expected_fks = {
            "question_revision_id": ("question_revisions.id", "RESTRICT"),
            "purpose_id": ("purposes.id", "RESTRICT"),
        }
        for column_name, (target, ondelete) in expected_fks.items():
            column = table.c[column_name]
            self.assertIsInstance(column.type, UUID)
            self.assertFalse(column.nullable)
            self.assertTrue(column.index)
            foreign_key = next(iter(column.foreign_keys))
            self.assertEqual(foreign_key.target_fullname, target)
            self.assertEqual(foreign_key.ondelete, ondelete)

        active_link_index = next(
            index for index in table.indexes
            if index.name == "uq_question_revision_purposes_active_link"
        )
        self.assertTrue(active_link_index.unique)
        self.assertEqual(
            [column.name for column in active_link_index.columns],
            ["question_revision_id", "purpose_id"],
        )
        self.assertEqual(
            str(active_link_index.dialect_options["postgresql"]["where"]),
            "deleted_at IS NULL",
        )
        self.assertTrue(table.c.deleted_at.nullable)

        relationships = QuestionRevisionPurpose.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {"question_revision", "purpose"},
        )
        self.assertFalse(relationships.question_revision.uselist)
        self.assertFalse(relationships.purpose.uselist)
        for relationship in relationships:
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertTrue(
            {
                "primary_purpose_id", "is_primary", "purpose_priority",
                "purpose_rank", "parent_id", "ksq", "bsq",
                "selection_limit", "exam_rule", "option_count",
            }.isdisjoint(table.c.keys())
        )

        self.assertEqual(QuestionType.__table__.name, "question_types")
        self.assertEqual(QuestionFamily.__table__.name, "question_families")
        self.assertEqual(QuestionForm.__table__.name, "question_forms")
        self.assertEqual(QuestionRevision.__table__.name, "question_revisions")
        self.assertEqual(
            QuestionRevisionRelatedTopic.__table__.name,
            "question_revision_related_topics",
        )
        for excluded_table in {
            "answer_options", "accepted_answers", "solutions", "hints",
            "rubrics", "media", "situation_contexts", "matching_items",
            "assessment_rules",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
