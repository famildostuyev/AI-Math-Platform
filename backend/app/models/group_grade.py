from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.grade import Grade
    from app.models.group import Group


class GroupGrade(BaseModel):
    __tablename__ = "group_grades"

    __table_args__ = (
        UniqueConstraint(
            "group_id",
            "grade_id",
            name="uq_group_grades_group_id_grade_id",
        ),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    grade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("grades.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    group: Mapped["Group"] = relationship(
        "Group",
        back_populates="grades",
    )

    grade: Mapped["Grade"] = relationship(
        "Grade",
        back_populates="group_grades",
    )