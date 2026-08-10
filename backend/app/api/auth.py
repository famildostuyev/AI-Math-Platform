from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from app.api.deps import (
    AuthServiceDependency,
    CurrentUser,
    bearer_scheme,
)
from app.core.security import (
    TokenExpiredError,
    TokenValidationError,
    decode_access_token,
)
from app.schemas.auth import (
    LoginRequest,
    LogoutAllResponse,
    LogoutResponse,
    RefreshTokenRequest,
    RegisterRequest,
    RegisterResponse,
    VerifyRequest,
    VerifyResponse,
)
from app.schemas.token import TokenResponse
from app.services.auth_service import (
    AccountInactiveError,
    AccountLockedError,
    AccountUnverifiedError,
    AuthenticationSessionError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    RegistrationConflictError,
    RegistrationRoleUnavailableError,
)
from app.services.session_service import RefreshTokenReuseDetectedError


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


def _client_ip(request: Request) -> str | None:
    """
    Return the connecting client's IP address when available.
    """

    if request.client is None:
        return None

    return request.client.host


def _user_agent(request: Request) -> str | None:
    """
    Return the request User-Agent header when available.
    """

    return request.headers.get("user-agent")


def _current_session_id(
    credentials: HTTPAuthorizationCredentials | None,
) -> uuid.UUID:
    """
    Extract the authenticated session identifier from an access token.
    """

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unsupported authentication scheme.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
        return uuid.UUID(str(payload["sid"]))

    except TokenExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    except (
        TokenValidationError,
        KeyError,
        TypeError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def _raise_verification_error(exc: Exception) -> None:
    """
    Convert expected verification-service failures into HTTP 400 responses.

    Verification exceptions belong to the verification service and may evolve
    independently from this router. Their class names are inspected here so
    the API remains decoupled from individual exception imports.
    """

    expected_names = {
        "VerificationChallengeNotFoundError",
        "VerificationChallengeExpiredError",
        "VerificationChallengeConsumedError",
        "VerificationChallengeInvalidError",
        "VerificationCodeInvalidError",
        "InvalidVerificationCodeError",
        "VerificationAttemptsExceededError",
        "VerificationChallengeLockedError",
    }

    if exc.__class__.__name__ in expected_names or isinstance(exc, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc) or "Verification failed.",
        ) from exc

    raise exc


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a public user account",
)
def register(
    registration: RegisterRequest,
    auth_service: AuthServiceDependency,
) -> RegisterResponse:
    """
    Register a student, parent, or teacher account.

    Registration creates a verification challenge and sends its code through
    the configured notification provider. It does not issue login tokens.
    """

    try:
        return auth_service.register(
            registration=registration,
        )

    except RegistrationConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    except RegistrationRoleUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post(
    "/verify",
    response_model=VerifyResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify an email address or phone number",
)
def verify(
    verification: VerifyRequest,
    auth_service: AuthServiceDependency,
) -> VerifyResponse:
    """
    Consume a verification challenge using its identifier and code.
    """

    try:
        return auth_service.verify(
            verification=verification,
        )

    except Exception as exc:
        _raise_verification_error(exc)
        raise


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Log in and create a session",
)
def login(
    login_data: LoginRequest,
    request: Request,
    auth_service: AuthServiceDependency,
) -> TokenResponse:
    """
    Authenticate a user and return access and refresh tokens.
    """

    try:
        return auth_service.login(
            identifier=login_data.identifier,
            password=login_data.password,
            ip_address=_client_ip(request),
            user_agent=_user_agent(request),
            device_name=login_data.device_name,
        )

    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    except AccountLockedError as exc:
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail={
                "message": str(exc),
                "locked_until": exc.locked_until.isoformat(),
            },
        ) from exc

    except AccountUnverifiedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc

    except AccountInactiveError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate a refresh token",
)
def refresh(
    refresh_data: RefreshTokenRequest,
    request: Request,
    auth_service: AuthServiceDependency,
) -> TokenResponse:
    """
    Rotate a valid refresh token and return a new token pair.
    """

    try:
        return auth_service.refresh(
            refresh_token=refresh_data.refresh_token,
            ip_address=_client_ip(request),
            user_agent=_user_agent(request),
            device_name=refresh_data.device_name,
        )

    except RefreshTokenReuseDetectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Refresh-token reuse was detected. "
                "The token family has been revoked."
            ),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    except InvalidRefreshTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    except AccountInactiveError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Log out from the current session",
)
def logout(
    current_user: CurrentUser,
    auth_service: AuthServiceDependency,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> LogoutResponse:
    """
    Revoke the session represented by the current access token.
    """

    session_id = _current_session_id(credentials)

    try:
        revoked = auth_service.logout(
            user_id=current_user.id,
            session_id=session_id,
        )

    except AuthenticationSessionError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    return LogoutResponse(
        revoked=revoked,
    )


@router.post(
    "/logout-all",
    response_model=LogoutAllResponse,
    status_code=status.HTTP_200_OK,
    summary="Log out from all sessions",
)
def logout_all(
    current_user: CurrentUser,
    auth_service: AuthServiceDependency,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    preserve_current_session: Annotated[
        bool,
        Query(
            description=(
                "Keep the current session active while revoking "
                "all other sessions."
            ),
        ),
    ] = False,
) -> LogoutAllResponse:
    """
    Revoke all active sessions belonging to the authenticated user.
    """

    current_session_id = (
        _current_session_id(credentials)
        if preserve_current_session
        else None
    )

    revoked_sessions = auth_service.logout_all(
        user_id=current_user.id,
        exclude_session_id=current_session_id,
    )

    return LogoutAllResponse(
        revoked_sessions=revoked_sessions,
    )
