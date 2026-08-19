from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import QuestionExtractionRunStatus
from app.services.question_extraction_service import (
    QuestionExtractionInvalidRunStateError,
    QuestionExtractionRunNotFoundError,
    QuestionExtractionService,
    QuestionExtractionValidationError,
)


NOW = datetime(2026, 8, 19, 20, 30, tzinfo=timezone.utc)


class QuestionExtractionServiceMarkFailedTest(unittest.TestCase):
    @staticmethod
    def _run(
        status: QuestionExtractionRunStatus = QuestionExtractionRunStatus.RUNNING,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            source_document_id=uuid.uuid4(),
            status=status,
            started_at=NOW,
            completed_at=None,
            failure_message=None,
        )

    def test_running_run_transitions_to_failed_and_commits(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.return_value = run

        with patch(
            "app.services.question_extraction_service.utc_now",
            return_value=NOW,
        ) as clock:
            returned = QuestionExtractionService(db).mark_failed(
                run_id=run.id,
                failure_message=" processor failed ",
            )

        self.assertIs(returned, run)
        self.assertEqual(run.status, QuestionExtractionRunStatus.FAILED)
        self.assertEqual(run.completed_at, NOW)
        self.assertEqual(run.failure_message, "processor failed")

        clock.assert_called_once_with()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()
        db.add.assert_not_called()
        db.flush.assert_not_called()

    def test_invalid_run_id_is_rejected_before_database_access(self) -> None:
        db = MagicMock()

        with self.assertRaises(QuestionExtractionValidationError):
            QuestionExtractionService(db).mark_failed(
                run_id="not-a-uuid",
                failure_message="failed",
            )

        db.scalar.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_non_string_or_blank_failure_message_is_rejected(self) -> None:
        for failure_message in (None, 123, "", "   "):
            with self.subTest(failure_message=failure_message):
                db = MagicMock()

                with self.assertRaises(QuestionExtractionValidationError):
                    QuestionExtractionService(db).mark_failed(
                        run_id=uuid.uuid4(),
                        failure_message=failure_message,
                    )

                db.scalar.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_query_requires_active_run_and_owning_document_with_lock(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.return_value = run

        QuestionExtractionService(db).mark_failed(
            run_id=run.id,
            failure_message="failed",
        )

        statement = str(db.scalar.call_args.args[0])
        self.assertIn("question_extraction_runs.id", statement)
        self.assertIn("question_extraction_runs.deleted_at IS NULL", statement)
        self.assertIn("source_documents.deleted_at IS NULL", statement)
        self.assertIn("JOIN source_documents", statement)
        self.assertIn("FOR UPDATE", statement)

    def test_missing_run_or_owning_document_is_rejected(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None

        with self.assertRaises(QuestionExtractionRunNotFoundError):
            QuestionExtractionService(db).mark_failed(
                run_id=uuid.uuid4(),
                failure_message="failed",
            )

        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_non_running_states_are_rejected_without_mutation(self) -> None:
        for status in (
            QuestionExtractionRunStatus.PENDING,
            QuestionExtractionRunStatus.SUCCEEDED,
            QuestionExtractionRunStatus.FAILED,
        ):
            with self.subTest(status=status):
                db = MagicMock()
                run = self._run(status)
                original = (
                    run.status,
                    run.started_at,
                    run.completed_at,
                    run.failure_message,
                )
                db.scalar.return_value = run

                with self.assertRaises(QuestionExtractionInvalidRunStateError):
                    QuestionExtractionService(db).mark_failed(
                        run_id=run.id,
                        failure_message="failed",
                    )

                self.assertEqual(
                    (
                        run.status,
                        run.started_at,
                        run.completed_at,
                        run.failure_message,
                    ),
                    original,
                )
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_commit_failure_rolls_back_and_propagates(self) -> None:
        db = MagicMock()
        run = self._run()
        failure = RuntimeError("commit failed")
        db.scalar.return_value = run
        db.commit.side_effect = failure

        with patch(
            "app.services.question_extraction_service.utc_now",
            return_value=NOW,
        ):
            with self.assertRaises(RuntimeError) as raised:
                QuestionExtractionService(db).mark_failed(
                    run_id=run.id,
                    failure_message="failed",
                )

        self.assertIs(raised.exception, failure)
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
