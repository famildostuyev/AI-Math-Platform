from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import VerificationChannel, VerificationPurpose
from app.database.base_model import BaseModel

if TYPE_CHECKING:
    from app.models.user import User


def _enum_values(enum_class: type) -> list[str]:
    """
    Persist string enum values instead of Python member names.
    """

    return [member.value for member in enum_class]


class VerificationChallenge(BaseModel):
    """
    Stores short-lived verification challenges.

    This model supports reusable verification workflows such as:

    - email verification;
    - phone verification;
    - password reset;
    - email change;
    - phone change;
    - multi-factor authentication;
    - passwordless login.

    Verification codes must never be stored in plaintext.
    """

    __tablename__ = "verification_challenges"

    __table_args__ = (
        CheckConstraint(
            "send_count >= 0",
            name="ck_verification_challenges_send_count_non_negative",
        ),
        CheckConstraint(
            "failed_attempts >= 0",
            name="ck_verification_challenges_failed_attempts_non_negative",
        ),
        Index(
            "ix_verification_challenges_user_purpose_created_at",
            "user_id",
            "purpose",
            "created_at",
        ),
        Index(
            "ix_verification_challenges_destination_purpose_created_at",
            "destination",
            "purpose",
            "created_at",
        ),
        Index(
            "ix_verification_challenges_expires_at",
            "expires_at",
        ),
        Index(
            "ix_verification_challenges_active_lookup",
            "user_id",
            "purpose",
            "channel",
            postgresql_where=text(
                "consumed_at IS NULL AND invalidated_at IS NULL"
            ),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    channel: Mapped[VerificationChannel] = mapped_column(
        Enum(
            VerificationChannel,
            name="verification_channel",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )

    purpose: Mapped[VerificationPurpose] = mapped_column(
        Enum(
            VerificationPurpose,
            name="verification_purpose",
            values_callable=_enum_values,
            validate_strings=True,
        ),
        nullable=False,
    )

    destination: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    code_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    last_sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    send_count: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text("1"),
        nullable=False,
    )

    failed_attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default=text("0"),
        nullable=False,
    )

    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    invalidated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    user: Mapped["User"] = relationship(
        "User",
        back_populates="verification_challenges",
    )