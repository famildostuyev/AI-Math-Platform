from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import settings


password_hasher = PasswordHash.recommended()


class TokenValidationError(ValueError):
    """Raised when an authentication token cannot be validated."""


class TokenExpiredError(TokenValidationError):
    """Raised when an authentication token has expired."""


def utc_now() -> datetime:
    """
    Return the current UTC datetime as a timezone-aware value.
    """

    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    """
    Hash a plaintext password using the configured password hasher.

    The current recommended pwdlib configuration uses Argon2.
    """

    if not password:
        raise ValueError("Password cannot be empty.")

    return password_hasher.hash(password)


def verify_password(
    plain_password: str,
    password_hash: str,
) -> bool:
    """
    Verify a plaintext password against its stored hash.

    Returns False for invalid input or verification failure.
    """

    if not plain_password or not password_hash:
        return False

    try:
        return password_hasher.verify(
            plain_password,
            password_hash,
        )
    except Exception:
        return False


def verify_and_update_password(
    plain_password: str,
    password_hash: str,
) -> tuple[bool, str | None]:
    """
    Verify a password and return an upgraded hash when needed.

    The returned tuple contains:

    - verification result;
    - replacement hash, or None when no rehash is required.
    """

    if not plain_password or not password_hash:
        return False, None

    try:
        is_valid, updated_hash = password_hasher.verify_and_update(
            plain_password,
            password_hash,
        )
    except Exception:
        return False, None

    return is_valid, updated_hash


def generate_jti() -> str:
    """
    Generate a unique JWT identifier.
    """

    return str(uuid.uuid4())


def generate_session_id() -> uuid.UUID:
    """
    Generate a unique session identifier.
    """

    return uuid.uuid4()


def create_access_token(
    *,
    user_id: uuid.UUID | str,
    session_id: uuid.UUID | str,
    additional_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a short-lived JWT access token.

    Required claims:

    - sub: authenticated user ID
    - sid: session ID
    - jti: unique token ID
    - type: token type
    - iss: token issuer
    - aud: intended audience
    - iat: issued-at time
    - nbf: not-before time
    - exp: expiry time
    """

    now = utc_now()

    expiration = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        )
    )

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "sid": str(session_id),
        "jti": generate_jti(),
        "type": "access",
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": now,
        "nbf": now,
        "exp": expiration,
    }

    if additional_claims:
        protected_claims = {
            "sub",
            "sid",
            "jti",
            "type",
            "iss",
            "aud",
            "iat",
            "nbf",
            "exp",
        }

        invalid_claims = protected_claims.intersection(
            additional_claims,
        )

        if invalid_claims:
            claim_names = ", ".join(sorted(invalid_claims))

            raise ValueError(
                f"Protected JWT claims cannot be overridden: "
                f"{claim_names}"
            )

        payload.update(additional_claims)

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT access token.

    Signature, algorithm, issuer, audience and required claims are
    validated. The token must explicitly have type='access'.
    """

    if not token:
        raise TokenValidationError(
            "Access token is missing."
        )

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
            options={
                "require": [
                    "sub",
                    "sid",
                    "jti",
                    "type",
                    "iss",
                    "aud",
                    "iat",
                    "nbf",
                    "exp",
                ],
                "verify_signature": True,
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iat": True,
                "verify_iss": True,
                "verify_aud": True,
            },
        )
    except ExpiredSignatureError as exc:
        raise TokenExpiredError(
            "Access token has expired."
        ) from exc
    except InvalidTokenError as exc:
        raise TokenValidationError(
            "Access token is invalid."
        ) from exc

    if payload.get("type") != "access":
        raise TokenValidationError(
            "Unexpected token type."
        )

    try:
        uuid.UUID(str(payload["sub"]))
        uuid.UUID(str(payload["sid"]))
        uuid.UUID(str(payload["jti"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise TokenValidationError(
            "Access token contains invalid identifiers."
        ) from exc

    return payload


def generate_refresh_token() -> str:
    """
    Generate a cryptographically secure opaque refresh token.

    The raw token must only be returned to the client. It must never
    be persisted directly in the database.
    """

    return secrets.token_urlsafe(64)


def hash_refresh_token(refresh_token: str) -> str:
    """
    Create a deterministic HMAC-SHA256 hash of a refresh token.

    The returned hexadecimal digest is suitable for database storage.
    """

    if not refresh_token:
        raise ValueError(
            "Refresh token cannot be empty."
        )

    return hmac.new(
        key=settings.REFRESH_TOKEN_HASH_KEY.encode("utf-8"),
        msg=refresh_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()


def verify_refresh_token_hash(
    refresh_token: str,
    expected_hash: str,
) -> bool:
    """
    Verify an opaque refresh token against a stored HMAC hash.

    hmac.compare_digest provides constant-time comparison.
    """

    if not refresh_token or not expected_hash:
        return False

    calculated_hash = hash_refresh_token(
        refresh_token,
    )

    return hmac.compare_digest(
        calculated_hash,
        expected_hash,
    )


def get_refresh_token_expiration(
    *,
    issued_at: datetime | None = None,
) -> datetime:
    """
    Calculate the absolute expiry time of a refresh token.
    """

    base_time = issued_at or utc_now()

    if base_time.tzinfo is None:
        base_time = base_time.replace(
            tzinfo=timezone.utc,
        )

    return base_time + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS,
    )


def get_access_token_expiration_seconds() -> int:
    """
    Return the configured access token lifetime in seconds.
    """

    return settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def get_refresh_token_expiration_seconds() -> int:
    """
    Return the configured refresh token lifetime in seconds.
    """

    return settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60