from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel


class QuestionRevisionPurpose(BaseModel):
    __tablename__ = "question_revision_purposes"

    __table_args__ = (
        Index(
            "uq_question_revision_purposes_active_link",
            "question_revision_id",
            "purpose_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    question_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("question_revisions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    purpose_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    question_revision: Mapped["QuestionRevision"] = relationship(
        "QuestionRevision",
        foreign_keys=[question_revision_id],
    )

    purpose: Mapped["Purpose"] = relationship(
        "Purpose",
        foreign_keys=[purpose_id],
    )
