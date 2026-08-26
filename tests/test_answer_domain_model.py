from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

from sqlalchemy import Boolean, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB

os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = "test-verification-code-hash-key-01"

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.models.accepted_answer import AcceptedAnswer
from app.models.answer_option import AnswerOption
from app.models.question_revision import QuestionRevision


class AnswerDomainModelTest(unittest.TestCase):
    def test_option_contract_has_stable_identity_content_and_correctness(self) -> None:
        table = AnswerOption.__table__
        self.assertEqual(table.c.id.primary_key, True)
        self.assertTrue(table.c.label.nullable)
        self.assertIsInstance(table.c.document_data.type, JSONB)
        self.assertIsInstance(table.c.is_correct.type, Boolean)
        self.assertFalse(table.c.is_correct.nullable)
        self.assertEqual(next(iter(table.c.revision_id.foreign_keys)).target_fullname, "question_revisions.id")

    def test_option_active_order_and_non_null_label_are_unique(self) -> None:
        indexes = {index.name: index for index in AnswerOption.__table__.indexes}
        for name in (
            "uq_answer_options_active_revision_order",
            "uq_answer_options_active_revision_label",
        ):
            self.assertTrue(indexes[name].unique)
            self.assertIsNotNone(indexes[name].dialect_options["postgresql"]["where"])
        checks = {item.name for item in AnswerOption.__table__.constraints if isinstance(item, CheckConstraint)}
        self.assertIn("ck_answer_options_order_positive", checks)
        self.assertIn("ck_answer_options_label_nonblank", checks)

    def test_option_extraction_provenance_metadata_is_declared_once(self) -> None:
        table = AnswerOption.__table__
        provenance_columns = (
            "source_extraction_result_id",
            "source_extraction_question_id",
            "source_option_index",
            "source_provenance",
        )
        column_names = [column.name for column in table.columns]
        for name in provenance_columns:
            self.assertEqual(column_names.count(name), 1)

        constraint_names = [constraint.name for constraint in table.constraints if constraint.name]
        self.assertEqual(len(constraint_names), len(set(constraint_names)))
        index_names = [index.name for index in table.indexes if index.name]
        self.assertEqual(len(index_names), len(set(index_names)))
        self.assertEqual(index_names.count("uq_answer_options_extraction_mapping"), 1)

    def test_accepted_answer_is_separate_structured_revision_child(self) -> None:
        table = AcceptedAnswer.__table__
        self.assertIsInstance(table.c.document_data.type, JSONB)
        self.assertNotIn("is_correct", table.c)
        indexes = {index.name: index for index in table.indexes if isinstance(index, Index)}
        self.assertTrue(indexes["uq_accepted_answers_active_revision_order"].unique)
        self.assertIsNotNone(indexes["uq_accepted_answers_active_revision_order"].dialect_options["postgresql"]["where"])

    def test_revision_owns_both_answer_collections(self) -> None:
        self.assertIn("answer_options", QuestionRevision.__mapper__.relationships)
        self.assertIn("accepted_answers", QuestionRevision.__mapper__.relationships)


if __name__ == "__main__":
    unittest.main()
