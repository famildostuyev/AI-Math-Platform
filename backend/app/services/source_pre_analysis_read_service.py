from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.core.enums import (
    SourcePreAnalysisFindingSeverity,
    SourcePreAnalysisRunStatus,
)
from app.models.source_document import SourceDocument
from app.models.source_document_page import SourceDocumentPage
from app.models.source_pre_analysis_finding import SourcePreAnalysisFinding
from app.models.source_pre_analysis_result import SourcePreAnalysisResult
from app.models.source_pre_analysis_run import SourcePreAnalysisRun


class SourcePreAnalysisReadServiceError(Exception):
    """Base exception for source pre-analysis read failures."""


class SourcePreAnalysisReadSourceNotFoundError(
    SourcePreAnalysisReadServiceError
):
    """Raised when an active source document is unavailable."""


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisRunSummary:
    id: uuid.UUID
    run_number: int
    status: SourcePreAnalysisRunStatus
    requested_by_user_id: uuid.UUID | None
    started_at: datetime | None
    completed_at: datetime | None
    failure_message: str | None


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisFindingView:
    id: uuid.UUID
    sequence_number: int
    finding_code: str
    severity: SourcePreAnalysisFindingSeverity
    confidence: Decimal | None
    message: str
    source_document_page_id: uuid.UUID | None
    page_number: int | None


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisSuccessfulResultView:
    run: SourcePreAnalysisRunSummary
    result_id: uuid.UUID
    schema_version: int
    page_count: int | None
    finding_count: int
    info_count: int
    warning_count: int
    error_count: int
    findings: tuple[SourcePreAnalysisFindingView, ...]


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisOverview:
    source_document_id: uuid.UUID
    media_asset_id: uuid.UUID
    question_source_id: uuid.UUID | None
    uploaded_by_user_id: uuid.UUID | None
    latest_run: SourcePreAnalysisRunSummary | None
    latest_successful_result: SourcePreAnalysisSuccessfulResultView | None


class SourcePreAnalysisReadService:
    """Read-only projections for source pre-analysis state."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_overview(
        self,
        *,
        source_document_id: uuid.UUID,
    ) -> SourcePreAnalysisOverview:
        """Return active source identity and its latest active run."""

        source_document = self.db.scalar(
            select(SourceDocument).where(
                SourceDocument.id == source_document_id,
                SourceDocument.deleted_at.is_(None),
            )
        )
        if source_document is None:
            raise SourcePreAnalysisReadSourceNotFoundError(
                "Active source document was not found."
            )

        latest_run = self.db.scalar(
            select(SourcePreAnalysisRun)
            .where(
                SourcePreAnalysisRun.source_document_id == source_document.id,
                SourcePreAnalysisRun.deleted_at.is_(None),
            )
            .order_by(
                SourcePreAnalysisRun.run_number.desc(),
                SourcePreAnalysisRun.id.desc(),
            )
            .limit(1)
        )

        latest_successful_row = self.db.execute(
            select(SourcePreAnalysisRun, SourcePreAnalysisResult)
            .join(
                SourcePreAnalysisResult,
                SourcePreAnalysisResult.source_pre_analysis_run_id
                == SourcePreAnalysisRun.id,
            )
            .where(
                SourcePreAnalysisRun.source_document_id == source_document.id,
                SourcePreAnalysisRun.status
                == SourcePreAnalysisRunStatus.SUCCEEDED,
                SourcePreAnalysisRun.deleted_at.is_(None),
                SourcePreAnalysisResult.deleted_at.is_(None),
            )
            .order_by(
                SourcePreAnalysisRun.run_number.desc(),
                SourcePreAnalysisRun.id.desc(),
            )
            .limit(1)
        ).first()

        latest_successful_result = None
        if latest_successful_row is not None:
            successful_run, result = latest_successful_row
            finding_rows = self.db.execute(
                select(
                    SourcePreAnalysisFinding,
                    SourceDocumentPage.page_number,
                )
                .outerjoin(
                    SourceDocumentPage,
                    and_(
                        SourceDocumentPage.id
                        == SourcePreAnalysisFinding.source_document_page_id,
                        SourceDocumentPage.deleted_at.is_(None),
                        SourceDocumentPage.source_document_id
                        == source_document.id,
                    ),
                )
                .where(
                    SourcePreAnalysisFinding.source_pre_analysis_result_id
                    == result.id,
                    SourcePreAnalysisFinding.deleted_at.is_(None),
                )
                .order_by(
                    SourcePreAnalysisFinding.sequence_number.asc(),
                    SourcePreAnalysisFinding.id.asc(),
                )
            ).all()
            findings = tuple(
                SourcePreAnalysisFindingView(
                    id=finding.id,
                    sequence_number=finding.sequence_number,
                    finding_code=finding.finding_code,
                    severity=finding.severity,
                    confidence=finding.confidence,
                    message=finding.message,
                    source_document_page_id=finding.source_document_page_id,
                    page_number=page_number,
                )
                for finding, page_number in finding_rows
            )
            latest_successful_result = SourcePreAnalysisSuccessfulResultView(
                run=self._run_summary(successful_run),
                result_id=result.id,
                schema_version=result.schema_version,
                page_count=result.page_count,
                finding_count=len(findings),
                info_count=sum(
                    finding.severity == SourcePreAnalysisFindingSeverity.INFO
                    for finding in findings
                ),
                warning_count=sum(
                    finding.severity
                    == SourcePreAnalysisFindingSeverity.WARNING
                    for finding in findings
                ),
                error_count=sum(
                    finding.severity == SourcePreAnalysisFindingSeverity.ERROR
                    for finding in findings
                ),
                findings=findings,
            )

        return SourcePreAnalysisOverview(
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
    def _run_summary(run: SourcePreAnalysisRun) -> SourcePreAnalysisRunSummary:
        return SourcePreAnalysisRunSummary(
            id=run.id,
            run_number=run.run_number,
            status=run.status,
            requested_by_user_id=run.requested_by_user_id,
            started_at=run.started_at,
            completed_at=run.completed_at,
            failure_message=run.failure_message,
        )
