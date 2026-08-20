from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.media_asset import MediaAsset
from app.models.question_extraction_run import QuestionExtractionRun
from app.models.source_document import SourceDocument
from app.services.question_extraction_processor import (
    ResolvedQuestionExtractionSourceBinary,
)
from app.storage.media_storage import LocalMediaStorage, MediaStorageError


class QuestionExtractionSourceServiceError(Exception):
    """Base exception for trusted extraction source-resolution failures."""


class QuestionExtractionSourceValidationError(
    QuestionExtractionSourceServiceError
):
    """Raised when a trusted extraction source-resolution input is invalid."""


class QuestionExtractionSourceMetadataNotFoundError(
    QuestionExtractionSourceServiceError
):
    """Raised when active run, document, or media metadata is unavailable."""


class QuestionExtractionStoredBinaryNotFoundError(
    QuestionExtractionSourceServiceError
):
    """Raised when the immutable stored binary cannot be opened."""


class QuestionExtractionSourceMetadataError(
    QuestionExtractionSourceServiceError
):
    """Raised when persisted source metadata is internally inconsistent."""


class QuestionExtractionSourceResolutionError(
    QuestionExtractionSourceServiceError
):
    """Raised when extraction source metadata cannot be safely resolved."""


class QuestionExtractionSourceService:
    """Resolve one extraction run to confined, read-only source access."""

    def __init__(
        self,
        db: Session,
        *,
        storage: LocalMediaStorage | None = None,
    ) -> None:
        self.db = db
        self.storage = storage or LocalMediaStorage(settings.MEDIA_ROOT)

    @contextmanager
    def open_for_run(
        self,
        *,
        run_id: uuid.UUID,
    ) -> Iterator[ResolvedQuestionExtractionSourceBinary]:
        if not isinstance(run_id, uuid.UUID):
            raise QuestionExtractionSourceValidationError(
                "Question extraction run ID must be a UUID."
            )

        try:
            row = self.db.execute(
                select(
                    QuestionExtractionRun,
                    SourceDocument,
                    MediaAsset,
                )
                .join(
                    SourceDocument,
                    SourceDocument.id
                    == QuestionExtractionRun.source_document_id,
                )
                .join(
                    MediaAsset,
                    MediaAsset.id == SourceDocument.media_asset_id,
                )
                .where(
                    QuestionExtractionRun.id == run_id,
                    QuestionExtractionRun.deleted_at.is_(None),
                    SourceDocument.deleted_at.is_(None),
                    MediaAsset.deleted_at.is_(None),
                )
            ).first()
        except SQLAlchemyError as exc:
            raise QuestionExtractionSourceResolutionError(
                "Source metadata could not be resolved."
            ) from exc

        if row is None:
            raise QuestionExtractionSourceMetadataNotFoundError(
                "Active source metadata was not found."
            )

        run, source_document, media_asset = row

        if (
            run.source_document_id != source_document.id
            or source_document.media_asset_id != media_asset.id
        ):
            raise QuestionExtractionSourceMetadataError(
                "Persisted source metadata is inconsistent."
            )

        if (
            not isinstance(media_asset.mime_type, str)
            or not media_asset.mime_type.strip()
            or not isinstance(media_asset.size_bytes, int)
            or isinstance(media_asset.size_bytes, bool)
            or media_asset.size_bytes <= 0
        ):
            raise QuestionExtractionSourceMetadataError(
                "Persisted source metadata is invalid."
            )

        try:
            stream = self.storage.open_key(media_asset.storage_key)
        except MediaStorageError as exc:
            raise QuestionExtractionStoredBinaryNotFoundError(
                "Stored source binary is unavailable."
            ) from exc

        try:
            yield ResolvedQuestionExtractionSourceBinary(
                source_document_id=source_document.id,
                media_asset_id=media_asset.id,
                mime_type=media_asset.mime_type,
                original_filename=media_asset.original_filename,
                size_bytes=media_asset.size_bytes,
                width_px=media_asset.width_px,
                height_px=media_asset.height_px,
                stream=stream,
            )
        finally:
            stream.close()
