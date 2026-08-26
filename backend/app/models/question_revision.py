from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    QuestionDifficulty,
    QuestionRevisionProvenanceKind,
    QuestionRevisionStatus,
)
from app.database.base_model import BaseModel


class QuestionRevision(BaseModel):
    __tablename__ = "question_revisions"

    __table_args__ = (
        CheckConstraint(
            "revision_number > 0",
            name="ck_question_revisions_number_positive",
        ),
        UniqueConstraint(
            "question_form_id",
            "revision_number",
            name="uq_question_revisions_form_id_number",
        ),
        CheckConstraint(
            "based_on_revision_id IS NULL OR based_on_revision_id <> id",
            name="ck_question_revisions_base_not_self",
        ),
        CheckConstraint(
            "NOT is_current_approved OR status = 'approved'",
            name="ck_question_revisions_current_requires_approved",
        ),
        CheckConstraint(
            "status <> 'approved' OR ("
            "primary_topic_id IS NOT NULL "
            "AND difficulty IS NOT NULL "
            "AND reviewed_by_user_id IS NOT NULL "
            "AND reviewed_at IS NOT NULL)",
            name="ck_question_revisions_approved_complete",
        ),
        Index(
            "uq_question_revisions_one_current_approved_per_form",
            "question_form_id",
            unique=True,
            postgresql_where=text("is_current_approved = true"),
        ),
    )

    question_form_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_forms.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    revision_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    based_on_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_revisions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    status: Mapped[QuestionRevisionStatus] = mapped_column(
        SQLEnum(
            QuestionRevisionStatus,
            name="question_revision_status",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    provenance_kind: Mapped[QuestionRevisionProvenanceKind] = mapped_column(
        SQLEnum(
            QuestionRevisionProvenanceKind,
            name="question_revision_provenance_kind",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    difficulty: Mapped[QuestionDifficulty | None] = mapped_column(
        SQLEnum(
            QuestionDifficulty,
            name="question_difficulty",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=True,
    )

    primary_topic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("topics.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    is_current_approved: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )

    question_form: Mapped["QuestionForm"] = relationship(
        "QuestionForm",
        foreign_keys=[question_form_id],
    )

    primary_topic: Mapped["Topic | None"] = relationship(
        "Topic",
        foreign_keys=[primary_topic_id],
    )

    created_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[created_by_user_id],
    )

    reviewed_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[reviewed_by_user_id],
    )

    based_on_revision: Mapped["QuestionRevision | None"] = relationship(
        "QuestionRevision",
        remote_side="QuestionRevision.id",
        foreign_keys=[based_on_revision_id],
        back_populates="derived_revisions",
    )

    derived_revisions: Mapped[list["QuestionRevision"]] = relationship(
        "QuestionRevision",
        foreign_keys="QuestionRevision.based_on_revision_id",
        back_populates="based_on_revision",
        passive_deletes=True,
    )

    content_blocks: Mapped[list["ContentBlock"]] = relationship(
        "ContentBlock",
        back_populates="question_revision",
        order_by="ContentBlock.sort_order",
        passive_deletes=True,
    )

    answer_options: Mapped[list["AnswerOption"]] = relationship(
        "AnswerOption",
        back_populates="revision",
        order_by="AnswerOption.order_index",
        passive_deletes=True,
    )

    accepted_answers: Mapped[list["AcceptedAnswer"]] = relationship(
        "AcceptedAnswer",
        back_populates="revision",
        order_by="AcceptedAnswer.order_index",
        passive_deletes=True,
    )
