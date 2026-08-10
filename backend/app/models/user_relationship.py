from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RelationshipStatus, RelationshipType
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.user import User


class UserRelationship(BaseModel):
    __tablename__ = "user_relationships"

    __table_args__ = (
        Index(
            "uq_user_relationships_without_context",
            "requester_id",
            "recipient_id",
            "relationship_type",
            unique=True,
            postgresql_where=text("context_student_id IS NULL"),
        ),
        Index(
            "uq_user_relationships_with_context",
            "requester_id",
            "recipient_id",
            "relationship_type",
            "context_student_id",
            unique=True,
            postgresql_where=text("context_student_id IS NOT NULL"),
        ),
    )

    requester_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    recipient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    context_student_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    blocked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    relationship_type: Mapped[RelationshipType] = mapped_column(
        SQLEnum(
            RelationshipType,
            name="relationship_type",
            native_enum=False,
        ),
        nullable=False,
        index=True,
    )

    status: Mapped[RelationshipStatus] = mapped_column(
        SQLEnum(
            RelationshipStatus,
            name="relationship_status",
            native_enum=False,
        ),
        default=RelationshipStatus.PENDING,
        nullable=False,
        index=True,
    )

    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    requester: Mapped["User"] = relationship(
        "User",
        foreign_keys=[requester_id],
        back_populates="sent_relationships",
    )

    recipient: Mapped["User"] = relationship(
        "User",
        foreign_keys=[recipient_id],
        back_populates="received_relationships",
    )

    context_student: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[context_student_id],
    )

    blocked_by: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[blocked_by_id],
    )