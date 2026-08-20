from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import QuestionExtractionRunStatus
from app.services.question_extraction_dispatch_service import (
    MAX_PENDING_RUN_DISCOVERY_LIMIT,
    QuestionExtractionDispatchService,
    QuestionExtractionDispatchValidationError,
)


class QuestionExtractionDispatchServiceTest(unittest.TestCase):
    def test_constructor_stores_session(self) -> None:
        db = MagicMock()

        service = QuestionExtractionDispatchService(db)

        self.assertIs(service.db, db)

    def test_returns_pending_run_ids_as_tuple(self) -> None:
        db = MagicMock()
        expected = (uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
        db.scalars.return_value.all.return_value = list(expected)

        returned = QuestionExtractionDispatchService(
            db
        ).list_pending_run_ids(limit=3)

        self.assertEqual(returned, expected)
        self.assertIsInstance(returned, tuple)
        db.scalars.assert_called_once()

    def test_query_is_active_pending_joined_bounded_and_deterministic(
        self,
    ) -> None:
        db = MagicMock()
        db.scalars.return_value.all.return_value = []

        QuestionExtractionDispatchService(
            db
        ).list_pending_run_ids(limit=7)

        statement = db.scalars.call_args.args[0]
        sql = str(statement)

        self.assertIn("question_extraction_runs.id", sql)
        self.assertIn("JOIN source_documents", sql)
        self.assertIn("question_extraction_runs.status", sql)
        self.assertIn("question_extraction_runs.deleted_at IS NULL", sql)
        self.assertIn("source_documents.deleted_at IS NULL", sql)
        self.assertIn("ORDER BY", sql)
        self.assertIn("question_extraction_runs.created_at", sql)
        self.assertIn("question_extraction_runs.run_number", sql)
        self.assertIn("question_extraction_runs.id", sql)
        self.assertNotIn("FOR UPDATE", sql)

        params = statement.compile().params
        self.assertIn(
            QuestionExtractionRunStatus.PENDING,
            params.values(),
        )
        self.assertIn(7, params.values())

        db.add.assert_not_called()
        db.add_all.assert_not_called()
        db.flush.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_not_called()

    def test_limit_must_be_strict_integer_in_supported_range(self) -> None:
        invalid_limits = (
            None,
            True,
            False,
            0,
            -1,
            1.0,
            "1",
            MAX_PENDING_RUN_DISCOVERY_LIMIT + 1,
        )

        for limit in invalid_limits:
            with self.subTest(limit=limit):
                db = MagicMock()

                with self.assertRaises(
                    QuestionExtractionDispatchValidationError
                ):
                    QuestionExtractionDispatchService(
                        db
                    ).list_pending_run_ids(
                        limit=limit,  # type: ignore[arg-type]
                    )

                db.scalars.assert_not_called()

    def test_maximum_limit_is_accepted(self) -> None:
        db = MagicMock()
        db.scalars.return_value.all.return_value = []

        returned = QuestionExtractionDispatchService(
            db
        ).list_pending_run_ids(
            limit=MAX_PENDING_RUN_DISCOVERY_LIMIT,
        )

        self.assertEqual(returned, ())
        db.scalars.assert_called_once()

    def test_service_has_no_claim_lifecycle_or_execution_boundary(self) -> None:
        module = Path(
            BACKEND_DIR
            / "app/services/question_extraction_dispatch_service.py"
        ).read_text(encoding="utf-8")

        for forbidden in (
            "start_run",
            "finalize_success",
            "mark_failed",
            "execute_run",
            "with_for_update",
            "commit(",
            "rollback(",
            "db.add(",
            "db.add_all(",
            "db.flush(",
        ):
            self.assertNotIn(forbidden, module)


if __name__ == "__main__":
    unittest.main()
