from __future__ import annotations

import uuid
import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func, select
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
from app.models.user import User
from app.services.source_pre_analysis_processor import (
    SourcePreAnalysisProcessorProvenance,
)


class SourcePreAnalysisServiceError(Exception):
    """Base exception for source pre-analysis service failures."""


class SourcePreAnalysisRunNotFoundError(SourcePreAnalysisServiceError):
    """Raised when an active run and owning document are unavailable."""


class SourcePreAnalysisSourceDocumentNotFoundError(
    SourcePreAnalysisServiceError
):
    """Raised when an active source document is unavailable."""


class SourcePreAnalysisRequestedByUserNotFoundError(
    SourcePreAnalysisServiceError
):
    """Raised when an active requesting user is unavailable."""


class SourcePreAnalysisActiveRunExistsError(SourcePreAnalysisServiceError):
    """Raised when a document already has a non-terminal active run."""


class SourcePreAnalysisInvalidRunStateError(SourcePreAnalysisServiceError):
    """Raised when a run cannot perform the requested lifecycle transition."""


class SourcePreAnalysisLeaseMismatchError(SourcePreAnalysisServiceError):
    """Raised when execution does not own the active run lease."""


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


@dataclass(frozen=True, slots=True)
class SourcePreAnalysisRunClaim:
    run_id: uuid.UUID
    execution_lease_id: uuid.UUID
    started_at: datetime
    last_heartbeat_at: datetime


class SourcePreAnalysisService:
    """Application service for source pre-analysis lifecycle operations."""

    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _validate_create_run_ids(
        *,
        source_document_id: uuid.UUID,
        requested_by_user_id: uuid.UUID | None,
    ) -> None:
        if not isinstance(source_document_id, uuid.UUID):
            raise SourcePreAnalysisValidationError(
                "Source document ID must be a UUID."
            )
        if requested_by_user_id is not None and not isinstance(
            requested_by_user_id, uuid.UUID,
        ):
            raise SourcePreAnalysisValidationError(
                "Requesting user ID must be a UUID or null."
            )

    def _get_active_source_document_for_update(
        self,
        *,
        source_document_id: uuid.UUID,
    ) -> SourceDocument:
        source_document = self.db.scalar(
            select(SourceDocument)
            .where(
                SourceDocument.id == source_document_id,
                SourceDocument.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if source_document is None:
            raise SourcePreAnalysisSourceDocumentNotFoundError(
                "Active source document was not found."
            )
        return source_document

    def _require_active_requesting_user(
        self,
        *,
        requested_by_user_id: uuid.UUID,
    ) -> None:
        user = self.db.scalar(
            select(User).where(
                User.id == requested_by_user_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        if user is None:
            raise SourcePreAnalysisRequestedByUserNotFoundError(
                "Active requesting user was not found."
            )

    def create_run(
        self,
        *,
        source_document_id: uuid.UUID,
        requested_by_user_id: uuid.UUID | None = None,
    ) -> SourcePreAnalysisRun:
        """Create the first pending pre-analysis run for an active document."""

        try:
            self._validate_create_run_ids(
                source_document_id=source_document_id,
                requested_by_user_id=requested_by_user_id,
            )
            source_document = self._get_active_source_document_for_update(
                source_document_id=source_document_id,
            )
            if requested_by_user_id is not None:
                self._require_active_requesting_user(
                    requested_by_user_id=requested_by_user_id,
                )

            active_run_id = self.db.scalar(
                select(SourcePreAnalysisRun.id)
                .where(
                    SourcePreAnalysisRun.source_document_id == source_document.id,
                    SourcePreAnalysisRun.deleted_at.is_(None),
                    SourcePreAnalysisRun.status.in_((
                        SourcePreAnalysisRunStatus.PENDING,
                        SourcePreAnalysisRunStatus.RUNNING,
                    )),
                )
                .limit(1)
            )
            if active_run_id is not None:
                raise SourcePreAnalysisActiveRunExistsError(
                    "Source document already has an active pre-analysis run."
                )

            maximum_run_number = self.db.scalar(
                select(func.max(SourcePreAnalysisRun.run_number)).where(
                    SourcePreAnalysisRun.source_document_id == source_document.id,
                )
            )
            next_run_number = (maximum_run_number or 0) + 1

            run = SourcePreAnalysisRun(
                source_document_id=source_document.id,
                run_number=next_run_number,
                status=SourcePreAnalysisRunStatus.PENDING,
                requested_by_user_id=requested_by_user_id,
                started_at=None,
                completed_at=None,
                failure_message=None,
            )
            self.db.add(run)
            self.db.commit()
            return run
        except IntegrityError as exc:
            self.db.rollback()
            raise SourcePreAnalysisPersistenceConflictError(
                "Source pre-analysis run could not be created."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

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
    def _normalize_provenance(
        provenance: SourcePreAnalysisProcessorProvenance,
    ) -> SourcePreAnalysisProcessorProvenance:
        if not isinstance(provenance, SourcePreAnalysisProcessorProvenance):
            raise SourcePreAnalysisValidationError(
                "Processor provenance is invalid."
            )

        identifier = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
        version_identifier = re.compile(
            r"^[A-Za-z0-9]+(?:[._:+/-][A-Za-z0-9]+)*$"
        )

        def required_identifier(
            value: object,
            *,
            label: str,
            maximum_length: int,
        ) -> str:
            if not isinstance(value, str):
                raise SourcePreAnalysisValidationError(
                    f"{label} must be a string."
                )
            normalized = value.strip()
            if (
                not normalized
                or len(normalized) > maximum_length
                or identifier.fullmatch(normalized) is None
            ):
                raise SourcePreAnalysisValidationError(f"{label} is invalid.")
            return normalized

        def optional_text(
            value: object,
            *,
            label: str,
            maximum_length: int,
        ) -> str | None:
            if value is None:
                return None
            if not isinstance(value, str):
                raise SourcePreAnalysisValidationError(
                    f"{label} must be a string or null."
                )
            normalized = value.strip()
            if (
                not normalized
                or len(normalized) > maximum_length
                or any(character in normalized for character in "\r\n")
            ):
                raise SourcePreAnalysisValidationError(f"{label} is invalid.")
            return normalized

        def optional_version_identifier(
            value: object,
            *,
            label: str,
            maximum_length: int,
        ) -> str | None:
            normalized = optional_text(
                value,
                label=label,
                maximum_length=maximum_length,
            )
            if (
                normalized is not None
                and version_identifier.fullmatch(normalized) is None
            ):
                raise SourcePreAnalysisValidationError(f"{label} is invalid.")
            return normalized

        processor_version = optional_text(
            provenance.processor_version,
            label="Processor version",
            maximum_length=100,
        )
        if processor_version is None:
            raise SourcePreAnalysisValidationError(
                "Processor version is required."
            )
        provider_name = None
        if provenance.provider_name is not None:
            provider_name = required_identifier(
                provenance.provider_name,
                label="Provider name",
                maximum_length=100,
            )
        return SourcePreAnalysisProcessorProvenance(
            processor_name=required_identifier(
                provenance.processor_name,
                label="Processor name",
                maximum_length=100,
            ),
            processor_version=processor_version,
            provider_name=provider_name,
            model_name=optional_text(
                provenance.model_name,
                label="Model name",
                maximum_length=200,
            ),
            prompt_version=optional_version_identifier(
                provenance.prompt_version,
                label="Prompt version",
                maximum_length=100,
            ),
        )

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
    ) -> SourcePreAnalysisRunClaim:
        """Atomically transition one active pending run to running."""

        try:
            if type(run_id) is not uuid.UUID:
                raise SourcePreAnalysisValidationError(
                    "Source pre-analysis run ID must be a UUID."
                )
            run = self._get_active_run_for_update(run_id=run_id)
            if run.status != SourcePreAnalysisRunStatus.PENDING:
                raise SourcePreAnalysisInvalidRunStateError(
                    "Source pre-analysis run is not pending."
                )

            lease_id = uuid.uuid4()
            started_at = utc_now()
            run.status = SourcePreAnalysisRunStatus.RUNNING
            run.started_at = started_at
            run.completed_at = None
            run.failure_message = None
            run.execution_lease_id = lease_id
            run.last_heartbeat_at = started_at

            self.db.commit()
            return SourcePreAnalysisRunClaim(
                run_id=run.id,
                execution_lease_id=lease_id,
                started_at=started_at,
                last_heartbeat_at=started_at,
            )
        except Exception:
            self.db.rollback()
            raise

    @staticmethod
    def _validate_execution_lease_id(
        execution_lease_id: uuid.UUID,
    ) -> None:
        if type(execution_lease_id) is not uuid.UUID:
            raise SourcePreAnalysisValidationError(
                "Execution lease ID must be a UUID."
            )

    @classmethod
    def _require_execution_lease(
        cls,
        *,
        run: SourcePreAnalysisRun,
        execution_lease_id: uuid.UUID,
    ) -> None:
        cls._validate_execution_lease_id(execution_lease_id)
        if (
            run.execution_lease_id is None
            or run.execution_lease_id != execution_lease_id
        ):
            raise SourcePreAnalysisLeaseMismatchError(
                "Source pre-analysis execution lease does not match."
            )

    def heartbeat_run(
        self,
        *,
        run_id: uuid.UUID,
        execution_lease_id: uuid.UUID,
    ) -> datetime:
        """Refresh one matching active execution lease under row lock."""

        try:
            if type(run_id) is not uuid.UUID:
                raise SourcePreAnalysisValidationError(
                    "Source pre-analysis run ID must be a UUID."
                )
            self._validate_execution_lease_id(execution_lease_id)
            run = self._get_active_run_for_update(run_id=run_id)
            if run.status != SourcePreAnalysisRunStatus.RUNNING:
                raise SourcePreAnalysisInvalidRunStateError(
                    "Source pre-analysis run is not running."
                )
            self._require_execution_lease(
                run=run,
                execution_lease_id=execution_lease_id,
            )
            heartbeat_at = utc_now()
            run.last_heartbeat_at = heartbeat_at
            self.db.commit()
            return heartbeat_at
        except Exception:
            self.db.rollback()
            raise

    def finalize_success(
        self,
        *,
        run_id: uuid.UUID,
        execution_lease_id: uuid.UUID,
        result: SourcePreAnalysisResultInput,
        findings: Sequence[SourcePreAnalysisFindingInput],
        provenance: SourcePreAnalysisProcessorProvenance,
    ) -> SourcePreAnalysisFinalization:
        """Atomically persist complete output and mark a running run succeeded."""

        try:
            self._validate_execution_lease_id(execution_lease_id)
            self._validate_result_input(result)
            normalized_findings = self._normalize_findings(findings)
            normalized_provenance = self._normalize_provenance(provenance)

            run = self._get_active_run_for_update(run_id=run_id)
            if run.status != SourcePreAnalysisRunStatus.RUNNING:
                raise SourcePreAnalysisInvalidRunStateError(
                    "Source pre-analysis run is not running."
                )
            self._require_execution_lease(
                run=run,
                execution_lease_id=execution_lease_id,
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
                processor_name=normalized_provenance.processor_name,
                processor_version=normalized_provenance.processor_version,
                provider_name=normalized_provenance.provider_name,
                model_name=normalized_provenance.model_name,
                prompt_version=normalized_provenance.prompt_version,
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
            run.execution_lease_id = None
            run.last_heartbeat_at = None

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
        execution_lease_id: uuid.UUID,
        failure_message: str,
    ) -> SourcePreAnalysisRun:
        """Atomically transition one active running run to failed."""

        try:
            self._validate_execution_lease_id(execution_lease_id)
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
            self._require_execution_lease(
                run=run,
                execution_lease_id=execution_lease_id,
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
            run.execution_lease_id = None
            run.last_heartbeat_at = None

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
