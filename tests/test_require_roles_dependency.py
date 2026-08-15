from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException


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

from app.api.deps import require_roles
from app.core.enums import RoleName


class RequireRolesDependencyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.current_user = SimpleNamespace(
            id=uuid.uuid4(),
            last_active_role_id=uuid.uuid4(),
        )

    def _dependency(self):
        return require_roles(RoleName.ADMIN)

    def _statement_text(self, db: MagicMock) -> str:
        return str(db.scalar.call_args.args[0])

    def _assert_active_non_deleted_filters(self, statement: str) -> None:
        self.assertIn("user_roles.is_active IS true", statement)
        self.assertIn("user_roles.deleted_at IS NULL", statement)
        self.assertIn("roles.is_active IS true", statement)
        self.assertIn("roles.deleted_at IS NULL", statement)

    def test_active_non_deleted_matching_role_is_allowed(self) -> None:
        db = MagicMock()
        db.scalar.return_value = RoleName.ADMIN.value

        result = self._dependency()(current_user=self.current_user, db=db)

        self.assertIs(result, self.current_user)
        self._assert_active_non_deleted_filters(self._statement_text(db))

    def test_soft_deleted_user_role_is_forbidden(self) -> None:
        db = MagicMock()
        # The matching row is absent because the assignment is soft-deleted.
        db.scalar.return_value = None

        with self.assertRaises(HTTPException) as response:
            self._dependency()(current_user=self.current_user, db=db)

        self.assertEqual(response.exception.status_code, 403)
        self.assertEqual(
            response.exception.detail,
            "The selected role is unavailable.",
        )
        statement = self._statement_text(db)
        self.assertIn("user_roles.deleted_at IS NULL", statement)
        self._assert_active_non_deleted_filters(statement)

    def test_soft_deleted_role_is_forbidden(self) -> None:
        db = MagicMock()
        # The matching row is absent because the role is soft-deleted.
        db.scalar.return_value = None

        with self.assertRaises(HTTPException) as response:
            self._dependency()(current_user=self.current_user, db=db)

        self.assertEqual(response.exception.status_code, 403)
        self.assertEqual(
            response.exception.detail,
            "The selected role is unavailable.",
        )
        statement = self._statement_text(db)
        self.assertIn("roles.deleted_at IS NULL", statement)
        self._assert_active_non_deleted_filters(statement)

    def test_inactive_assignment_or_role_remains_forbidden(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None

        with self.assertRaises(HTTPException) as response:
            self._dependency()(current_user=self.current_user, db=db)

        self.assertEqual(response.exception.status_code, 403)
        statement = self._statement_text(db)
        self.assertIn("user_roles.is_active IS true", statement)
        self.assertIn("roles.is_active IS true", statement)

    def test_wrong_role_remains_forbidden(self) -> None:
        db = MagicMock()
        db.scalar.return_value = RoleName.TEACHER.value

        with self.assertRaises(HTTPException) as response:
            self._dependency()(current_user=self.current_user, db=db)

        self.assertEqual(response.exception.status_code, 403)
        self.assertEqual(
            response.exception.detail,
            "You do not have permission to access this resource.",
        )


if __name__ == "__main__":
    unittest.main()
