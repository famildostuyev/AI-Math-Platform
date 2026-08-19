from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import QuestionExtractionRunStatus
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.source_document import SourceDocument
    from app.models.user import User


class QuestionExtractionRun(BaseModel):
    """Auditable lifecycle identity for one question extraction attempt."""

    __tablename__ = "question_extraction_runs"

    __table_args__ = (
        CheckConstraint(
            "run_number > 0",
            name="ck_question_extraction_runs_number_positive",
        ),
        CheckConstraint(
            "(status = 'pending' AND started_at IS NULL "
            "AND completed_at IS NULL AND failure_message IS NULL) "
            "OR (status = 'running' AND started_at IS NOT NULL "
            "AND completed_at IS NULL AND failure_message IS NULL) "
            "OR (status = 'succeeded' AND started_at IS NOT NULL "
            "AND completed_at IS NOT NULL AND failure_message IS NULL) "
            "OR (status = 'failed' AND completed_at IS NOT NULL "
            "AND failure_message IS NOT NULL "
            "AND char_length(btrim(failure_message)) > 0)",
            name="ck_question_extraction_runs_lifecycle_consistent",
        ),
        CheckConstraint(
            "started_at IS NULL OR completed_at IS NULL "
            "OR completed_at >= started_at",
            name="ck_question_extraction_runs_time_order",
        ),
        UniqueConstraint(
            "source_document_id",
            "run_number",
            name="uq_question_extraction_runs_document_number",
        ),
    )

    source_document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("source_documents.id", ondelete="RESTRICT"),
        nullable=False,
    )

    run_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    status: Mapped[QuestionExtractionRunStatus] = mapped_column(
        SQLEnum(
            QuestionExtractionRunStatus,
            name="question_extraction_run_status",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda enum_class: [
                member.value for member in enum_class
            ],
        ),
        nullable=False,
    )

    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    failure_message: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    source_document: Mapped["SourceDocument"] = relationship(
        "SourceDocument",
        foreign_keys=[source_document_id],
    )

    requested_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[requested_by_user_id],
    )
