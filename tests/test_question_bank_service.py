from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import operators, visitors
from sqlalchemy.sql.elements import BinaryExpression


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused",
)
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.question_bank import QuestionBankListQuery
from app.services.question_bank_service import QuestionBankService


class QuestionBankServiceTest(unittest.TestCase):
    def _row(self, **overrides: object) -> SimpleNamespace:
        value: dict[str, object] = {
            "question_family_id": uuid.uuid4(),
            "question_form_id": uuid.uuid4(),
            "revision_id": uuid.uuid4(),
            "revision_number": 3,
            "status": "draft",
            "is_current_approved": False,
            "question_type_id": uuid.uuid4(),
            "question_type_name": "open_response",
            "question_type_display_name": "Open response",
            "difficulty": "medium",
            "primary_topic_id": None,
            "primary_topic_name": None,
            "primary_topic_display_name": None,
            "block_count": 2,
            "text_preview": "Solve the equation.",
            "updated_at": datetime.now(timezone.utc),
        }
        value.update(overrides)
        return SimpleNamespace(**value)

    def _db(self, rows: list[SimpleNamespace], *, total: int | None = None) -> MagicMock:
        db = MagicMock()
        db.scalar.return_value = len(rows) if total is None else total
        db.execute.return_value.mappings.return_value.all.return_value = rows
        return db

    def _run(
        self,
        query: QuestionBankListQuery | None = None,
        rows: list[SimpleNamespace] | None = None,
        *,
        total: int | None = None,
    ) -> tuple[MagicMock, object, str, str]:
        db = self._db(rows or [], total=total)
        response = QuestionBankService(db).list_questions(
            query=query or QuestionBankListQuery()
        )
        count_sql = self._sql(db.scalar.call_args.args[0])
        list_sql = self._sql(db.execute.call_args.args[0])
        return db, response, count_sql, list_sql

    @staticmethod
    def _sql(statement: object) -> str:
        return str(statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        ))

    def test_lists_one_latest_revision_row_per_active_form(self) -> None:
        row = self._row(revision_number=7)
        _db, response, count_sql, list_sql = self._run(rows=[row])

        self.assertEqual(len(response.items), 1)
        self.assertEqual(response.items[0].revision_number, 7)
        self.assertIn("max(question_revisions.revision_number)", list_sql)
        self.assertIn("GROUP BY question_revisions.question_form_id", list_sql)
        self.assertIn("question_forms.is_active IS true", list_sql)
        self.assertIn("question_families.is_active IS true", list_sql)
        self.assertIn("filtered_question_forms", count_sql)

    def test_multiple_revisions_do_not_duplicate_form_and_deleted_revisions_are_excluded(self) -> None:
        _db, _response, _count_sql, list_sql = self._run()

        self.assertIn("latest_question_revision", list_sql)
        self.assertIn("question_revisions.deleted_at IS NULL", list_sql)
        self.assertIn(
            "question_revisions.revision_number = latest_question_revision.revision_number",
            list_sql,
        )

    def test_multiple_forms_in_same_family_remain_separate_items(self) -> None:
        family_id = uuid.uuid4()
        rows = [
            self._row(question_family_id=family_id),
            self._row(question_family_id=family_id),
        ]
        _db, response, _count_sql, _list_sql = self._run(rows=rows)

        self.assertEqual(len(response.items), 2)
        self.assertNotEqual(
            response.items[0].question_form_id,
            response.items[1].question_form_id,
        )

    def test_deleted_or_inactive_family_and_form_are_excluded(self) -> None:
        _db, _response, _count_sql, list_sql = self._run()

        for clause in (
            "question_forms.is_active IS true",
            "question_forms.deleted_at IS NULL",
            "question_families.is_active IS true",
            "question_families.deleted_at IS NULL",
        ):
            self.assertIn(clause, list_sql)

    def test_all_revision_statuses_are_returnable(self) -> None:
        rows = [self._row(status=status) for status in (
            "draft", "proposed", "approved", "rejected"
        )]
        _db, response, _count_sql, list_sql = self._run(rows=rows)

        self.assertEqual(
            {item.status.value for item in response.items},
            {"draft", "proposed", "approved", "rejected"},
        )
        self.assertNotIn("question_revisions.status =", list_sql)

    def test_question_type_status_and_difficulty_filters_apply_to_both_queries(self) -> None:
        query = QuestionBankListQuery(
            question_type_id=uuid.uuid4(), status="approved", difficulty="hard"
        )
        _db, _response, count_sql, list_sql = self._run(query=query)

        for clause in (
            "question_forms.question_type_id =",
            "question_revisions.status = 'approved'",
            "question_revisions.difficulty = 'hard'",
        ):
            self.assertIn(clause, list_sql)
            self.assertIn(clause, count_sql)

    def test_purpose_filter_uses_active_non_deleted_link_and_purpose(self) -> None:
        _db, _response, count_sql, list_sql = self._run(
            query=QuestionBankListQuery(purpose_id=uuid.uuid4())
        )

        for clause in (
            "question_revision_purposes.deleted_at IS NULL",
            "purposes.is_active IS true",
            "purposes.deleted_at IS NULL",
        ):
            self.assertIn(clause, list_sql)
            self.assertIn(clause, count_sql)

    def test_uuid_search_matches_revision_form_family_and_payloads(self) -> None:
        identifier = uuid.uuid4()
        _db, _response, _count_sql, list_sql = self._run(
            query=QuestionBankListQuery(q=str(identifier))
        )

        self.assertIn(f"question_revisions.id = '{identifier}'", list_sql)
        self.assertIn(f"question_forms.id = '{identifier}'", list_sql)
        self.assertIn(f"question_families.id = '{identifier}'", list_sql)
        self.assertIn("text_block_contents.source_text ILIKE", list_sql)
        self.assertIn("formula_block_contents.source_latex ILIKE", list_sql)

    def test_non_uuid_search_only_searches_text_and_formula_source(self) -> None:
        _db, _response, _count_sql, list_sql = self._run(
            query=QuestionBankListQuery(q="x^2")
        )

        self.assertIn("text_block_contents.source_text ILIKE '%%x^2%%'", list_sql)
        self.assertIn("formula_block_contents.source_latex ILIKE '%%x^2%%'", list_sql)
        self.assertNotIn("document_data", list_sql)
        self.assertNotIn("geometry_block_contents", list_sql)

    def test_search_treats_like_metacharacters_as_literals_in_both_queries(self) -> None:
        cases = (
            ("%", r"%\%%"),
            ("_", r"%\_%"),
            (r"a\b", r"%a\\b%"),
        )

        for search, expected_pattern in cases:
            with self.subTest(search=search):
                db = self._db([])
                QuestionBankService(db).list_questions(
                    query=QuestionBankListQuery(q=search)
                )
                statements = (
                    db.scalar.call_args.args[0],
                    db.execute.call_args.args[0],
                )

                for statement in statements:
                    expressions = [
                        element
                        for element in visitors.iterate(statement)
                        if isinstance(element, BinaryExpression)
                        and element.operator is operators.ilike_op
                    ]
                    self.assertEqual(len(expressions), 2)
                    self.assertTrue(all(
                        expression.right.value == expected_pattern
                        for expression in expressions
                    ))
                    self.assertTrue(all(
                        expression.modifiers.get("escape") == "\\"
                        for expression in expressions
                    ))

    def test_search_uses_only_active_blocks(self) -> None:
        _db, _response, _count_sql, list_sql = self._run(
            query=QuestionBankListQuery(q="algebra")
        )

        self.assertGreaterEqual(
            list_sql.count("content_blocks.deleted_at IS NULL"), 3
        )

    def test_block_count_and_first_text_preview_are_correlated_and_ordered(self) -> None:
        _db, response, _count_sql, list_sql = self._run(rows=[self._row()])

        self.assertEqual(response.items[0].block_count, 2)
        self.assertEqual(response.items[0].text_preview, "Solve the equation.")
        self.assertIn("count(content_blocks.id)", list_sql)
        self.assertIn("btrim(text_block_contents.source_text)", list_sql)
        self.assertIn("ORDER BY content_blocks.sort_order, content_blocks.id", list_sql)
        self.assertIn("LIMIT 1", list_sql)

    def test_primary_topic_is_nullable_and_uses_public_metadata_only(self) -> None:
        topic_id = uuid.uuid4()
        rows = [self._row(), self._row(
            primary_topic_id=topic_id,
            primary_topic_name="algebra",
            primary_topic_display_name="Algebra",
        )]
        _db, response, _count_sql, list_sql = self._run(rows=rows)

        self.assertIsNone(response.items[0].primary_topic)
        self.assertEqual(response.items[1].primary_topic.id, topic_id)
        self.assertIn("primary_topic.is_active IS true", list_sql)
        self.assertIn("primary_topic.deleted_at IS NULL", list_sql)

    def test_pagination_metadata_offset_limit_and_zero_results(self) -> None:
        query = QuestionBankListQuery(page=3, page_size=10)
        _db, response, _count_sql, list_sql = self._run(
            query=query, rows=[self._row()], total=21
        )

        self.assertEqual((response.page, response.page_size), (3, 10))
        self.assertEqual((response.total, response.total_pages), (21, 3))
        self.assertIn("LIMIT 10 OFFSET 20", list_sql)

        _db, empty, _count_sql, _list_sql = self._run(total=0)
        self.assertEqual(empty.items, [])
        self.assertEqual(empty.total_pages, 0)

    def test_updated_desc_is_default_with_deterministic_tie_break(self) -> None:
        _db, _response, _count_sql, list_sql = self._run()

        self.assertIn(
            "ORDER BY question_revisions.updated_at DESC, question_revisions.id DESC",
            list_sql,
        )

    def test_created_desc_uses_created_time_and_revision_id_tie_break(self) -> None:
        _db, _response, _count_sql, list_sql = self._run(
            query=QuestionBankListQuery(sort="created_desc")
        )

        self.assertIn(
            "ORDER BY question_revisions.created_at DESC, question_revisions.id DESC",
            list_sql,
        )

    def test_service_is_read_only(self) -> None:
        db, _response, _count_sql, _list_sql = self._run(rows=[self._row()])

        db.add.assert_not_called()
        db.flush.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
