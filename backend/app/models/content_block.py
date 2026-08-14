from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, Enum as SQLEnum, ForeignKey, Index, Integer, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ContentBlockType
from app.database.base_model import BaseModel


class ContentBlock(BaseModel):
    __tablename__ = "content_blocks"

    __table_args__ = (
        CheckConstraint(
            "sort_order >= 0",
            name="ck_content_blocks_sort_order_non_negative",
        ),
        Index(
            "ix_content_blocks_revision_sort_order",
            "question_revision_id",
            "sort_order",
        ),
        Index(
            "uq_content_blocks_active_revision_sort_order",
            "question_revision_id",
            "sort_order",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    question_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_revisions.id", ondelete="RESTRICT"),
        nullable=False,
    )

    block_type: Mapped[ContentBlockType] = mapped_column(
        SQLEnum(
            ContentBlockType,
            name="content_block_type",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    question_revision: Mapped["QuestionRevision"] = relationship(
        "QuestionRevision",
        foreign_keys=[question_revision_id],
        back_populates="content_blocks",
    )

    text_content: Mapped["TextBlockContent | None"] = relationship(
        "TextBlockContent",
        back_populates="content_block",
        uselist=False,
        passive_deletes=True,
    )

    formula_content: Mapped["FormulaBlockContent | None"] = relationship(
        "FormulaBlockContent",
        back_populates="content_block",
        uselist=False,
        passive_deletes=True,
    )
