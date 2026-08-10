from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from starlette.requests import Request


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DEBUG"] = "false"

from app.api.auth import login as login_endpoint
from app.schemas.auth import LoginRequest
from app.services.auth_service import AccountUnverifiedError, AuthService


class UnverifiedLoginTest(unittest.TestCase):
    def test_valid_active_unverified_user_is_rejected(self) -> None:
        db = MagicMock()
        user = SimpleNamespace(
            is_active=True,
            is_email_verified=False,
            is_phone_verified=False,
            locked_until=None,
            failed_login_attempts=0,
            password_hash="stored-password-hash",
        )
        auth_service = AuthService(db)

        with (
            patch.object(
                auth_service,
                "_find_user_for_authentication",
                return_value=user,
            ),
            patch(
                "app.services.auth_service.verify_and_update_password",
                return_value=(True, None),
            ),
        ):
            with self.assertRaises(AccountUnverifiedError):
                auth_service.login(
                    identifier="unverified@example.com",
                    password="ValidPassword123!",
                )

        db.rollback.assert_called_once_with()

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/v1/auth/login",
                "headers": [],
                "client": ("127.0.0.1", 12345),
                "query_string": b"",
                "scheme": "http",
                "server": ("testserver", 80),
            }
        )

        with patch.object(
            auth_service,
            "login",
            side_effect=AccountUnverifiedError(
                "User account has not been verified."
            ),
        ):
            with self.assertRaises(HTTPException) as response:
                login_endpoint(
                    login_data=LoginRequest(
                        identifier="unverified@example.com",
                        password="ValidPassword123!",
                    ),
                    request=request,
                    auth_service=auth_service,
                )

        self.assertEqual(response.exception.status_code, 403)
        self.assertEqual(
            response.exception.detail,
            "User account has not been verified.",
        )


if __name__ == "__main__":
    unittest.main()
