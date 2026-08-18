from __future__ import annotations

import uuid
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.media_asset import MediaAsset
from app.models.question_source import QuestionSource
from app.models.source_document import SourceDocument
from app.models.user import User
from app.schemas.source_document import (
    SourceDocumentMediaAssetRead,
    SourceDocumentRead,
)
from app.services.source_binary_service import (
    PreparedSourceBinary,
    SourceBinaryCleanupError,
    SourceBinaryService,
)


class SourceIngestionServiceError(Exception):
    """Base exception for atomic source-ingestion failures."""


class SourceIngestionValidationError(SourceIngestionServiceError):
    """Raised when trusted scalar ingestion input is invalid."""


class SourceIngestionUploaderNotFoundError(SourceIngestionServiceError):
    """Raised when the active uploading user is unavailable."""


class SourceIngestionQuestionSourceNotFoundError(SourceIngestionServiceError):
    """Raised when requested active QuestionSource metadata is unavailable."""


class SourceIngestionPersistenceConflictError(SourceIngestionServiceError):
    """Raised when source persistence encounters an integrity conflict."""


class SourceIngestionCompensationError(SourceIngestionServiceError):
    """Raised when rollback succeeds but prepared-file cleanup fails."""

    def __init__(
        self,
        message: str,
        *,
        original_error: Exception,
        cleanup_error: SourceBinaryCleanupError,
    ) -> None:
        super().__init__(message)
        self.original_error = original_error
        self.cleanup_error = cleanup_error


class SourceIngestionService:
    """Atomically register one prepared binary as a source document."""

    def __init__(
        self,
        db: Session,
        *,
        binary_service: SourceBinaryService | None = None,
    ) -> None:
        self.db = db
        self.binary_service = binary_service or SourceBinaryService()

    @staticmethod
    def _validate_ids(
        *,
        uploaded_by_user_id: uuid.UUID,
        question_source_id: uuid.UUID | None,
    ) -> None:
        if not isinstance(uploaded_by_user_id, uuid.UUID):
            raise SourceIngestionValidationError(
                "Uploading user ID must be a UUID."
            )
        if question_source_id is not None and not isinstance(
            question_source_id, uuid.UUID,
        ):
            raise SourceIngestionValidationError(
                "Question source ID must be a UUID or null."
            )

    def _require_active_uploader(self, uploaded_by_user_id: uuid.UUID) -> None:
        uploader_id = self.db.scalar(
            select(User.id).where(
                User.id == uploaded_by_user_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        if uploader_id is None:
            raise SourceIngestionUploaderNotFoundError(
                "Active uploading user was not found."
            )

    def _require_active_question_source(
        self, question_source_id: uuid.UUID,
    ) -> None:
        source_id = self.db.scalar(
            select(QuestionSource.id).where(
                QuestionSource.id == question_source_id,
                QuestionSource.is_active.is_(True),
                QuestionSource.deleted_at.is_(None),
            )
        )
        if source_id is None:
            raise SourceIngestionQuestionSourceNotFoundError(
                "Active question source was not found."
            )

    def create_source_document(
        self,
        *,
        upload: BinaryIO,
        original_filename: str | None,
        submitted_mime_type: str | None,
        question_source_id: uuid.UUID | None,
        uploaded_by_user_id: uuid.UUID,
    ) -> SourceDocumentRead:
        """Prepare and atomically persist one immutable source document."""

        prepared: PreparedSourceBinary | None = None
        committed = False
        try:
            self._validate_ids(
                uploaded_by_user_id=uploaded_by_user_id,
                question_source_id=question_source_id,
            )
            self._require_active_uploader(uploaded_by_user_id)
            if question_source_id is not None:
                self._require_active_question_source(question_source_id)

            prepared = self.binary_service.prepare_source_binary(
                upload=upload,
                original_filename=original_filename,
                submitted_mime_type=submitted_mime_type,
            )
            media_asset = MediaAsset(
                storage_key=prepared.storage_key,
                mime_type=prepared.mime_type,
                original_filename=prepared.original_filename,
                size_bytes=prepared.size_bytes,
                sha256=prepared.sha256,
                width_px=prepared.width_px,
                height_px=prepared.height_px,
            )
            self.db.add(media_asset)
            self.db.flush()

            source_document = SourceDocument(
                media_asset_id=media_asset.id,
                question_source_id=question_source_id,
                uploaded_by_user_id=uploaded_by_user_id,
            )
            self.db.add(source_document)
            self.db.flush()

            response = SourceDocumentRead(
                id=source_document.id,
                media_asset_id=media_asset.id,
                question_source_id=source_document.question_source_id,
                uploaded_by_user_id=source_document.uploaded_by_user_id,
                created_at=source_document.created_at,
                media_asset=SourceDocumentMediaAssetRead(
                    id=media_asset.id,
                    original_filename=media_asset.original_filename,
                    mime_type=media_asset.mime_type,
                    size_bytes=media_asset.size_bytes,
                    width_px=media_asset.width_px,
                    height_px=media_asset.height_px,
                    created_at=media_asset.created_at,
                ),
            )
            self.db.commit()
            committed = True
            return response
        except IntegrityError as exc:
            self.db.rollback()
            self._compensate(prepared, original_error=exc)
            raise SourceIngestionPersistenceConflictError(
                "Source document could not be persisted."
            ) from exc
        except Exception as exc:
            if not committed:
                self.db.rollback()
                self._compensate(prepared, original_error=exc)
            raise

    def _compensate(
        self,
        prepared: PreparedSourceBinary | None,
        *,
        original_error: Exception,
    ) -> None:
        if prepared is None:
            return
        try:
            self.binary_service.cleanup_prepared(prepared)
        except SourceBinaryCleanupError as cleanup_error:
            raise SourceIngestionCompensationError(
                "Prepared source cleanup failed after ingestion rollback.",
                original_error=original_error,
                cleanup_error=cleanup_error,
            ) from cleanup_error
