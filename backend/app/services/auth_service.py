from uuid import UUID

from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.user import User
from app.schemas import TokenResponse


class AuthService:
    """
    Service responsible for authentication logic.
    """

    def __init__(self, db: Session):
        self.db = db

    def authenticate_user(
        self,
        *,
        identifier: str,
        password: str,
    ) -> User | None:
        """
        Authenticate a user using email or phone number.
        """
        normalized_identifier = identifier.strip()

        query = self.db.query(User)

        if "@" in normalized_identifier:
            user = query.filter(
                User.email == normalized_identifier.lower()
            ).first()
        else:
            user = query.filter(
                User.phone == normalized_identifier
            ).first()

        if user is None:
            return None

        if not verify_password(
            password,
            user.password_hash,
        ):
            return None

        return user

    def login(
        self,
        user: User,
    ) -> TokenResponse:
        """
        Generate JWT access and refresh tokens.
        """
        return TokenResponse(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )

    def refresh(
        self,
        refresh_token: str,
    ) -> TokenResponse | None:
        """
        Validate a refresh token and generate a new token pair.
        """
        try:
            payload = decode_token(refresh_token)

            if payload.get("type") != "refresh":
                return None

            subject = payload.get("sub")

            if subject is None:
                return None

            user_id = UUID(subject)

        except (
            InvalidTokenError,
            ValueError,
            TypeError,
        ):
            return None

        user = self.db.get(User, user_id)

        if user is None:
            return None

        if not user.is_active:
            return None

        return TokenResponse(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id),
        )