from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from sqlalchemy import Select, select, update
from sqlalchemy.orm import Session

from app.core.security import (
    generate_refresh_token,
    get_refresh_token_expiration,
    hash_refresh_token,
    utc_now,
)
from app.models.user_session import UserSession


REVOCATION_REASON_ROTATED: Final[str] = "rotated"
REVOCATION_REASON_LOGOUT: Final[str] = "logout"
REVOCATION_REASON_LOGOUT_ALL: Final[str] = "logout_all"
REVOCATION_REASON_EXPIRED: Final[str] = "expired"
REVOCATION_REASON_REUSE_DETECTED: Final[str] = "refresh_token_reuse"
REVOCATION_REASON_SECURITY: Final[str] = "security_action"


class SessionServiceError(Exception):
    """Base exception for session-management failures."""


class RefreshTokenNotFoundError(SessionServiceError):
    """Raised when a refresh token does not match any stored session."""


class RefreshTokenExpiredError(SessionServiceError):
    """Raised when a refresh token session has expired."""


class RefreshTokenRevokedError(SessionServiceError):
    """Raised when a refresh token session has already been revoked."""


class RefreshTokenReuseDetectedError(SessionServiceError):
    """
    Raised when a previously rotated refresh token is used again.

    The entire refresh-token family is revoked before this exception
    is raised.
    """


class SessionNotFoundError(SessionServiceError):
    """Raised when a requested user session does not exist."""


@dataclass(frozen=True, slots=True)
class IssuedSession:
    """
    Result of creating or rotating a user session.

    The raw refresh token must be returned to the client exactly once.
    Only its HMAC hash is stored in the database.
    """

    session: UserSession
    refresh_token: str


def _normalize_ip_address(
    ip_address: str | None,
) -> str | None:
    """
    Normalize an IPv4 or IPv6 address for database storage.

    The model allows a maximum of 45 characters, which is sufficient
    for a textual IPv6 address.
    """

    if ip_address is None:
        return None

    normalized = ip_address.strip()

    if not normalized:
        return None

    return normalized[:45]


def _normalize_user_agent(
    user_agent: str | None,
) -> str | None:
    """
    Normalize a user-agent value.

    UserSession.user_agent is a Text column, but excessively large
    untrusted header values are still limited defensively.
    """

    if user_agent is None:
        return None

    normalized = user_agent.strip()

    if not normalized:
        return None

    return normalized[:2000]


def _normalize_device_name(
    device_name: str | None,
) -> str | None:
    """
    Normalize the optional human-readable device name.
    """

    if device_name is None:
        return None

    normalized = device_name.strip()

    if not normalized:
        return None

    return normalized[:150]


def _session_by_refresh_hash_statement(
    refresh_token_hash: str,
    *,
    lock_for_update: bool,
) -> Select[tuple[UserSession]]:
    """
    Build the query used to retrieve a session by refresh-token hash.
    """

    statement = select(UserSession).where(
        UserSession.refresh_token_hash == refresh_token_hash,
        UserSession.deleted_at.is_(None),
    )

    if lock_for_update:
        statement = statement.with_for_update()

    return statement


def get_session_by_id(
    db: Session,
    *,
    session_id: uuid.UUID,
    lock_for_update: bool = False,
) -> UserSession | None:
    """
    Retrieve a non-deleted session by its identifier.
    """

    statement = select(UserSession).where(
        UserSession.id == session_id,
        UserSession.deleted_at.is_(None),
    )

    if lock_for_update:
        statement = statement.with_for_update()

    return db.scalar(statement)


def get_session_by_refresh_token(
    db: Session,
    *,
    refresh_token: str,
    lock_for_update: bool = False,
) -> UserSession | None:
    """
    Retrieve a session using an opaque refresh token.

    The raw token is converted to its deterministic HMAC hash before
    querying the database.
    """

    if not refresh_token:
        return None

    refresh_token_hash = hash_refresh_token(refresh_token)

    statement = _session_by_refresh_hash_statement(
        refresh_token_hash,
        lock_for_update=lock_for_update,
    )

    return db.scalar(statement)


def create_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    ip_address: str | None = None,
    user_agent: str | None = None,
    device_name: str | None = None,
    family_id: uuid.UUID | None = None,
    parent_session_id: uuid.UUID | None = None,
    rotation_counter: int = 0,
    issued_at: datetime | None = None,
) -> IssuedSession:
    """
    Create a new refresh-token session.

    This function stores only the HMAC hash of the refresh token.
    The plaintext token is returned in IssuedSession and must never
    be written to logs or persisted elsewhere.

    The function performs flush(), but not commit().
    """

    if rotation_counter < 0:
        raise ValueError(
            "Rotation counter cannot be negative."
        )

    effective_issued_at = issued_at or utc_now()
    raw_refresh_token = generate_refresh_token()
    refresh_token_hash = hash_refresh_token(
        raw_refresh_token
    )

    session = UserSession(
        user_id=user_id,
        family_id=family_id or uuid.uuid4(),
        refresh_token_hash=refresh_token_hash,
        parent_session_id=parent_session_id,
        rotation_counter=rotation_counter,
        issued_at=effective_issued_at,
        expires_at=get_refresh_token_expiration(
            issued_at=effective_issued_at,
        ),
        created_ip_address=_normalize_ip_address(
            ip_address
        ),
        last_used_ip_address=_normalize_ip_address(
            ip_address
        ),
        user_agent=_normalize_user_agent(user_agent),
        device_name=_normalize_device_name(device_name),
    )

    db.add(session)
    db.flush()

    return IssuedSession(
        session=session,
        refresh_token=raw_refresh_token,
    )


def revoke_session(
    db: Session,
    *,
    session: UserSession,
    reason: str,
    revoked_at: datetime | None = None,
) -> bool:
    """
    Revoke one session.

    Returns True when this call changed the session. Returns False when
    the session had already been revoked.

    The function performs flush(), but not commit().
    """

    if session.revoked_at is not None:
        return False

    normalized_reason = reason.strip()

    if not normalized_reason:
        raise ValueError(
            "Revocation reason cannot be empty."
        )

    session.revoked_at = revoked_at or utc_now()
    session.revocation_reason = normalized_reason[:100]

    db.flush()

    return True


def revoke_session_by_id(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    reason: str = REVOCATION_REASON_LOGOUT,
) -> bool:
    """
    Lock and revoke a session by ID.

    When user_id is supplied, the session must belong to that user.
    Returns False when no matching session exists or it was already
    revoked.
    """

    statement = select(UserSession).where(
        UserSession.id == session_id,
        UserSession.deleted_at.is_(None),
    )

    if user_id is not None:
        statement = statement.where(
            UserSession.user_id == user_id
        )

    statement = statement.with_for_update()

    session = db.scalar(statement)

    if session is None:
        return False

    return revoke_session(
        db,
        session=session,
        reason=reason,
    )


def revoke_token_family(
    db: Session,
    *,
    family_id: uuid.UUID,
    reason: str,
    revoked_at: datetime | None = None,
) -> int:
    """
    Revoke every currently active session in a token family.

    Returns the number of rows updated.

    The function performs database execution, but not commit().
    """

    normalized_reason = reason.strip()

    if not normalized_reason:
        raise ValueError(
            "Revocation reason cannot be empty."
        )

    effective_revoked_at = revoked_at or utc_now()

    result = db.execute(
        update(UserSession)
        .where(
            UserSession.family_id == family_id,
            UserSession.revoked_at.is_(None),
            UserSession.deleted_at.is_(None),
        )
        .values(
            revoked_at=effective_revoked_at,
            revocation_reason=normalized_reason[:100],
            updated_at=effective_revoked_at,
        )
    )

    db.flush()

    return int(result.rowcount or 0)


def revoke_all_user_sessions(
    db: Session,
    *,
    user_id: uuid.UUID,
    reason: str = REVOCATION_REASON_LOGOUT_ALL,
    exclude_session_id: uuid.UUID | None = None,
) -> int:
    """
    Revoke all active sessions belonging to a user.

    exclude_session_id may be used to preserve the current session.

    The function performs database execution, but not commit().
    """

    normalized_reason = reason.strip()

    if not normalized_reason:
        raise ValueError(
            "Revocation reason cannot be empty."
        )

    now = utc_now()

    conditions = [
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
        UserSession.deleted_at.is_(None),
    ]

    if exclude_session_id is not None:
        conditions.append(
            UserSession.id != exclude_session_id
        )

    result = db.execute(
        update(UserSession)
        .where(*conditions)
        .values(
            revoked_at=now,
            revocation_reason=normalized_reason[:100],
            updated_at=now,
        )
    )

    db.flush()

    return int(result.rowcount or 0)


def _handle_rotated_token_reuse(
    db: Session,
    *,
    reused_session: UserSession,
    detected_at: datetime,
    ip_address: str | None,
) -> None:
    """
    Record reuse and revoke the full refresh-token family.

    A token is considered rotated when it points to a replacement
    session. Reusing it indicates that an old refresh token may have
    been copied or stolen.
    """

    reused_session.reuse_detected_at = detected_at
    reused_session.last_used_at = detected_at
    reused_session.last_used_ip_address = (
        _normalize_ip_address(ip_address)
    )

    revoke_token_family(
        db,
        family_id=reused_session.family_id,
        reason=REVOCATION_REASON_REUSE_DETECTED,
        revoked_at=detected_at,
    )

    db.flush()


def rotate_refresh_token(
    db: Session,
    *,
    refresh_token: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
    device_name: str | None = None,
) -> IssuedSession:
    """
    Validate and rotate an opaque refresh token.

    Rotation procedure:

    1. Hash the incoming token.
    2. Lock the matching session row.
    3. Reject expired or revoked sessions.
    4. Detect reuse of a previously rotated token.
    5. Create a replacement session in the same family.
    6. Revoke the old session and link it to the replacement.

    The caller must commit the transaction. On ordinary errors, the
    caller should roll it back.

    Important: RefreshTokenReuseDetectedError is raised only after the
    family-revocation changes have been flushed. The caller must commit
    that security action rather than rolling it back.
    """

    if not refresh_token:
        raise RefreshTokenNotFoundError(
            "Refresh token was not provided."
        )

    incoming_token_hash = hash_refresh_token(
        refresh_token
    )

    statement = _session_by_refresh_hash_statement(
        incoming_token_hash,
        lock_for_update=True,
    )

    current_session = db.scalar(statement)

    if current_session is None:
        raise RefreshTokenNotFoundError(
            "Refresh token is invalid."
        )

    now = utc_now()

    if current_session.revoked_at is not None:
        was_rotated = (
            current_session.replaced_by_session_id
            is not None
            or current_session.revocation_reason
            == REVOCATION_REASON_ROTATED
        )

        if was_rotated:
            _handle_rotated_token_reuse(
                db,
                reused_session=current_session,
                detected_at=now,
                ip_address=ip_address,
            )

            raise RefreshTokenReuseDetectedError(
                "Refresh token reuse was detected. "
                "The full session family has been revoked."
            )

        raise RefreshTokenRevokedError(
            "Refresh token has been revoked."
        )

    if current_session.expires_at <= now:
        current_session.last_used_at = now
        current_session.last_used_ip_address = (
            _normalize_ip_address(ip_address)
        )

        revoke_session(
            db,
            session=current_session,
            reason=REVOCATION_REASON_EXPIRED,
            revoked_at=now,
        )

        raise RefreshTokenExpiredError(
            "Refresh token has expired."
        )

    current_session.last_used_at = now
    current_session.last_used_ip_address = (
        _normalize_ip_address(ip_address)
    )

    replacement = create_session(
        db,
        user_id=current_session.user_id,
        family_id=current_session.family_id,
        parent_session_id=current_session.id,
        rotation_counter=(
            current_session.rotation_counter + 1
        ),
        ip_address=ip_address,
        user_agent=(
            user_agent
            if user_agent is not None
            else current_session.user_agent
        ),
        device_name=(
            device_name
            if device_name is not None
            else current_session.device_name
        ),
        issued_at=now,
    )

    current_session.replaced_by_session_id = (
        replacement.session.id
    )
    current_session.revoked_at = now
    current_session.revocation_reason = (
        REVOCATION_REASON_ROTATED
    )

    db.flush()

    return replacement


def validate_active_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID | None = None,
    lock_for_update: bool = False,
) -> UserSession:
    """
    Validate that a session exists, belongs to the expected user,
    remains active, and has not expired.

    This is intended for access-token session validation.
    """

    statement = select(UserSession).where(
        UserSession.id == session_id,
        UserSession.deleted_at.is_(None),
    )

    if user_id is not None:
        statement = statement.where(
            UserSession.user_id == user_id
        )

    if lock_for_update:
        statement = statement.with_for_update()

    session = db.scalar(statement)

    if session is None:
        raise SessionNotFoundError(
            "Session does not exist."
        )

    if session.revoked_at is not None:
        raise RefreshTokenRevokedError(
            "Session has been revoked."
        )

    now = utc_now()

    if session.expires_at <= now:
        raise RefreshTokenExpiredError(
            "Session has expired."
        )

    return session