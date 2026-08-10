from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum as SQLEnum, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import GroupMemberCategory
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.group_grade import GroupGrade
    from app.models.group_member import GroupMember
    from app.models.group_purpose import GroupPurpose
    from app.models.user import User


class Group(BaseModel):
    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    owner_teacher_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    member_category: Mapped[GroupMemberCategory] = mapped_column(
        SQLEnum(
            GroupMemberCategory,
            name="group_member_category",
            native_enum=False,
        ),
        nullable=False,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default=text("true"),
        nullable=False,
    )

    owner_teacher: Mapped["User"] = relationship(
        "User",
        foreign_keys=[owner_teacher_id],
    )

    members: Mapped[list["GroupMember"]] = relationship(
        "GroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    grades: Mapped[list["GroupGrade"]] = relationship(
        "GroupGrade",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    purposes: Mapped[list["GroupPurpose"]] = relationship(
        "GroupPurpose",
        back_populates="group",
        cascade="all, delete-orphan",
    )