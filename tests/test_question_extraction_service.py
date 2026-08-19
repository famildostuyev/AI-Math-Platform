from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.exc import IntegrityError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import QuestionExtractionRunStatus
from app.services.question_extraction_service import (
    QuestionExtractionActiveRunExistsError,
    QuestionExtractionPersistenceConflictError,
    QuestionExtractionRequestedByUserNotFoundError,
    QuestionExtractionService,
    QuestionExtractionSourceDocumentNotFoundError,
    QuestionExtractionValidationError,
)


class QuestionExtractionServiceCreateRunTest(unittest.TestCase):
    def test_constructor_stores_session(self) -> None:
        db = MagicMock()

        service = QuestionExtractionService(db)

        self.assertIs(service.db, db)

    def test_create_run_creates_first_pending_run_and_commits(self) -> None:
        db = MagicMock()
        source_document_id = uuid.uuid4()
        requested_by_user_id = uuid.uuid4()
        source_document = SimpleNamespace(id=source_document_id)

        db.scalar.side_effect = [
            source_document,  # active source document
            1,                # active requesting user exists
            None,             # no active extraction run
            None,             # no previous run number
        ]

        run = QuestionExtractionService(db).create_run(
            source_document_id=source_document_id,
            requested_by_user_id=requested_by_user_id,
        )

        self.assertEqual(run.source_document_id, source_document_id)
        self.assertEqual(run.run_number, 1)
        self.assertEqual(run.status, QuestionExtractionRunStatus.PENDING)
        self.assertEqual(run.requested_by_user_id, requested_by_user_id)
        self.assertIsNone(run.started_at)
        self.assertIsNone(run.completed_at)
        self.assertIsNone(run.failure_message)

        db.add.assert_called_once_with(run)
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_create_run_increments_run_number_for_same_document(self) -> None:
        db = MagicMock()
        source_document_id = uuid.uuid4()
        source_document = SimpleNamespace(id=source_document_id)

        db.scalar.side_effect = [
            source_document,
            None,  # no active extraction run
            4,     # previous maximum run number
        ]

        run = QuestionExtractionService(db).create_run(
            source_document_id=source_document_id,
        )

        self.assertEqual(run.run_number, 5)
        self.assertEqual(run.status, QuestionExtractionRunStatus.PENDING)
        self.assertIsNone(run.requested_by_user_id)
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_create_run_rejects_invalid_ids_before_database_access(self) -> None:
        cases = (
            {
                "source_document_id": "not-a-uuid",
                "requested_by_user_id": None,
            },
            {
                "source_document_id": uuid.uuid4(),
                "requested_by_user_id": "not-a-uuid",
            },
        )

        for kwargs in cases:
            with self.subTest(kwargs=kwargs):
                db = MagicMock()

                with self.assertRaises(QuestionExtractionValidationError):
                    QuestionExtractionService(db).create_run(**kwargs)

                db.scalar.assert_not_called()
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_missing_active_source_document_is_rejected(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None

        with self.assertRaises(QuestionExtractionSourceDocumentNotFoundError):
            QuestionExtractionService(db).create_run(
                source_document_id=uuid.uuid4(),
            )

        statement = str(db.scalar.call_args.args[0])
        self.assertIn("source_documents.id", statement)
        self.assertIn("source_documents.deleted_at IS NULL", statement)
        self.assertIn("FOR UPDATE", statement)

        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_missing_or_inactive_requesting_user_is_rejected(self) -> None:
        db = MagicMock()
        source_document_id = uuid.uuid4()
        requested_by_user_id = uuid.uuid4()
        db.scalar.side_effect = [
            SimpleNamespace(id=source_document_id),
            None,
        ]

        with self.assertRaises(QuestionExtractionRequestedByUserNotFoundError):
            QuestionExtractionService(db).create_run(
                source_document_id=source_document_id,
                requested_by_user_id=requested_by_user_id,
            )

        user_statement = str(db.scalar.call_args_list[1].args[0])
        self.assertIn("users.id", user_statement)
        self.assertIn("users.is_active", user_statement)
        self.assertIn("users.deleted_at IS NULL", user_statement)

        db.add.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_existing_pending_or_running_run_is_rejected(self) -> None:
        for status in (
            QuestionExtractionRunStatus.PENDING,
            QuestionExtractionRunStatus.RUNNING,
        ):
            with self.subTest(status=status):
                db = MagicMock()
                source_document_id = uuid.uuid4()
                source_document = SimpleNamespace(id=source_document_id)
                active_run_id = uuid.uuid4()

                db.scalar.side_effect = [
                    source_document,
                    active_run_id,
                ]

                with self.assertRaises(QuestionExtractionActiveRunExistsError):
                    QuestionExtractionService(db).create_run(
                        source_document_id=source_document_id,
                    )

                active_run_statement = str(db.scalar.call_args_list[1].args[0])
                self.assertIn("question_extraction_runs.status", active_run_statement)
                self.assertIn("question_extraction_runs.deleted_at IS NULL", active_run_statement)

                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_integrity_error_rolls_back_and_maps_to_persistence_error(self) -> None:
        db = MagicMock()
        source_document_id = uuid.uuid4()
        source_document = SimpleNamespace(id=source_document_id)

        db.scalar.side_effect = [
            source_document,
            None,
            None,
        ]
        db.commit.side_effect = IntegrityError(
            "statement",
            {},
            RuntimeError("integrity failure"),
        )

        with self.assertRaises(QuestionExtractionPersistenceConflictError):
            QuestionExtractionService(db).create_run(
                source_document_id=source_document_id,
            )

        db.add.assert_called_once()
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
