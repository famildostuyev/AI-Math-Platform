from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import GroupMemberRole, GroupMembershipStatus
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.grade import Grade
    from app.models.group import Group
    from app.models.user import User


class GroupMember(BaseModel):
    __tablename__ = "group_members"

    __table_args__ = (
        UniqueConstraint(
            "group_id",
            "user_id",
            name="uq_group_members_group_id_user_id",
        ),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    grade_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("grades.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    member_role: Mapped[GroupMemberRole] = mapped_column(
        SQLEnum(
            GroupMemberRole,
            name="group_member_role",
            native_enum=False,
        ),
        default=GroupMemberRole.MEMBER,
        nullable=False,
        index=True,
    )

    status: Mapped[GroupMembershipStatus] = mapped_column(
        SQLEnum(
            GroupMembershipStatus,
            name="group_membership_status",
            native_enum=False,
        ),
        default=GroupMembershipStatus.PENDING,
        nullable=False,
        index=True,
    )

    joined_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    left_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    group: Mapped["Group"] = relationship(
        "Group",
        back_populates="members",
    )

    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
    )

    grade: Mapped["Grade | None"] = relationship(
        "Grade",
        back_populates="group_members",
    )

    invited_by_user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[invited_by],
    )