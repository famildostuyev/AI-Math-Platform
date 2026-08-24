from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.media_asset import MediaAsset
from app.models.source_document import SourceDocument
from app.schemas.source_document import (
    SourceDocumentMediaAssetRead,
    SourceDocumentRead,
)


class SourceDocumentReadServiceError(Exception):
    """Base exception for source-document read failures."""


class SourceDocumentReadService:
    """Read-only projections for active source documents."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_documents(self) -> tuple[SourceDocumentRead, ...]:
        """Return all active source documents, newest first."""

        rows = self.db.execute(
            select(SourceDocument, MediaAsset)
            .join(
                MediaAsset,
                MediaAsset.id == SourceDocument.media_asset_id,
            )
            .where(
                SourceDocument.deleted_at.is_(None),
                MediaAsset.deleted_at.is_(None),
            )
            .order_by(
                SourceDocument.created_at.desc(),
                SourceDocument.id.desc(),
            )
        ).all()

        return tuple(
            SourceDocumentRead(
                id=source_document.id,
                media_asset_id=source_document.media_asset_id,
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
            for source_document, media_asset in rows
        )