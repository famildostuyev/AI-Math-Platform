from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, Enum as SQLEnum
from sqlalchemy.dialects import postgresql

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.models import AnswerOption, AcceptedAnswer, QuestionRevision, Solution, SolutionBlock


class SolutionModelMetadataTest(unittest.TestCase):
    def test_solution_is_revision_bound_with_one_active_row(self) -> None:
        table = Solution.__table__
        self.assertEqual(set(table.c), {
            table.c.id, table.c.question_revision_id, table.c.created_at,
            table.c.updated_at, table.c.deleted_at,
        })
        fk = next(iter(table.c.question_revision_id.foreign_keys))
        self.assertEqual(fk.target_fullname, "question_revisions.id")
        self.assertEqual(fk.ondelete, "RESTRICT")
        active = next(index for index in table.indexes if index.name == "uq_solutions_active_revision")
        self.assertTrue(active.unique)
        self.assertEqual(str(active.dialect_options["postgresql"]["where"]), "deleted_at IS NULL")
        self.assertNotIn("status", table.c)
        self.assertNotIn("solution_type", table.c)
        self.assertEqual(QuestionRevision.__mapper__.relationships.solution.back_populates, "question_revision")

    def test_solution_block_contract_is_isolated_and_text_formula_only(self) -> None:
        table = SolutionBlock.__table__
        fk = next(iter(table.c.solution_id.foreign_keys))
        self.assertEqual(fk.target_fullname, "solutions.id")
        self.assertEqual(table.c.block_type.type.enums, ["text", "formula"])
        self.assertIsInstance(table.c.block_type.type, SQLEnum)
        checks = {
            item.name: str(item.sqltext) for item in table.constraints
            if isinstance(item, CheckConstraint)
        }
        self.assertEqual(checks["ck_solution_blocks_sort_order_positive"], "sort_order > 0")
        active = next(index for index in table.indexes if index.name == "uq_solution_blocks_active_solution_order")
        self.assertTrue(active.unique)
        self.assertEqual(str(active.dialect_options["postgresql"]["where"]), "deleted_at IS NULL")
        self.assertNotIn("question_revision_id", table.c)
        self.assertNotIn("answer_option_id", table.c)
        self.assertNotIn("accepted_answer_id", table.c)
        self.assertFalse(any(fk.target_fullname.startswith("answer_") for fk in table.foreign_keys))
        self.assertNotIn("solution_id", AnswerOption.__table__.c)
        self.assertNotIn("solution_id", AcceptedAnswer.__table__.c)

    def test_solution_block_document_data_binds_python_none_as_sql_null(self) -> None:
        document_data_type = SolutionBlock.__table__.c.document_data.type
        self.assertTrue(document_data_type.none_as_null)

        bind = document_data_type.bind_processor(postgresql.dialect())
        self.assertIsNotNone(bind)
        assert bind is not None
        self.assertIsNone(bind(None))
        self.assertEqual(bind({"type": "doc", "content": []}), '{"type": "doc", "content": []}')

        checks = {
            item.name: str(item.sqltext)
            for item in SolutionBlock.__table__.constraints
            if isinstance(item, CheckConstraint)
        }
        self.assertEqual(
            checks["ck_solution_blocks_document_data_object_or_null"],
            "document_data IS NULL OR jsonb_typeof(document_data) = 'object'",
        )


if __name__ == "__main__":
    unittest.main()
