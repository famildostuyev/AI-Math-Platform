from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class ImageBlockContent(Base):
    __tablename__ = "image_block_contents"

    content_block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_blocks.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
    )

    media_asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media_assets.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    alt_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    content_block: Mapped["ContentBlock"] = relationship(
        "ContentBlock",
        foreign_keys=[content_block_id],
        back_populates="image_content",
    )

    media_asset: Mapped["MediaAsset"] = relationship(
        "MediaAsset",
        foreign_keys=[media_asset_id],
        back_populates="image_block_contents",
    )
