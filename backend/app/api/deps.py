from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import RoleName
from app.core.security import (
    TokenExpiredError,
    TokenValidationError,
    decode_access_token,
)
from app.database.session import get_db
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.services.auth_service import (
    AccountInactiveError,
    AccountUnverifiedError,
    AuthService,
    AuthenticationSessionError,
)


bearer_scheme = HTTPBearer(
    auto_error=False,
)


def get_auth_service(
    db: Session = Depends(get_db),
) -> AuthService:
    """
    Provide an AuthService instance for the current request.
    """

    return AuthService(db)


def _credentials_exception(
    *,
    detail: str = "Could not validate credentials.",
) -> HTTPException:
    """
    Build a consistent HTTP 401 response.
    """

    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={
            "WWW-Authenticate": "Bearer",
        },
    )


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
    auth_service: Annotated[
        AuthService,
        Depends(get_auth_service),
    ],
) -> User:
    """
    Return the user represented by a valid JWT access token.

    Validation includes:

    - Bearer authorization scheme;
    - JWT signature and registered claims;
    - access-token type;
    - UUID-formatted user and session identifiers;
    - active database session;
    - active user account.
    """

    if credentials is None:
        raise _credentials_exception()

    if credentials.scheme.lower() != "bearer":
        raise _credentials_exception(
            detail="Unsupported authentication scheme.",
        )

    try:
        payload = decode_access_token(
            credentials.credentials,
        )

        user_id = uuid.UUID(
            str(payload["sub"]),
        )
        session_id = uuid.UUID(
            str(payload["sid"]),
        )

        return auth_service.validate_session(
            user_id=user_id,
            session_id=session_id,
        )

    except TokenExpiredError as exc:
        raise _credentials_exception(
            detail="Access token has expired.",
        ) from exc

    except (
        TokenValidationError,
        AuthenticationSessionError,
        KeyError,
        TypeError,
        ValueError,
    ) as exc:
        raise _credentials_exception() from exc

    except AccountInactiveError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        ) from exc

    except AccountUnverifiedError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account has not been verified.",
        ) from exc


def get_current_active_user(
    current_user: Annotated[
        User,
        Depends(get_current_user),
    ],
) -> User:
    """
    Return the current authenticated and active user.

    Account activity is already checked by get_current_user. This
    separate dependency is retained as a clear extension point for
    future authorization rules such as account verification, RBAC,
    MFA requirements, or organization membership.
    """

    return current_user


def require_roles(
    *allowed_roles: RoleName,
) -> Callable[..., User]:
    """
    Build a dependency that permits access only when the user's
    active role is included in the supplied roles.

    The active role must:

    - be selected as the user's last active role;
    - be assigned to the user;
    - have an active UserRole assignment;
    - reference an active Role record.
    """

    if not allowed_roles:
        raise ValueError(
            "At least one allowed role must be supplied.",
        )

    allowed_role_names = {
        role.value
        for role in allowed_roles
    }

    def role_dependency(
        current_user: Annotated[
            User,
            Depends(get_current_active_user),
        ],
        db: Annotated[
            Session,
            Depends(get_db),
        ],
    ) -> User:
        """
        Validate the current user's active role.
        """

        if current_user.last_active_role_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No active role is selected.",
            )

        active_role_name = db.scalar(
            select(Role.name)
            .join(
                UserRole,
                UserRole.role_id == Role.id,
            )
            .where(
                UserRole.user_id == current_user.id,
                UserRole.role_id
                == current_user.last_active_role_id,
                UserRole.is_active.is_(True),
                UserRole.deleted_at.is_(None),
                Role.is_active.is_(True),
                Role.deleted_at.is_(None),
            )
        )

        if active_role_name is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The selected role is unavailable.",
            )

        if active_role_name not in allowed_role_names:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource.",
            )

        return current_user

    return role_dependency


CurrentUser = Annotated[
    User,
    Depends(get_current_active_user),
]

AuthServiceDependency = Annotated[
    AuthService,
    Depends(get_auth_service),
]
