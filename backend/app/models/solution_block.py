from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, Enum as SQLEnum, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import SolutionBlockType
from app.database.base_model import BaseModel


class SolutionBlock(BaseModel):
    __tablename__ = "solution_blocks"
    __table_args__ = (
        CheckConstraint("sort_order > 0", name="ck_solution_blocks_sort_order_positive"),
        CheckConstraint("format_version > 0", name="ck_solution_blocks_format_version_positive"),
        CheckConstraint(
            "document_data IS NULL OR jsonb_typeof(document_data) = 'object'",
            name="ck_solution_blocks_document_data_object_or_null",
        ),
        CheckConstraint(
            "(block_type = 'text' AND source_text IS NOT NULL AND document_data IS NOT NULL AND source_latex IS NULL) "
            "OR (block_type = 'formula' AND source_text IS NULL AND document_data IS NULL AND source_latex IS NOT NULL)",
            name="ck_solution_blocks_payload_matches_type",
        ),
        Index("ix_solution_blocks_solution_sort_order", "solution_id", "sort_order"),
        Index(
            "uq_solution_blocks_active_solution_order",
            "solution_id", "sort_order", unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    solution_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("solutions.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    block_type: Mapped[SolutionBlockType] = mapped_column(
        SQLEnum(
            SolutionBlockType,
            name="solution_block_type",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    document_data: Mapped[dict[str, object] | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    source_latex: Mapped[str | None] = mapped_column(Text, nullable=True)
    format_version: Mapped[int] = mapped_column(
        Integer, server_default=text("1"), nullable=False
    )

    solution: Mapped["Solution"] = relationship("Solution", back_populates="blocks")
