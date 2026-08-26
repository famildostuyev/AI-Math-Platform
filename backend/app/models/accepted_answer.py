from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel


class AcceptedAnswer(BaseModel):
    __tablename__ = "accepted_answers"
    __table_args__ = (
        CheckConstraint("order_index > 0", name="ck_accepted_answers_order_positive"),
        CheckConstraint("format_version > 0", name="ck_accepted_answers_format_version_positive"),
        CheckConstraint(
            "jsonb_typeof(document_data) = 'object'",
            name="ck_accepted_answers_document_data_object",
        ),
        Index(
            "uq_accepted_answers_active_revision_order",
            "revision_id", "order_index", unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_revisions.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    document_data: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    format_version: Mapped[int] = mapped_column(Integer, server_default=text("1"), nullable=False)

    revision: Mapped["QuestionRevision"] = relationship(
        "QuestionRevision", foreign_keys=[revision_id], back_populates="accepted_answers"
    )
