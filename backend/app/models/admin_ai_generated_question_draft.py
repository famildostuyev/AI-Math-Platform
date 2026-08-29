from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Enum as SQLEnum, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AdminAIGeneratedQuestionDraftStatus
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.question_revision import QuestionRevision
    from app.models.user import User


class AdminAIGeneratedQuestionDraft(BaseModel):
    """Non-canonical Admin-owned question draft produced by Admin AI."""

    __tablename__ = "admin_ai_generated_question_drafts"
    __table_args__ = (
        CheckConstraint(
            "draft_kind IN ('question', 'explanation', 'solution', 'lesson_fragment', 'other')",
            name="ck_admin_ai_generated_drafts_kind",
        ),
        CheckConstraint(
            "format_hint IN ('free_form', 'multiple_choice')",
            name="ck_admin_ai_generated_drafts_format_hint",
        ),
        CheckConstraint("is_canonical = false", name="ck_admin_ai_generated_drafts_noncanonical"),
        CheckConstraint("jsonb_typeof(content) = 'object'", name="ck_admin_ai_generated_drafts_content_object"),
        CheckConstraint("jsonb_typeof(answer_options) = 'array'", name="ck_admin_ai_generated_drafts_options_array"),
        CheckConstraint(
            "jsonb_typeof(correct_option_labels) = 'array'",
            name="ck_admin_ai_generated_drafts_correct_labels_array",
        ),
        CheckConstraint(
            "explanation IS NULL OR jsonb_typeof(explanation) = 'object'",
            name="ck_admin_ai_generated_drafts_explanation_object_or_null",
        ),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False, index=True,
    )
    source_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("question_revisions.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    status: Mapped[AdminAIGeneratedQuestionDraftStatus] = mapped_column(
        SQLEnum(
            AdminAIGeneratedQuestionDraftStatus,
            name="admin_ai_generated_question_draft_status",
            native_enum=False, create_constraint=True,
            values_callable=lambda enum_class: [member.value for member in enum_class],
        ),
        default=AdminAIGeneratedQuestionDraftStatus.ACTIVE,
        server_default=text("'active'"), nullable=False, index=True,
    )
    draft_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    format_hint: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[dict[str, object]] = mapped_column(JSONB(none_as_null=True), nullable=False)
    answer_options: Mapped[list[dict[str, object]]] = mapped_column(JSONB(none_as_null=True), nullable=False)
    correct_option_labels: Mapped[list[str]] = mapped_column(JSONB(none_as_null=True), nullable=False)
    explanation: Mapped[dict[str, object] | None] = mapped_column(JSONB(none_as_null=True), nullable=True)
    is_canonical: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False,
    )

    owner_user: Mapped["User"] = relationship("User", foreign_keys=[owner_user_id])
    source_revision: Mapped["QuestionRevision | None"] = relationship(
        "QuestionRevision", foreign_keys=[source_revision_id]
    )
