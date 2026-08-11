from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Final

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.enums import VerificationChannel, VerificationPurpose
from app.core.security import (
    create_access_token,
    hash_password,
    utc_now,
    verify_and_update_password,
    verify_password,
)
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.models.user_session import UserSession
from app.schemas.auth import (
    RegisterRequest,
    RegisterResponse,
    VerifyRequest,
    VerifyResponse,
)
from app.schemas.token import TokenResponse
from app.services.session_service import (
    REVOCATION_REASON_LOGOUT,
    REVOCATION_REASON_LOGOUT_ALL,
    REVOCATION_REASON_SECURITY,
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenReuseDetectedError,
    RefreshTokenRevokedError,
    SessionNotFoundError,
    create_session,
    revoke_all_user_sessions,
    revoke_session_by_id,
    revoke_token_family,
    rotate_refresh_token,
)
from app.services.notification_service import NotificationService
from app.services.verification_service import VerificationService
_DUMMY_PASSWORD_HASH: Final[str] = hash_password(
    "dummy-password-used-for-timing-protection"
)


class AuthServiceError(Exception):
    """Base exception for authentication-service failures."""


class RegistrationConflictError(AuthServiceError):
    """Raised when registration data conflicts with an existing account."""


class RegistrationRoleUnavailableError(AuthServiceError):
    """Raised when the requested public registration role is unavailable."""


class InvalidCredentialsError(AuthServiceError):
    """Raised when the supplied login credentials are invalid."""


class AccountInactiveError(AuthServiceError):
    """Raised when a user account is inactive."""


class AccountUnverifiedError(AuthServiceError):
    """Raised when a user account has not completed verification."""


class AccountLockedError(AuthServiceError):
    """Raised when a user account is temporarily locked."""

    def __init__(
        self,
        *,
        locked_until: datetime,
    ) -> None:
        self.locked_until = locked_until

        super().__init__(
            "User account is temporarily locked."
        )


class InvalidRefreshTokenError(AuthServiceError):
    """Raised when a refresh token cannot be accepted."""


class AuthenticationSessionError(AuthServiceError):
    """Raised when an authentication session is invalid."""


class AuthService:
    """
    Application service responsible for authentication workflows.

    Responsibilities:

    - public user registration;
    - initial role assignment;
    - user authentication;
    - failed-login protection;
    - account lockout;
    - password-hash upgrades;
    - access-token creation;
    - refresh-token session creation;
    - refresh-token rotation;
    - current-session logout;
    - all-device logout.

    SessionService handles low-level session operations. AuthService
    controls transaction boundaries and business rules.
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self.notification_service = NotificationService()
        self.verification_service = VerificationService(db)

    @staticmethod
    def _normalize_identifier(
        identifier: str,
    ) -> str:
        """
        Normalize an email address or phone number used for login.
        """

        normalized = identifier.strip()

        if not normalized:
            raise InvalidCredentialsError(
                "Invalid credentials."
            )

        if "@" in normalized:
            return normalized.lower()

        return normalized

    def _find_user_for_authentication(
        self,
        *,
        identifier: str,
        lock_for_update: bool = True,
    ) -> User | None:
        """
        Retrieve a non-deleted user by normalized email or phone.

        A row lock is used during login so concurrent failed attempts
        cannot overwrite each other's counters.
        """

        if "@" in identifier:
            condition = (
                func.lower(User.email) == identifier.lower()
            )
        else:
            condition = User.phone == identifier

        statement = select(User).where(
            condition,
            User.deleted_at.is_(None),
        )

        if lock_for_update:
            statement = statement.with_for_update()

        return self.db.scalar(statement)

    @staticmethod
    def _is_account_locked(
        user: User,
        *,
        now: datetime,
    ) -> bool:
        """
        Return True when the account lock has not expired.
        """

        return (
            user.locked_until is not None
            and user.locked_until > now
        )

    @staticmethod
    def _clear_expired_lock(
        user: User,
        *,
        now: datetime,
    ) -> None:
        """
        Clear an account lock whose deadline has passed.
        """

        if (
            user.locked_until is not None
            and user.locked_until <= now
        ):
            user.locked_until = None
            user.failed_login_attempts = 0

    def _record_failed_login(
        self,
        *,
        user: User,
        now: datetime,
    ) -> datetime | None:
        """
        Increment the failed-login counter.

        When the configured threshold is reached, the account is
        temporarily locked and the failed-attempt counter is reset.

        Returns the lock expiry time when the account becomes locked.
        """

        user.failed_login_attempts += 1

        if (
            user.failed_login_attempts
            < settings.MAX_FAILED_LOGIN_ATTEMPTS
        ):
            return None

        locked_until = now + timedelta(
            minutes=settings.ACCOUNT_LOCK_MINUTES,
        )

        user.locked_until = locked_until
        user.failed_login_attempts = 0

        return locked_until

    def _revoke_oldest_sessions_for_limit(
        self,
        *,
        user_id: uuid.UUID,
    ) -> int:
        """
        Revoke the oldest active sessions when the configured
        per-user session limit has been reached.

        Enough sessions are revoked to leave room for one new login.
        """

        now = utc_now()

        statement = (
            select(UserSession)
            .where(
                UserSession.user_id == user_id,
                UserSession.revoked_at.is_(None),
                UserSession.deleted_at.is_(None),
                UserSession.expires_at > now,
            )
            .order_by(
                UserSession.issued_at.asc(),
                UserSession.id.asc(),
            )
            .with_for_update()
        )

        active_sessions = list(
            self.db.scalars(statement).all()
        )

        number_to_revoke = (
            len(active_sessions)
            - settings.MAX_ACTIVE_SESSIONS_PER_USER
            + 1
        )

        if number_to_revoke <= 0:
            return 0

        for session in active_sessions[:number_to_revoke]:
            session.revoked_at = now
            session.revocation_reason = (
                REVOCATION_REASON_SECURITY
            )

        self.db.flush()

        return number_to_revoke

    @staticmethod
    def _build_token_response(
        *,
        user_id: uuid.UUID,
        session_id: uuid.UUID,
        refresh_token: str,
    ) -> TokenResponse:
        """
        Create a client-facing access and refresh token pair.
        """

        access_token = create_access_token(
            user_id=user_id,
            session_id=session_id,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="Bearer",
        )

    def register(
        self,
        *,
        registration: RegisterRequest,
    ) -> RegisterResponse:
        """
        Create a public user account and assign its initial role.

        Registration does not create an authentication session and does
        not issue tokens. The user must authenticate through login after
        the account has been created.
        """

        email = (
            str(registration.email).lower()
            if registration.email is not None
            else None
        )
        phone = registration.phone_number
        role_name = registration.account_type.value

        conflict_conditions = []

        if email is not None:
            conflict_conditions.append(
                func.lower(User.email) == email
            )

        if phone is not None:
            conflict_conditions.append(User.phone == phone)

        if conflict_conditions:
            existing_user = self.db.scalar(
                select(User).where(
                    or_(*conflict_conditions),
                    User.deleted_at.is_(None),
                )
            )

            if existing_user is not None:
                raise RegistrationConflictError(
                    "An account with the supplied email or phone number "
                    "already exists."
                )

        role = self.db.scalar(
            select(Role).where(
                func.lower(Role.name) == role_name.lower(),
                Role.is_active.is_(True),
                Role.deleted_at.is_(None),
            )
        )

        if role is None:
            raise RegistrationRoleUnavailableError(
                "The requested account type is unavailable."
            )

        user = User(
            first_name=registration.first_name,
            last_name=registration.last_name,
            email=email,
            phone=phone,
            password_hash=hash_password(registration.password),
            is_active=True,
        )

        try:
            self.db.add(user)
            self.db.flush()

            user_role = UserRole(
                user_id=user.id,
                role_id=role.id,
                assigned_by=None,
                is_active=True,
            )

            self.db.add(user_role)
            self.db.flush()

            user.last_active_role_id = role.id

            if email is not None:
                verification_channel = VerificationChannel.EMAIL
                verification_purpose = (
                    VerificationPurpose.VERIFY_EMAIL
                )
                verification_destination = email
            else:
                verification_channel = VerificationChannel.PHONE
                verification_purpose = (
                    VerificationPurpose.VERIFY_PHONE
                )
                verification_destination = phone

            if verification_destination is None:
                raise ValueError(
                    "Registration requires an email address or "
                    "phone number."
                )

            challenge, verification_code = (
                self.verification_service.create_challenge(
                    user_id=user.id,
                    channel=verification_channel,
                    purpose=verification_purpose,
                    destination=verification_destination,
                )
            )

            self.notification_service.send_verification_code(
                channel=verification_channel,
                destination=verification_destination,
                code=verification_code,
            )

            self.db.commit()
            self.db.refresh(user)

            return RegisterResponse(
                user_id=user.id,
                challenge_id=challenge.id,
                first_name=user.first_name,
                last_name=user.last_name,
                account_type=registration.account_type,
                email=user.email,
                phone_number=user.phone,
                is_active=user.is_active,
                message=(
                    "Registration completed successfully. "
                    "Please log in."
                ),
            )
        except IntegrityError as exc:
            self.db.rollback()

            raise RegistrationConflictError(
                "An account with the supplied email or phone number "
                "already exists."
            ) from exc
        except Exception:
            self.db.rollback()
            raise

    def verify(
        self,
        *,
        verification: VerifyRequest,
    ) -> VerifyResponse:
        """
        Verify an email address or phone number using a challenge code.

        Challenge consumption and user verification are committed as one
        atomic transaction. Any failure rolls back the complete operation.
        """

        try:
            challenge = self.verification_service.verify_challenge(
                challenge_id=verification.challenge_id,
                code=verification.code,
            )

            self.verification_service.mark_user_verified(
                challenge=challenge,
            )

            self.db.commit()

            return VerifyResponse(
                success=True,
                message="Contact information verified successfully.",
            )

        except Exception:
            self.db.rollback()
            raise

    def login(
        self,
        *,
        identifier: str,
        password: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
        device_name: str | None = None,
    ) -> TokenResponse:
        """
        Authenticate a user and create a new device session.

        The operation is atomic:

        - credentials are validated;
        - lockout counters are updated;
        - an opaque refresh-token session is created;
        - a JWT access token is issued;
        - all changes are committed together.
        """

        normalized_identifier = (
            self._normalize_identifier(identifier)
        )

        user = self._find_user_for_authentication(
            identifier=normalized_identifier,
            lock_for_update=True,
        )

        if user is None:
            verify_password(
                password,
                _DUMMY_PASSWORD_HASH,
            )

            self.db.rollback()

            raise InvalidCredentialsError(
                "Invalid credentials."
            )

        now = utc_now()

        self._clear_expired_lock(
            user,
            now=now,
        )

        if self._is_account_locked(
            user,
            now=now,
        ):
            locked_until = user.locked_until

            self.db.rollback()

            if locked_until is None:
                raise InvalidCredentialsError(
                    "Invalid credentials."
                )

            raise AccountLockedError(
                locked_until=locked_until,
            )

        password_is_valid, replacement_hash = (
            verify_and_update_password(
                password,
                user.password_hash,
            )
        )

        if not password_is_valid:
            locked_until = self._record_failed_login(
                user=user,
                now=now,
            )

            try:
                self.db.commit()
            except Exception:
                self.db.rollback()
                raise

            if locked_until is not None:
                raise AccountLockedError(
                    locked_until=locked_until,
                )

            raise InvalidCredentialsError(
                "Invalid credentials."
            )

        if not user.is_active:
            self.db.rollback()

            raise AccountInactiveError(
                "User account is inactive."
            )

        if not (
            user.is_email_verified
            or user.is_phone_verified
        ):
            self.db.rollback()

            raise AccountUnverifiedError(
                "User account has not been verified."
            )

        if replacement_hash is not None:
            user.password_hash = replacement_hash

        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = now

        self._revoke_oldest_sessions_for_limit(
            user_id=user.id,
        )

        try:
            issued_session = create_session(
                self.db,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                device_name=device_name,
                issued_at=now,
            )

            tokens = self._build_token_response(
                user_id=user.id,
                session_id=issued_session.session.id,
                refresh_token=issued_session.refresh_token,
            )

            self.db.commit()

            return tokens

        except Exception:
            self.db.rollback()
            raise

    def refresh(
        self,
        *,
        refresh_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
        device_name: str | None = None,
    ) -> TokenResponse:
        """
        Rotate an opaque refresh token and issue a new token pair.

        When reuse of an already-rotated token is detected, the entire
        token family is revoked and that security change is committed.
        """

        try:
            replacement = rotate_refresh_token(
                self.db,
                refresh_token=refresh_token,
                ip_address=ip_address,
                user_agent=user_agent,
                device_name=device_name,
            )

            user_statement = (
                select(User)
                .where(
                    User.id == replacement.session.user_id,
                    User.deleted_at.is_(None),
                )
                .with_for_update()
            )

            user = self.db.scalar(user_statement)

            if user is None:
                revoke_token_family(
                    self.db,
                    family_id=replacement.session.family_id,
                    reason=REVOCATION_REASON_SECURITY,
                )

                self.db.commit()

                raise InvalidRefreshTokenError(
                    "Refresh token is invalid."
                )

            if not user.is_active:
                revoke_token_family(
                    self.db,
                    family_id=replacement.session.family_id,
                    reason=REVOCATION_REASON_SECURITY,
                )

                self.db.commit()

                raise AccountInactiveError(
                    "User account is inactive."
                )

            if not (
                user.is_email_verified
                or user.is_phone_verified
            ):
                revoke_token_family(
                    self.db,
                    family_id=replacement.session.family_id,
                    reason=REVOCATION_REASON_SECURITY,
                )

                self.db.commit()

                raise AccountUnverifiedError(
                    "User account has not been verified."
                )

            tokens = self._build_token_response(
                user_id=user.id,
                session_id=replacement.session.id,
                refresh_token=replacement.refresh_token,
            )

            self.db.commit()

            return tokens

        except RefreshTokenReuseDetectedError:
            self.db.commit()
            raise

        except RefreshTokenExpiredError:
            self.db.commit()

            raise InvalidRefreshTokenError(
                "Refresh token has expired."
            )

        except (
            RefreshTokenNotFoundError,
            RefreshTokenRevokedError,
        ) as exc:
            self.db.rollback()

            raise InvalidRefreshTokenError(
                "Refresh token is invalid."
            ) from exc

        except (
            InvalidRefreshTokenError,
            AccountInactiveError,
            AccountUnverifiedError,
        ):
            raise

        except Exception:
            self.db.rollback()
            raise

    def logout(
        self,
        *,
        user_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> bool:
        """
        Revoke the current authenticated session.

        Returns False when the session does not exist, does not belong
        to the user, or was already revoked.
        """

        try:
            revoked = revoke_session_by_id(
                self.db,
                session_id=session_id,
                user_id=user_id,
                reason=REVOCATION_REASON_LOGOUT,
            )

            self.db.commit()

            return revoked

        except Exception:
            self.db.rollback()
            raise

    def logout_all(
        self,
        *,
        user_id: uuid.UUID,
        exclude_session_id: uuid.UUID | None = None,
    ) -> int:
        """
        Revoke all active sessions belonging to a user.

        exclude_session_id can preserve the current device when that
        behavior is explicitly requested.
        """

        try:
            revoked_count = revoke_all_user_sessions(
                self.db,
                user_id=user_id,
                reason=REVOCATION_REASON_LOGOUT_ALL,
                exclude_session_id=exclude_session_id,
            )

            self.db.commit()

            return revoked_count

        except Exception:
            self.db.rollback()
            raise

    def validate_session(
        self,
        *,
        user_id: uuid.UUID,
        session_id: uuid.UUID,
    ) -> User:
        """
        Validate the user and session represented by an access token.

        This method is intended for the future get_current_user
        dependency.
        """

        statement = (
            select(User)
            .join(
                UserSession,
                UserSession.user_id == User.id,
            )
            .where(
                User.id == user_id,
                UserSession.id == session_id,
                User.deleted_at.is_(None),
                UserSession.deleted_at.is_(None),
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > utc_now(),
            )
        )

        user = self.db.scalar(statement)

        if user is None:
            raise AuthenticationSessionError(
                "Authentication session is invalid."
            )

        if not user.is_active:
            raise AccountInactiveError(
                "User account is inactive."
            )

        if not (
            user.is_email_verified
            or user.is_phone_verified
        ):
            raise AccountUnverifiedError(
                "User account has not been verified."
            )

        return user
