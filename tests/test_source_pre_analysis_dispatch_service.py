from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = (
    "test-refresh-token-hash-key-000001"
)
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import SourcePreAnalysisRunStatus
from app.services.source_pre_analysis_dispatch_service import (
    MAX_PENDING_RUN_DISCOVERY_LIMIT,
    SourcePreAnalysisDispatchError,
    SourcePreAnalysisDispatchService,
    SourcePreAnalysisDispatchValidationError,
)


class SourcePreAnalysisDispatchServiceTest(unittest.TestCase):
    @staticmethod
    def _db_with_ids(*run_ids: uuid.UUID) -> MagicMock:
        db = MagicMock()
        db.scalars.return_value.all.return_value = list(run_ids)
        return db

    @staticmethod
    def _assert_read_only(db: MagicMock) -> None:
        db.add.assert_not_called()
        db.add_all.assert_not_called()
        db.flush.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_not_called()

    def test_constructor_stores_caller_owned_session(self) -> None:
        db = MagicMock()

        service = SourcePreAnalysisDispatchService(db)

        self.assertIs(service.db, db)
        db.close.assert_not_called()

    def test_positive_limits_through_explicit_maximum_are_accepted(self) -> None:
        for limit in (1, 7, MAX_PENDING_RUN_DISCOVERY_LIMIT):
            with self.subTest(limit=limit):
                db = self._db_with_ids()

                result = SourcePreAnalysisDispatchService(
                    db,
                ).list_pending_run_ids(limit=limit)

                self.assertEqual(result, ())
                statement = db.scalars.call_args.args[0]
                self.assertEqual(statement._limit_clause.value, limit)
                self._assert_read_only(db)

    def test_invalid_limits_are_rejected_without_querying(self) -> None:
        invalid_limits = (
            True,
            False,
            0,
            -1,
            1.0,
            "1",
            None,
            object(),
            MAX_PENDING_RUN_DISCOVERY_LIMIT + 1,
        )
        for limit in invalid_limits:
            with self.subTest(limit=repr(limit)):
                db = MagicMock()
                with self.assertRaises(
                    SourcePreAnalysisDispatchValidationError,
                ) as raised:
                    SourcePreAnalysisDispatchService(
                        db,
                    ).list_pending_run_ids(
                        limit=limit,  # type: ignore[arg-type]
                    )

                self.assertIsInstance(
                    raised.exception,
                    SourcePreAnalysisDispatchError,
                )
                db.scalars.assert_not_called()
                self._assert_read_only(db)

    def test_query_has_exact_active_pending_scope_and_minimum_join(self) -> None:
        db = self._db_with_ids(uuid.uuid4())

        SourcePreAnalysisDispatchService(db).list_pending_run_ids(limit=10)

        db.scalars.assert_called_once()
        statement = db.scalars.call_args.args[0]
        sql = str(statement)
        whereclause = str(statement.whereclause)
        self.assertIn(
            "JOIN source_documents ON source_documents.id = "
            "source_pre_analysis_runs.source_document_id",
            sql,
        )
        self.assertIn("source_pre_analysis_runs.status", whereclause)
        self.assertIn(
            "source_pre_analysis_runs.deleted_at IS NULL",
            whereclause,
        )
        self.assertIn("source_documents.deleted_at IS NULL", whereclause)
        status_values = [
            value
            for value in statement.compile().params.values()
            if isinstance(value, SourcePreAnalysisRunStatus)
        ]
        self.assertEqual(status_values, [SourcePreAnalysisRunStatus.PENDING])
        self.assertNotIn("FOR UPDATE", sql)
        self.assertNotIn("source_pre_analysis_runs.*", sql)
        self.assertIn("SELECT source_pre_analysis_runs.id", sql)
        self._assert_read_only(db)

    def test_query_excludes_every_non_pending_status_by_exact_predicate(self) -> None:
        db = self._db_with_ids()

        SourcePreAnalysisDispatchService(db).list_pending_run_ids(limit=5)

        statement = db.scalars.call_args.args[0]
        params = tuple(statement.compile().params.values())
        self.assertIn(SourcePreAnalysisRunStatus.PENDING, params)
        for status in (
            SourcePreAnalysisRunStatus.RUNNING,
            SourcePreAnalysisRunStatus.SUCCEEDED,
            SourcePreAnalysisRunStatus.FAILED,
        ):
            self.assertNotIn(status, params)

    def test_query_order_is_created_run_number_uuid_and_limit_is_applied(self) -> None:
        db = self._db_with_ids()

        SourcePreAnalysisDispatchService(db).list_pending_run_ids(limit=23)

        statement = db.scalars.call_args.args[0]
        sql = str(statement)
        self.assertIn(
            "ORDER BY source_pre_analysis_runs.created_at ASC, "
            "source_pre_analysis_runs.run_number ASC, "
            "source_pre_analysis_runs.id ASC",
            sql,
        )
        self.assertEqual(statement._limit_clause.value, 23)
        self.assertNotIn("FOR UPDATE", sql)

    def test_returns_exact_uuid_tuple_without_orm_objects(self) -> None:
        first = uuid.uuid4()
        second = uuid.uuid4()
        db = self._db_with_ids(first, second)

        result = SourcePreAnalysisDispatchService(
            db,
        ).list_pending_run_ids(limit=2)

        self.assertIsInstance(result, tuple)
        self.assertEqual(result, (first, second))
        self.assertTrue(all(type(value) is uuid.UUID for value in result))
        self.assertEqual(db.scalars.call_count, 1)
        db.execute.assert_not_called()
        db.scalar.assert_not_called()
        self._assert_read_only(db)
        db.close.assert_not_called()

    def test_empty_discovery_is_exact_empty_tuple_and_has_no_side_effects(self) -> None:
        db = self._db_with_ids()

        result = SourcePreAnalysisDispatchService(
            db,
        ).list_pending_run_ids(limit=1)

        self.assertEqual(result, ())
        self.assertIsInstance(result, tuple)
        self.assertEqual(db.scalars.call_count, 1)
        self._assert_read_only(db)
        db.close.assert_not_called()


if __name__ == "__main__":
    unittest.main()
