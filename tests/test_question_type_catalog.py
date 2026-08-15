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


class QuestionTypeCatalogTest(unittest.TestCase):
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

    def test_lists_only_active_non_deleted_question_types_in_order(self) -> None:
        question_types = [
            SimpleNamespace(
                id=uuid.uuid4(),
                name="multiple_choice",
                display_name="Multiple choice",
                description="Choose one answer.",
                sort_order=1,
                is_active=True,
                deleted_at=None,
                created_at="not-public",
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                name="open_response",
                display_name="Open response",
                description=None,
                sort_order=2,
                is_active=True,
                deleted_at=None,
                updated_at="not-public",
            ),
        ]
        self.db.scalars.return_value.all.return_value = question_types

        response = self.client.get("/api/v1/catalog/question-types")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [
            {
                "id": str(question_type.id),
                "name": question_type.name,
                "display_name": question_type.display_name,
                "description": question_type.description,
                "sort_order": question_type.sort_order,
            }
            for question_type in question_types
        ])
        self.assertTrue(all(
            set(item) == {
                "id", "name", "display_name", "description", "sort_order",
            }
            for item in response.json()
        ))

        statement_text = str(self.db.scalars.call_args.args[0])
        self.assertIn("question_types.is_active IS true", statement_text)
        self.assertIn("question_types.deleted_at IS NULL", statement_text)
        self.assertIn(
            "ORDER BY question_types.sort_order, "
            "question_types.display_name, question_types.id",
            statement_text,
        )

    def test_authentication_is_delegated_to_current_user_dependency(self) -> None:
        del app.dependency_overrides[get_current_active_user]

        response = self.client.get("/api/v1/catalog/question-types")

        self.assertEqual(response.status_code, 401)
        self.db.scalars.assert_not_called()


if __name__ == "__main__":
    unittest.main()
