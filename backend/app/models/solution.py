from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel


class Solution(BaseModel):
    __tablename__ = "solutions"
    __table_args__ = (
        Index(
            "uq_solutions_active_revision",
            "question_revision_id",
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

    question_revision: Mapped["QuestionRevision"] = relationship(
        "QuestionRevision", back_populates="solution"
    )
    blocks: Mapped[list["SolutionBlock"]] = relationship(
        "SolutionBlock",
        back_populates="solution",
        order_by="SolutionBlock.sort_order",
        passive_deletes=True,
    )
