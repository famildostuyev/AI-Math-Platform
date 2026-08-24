from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import QuestionExtractionRunStatus
from app.core.config import settings
from app.database.session import SessionLocal
from app.models.question_extraction_result import QuestionExtractionResult
from app.models.question_extraction_run import QuestionExtractionRun
from app.models.source_document import SourceDocument
from app.services.question_extraction_dispatch_service import (
    QuestionExtractionDispatchService,
)
from app.services.question_extraction_execution_service import (
    QuestionExtractionExecutionError,
    QuestionExtractionExecutionStartError,
)
from app.services.question_extraction_document_analysis_execution_service import (
    QuestionExtractionDocumentAnalysisAlreadyFinalizedError,
    QuestionExtractionDocumentAnalysisExecutionError,
    QuestionExtractionDocumentAnalysisStartError,
)
from app.services.question_extraction_execution_strategy import (
    QuestionExtractionExecutionMode,
    build_question_extraction_execution_strategy,
)
from app.services.question_extraction_processor_registry import (
    build_question_extraction_processor_selector,
)
from app.services.question_extraction_service import QuestionExtractionService


logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]
ExecutionStrategyFactory = Callable[..., object]
DOCUMENT_ANALYSIS_FAILURE_MESSAGE = "Document analysis execution failed."


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
        execution_mode: QuestionExtractionExecutionMode = (
            settings.QUESTION_EXTRACTION_EXECUTION_MODE
        ),
        execution_strategy_factory: ExecutionStrategyFactory = (
            build_question_extraction_execution_strategy
        ),
    ) -> None:
        if execution_mode not in ("legacy", "document_analysis"):
            raise ValueError("Question extraction execution mode is invalid.")
        self._session_factory = session_factory
        self._worker_batch_size = worker_batch_size
        self._selector_factory = selector_factory
        self._execution_mode = execution_mode
        self._execution_strategy_factory = execution_strategy_factory

    def run_once(
        self,
        *,
        run_id: uuid.UUID | None = None,
    ) -> QuestionExtractionWorkerSummary:
        if run_id is not None and type(run_id) is not uuid.UUID:
            raise ValueError("Question extraction target run ID is invalid.")
        run_ids = self._discover_pending_runs(run_id=run_id)
        succeeded = failed = start_skipped = 0

        for run_id in run_ids:
            db = self._session_factory()
            try:
                self._execution_strategy_factory(
                    db,
                    execution_mode=self._execution_mode,
                    selector_factory=self._selector_factory,
                ).execute_run(run_id=run_id)
            except (
                QuestionExtractionExecutionStartError,
                QuestionExtractionDocumentAnalysisStartError,
                QuestionExtractionDocumentAnalysisAlreadyFinalizedError,
            ):
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
            except QuestionExtractionDocumentAnalysisExecutionError as exc:
                db.rollback()
                try:
                    QuestionExtractionService(db).mark_failed(
                        run_id=run_id,
                        failure_message=DOCUMENT_ANALYSIS_FAILURE_MESSAGE,
                    )
                except Exception:
                    db.rollback()
                failed += 1
                logger.warning(
                    "Question extraction document analysis failed: "
                    "run_id=%s category=%s",
                    run_id,
                    getattr(exc, "safe_category", "execution_error"),
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

    def _discover_pending_runs(
        self,
        *,
        run_id: uuid.UUID | None = None,
    ) -> tuple[uuid.UUID, ...]:
        db = self._session_factory()
        try:
            if run_id is not None:
                eligible_run_id = db.scalar(
                    select(QuestionExtractionRun.id)
                    .join(
                        SourceDocument,
                        SourceDocument.id
                        == QuestionExtractionRun.source_document_id,
                    )
                    .where(
                        QuestionExtractionRun.id == run_id,
                        QuestionExtractionRun.status
                        == QuestionExtractionRunStatus.PENDING,
                        QuestionExtractionRun.deleted_at.is_(None),
                        SourceDocument.deleted_at.is_(None),
                        ~select(QuestionExtractionResult.id)
                        .where(
                            QuestionExtractionResult.question_extraction_run_id
                            == QuestionExtractionRun.id,
                        )
                        .exists(),
                    )
                )
                return () if eligible_run_id is None else (eligible_run_id,)
            return QuestionExtractionDispatchService(
                db
            ).list_pending_run_ids(
                limit=self._worker_batch_size,
            )
        finally:
            db.close()
