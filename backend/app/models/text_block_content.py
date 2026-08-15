from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class TextBlockContent(Base):
    __tablename__ = "text_block_contents"

    __table_args__ = (
        CheckConstraint(
            "format_version > 0",
            name="ck_text_block_contents_format_version_positive",
        ),
        CheckConstraint(
            "document_data IS NULL OR jsonb_typeof(document_data) = 'object'",
            name="ck_text_block_contents_document_data_object_or_null",
        ),
    )

    content_block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_blocks.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
    )

    source_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    document_data: Mapped[dict[str, object] | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    format_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text("1"),
        nullable=False,
    )

    content_block: Mapped["ContentBlock"] = relationship(
        "ContentBlock",
        foreign_keys=[content_block_id],
        back_populates="text_content",
    )
