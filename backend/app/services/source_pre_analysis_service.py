from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import (
    SourcePreAnalysisFindingSeverity,
    SourcePreAnalysisRunStatus,
)
from app.core.security import utc_now
from app.models.source_document import SourceDocument
from app.models.source_document_page import SourceDocumentPage
from app.models.source_pre_analysis_finding import SourcePreAnalysisFinding
from app.models.source_pre_analysis_result import SourcePreAnalysisResult
from app.models.source_pre_analysis_run import SourcePreAnalysisRun


class SourcePreAnalysisServiceError(Exception):
    """Base exception for source pre-analysis service failures."""


class SourcePreAnalysisRunNotFoundError(SourcePreAnalysisServiceError):
    """Raised when an active run and owning document are unavailable."""


class SourcePreAnalysisInvalidRunStateError(SourcePreAnalysisServiceError):
    """Raised when a run cannot perform the requested lifecycle transition."""


class SourcePreAnalysisResultAlreadyExistsError(SourcePreAnalysisServiceError):
    """Raised when a run already owns a historical result."""


class SourcePreAnalysisPageNotFoundError(SourcePreAnalysisServiceError):
    """Raised when a referenced active source page is unavailable."""


class SourcePreAnalysisPageDocumentMismatchError(
    SourcePreAnalysisServiceError
):
    """Raised when a referenced page belongs to another source document."""


class SourcePreAnalysisValidationError(SourcePreAnalysisServiceError):
    """Raised when finalization input violates the internal contract."""


class SourcePreAnalysisPersistenceConflictError(SourcePreAnalysisServiceError):
    """Raised when finalization encounters a database integrity conflict."""


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisResultInput:
    schema_version: int = 1
    page_count: int | None = None


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisFindingInput:
    source_document_page_id: uuid.UUID | None
    finding_code: str
    severity: SourcePreAnalysisFindingSeverity
    confidence: Decimal | None
    message: str


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisFinalization:
    result: SourcePreAnalysisResult
    findings: tuple[SourcePreAnalysisFinding, ...]


class SourcePreAnalysisService:
    """Application service for source pre-analysis lifecycle operations."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _get_active_run_for_update(
        self,
        *,
        run_id: uuid.UUID,
    ) -> SourcePreAnalysisRun:
        run = self.db.scalar(
            select(SourcePreAnalysisRun)
            .join(
                SourceDocument,
                SourceDocument.id == SourcePreAnalysisRun.source_document_id,
            )
            .where(
                SourcePreAnalysisRun.id == run_id,
                SourcePreAnalysisRun.deleted_at.is_(None),
                SourceDocument.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if run is None:
            raise SourcePreAnalysisRunNotFoundError(
                "Active source pre-analysis run was not found."
            )
        return run

    @staticmethod
    def _validate_result_input(
        result: SourcePreAnalysisResultInput,
    ) -> None:
        if (
            not isinstance(result.schema_version, int)
            or isinstance(result.schema_version, bool)
            or result.schema_version <= 0
        ):
            raise SourcePreAnalysisValidationError(
                "Result schema version must be a positive integer."
            )
        if (
            result.page_count is not None
            and (
                not isinstance(result.page_count, int)
                or isinstance(result.page_count, bool)
                or result.page_count < 0
            )
        ):
            raise SourcePreAnalysisValidationError(
                "Result page count must be a non-negative integer or null."
            )

    @staticmethod
    def _normalize_findings(
        findings: Sequence[SourcePreAnalysisFindingInput],
    ) -> tuple[SourcePreAnalysisFindingInput, ...]:
        normalized: list[SourcePreAnalysisFindingInput] = []
        for finding in findings:
            if not isinstance(finding.source_document_page_id, (uuid.UUID, type(None))):
                raise SourcePreAnalysisValidationError(
                    "Finding page ID must be a UUID or null."
                )
            if not isinstance(finding.finding_code, str):
                raise SourcePreAnalysisValidationError(
                    "Finding code must be a string."
                )
            finding_code = finding.finding_code.strip()
            if not finding_code or len(finding_code) > 100:
                raise SourcePreAnalysisValidationError(
                    "Finding code must contain 1 to 100 characters."
                )
            if not isinstance(finding.message, str):
                raise SourcePreAnalysisValidationError(
                    "Finding message must be a string."
                )
            message = finding.message.strip()
            if not message:
                raise SourcePreAnalysisValidationError(
                    "Finding message cannot be blank."
                )
            if not isinstance(
                finding.severity, SourcePreAnalysisFindingSeverity,
            ):
                raise SourcePreAnalysisValidationError(
                    "Finding severity is invalid."
                )
            if finding.confidence is not None:
                if not isinstance(finding.confidence, Decimal):
                    raise SourcePreAnalysisValidationError(
                        "Finding confidence must be a Decimal or null."
                    )
                if (
                    not finding.confidence.is_finite()
                    or finding.confidence < Decimal("0")
                    or finding.confidence > Decimal("1")
                ):
                    raise SourcePreAnalysisValidationError(
                        "Finding confidence must be between 0 and 1."
                    )
            normalized.append(
                SourcePreAnalysisFindingInput(
                    source_document_page_id=finding.source_document_page_id,
                    finding_code=finding_code,
                    severity=finding.severity,
                    confidence=finding.confidence,
                    message=message,
                )
            )
        return tuple(normalized)

    def start_run(
        self,
        *,
        run_id: uuid.UUID,
    ) -> SourcePreAnalysisRun:
        """Atomically transition one active pending run to running."""

        try:
            run = self._get_active_run_for_update(run_id=run_id)
            if run.status != SourcePreAnalysisRunStatus.PENDING:
                raise SourcePreAnalysisInvalidRunStateError(
                    "Source pre-analysis run is not pending."
                )

            run.status = SourcePreAnalysisRunStatus.RUNNING
            run.started_at = utc_now()
            run.completed_at = None
            run.failure_message = None

            self.db.commit()
            return run
        except Exception:
            self.db.rollback()
            raise

    def finalize_success(
        self,
        *,
        run_id: uuid.UUID,
        result: SourcePreAnalysisResultInput,
        findings: Sequence[SourcePreAnalysisFindingInput],
    ) -> SourcePreAnalysisFinalization:
        """Atomically persist complete output and mark a running run succeeded."""

        try:
            self._validate_result_input(result)
            normalized_findings = self._normalize_findings(findings)

            run = self._get_active_run_for_update(run_id=run_id)
            if run.status != SourcePreAnalysisRunStatus.RUNNING:
                raise SourcePreAnalysisInvalidRunStateError(
                    "Source pre-analysis run is not running."
                )

            existing_result = self.db.scalar(
                select(SourcePreAnalysisResult).where(
                    SourcePreAnalysisResult.source_pre_analysis_run_id == run.id,
                )
            )
            if existing_result is not None:
                raise SourcePreAnalysisResultAlreadyExistsError(
                    "Source pre-analysis run already has a result."
                )

            page_ids = {
                finding.source_document_page_id
                for finding in normalized_findings
                if finding.source_document_page_id is not None
            }
            if page_ids:
                pages = list(
                    self.db.scalars(
                        select(SourceDocumentPage)
                        .where(
                            SourceDocumentPage.id.in_(page_ids),
                            SourceDocumentPage.deleted_at.is_(None),
                        )
                        .with_for_update()
                    ).all()
                )
                page_by_id = {page.id: page for page in pages}
                if set(page_by_id) != page_ids:
                    raise SourcePreAnalysisPageNotFoundError(
                        "An active source document page was not found."
                    )
                if any(
                    page.source_document_id != run.source_document_id
                    for page in pages
                ):
                    raise SourcePreAnalysisPageDocumentMismatchError(
                        "Source document page belongs to another document."
                    )

            result_model = SourcePreAnalysisResult(
                source_pre_analysis_run_id=run.id,
                schema_version=result.schema_version,
                page_count=result.page_count,
            )
            self.db.add(result_model)
            self.db.flush()

            finding_models = tuple(
                SourcePreAnalysisFinding(
                    source_pre_analysis_result_id=result_model.id,
                    source_document_page_id=finding.source_document_page_id,
                    sequence_number=sequence_number,
                    finding_code=finding.finding_code,
                    severity=finding.severity,
                    confidence=finding.confidence,
                    message=finding.message,
                )
                for sequence_number, finding in enumerate(
                    normalized_findings, start=1,
                )
            )
            if finding_models:
                self.db.add_all(finding_models)

            run.status = SourcePreAnalysisRunStatus.SUCCEEDED
            run.completed_at = utc_now()
            run.failure_message = None

            self.db.commit()
            return SourcePreAnalysisFinalization(
                result=result_model,
                findings=finding_models,
            )
        except IntegrityError as exc:
            self.db.rollback()
            raise SourcePreAnalysisPersistenceConflictError(
                "Source pre-analysis finalization could not be persisted."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def mark_failed(
        self,
        *,
        run_id: uuid.UUID,
        failure_message: str,
    ) -> SourcePreAnalysisRun:
        """Atomically transition one active running run to failed."""

        try:
            if not isinstance(failure_message, str):
                raise SourcePreAnalysisValidationError(
                    "Failure message must be a string."
                )
            normalized_message = failure_message.strip()
            if not normalized_message:
                raise SourcePreAnalysisValidationError(
                    "Failure message cannot be blank."
                )

            run = self._get_active_run_for_update(run_id=run_id)
            if run.status != SourcePreAnalysisRunStatus.RUNNING:
                raise SourcePreAnalysisInvalidRunStateError(
                    "Source pre-analysis run is not running."
                )

            existing_result = self.db.scalar(
                select(SourcePreAnalysisResult).where(
                    SourcePreAnalysisResult.source_pre_analysis_run_id == run.id,
                )
            )
            if existing_result is not None:
                raise SourcePreAnalysisResultAlreadyExistsError(
                    "Source pre-analysis run already has a result."
                )

            run.status = SourcePreAnalysisRunStatus.FAILED
            run.completed_at = utc_now()
            run.failure_message = normalized_message

            self.db.commit()
            return run
        except IntegrityError as exc:
            self.db.rollback()
            raise SourcePreAnalysisPersistenceConflictError(
                "Source pre-analysis failure transition could not be persisted."
            ) from exc
        except Exception:
            self.db.rollback()
            raise
