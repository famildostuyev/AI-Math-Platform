from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.enums import QuestionExtractionRunStatus
from app.models.question_candidate import QuestionCandidate
from app.models.question_extraction_run import QuestionExtractionRun
from app.models.question_extraction_result import QuestionExtractionResult
from app.models.source_document import SourceDocument
from app.models.source_document_page import SourceDocumentPage


class QuestionExtractionReadServiceError(Exception):
    """Base exception for question extraction read failures."""


class QuestionExtractionReadSourceNotFoundError(
    QuestionExtractionReadServiceError
):
    """Raised when an active source document is unavailable."""


@dataclass(frozen=True, slots=True)
class QuestionExtractionRunSummary:
    id: uuid.UUID
    run_number: int
    status: QuestionExtractionRunStatus
    requested_by_user_id: uuid.UUID | None
    started_at: object | None
    completed_at: object | None
    failure_message: str | None


@dataclass(frozen=True, slots=True)
class QuestionCandidateView:
    id: uuid.UUID
    sequence_number: int
    extracted_text: str
    confidence: Decimal | None
    source_document_page_id: uuid.UUID | None
    page_number: int | None


@dataclass(frozen=True, slots=True)
class QuestionExtractionSuccessfulResultView:
    run: QuestionExtractionRunSummary
    candidate_count: int
    candidates: tuple[QuestionCandidateView, ...]
    analysis_result: QuestionExtractionResult | None = None


@dataclass(frozen=True, slots=True)
class QuestionExtractionOverview:
    source_document_id: uuid.UUID
    media_asset_id: uuid.UUID
    question_source_id: uuid.UUID | None
    uploaded_by_user_id: uuid.UUID | None
    latest_run: QuestionExtractionRunSummary | None
    latest_successful_result: QuestionExtractionSuccessfulResultView | None


class QuestionExtractionReadService:
    """Read-only projections for question extraction state."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_overview(
        self,
        *,
        source_document_id: uuid.UUID,
    ) -> QuestionExtractionOverview:
        """Return active source identity and its latest extraction state."""

        source_document = self.db.scalar(
            select(SourceDocument).where(
                SourceDocument.id == source_document_id,
                SourceDocument.deleted_at.is_(None),
            )
        )
        if source_document is None:
            raise QuestionExtractionReadSourceNotFoundError(
                "Active source document was not found."
            )

        latest_run = self.db.scalar(
            select(QuestionExtractionRun, QuestionExtractionResult)
            .outerjoin(
                QuestionExtractionResult,
                and_(
                    QuestionExtractionResult.question_extraction_run_id
                    == QuestionExtractionRun.id,
                    QuestionExtractionResult.deleted_at.is_(None),
                ),
            )
            .where(
                QuestionExtractionRun.source_document_id
                == source_document.id,
                QuestionExtractionRun.deleted_at.is_(None),
            )
            .order_by(
                QuestionExtractionRun.run_number.desc(),
                QuestionExtractionRun.id.desc(),
            )
            .limit(1)
        )

        latest_successful_row = self.db.execute(
            select(QuestionExtractionRun, QuestionExtractionResult)
            .outerjoin(
                QuestionExtractionResult,
                and_(
                    QuestionExtractionResult.question_extraction_run_id
                    == QuestionExtractionRun.id,
                    QuestionExtractionResult.deleted_at.is_(None),
                ),
            )
            .where(
                QuestionExtractionRun.source_document_id
                == source_document.id,
                QuestionExtractionRun.status
                == QuestionExtractionRunStatus.SUCCEEDED,
                QuestionExtractionRun.deleted_at.is_(None),
            )
            .order_by(
                QuestionExtractionRun.run_number.desc(),
                QuestionExtractionRun.id.desc(),
            )
            .limit(1)
        ).first()

        latest_successful_result = None
        if latest_successful_row is not None:
            successful_run = latest_successful_row[0]
            analysis_result = (
                latest_successful_row[1]
                if len(latest_successful_row) > 1
                else None
            )

            candidate_rows = self.db.execute(
                select(
                    QuestionCandidate,
                    SourceDocumentPage.page_number,
                )
                .outerjoin(
                    SourceDocumentPage,
                    and_(
                        SourceDocumentPage.id
                        == QuestionCandidate.source_document_page_id,
                        SourceDocumentPage.deleted_at.is_(None),
                        SourceDocumentPage.source_document_id
                        == source_document.id,
                    ),
                )
                .where(
                    QuestionCandidate.question_extraction_run_id
                    == successful_run.id,
                    QuestionCandidate.deleted_at.is_(None),
                )
                .order_by(
                    QuestionCandidate.sequence_number.asc(),
                    QuestionCandidate.id.asc(),
                )
            ).all()

            candidates = tuple(
                QuestionCandidateView(
                    id=candidate.id,
                    sequence_number=candidate.sequence_number,
                    extracted_text=candidate.extracted_text,
                    confidence=candidate.confidence,
                    source_document_page_id=candidate.source_document_page_id,
                    page_number=page_number,
                )
                for candidate, page_number in candidate_rows
            )

            latest_successful_result = (
                QuestionExtractionSuccessfulResultView(
                    run=self._run_summary(successful_run),
                    candidate_count=len(candidates),
                    candidates=candidates,
                    analysis_result=analysis_result,
                )
            )

        return QuestionExtractionOverview(
            source_document_id=source_document.id,
            media_asset_id=source_document.media_asset_id,
            question_source_id=source_document.question_source_id,
            uploaded_by_user_id=source_document.uploaded_by_user_id,
            latest_run=(
                self._run_summary(latest_run)
                if latest_run is not None
                else None
            ),
            latest_successful_result=latest_successful_result,
        )

    @staticmethod
    def _run_summary(
        run: QuestionExtractionRun,
    ) -> QuestionExtractionRunSummary:
        return QuestionExtractionRunSummary(
            id=run.id,
            run_number=run.run_number,
            status=run.status,
            requested_by_user_id=run.requested_by_user_id,
            started_at=run.started_at,
            completed_at=run.completed_at,
            failure_message=run.failure_message,
        )
