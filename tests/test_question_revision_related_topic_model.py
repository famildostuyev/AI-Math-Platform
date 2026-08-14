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
    QuestionRevisionRelatedTopic,
    QuestionType,
)


class QuestionRevisionRelatedTopicModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_related_topic_contract(self) -> None:
        table = QuestionRevisionRelatedTopic.__table__

        self.assertEqual(table.name, "question_revision_related_topics")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "question_revision_id", "topic_id",
                "created_at", "updated_at", "deleted_at",
            },
        )

        expected_fks = {
            "question_revision_id": ("question_revisions.id", "RESTRICT"),
            "topic_id": ("topics.id", "RESTRICT"),
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
            if index.name == "uq_question_revision_related_topics_active_link"
        )
        self.assertTrue(active_link_index.unique)
        self.assertEqual(
            [column.name for column in active_link_index.columns],
            ["question_revision_id", "topic_id"],
        )
        self.assertEqual(
            str(active_link_index.dialect_options["postgresql"]["where"]),
            "deleted_at IS NULL",
        )
        self.assertTrue(table.c.deleted_at.nullable)

        relationships = QuestionRevisionRelatedTopic.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {"question_revision", "topic"},
        )
        self.assertFalse(relationships.question_revision.uselist)
        self.assertFalse(relationships.topic.uselist)
        for relationship in relationships:
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertTrue(
            {"grade_id", "section_id", "curriculum_course_id", "subject_id"}
            .isdisjoint(table.c.keys())
        )
        self.assertEqual(
            next(iter(QuestionRevision.__table__.c.primary_topic_id.foreign_keys))
            .target_fullname,
            "topics.id",
        )
        self.assertTrue(QuestionRevision.__table__.c.primary_topic_id.nullable)

        # Cross-table validation must reject a related Topic equal to the
        # revision's primary Topic; no local CHECK can enforce that invariant.
        self.assertFalse(
            any(
                "primary_topic_id" in str(constraint)
                for constraint in table.constraints
            )
        )

        self.assertEqual(QuestionType.__table__.name, "question_types")
        self.assertEqual(QuestionFamily.__table__.name, "question_families")
        self.assertEqual(QuestionForm.__table__.name, "question_forms")
        self.assertEqual(QuestionRevision.__table__.name, "question_revisions")
        for excluded_table in {
            "answer_options", "accepted_answers", "solutions", "hints",
            "rubrics", "media", "situation_contexts", "matching_items",
        }:
            self.assertNotIn(excluded_table, Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
