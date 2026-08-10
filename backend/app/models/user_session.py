from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.user import User


class UserSession(BaseModel):
    __tablename__ = "user_sessions"

    __table_args__ = (
        CheckConstraint(
            "expires_at > issued_at",
            name="ck_user_sessions_expiry_after_issue",
        ),
        CheckConstraint(
            "rotation_counter >= 0",
            name="ck_user_sessions_rotation_counter_non_negative",
        ),
        Index(
            "ix_user_sessions_user_id_family_id",
            "user_id",
            "family_id",
        ),
        Index(
            "ix_user_sessions_user_id_revoked_at",
            "user_id",
            "revoked_at",
        ),
        Index(
            "ix_user_sessions_family_id_revoked_at",
            "family_id",
            "revoked_at",
        ),
        Index(
            "ix_user_sessions_expires_at",
            "expires_at",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        default=uuid.uuid4,
        nullable=False,
        index=True,
    )

    refresh_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    parent_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    replaced_by_session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    rotation_counter: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )

    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now().astimezone(),
        server_default=func.now(),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    revocation_reason: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    reuse_detected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )

    last_used_ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )

    user_agent: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    device_name: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="sessions",
        foreign_keys=[user_id],
    )

    parent_session: Mapped["UserSession | None"] = relationship(
        "UserSession",
        foreign_keys=[parent_session_id],
        remote_side="UserSession.id",
        post_update=True,
    )

    replacement_session: Mapped["UserSession | None"] = relationship(
        "UserSession",
        foreign_keys=[replaced_by_session_id],
        remote_side="UserSession.id",
        post_update=True,
    )

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def has_reuse_detected(self) -> bool:
        return self.reuse_detected_at is not None