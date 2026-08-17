from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.media_asset import MediaAsset
    from app.models.question_source import QuestionSource
    from app.models.user import User


class SourceDocument(BaseModel):
    """Identity for one concrete original document registered for ingestion."""

    __tablename__ = "source_documents"

    __table_args__ = (
        UniqueConstraint(
            "media_asset_id",
            name="uq_source_documents_media_asset_id",
        ),
    )

    media_asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="RESTRICT"),
        nullable=False,
    )

    question_source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_sources.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    media_asset: Mapped["MediaAsset"] = relationship(
        "MediaAsset",
        foreign_keys=[media_asset_id],
    )

    question_source: Mapped["QuestionSource | None"] = relationship(
        "QuestionSource",
        foreign_keys=[question_source_id],
    )

    uploaded_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[uploaded_by_user_id],
    )
