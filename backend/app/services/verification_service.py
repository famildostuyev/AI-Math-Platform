from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta
from typing import Final

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.enums import VerificationChannel, VerificationPurpose
from app.core.security import utc_now
from app.models.user import User
from app.models.verification_challenge import VerificationChallenge


class VerificationServiceError(Exception):
    """Base exception for verification-service failures."""


class VerificationChallengeNotFoundError(VerificationServiceError):
    """Raised when a verification challenge cannot be found."""


class VerificationChallengeExpiredError(VerificationServiceError):
    """Raised when a verification challenge has expired."""


class VerificationChallengeConsumedError(VerificationServiceError):
    """Raised when a verification challenge has already been consumed."""


class VerificationChallengeInvalidatedError(VerificationServiceError):
    """Raised when a verification challenge has been invalidated."""


class InvalidVerificationCodeError(VerificationServiceError):
    """Raised when a verification code is incorrect."""


class VerificationAttemptsExceededError(VerificationServiceError):
    """Raised after too many incorrect verification attempts."""


class VerificationUserNotFoundError(VerificationServiceError):
    """Raised when the challenge owner cannot be found."""


class VerificationPurposeMismatchError(VerificationServiceError):
    """Raised when a challenge purpose cannot verify the selected contact."""


class VerificationService:
    """
    Handles creation, validation, and consumption of verification challenges.

    Transaction boundaries are intentionally controlled by AuthService.
    This service flushes changes but does not commit or roll back.
    """

    DEFAULT_CODE_LENGTH: Final[int] = 6
    MIN_CODE_LENGTH: Final[int] = 4
    MAX_CODE_LENGTH: Final[int] = 10
    DEFAULT_MAX_FAILED_ATTEMPTS: Final[int] = 5

    def __init__(self, db: Session) -> None:
        self.db = db

    @classmethod
    def generate_code(cls, length: int = DEFAULT_CODE_LENGTH) -> str:
        """Generate a cryptographically secure numeric verification code."""

        if not cls.MIN_CODE_LENGTH <= length <= cls.MAX_CODE_LENGTH:
            raise ValueError(
                "Verification code length must be between "
                f"{cls.MIN_CODE_LENGTH} and {cls.MAX_CODE_LENGTH} digits."
            )

        upper_bound = 10**length
        value = secrets.randbelow(upper_bound)

        return f"{value:0{length}d}"

    @staticmethod
    def hash_code(code: str) -> str:
        """Return the HMAC-SHA256 hash of a verification code."""

        normalized_code = code.strip()

        return hmac.new(
            settings.VERIFICATION_CODE_HASH_KEY.encode("utf-8"),
            normalized_code.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @staticmethod
    def verify_code(code: str, code_hash: str) -> bool:
        """Compare a plaintext verification code against its stored hash."""

        return hmac.compare_digest(
            VerificationService.hash_code(code),
            code_hash,
        )

    @staticmethod
    def _code_length() -> int:
        """Read the configured code length while retaining a safe default."""

        return int(
            getattr(
                settings,
                "VERIFICATION_CODE_LENGTH",
                VerificationService.DEFAULT_CODE_LENGTH,
            )
        )

    @staticmethod
    def _max_failed_attempts() -> int:
        """Read the configured attempt limit while retaining a safe default."""

        configured_value = getattr(
            settings,
            "VERIFICATION_MAX_FAILED_ATTEMPTS",
            getattr(
                settings,
                "VERIFICATION_CODE_MAX_ATTEMPTS",
                VerificationService.DEFAULT_MAX_FAILED_ATTEMPTS,
            ),
        )

        return max(1, int(configured_value))

    def invalidate_previous_challenges(
        self,
        *,
        user_id: uuid.UUID,
        purpose: VerificationPurpose,
        channel: VerificationChannel | None = None,
    ) -> int:
        """
        Invalidate active earlier challenges for the same workflow.

        Returns the number of challenges invalidated.
        """

        now = utc_now()

        statement = (
            select(VerificationChallenge)
            .where(
                VerificationChallenge.user_id == user_id,
                VerificationChallenge.purpose == purpose,
                VerificationChallenge.consumed_at.is_(None),
                VerificationChallenge.invalidated_at.is_(None),
                VerificationChallenge.deleted_at.is_(None),
            )
            .with_for_update()
        )

        if channel is not None:
            statement = statement.where(
                VerificationChallenge.channel == channel,
            )

        challenges = list(self.db.scalars(statement).all())

        for challenge in challenges:
            challenge.invalidated_at = now

        if challenges:
            self.db.flush()

        return len(challenges)

    def create_challenge(
        self,
        *,
        user_id: uuid.UUID,
        channel: VerificationChannel,
        purpose: VerificationPurpose,
        destination: str,
    ) -> tuple[VerificationChallenge, str]:
        """
        Create and persist a new verification challenge.

        The plaintext code is returned once for notification delivery. Only
        its HMAC hash is stored in the database.
        """

        normalized_destination = destination.strip()

        if not normalized_destination:
            raise ValueError("Verification destination cannot be empty.")

        self.invalidate_previous_challenges(
            user_id=user_id,
            purpose=purpose,
            channel=channel,
        )

        now = utc_now()
        verification_code = self.generate_code(self._code_length())

        challenge = VerificationChallenge(
            user_id=user_id,
            channel=channel,
            purpose=purpose,
            destination=normalized_destination,
            code_hash=self.hash_code(verification_code),
            expires_at=now
            + timedelta(
                minutes=settings.VERIFICATION_CODE_EXPIRE_MINUTES,
            ),
            last_sent_at=now,
            send_count=1,
            failed_attempts=0,
        )

        self.db.add(challenge)
        self.db.flush()

        return challenge, verification_code

    def verify_challenge(
        self,
        *,
        challenge_id: uuid.UUID,
        code: str,
    ) -> VerificationChallenge:
        """
        Validate a verification code and consume its challenge.

        Failed attempts are flushed so AuthService can decide whether to
        commit or roll back the surrounding transaction.
        """

        statement = (
            select(VerificationChallenge)
            .where(
                VerificationChallenge.id == challenge_id,
                VerificationChallenge.deleted_at.is_(None),
            )
            .with_for_update()
        )

        challenge = self.db.scalar(statement)

        if challenge is None:
            raise VerificationChallengeNotFoundError(
                "Verification challenge was not found."
            )

        if challenge.consumed_at is not None:
            raise VerificationChallengeConsumedError(
                "Verification challenge has already been used."
            )

        if challenge.invalidated_at is not None:
            raise VerificationChallengeInvalidatedError(
                "Verification challenge is no longer valid."
            )

        now = utc_now()

        if challenge.expires_at <= now:
            challenge.invalidated_at = now
            self.db.flush()

            raise VerificationChallengeExpiredError(
                "Verification challenge has expired."
            )

        if not self.verify_code(code, challenge.code_hash):
            challenge.failed_attempts += 1

            if challenge.failed_attempts >= self._max_failed_attempts():
                challenge.invalidated_at = now
                self.db.flush()

                raise VerificationAttemptsExceededError(
                    "Maximum verification attempts exceeded."
                )

            self.db.flush()

            raise InvalidVerificationCodeError(
                "Verification code is invalid."
            )

        challenge.consumed_at = now
        self.db.flush()

        return challenge

    def mark_user_verified(
        self,
        *,
        challenge: VerificationChallenge,
    ) -> User:
        """Mark the challenge owner's email address or phone as verified."""

        statement = (
            select(User)
            .where(
                User.id == challenge.user_id,
                User.deleted_at.is_(None),
            )
            .with_for_update()
        )

        user = self.db.scalar(statement)

        if user is None:
            raise VerificationUserNotFoundError(
                "Verification challenge owner was not found."
            )

        if challenge.purpose == VerificationPurpose.VERIFY_EMAIL:
            if (
                user.email is None
                or user.email.lower() != challenge.destination.lower()
            ):
                raise VerificationPurposeMismatchError(
                    "Verification challenge does not match the user's email."
                )

            user.is_email_verified = True

        elif challenge.purpose == VerificationPurpose.VERIFY_PHONE:
            if (
                user.phone is None
                or user.phone != challenge.destination
            ):
                raise VerificationPurposeMismatchError(
                    "Verification challenge does not match the user's phone."
                )

            user.is_phone_verified = True

        else:
            raise VerificationPurposeMismatchError(
                "Challenge purpose cannot be used for contact verification."
            )

        self.db.flush()

        return user