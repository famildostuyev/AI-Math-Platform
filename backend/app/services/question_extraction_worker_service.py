from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import SessionLocal
from app.services.question_extraction_dispatch_service import (
    QuestionExtractionDispatchService,
)
from app.services.question_extraction_execution_service import (
    QuestionExtractionExecutionError,
    QuestionExtractionExecutionService,
    QuestionExtractionExecutionStartError,
)
from app.services.question_extraction_processor_registry import (
    build_question_extraction_processor_selector,
)


logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]


@dataclass(frozen=True, slots=True)
class QuestionExtractionWorkerSummary:
    discovered: int
    succeeded: int
    failed: int
    start_skipped: int

    def __post_init__(self) -> None:
        values = (
            self.discovered,
            self.succeeded,
            self.failed,
            self.start_skipped,
        )
        if any(type(value) is not int or value < 0 for value in values):
            raise ValueError(
                "Question extraction worker summary counts must be "
                "non-negative integers."
            )
        if self.succeeded + self.failed + self.start_skipped > self.discovered:
            raise ValueError(
                "Question extraction worker outcome counts cannot exceed "
                "discovered work."
            )


class QuestionExtractionWorkerService:
    """Execute one bounded batch of pending question extraction work."""

    def __init__(
        self,
        *,
        session_factory: SessionFactory = SessionLocal,
        worker_batch_size: int = settings.QUESTION_EXTRACTION_WORKER_BATCH_SIZE,
        selector_factory=build_question_extraction_processor_selector,
    ) -> None:
        self._session_factory = session_factory
        self._worker_batch_size = worker_batch_size
        self._selector_factory = selector_factory

    def run_once(self) -> QuestionExtractionWorkerSummary:
        run_ids = self._discover_pending_runs()
        succeeded = failed = start_skipped = 0

        for run_id in run_ids:
            db = self._session_factory()
            try:
                QuestionExtractionExecutionService(
                    db,
                    processor_selector=self._selector_factory(),
                ).execute_run(run_id=run_id)
            except QuestionExtractionExecutionStartError:
                db.rollback()
                start_skipped += 1
                logger.info(
                    "Question extraction start skipped for run %s.",
                    run_id,
                )
            except QuestionExtractionExecutionError:
                db.rollback()
                failed += 1
                logger.warning(
                    "Question extraction execution failed for run %s.",
                    run_id,
                )
            except Exception:
                db.rollback()
                failed += 1
                logger.warning(
                    "Question extraction execution failed unexpectedly "
                    "for run %s.",
                    run_id,
                )
            else:
                succeeded += 1
                logger.info(
                    "Question extraction execution succeeded for run %s.",
                    run_id,
                )
            finally:
                db.close()

        summary = QuestionExtractionWorkerSummary(
            discovered=len(run_ids),
            succeeded=succeeded,
            failed=failed,
            start_skipped=start_skipped,
        )
        logger.info("Question extraction worker summary: %s", summary)
        return summary

    def _discover_pending_runs(self) -> tuple:
        db = self._session_factory()
        try:
            return QuestionExtractionDispatchService(
                db
            ).list_pending_run_ids(
                limit=self._worker_batch_size,
            )
        finally:
            db.close()
