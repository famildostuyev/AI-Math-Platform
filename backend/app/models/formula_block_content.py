from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class FormulaBlockContent(Base):
    __tablename__ = "formula_block_contents"

    __table_args__ = (
        CheckConstraint(
            "format_version > 0",
            name="ck_formula_block_contents_format_version_positive",
        ),
    )

    content_block_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("content_blocks.id", ondelete="RESTRICT"),
        primary_key=True,
        nullable=False,
    )

    source_latex: Mapped[str] = mapped_column(
        Text,
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
        back_populates="formula_content",
    )
