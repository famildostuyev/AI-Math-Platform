from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class GeometryBlockContent(Base):
    __tablename__ = "geometry_block_contents"

    __table_args__ = (
        CheckConstraint(
            "format_version > 0",
            name="ck_geometry_block_contents_format_version_positive",
        ),
        CheckConstraint(
            "jsonb_typeof(source_data) = 'object'",
            name="ck_geometry_block_contents_source_data_object",
        ),
    )

    content_block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_blocks.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
    )

    source_data: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
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
        back_populates="geometry_content",
    )
