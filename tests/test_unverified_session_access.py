from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = (
    "test-refresh-token-hash-key-000001"
)
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request

from app.api.auth import refresh as refresh_endpoint
from app.api.deps import get_current_user
from app.schemas.auth import RefreshTokenRequest
from app.services.auth_service import AccountUnverifiedError, AuthService
from app.services.session_service import REVOCATION_REASON_SECURITY


UNVERIFIED_DETAIL = "User account has not been verified."


class UnverifiedSessionAccessTest(unittest.TestCase):
    def test_refresh_rejects_user_and_revokes_token_family(self) -> None:
        db = MagicMock()
        user_id = uuid.uuid4()
        family_id = uuid.uuid4()
        replacement = SimpleNamespace(
            session=SimpleNamespace(
                user_id=user_id,
                family_id=family_id,
            ),
            refresh_token="rotated-refresh-token",
        )
        db.scalar.return_value = SimpleNamespace(
            is_active=True,
            is_email_verified=False,
            is_phone_verified=False,
        )
        auth_service = AuthService(db)

        with (
            patch(
                "app.services.auth_service.rotate_refresh_token",
                return_value=replacement,
            ),
            patch(
                "app.services.auth_service.revoke_token_family",
            ) as revoke_token_family,
        ):
            with self.assertRaises(AccountUnverifiedError):
                auth_service.refresh(
                    refresh_token="existing-refresh-token",
                )

        revoke_token_family.assert_called_once_with(
            db,
            family_id=family_id,
            reason=REVOCATION_REASON_SECURITY,
        )
        db.commit.assert_called_once_with()

    def test_validate_session_rejects_unverified_user(self) -> None:
        db = MagicMock()
        db.scalar.return_value = SimpleNamespace(
            is_active=True,
            is_email_verified=False,
            is_phone_verified=False,
        )
        auth_service = AuthService(db)

        with self.assertRaises(AccountUnverifiedError):
            auth_service.validate_session(
                user_id=uuid.uuid4(),
                session_id=uuid.uuid4(),
            )

    def test_refresh_endpoint_maps_unverified_error_to_403(self) -> None:
        auth_service = MagicMock()
        auth_service.refresh.side_effect = AccountUnverifiedError(
            UNVERIFIED_DETAIL
        )
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/v1/auth/refresh",
                "headers": [],
                "client": ("127.0.0.1", 12345),
                "query_string": b"",
                "scheme": "http",
                "server": ("testserver", 80),
            }
        )

        with self.assertRaises(HTTPException) as response:
            refresh_endpoint(
                refresh_data=RefreshTokenRequest(
                    refresh_token="r" * 32,
                ),
                request=request,
                auth_service=auth_service,
            )

        self.assertEqual(response.exception.status_code, 403)
        self.assertEqual(response.exception.detail, UNVERIFIED_DETAIL)

    def test_current_user_dependency_maps_unverified_error_to_403(self) -> None:
        user_id = uuid.uuid4()
        session_id = uuid.uuid4()
        auth_service = MagicMock()
        auth_service.validate_session.side_effect = AccountUnverifiedError(
            UNVERIFIED_DETAIL
        )
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="test-access-token",
        )

        with patch(
            "app.api.deps.decode_access_token",
            return_value={
                "sub": str(user_id),
                "sid": str(session_id),
            },
        ):
            with self.assertRaises(HTTPException) as response:
                get_current_user(
                    credentials=credentials,
                    auth_service=auth_service,
                )

        self.assertEqual(response.exception.status_code, 403)
        self.assertEqual(response.exception.detail, UNVERIFIED_DETAIL)


if __name__ == "__main__":
    unittest.main()
