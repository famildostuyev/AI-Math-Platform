from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.group_grade import GroupGrade
    from app.models.group_member import GroupMember


class Grade(BaseModel):
    __tablename__ = "grades"

    name: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    display_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    group_grades: Mapped[list["GroupGrade"]] = relationship(
        "GroupGrade",
        back_populates="grade",
        cascade="all, delete-orphan",
    )

    group_members: Mapped[list["GroupMember"]] = relationship(
        "GroupMember",
        back_populates="grade",
    )