from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


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

from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.database.session import get_db
from app.main import app


class GradeCatalogTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_active_user] = lambda: (
            SimpleNamespace(id=uuid.uuid4())
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_lists_only_public_grade_fields_using_catalog_query(self) -> None:
        grade_ids = [uuid.uuid4(), uuid.uuid4(), uuid.uuid4()]
        grades = [
            SimpleNamespace(
                id=grade_ids[0],
                name="grade_alpha",
                display_name="Alpha",
                sort_order=1,
                is_active=True,
                deleted_at=None,
                created_at="not-public",
            ),
            SimpleNamespace(
                id=grade_ids[1],
                name="grade_beta",
                display_name="Beta",
                sort_order=1,
                is_active=True,
                deleted_at=None,
                created_at="not-public",
            ),
            SimpleNamespace(
                id=grade_ids[2],
                name="grade_gamma",
                display_name="Gamma",
                sort_order=2,
                is_active=True,
                deleted_at=None,
                created_at="not-public",
            ),
        ]
        self.db.scalars.return_value.all.return_value = grades

        response = self.client.get("/api/v1/catalog/grades")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            [
                {
                    "id": str(grade.id),
                    "name": grade.name,
                    "display_name": grade.display_name,
                    "sort_order": grade.sort_order,
                }
                for grade in grades
            ],
        )
        self.assertTrue(
            all(
                set(item) == {
                    "id",
                    "name",
                    "display_name",
                    "sort_order",
                }
                for item in response.json()
            )
        )

        statement = self.db.scalars.call_args.args[0]
        statement_text = str(statement)
        self.assertIn("grades.is_active IS true", statement_text)
        self.assertIn("grades.deleted_at IS NULL", statement_text)
        self.assertIn(
            "ORDER BY grades.sort_order, grades.display_name, grades.id",
            statement_text,
        )

    def test_authentication_is_delegated_to_current_user_dependency(self) -> None:
        del app.dependency_overrides[get_current_active_user]

        response = self.client.get("/api/v1/catalog/grades")

        self.assertEqual(response.status_code, 401)
        self.db.scalars.assert_not_called()


if __name__ == "__main__":
    unittest.main()
