from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import QuestionExtractionRunStatus
from app.core.security import utc_now
from app.models.question_extraction_run import QuestionExtractionRun
from app.models.source_document import SourceDocument
from app.models.user import User


class QuestionExtractionServiceError(Exception):
    """Base exception for question extraction lifecycle failures."""


class QuestionExtractionRunNotFoundError(QuestionExtractionServiceError):
    """Raised when an active extraction run and owning document are unavailable."""


class QuestionExtractionSourceDocumentNotFoundError(
    QuestionExtractionServiceError
):
    """Raised when an active source document is unavailable."""


class QuestionExtractionRequestedByUserNotFoundError(
    QuestionExtractionServiceError
):
    """Raised when an active requesting user is unavailable."""


class QuestionExtractionActiveRunExistsError(
    QuestionExtractionServiceError
):
    """Raised when a source document already has an active extraction run."""


class QuestionExtractionInvalidRunStateError(
    QuestionExtractionServiceError
):
    """Raised when an extraction run cannot perform the requested transition."""


class QuestionExtractionValidationError(
    QuestionExtractionServiceError
):
    """Raised when trusted lifecycle input is invalid."""


class QuestionExtractionPersistenceConflictError(
    QuestionExtractionServiceError
):
    """Raised when extraction lifecycle persistence conflicts."""


class QuestionExtractionService:
    """Application service for question extraction lifecycle operations."""

    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def _validate_create_run_ids(
        *,
        source_document_id: uuid.UUID,
        requested_by_user_id: uuid.UUID | None,
    ) -> None:
        if not isinstance(source_document_id, uuid.UUID):
            raise QuestionExtractionValidationError(
                "Source document ID must be a UUID."
            )
        if (
            requested_by_user_id is not None
            and not isinstance(requested_by_user_id, uuid.UUID)
        ):
            raise QuestionExtractionValidationError(
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
            raise QuestionExtractionSourceDocumentNotFoundError(
                "Active source document was not found."
            )
        return source_document

    def _require_active_requesting_user(
        self,
        *,
        requested_by_user_id: uuid.UUID,
    ) -> None:
        user_id = self.db.scalar(
            select(User.id).where(
                User.id == requested_by_user_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        if user_id is None:
            raise QuestionExtractionRequestedByUserNotFoundError(
                "Active requesting user was not found."
            )

    def create_run(
        self,
        *,
        source_document_id: uuid.UUID,
        requested_by_user_id: uuid.UUID | None = None,
    ) -> QuestionExtractionRun:
        """Create one pending extraction run for an active source document."""

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
                select(QuestionExtractionRun.id)
                .where(
                    QuestionExtractionRun.source_document_id
                    == source_document.id,
                    QuestionExtractionRun.deleted_at.is_(None),
                    QuestionExtractionRun.status.in_(
                        (
                            QuestionExtractionRunStatus.PENDING,
                            QuestionExtractionRunStatus.RUNNING,
                        )
                    ),
                )
                .limit(1)
            )
            if active_run_id is not None:
                raise QuestionExtractionActiveRunExistsError(
                    "Source document already has an active extraction run."
                )

            maximum_run_number = self.db.scalar(
                select(func.max(QuestionExtractionRun.run_number)).where(
                    QuestionExtractionRun.source_document_id
                    == source_document.id,
                )
            )
            next_run_number = (maximum_run_number or 0) + 1

            run = QuestionExtractionRun(
                source_document_id=source_document.id,
                run_number=next_run_number,
                status=QuestionExtractionRunStatus.PENDING,
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
            raise QuestionExtractionPersistenceConflictError(
                "Question extraction run could not be created."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def _get_active_run_for_update(
        self,
        *,
        run_id: uuid.UUID,
    ) -> QuestionExtractionRun:
        run = self.db.scalar(
            select(QuestionExtractionRun)
            .join(
                SourceDocument,
                SourceDocument.id == QuestionExtractionRun.source_document_id,
            )
            .where(
                QuestionExtractionRun.id == run_id,
                QuestionExtractionRun.deleted_at.is_(None),
                SourceDocument.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if run is None:
            raise QuestionExtractionRunNotFoundError(
                "Active question extraction run was not found."
            )
        return run

    def start_run(
        self,
        *,
        run_id: uuid.UUID,
    ) -> QuestionExtractionRun:
        """Atomically transition one active pending extraction run to running."""

        try:
            if type(run_id) is not uuid.UUID:
                raise QuestionExtractionValidationError(
                    "Question extraction run ID must be a UUID."
                )

            run = self._get_active_run_for_update(run_id=run_id)

            if run.status != QuestionExtractionRunStatus.PENDING:
                raise QuestionExtractionInvalidRunStateError(
                    "Question extraction run is not pending."
                )

            started_at = utc_now()
            run.status = QuestionExtractionRunStatus.RUNNING
            run.started_at = started_at
            run.completed_at = None
            run.failure_message = None

            self.db.commit()
            return run

        except Exception:
            self.db.rollback()
            raise

    def mark_failed(
        self,
        *,
        run_id: uuid.UUID,
        failure_message: str,
    ) -> QuestionExtractionRun:
        """Atomically transition one active running extraction run to failed."""

        try:
            if type(run_id) is not uuid.UUID:
                raise QuestionExtractionValidationError(
                    "Question extraction run ID must be a UUID."
                )
            if not isinstance(failure_message, str):
                raise QuestionExtractionValidationError(
                    "Failure message must be a string."
                )

            normalized_message = failure_message.strip()
            if not normalized_message:
                raise QuestionExtractionValidationError(
                    "Failure message cannot be blank."
                )

            run = self._get_active_run_for_update(run_id=run_id)

            if run.status != QuestionExtractionRunStatus.RUNNING:
                raise QuestionExtractionInvalidRunStateError(
                    "Question extraction run is not running."
                )

            run.status = QuestionExtractionRunStatus.FAILED
            run.completed_at = utc_now()
            run.failure_message = normalized_message

            self.db.commit()
            return run

        except Exception:
            self.db.rollback()
            raise
