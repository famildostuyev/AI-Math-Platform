from __future__ import annotations

import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel


class AnswerOption(BaseModel):
    __tablename__ = "answer_options"
    __table_args__ = (
        CheckConstraint("order_index > 0", name="ck_answer_options_order_positive"),
        CheckConstraint(
            "label IS NULL OR char_length(btrim(label)) > 0",
            name="ck_answer_options_label_nonblank",
        ),
        CheckConstraint("format_version > 0", name="ck_answer_options_format_version_positive"),
        CheckConstraint("source_option_index IS NULL OR source_option_index > 0", name="ck_answer_options_source_option_index_positive"),
        CheckConstraint("(source_extraction_result_id IS NULL AND source_extraction_question_id IS NULL AND source_option_index IS NULL) OR (source_extraction_result_id IS NOT NULL AND source_extraction_question_id IS NOT NULL AND source_option_index IS NOT NULL)", name="ck_answer_options_extraction_identity_complete"),
        CheckConstraint(
            "jsonb_typeof(document_data) = 'object'",
            name="ck_answer_options_document_data_object",
        ),
        Index(
            "uq_answer_options_active_revision_order",
            "revision_id", "order_index", unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "uq_answer_options_active_revision_label",
            "revision_id", "label", unique=True,
            postgresql_where=text("deleted_at IS NULL AND label IS NOT NULL"),
        ),
        Index("uq_answer_options_extraction_mapping", "revision_id", "source_extraction_result_id", "source_extraction_question_id", "source_option_index", unique=True, postgresql_where=text("deleted_at IS NULL AND source_extraction_result_id IS NOT NULL")),
    )

    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_revisions.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    label: Mapped[str | None] = mapped_column(String(50), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    document_data: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    format_version: Mapped[int] = mapped_column(Integer, server_default=text("1"), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), nullable=False)
    source_extraction_result_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("question_extraction_results.id", ondelete="RESTRICT"), nullable=True, index=True)
    source_extraction_question_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_option_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_provenance: Mapped[dict[str, object] | None] = mapped_column(JSONB, nullable=True)

    revision: Mapped["QuestionRevision"] = relationship(
        "QuestionRevision", foreign_keys=[revision_id], back_populates="answer_options"
    )
