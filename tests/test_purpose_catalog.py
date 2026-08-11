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


class PurposeCatalogTest(unittest.TestCase):
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

    def test_lists_flat_immediate_parent_hierarchy_with_public_fields(self) -> None:
        parent_id = uuid.uuid4()
        purposes = [
            SimpleNamespace(
                id=parent_id,
                name="purpose_parent",
                display_name="Parent option",
                description="Parent description",
                sort_order=10,
                parent_id=None,
                is_active=True,
                is_system=True,
                deleted_at=None,
                created_at="not-public",
            ),
            SimpleNamespace(
                id=uuid.uuid4(),
                name="purpose_child",
                display_name="Child option",
                description=None,
                sort_order=1,
                parent_id=parent_id,
                is_active=True,
                is_system=True,
                deleted_at=None,
                created_at="not-public",
            ),
        ]
        self.db.scalars.return_value.all.return_value = purposes

        response = self.client.get("/api/v1/catalog/purposes")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            [
                {
                    "id": str(purpose.id),
                    "name": purpose.name,
                    "display_name": purpose.display_name,
                    "description": purpose.description,
                    "sort_order": purpose.sort_order,
                    "parent_id": (
                        str(purpose.parent_id)
                        if purpose.parent_id is not None
                        else None
                    ),
                }
                for purpose in purposes
            ],
        )
        self.assertEqual(len(response.json()), 2)
        self.assertEqual(response.json()[1]["parent_id"], str(parent_id))
        self.assertTrue(
            all(
                set(item) == {
                    "id",
                    "name",
                    "display_name",
                    "description",
                    "sort_order",
                    "parent_id",
                }
                for item in response.json()
            )
        )

        statement_text = str(self.db.scalars.call_args.args[0])
        self.assertIn("purposes.is_active IS true", statement_text)
        self.assertIn("purposes.deleted_at IS NULL", statement_text)
        self.assertIn("LEFT OUTER JOIN purposes AS", statement_text)
        self.assertRegex(
            statement_text,
            r"ORDER BY "
            r"coalesce\(purposes_\d+\.sort_order, purposes\.sort_order\), "
            r"coalesce\(purposes_\d+\.display_name, purposes\.display_name\), "
            r"coalesce\(purposes_\d+\.id, purposes\.id\), "
            r"CASE WHEN \(purposes\.parent_id IS NULL\) "
            r"THEN :param_\d+ ELSE :param_\d+ END, "
            r"purposes\.sort_order, purposes\.display_name, purposes\.id",
        )
        self.assertNotIn("enabled", response.text)

    def test_authentication_is_delegated_to_current_user_dependency(self) -> None:
        del app.dependency_overrides[get_current_active_user]

        response = self.client.get("/api/v1/catalog/purposes")

        self.assertEqual(response.status_code, 401)
        self.db.scalars.assert_not_called()


if __name__ == "__main__":
    unittest.main()
