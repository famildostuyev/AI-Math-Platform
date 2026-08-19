from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy.exc import IntegrityError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.core.enums import QuestionExtractionRunStatus
from app.models.question_candidate import QuestionCandidate
from app.services.question_extraction_service import (
    QuestionExtractionCandidateInput,
    QuestionExtractionCandidatesAlreadyExistError,
    QuestionExtractionInvalidRunStateError,
    QuestionExtractionPageDocumentMismatchError,
    QuestionExtractionPageNotFoundError,
    QuestionExtractionPersistenceConflictError,
    QuestionExtractionRunNotFoundError,
    QuestionExtractionService,
    QuestionExtractionValidationError,
)


NOW = datetime(2026, 8, 19, 21, 0, tzinfo=timezone.utc)


class QuestionExtractionServiceFinalizeSuccessTest(unittest.TestCase):
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

    @staticmethod
    def _candidate(
        *,
        page_id: uuid.UUID | None = None,
        text: str = "  Find x.  ",
        confidence: Decimal | None = Decimal("0.9500"),
    ) -> QuestionExtractionCandidateInput:
        return QuestionExtractionCandidateInput(
            source_document_page_id=page_id,
            extracted_text=text,
            confidence=confidence,
        )

    def test_running_run_persists_candidates_and_marks_succeeded(self) -> None:
        db = MagicMock()
        run = self._run()
        page_id = uuid.uuid4()
        page = SimpleNamespace(
            id=page_id,
            source_document_id=run.source_document_id,
        )

        db.scalar.side_effect = [
            run,   # active run
            None,  # no existing candidate
        ]
        db.scalars.return_value.all.return_value = [page]

        with patch(
            "app.services.question_extraction_service.utc_now",
            return_value=NOW,
        ) as clock:
            returned = QuestionExtractionService(db).finalize_success(
                run_id=run.id,
                candidates=(
                    self._candidate(page_id=page_id),
                    self._candidate(
                        page_id=None,
                        text="Second question",
                        confidence=None,
                    ),
                ),
            )

        self.assertEqual(len(returned), 2)
        self.assertTrue(all(isinstance(item, QuestionCandidate) for item in returned))

        first, second = returned
        self.assertEqual(first.question_extraction_run_id, run.id)
        self.assertEqual(first.source_document_page_id, page_id)
        self.assertEqual(first.sequence_number, 1)
        self.assertEqual(first.extracted_text, "Find x.")
        self.assertEqual(first.confidence, Decimal("0.9500"))

        self.assertEqual(second.question_extraction_run_id, run.id)
        self.assertIsNone(second.source_document_page_id)
        self.assertEqual(second.sequence_number, 2)
        self.assertEqual(second.extracted_text, "Second question")
        self.assertIsNone(second.confidence)

        self.assertEqual(run.status, QuestionExtractionRunStatus.SUCCEEDED)
        self.assertEqual(run.completed_at, NOW)
        self.assertIsNone(run.failure_message)

        db.add_all.assert_called_once_with(returned)
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()
        clock.assert_called_once_with()

    def test_empty_candidate_sequence_is_allowed_and_marks_succeeded(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.side_effect = [run, None]

        with patch(
            "app.services.question_extraction_service.utc_now",
            return_value=NOW,
        ):
            returned = QuestionExtractionService(db).finalize_success(
                run_id=run.id,
                candidates=(),
            )

        self.assertEqual(returned, ())
        self.assertEqual(run.status, QuestionExtractionRunStatus.SUCCEEDED)
        self.assertEqual(run.completed_at, NOW)
        db.add_all.assert_not_called()
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_invalid_run_id_is_rejected_before_database_access(self) -> None:
        db = MagicMock()

        with self.assertRaises(QuestionExtractionValidationError):
            QuestionExtractionService(db).finalize_success(
                run_id="not-a-uuid",
                candidates=(),
            )

        db.scalar.assert_not_called()
        db.scalars.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_invalid_candidate_input_is_rejected_before_database_access(self) -> None:
        invalid_candidates = (
            self._candidate(text="   "),
            self._candidate(confidence=Decimal("-0.1")),
            self._candidate(confidence=Decimal("1.1")),
            self._candidate(confidence=Decimal("NaN")),
            QuestionExtractionCandidateInput(
                source_document_page_id="not-a-uuid",
                extracted_text="Question",
                confidence=None,
            ),
        )

        for candidate in invalid_candidates:
            with self.subTest(candidate=candidate):
                db = MagicMock()

                with self.assertRaises(QuestionExtractionValidationError):
                    QuestionExtractionService(db).finalize_success(
                        run_id=uuid.uuid4(),
                        candidates=(candidate,),
                    )

                db.scalar.assert_not_called()
                db.scalars.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_missing_run_or_owning_document_is_rejected(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None

        with self.assertRaises(QuestionExtractionRunNotFoundError):
            QuestionExtractionService(db).finalize_success(
                run_id=uuid.uuid4(),
                candidates=(),
            )

        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_non_running_states_are_rejected(self) -> None:
        for status in (
            QuestionExtractionRunStatus.PENDING,
            QuestionExtractionRunStatus.SUCCEEDED,
            QuestionExtractionRunStatus.FAILED,
        ):
            with self.subTest(status=status):
                db = MagicMock()
                run = self._run(status)
                db.scalar.return_value = run

                with self.assertRaises(QuestionExtractionInvalidRunStateError):
                    QuestionExtractionService(db).finalize_success(
                        run_id=run.id,
                        candidates=(),
                    )

                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_existing_candidate_history_blocks_second_finalization(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.side_effect = [run, uuid.uuid4()]

        with self.assertRaises(QuestionExtractionCandidatesAlreadyExistError):
            QuestionExtractionService(db).finalize_success(
                run_id=run.id,
                candidates=(),
            )

        db.add_all.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_missing_referenced_page_is_rejected(self) -> None:
        db = MagicMock()
        run = self._run()
        page_id = uuid.uuid4()
        db.scalar.side_effect = [run, None]
        db.scalars.return_value.all.return_value = []

        with self.assertRaises(QuestionExtractionPageNotFoundError):
            QuestionExtractionService(db).finalize_success(
                run_id=run.id,
                candidates=(self._candidate(page_id=page_id),),
            )

        db.add_all.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_page_from_another_document_is_rejected(self) -> None:
        db = MagicMock()
        run = self._run()
        page_id = uuid.uuid4()
        page = SimpleNamespace(
            id=page_id,
            source_document_id=uuid.uuid4(),
        )
        db.scalar.side_effect = [run, None]
        db.scalars.return_value.all.return_value = [page]

        with self.assertRaises(QuestionExtractionPageDocumentMismatchError):
            QuestionExtractionService(db).finalize_success(
                run_id=run.id,
                candidates=(self._candidate(page_id=page_id),),
            )

        db.add_all.assert_not_called()
        db.commit.assert_not_called()
        db.rollback.assert_called_once_with()

    def test_integrity_error_rolls_back_and_maps_to_persistence_error(self) -> None:
        db = MagicMock()
        run = self._run()
        db.scalar.side_effect = [run, None]
        db.commit.side_effect = IntegrityError(
            "statement",
            {},
            RuntimeError("integrity failure"),
        )

        with patch(
            "app.services.question_extraction_service.utc_now",
            return_value=NOW,
        ):
            with self.assertRaises(QuestionExtractionPersistenceConflictError):
                QuestionExtractionService(db).finalize_success(
                    run_id=run.id,
                    candidates=(self._candidate(page_id=None),),
                )

        db.add_all.assert_called_once()
        db.commit.assert_called_once_with()
        db.rollback.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
