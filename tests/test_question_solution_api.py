from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = "test-verification-code-hash-key-01"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.core.enums import RoleName
from app.database.session import get_db
from app.main import app
from app.schemas.question_solution import (
    SolutionFormulaBlockRead, SolutionRead, SolutionTextBlockRead,
)
from app.services.question_solution_service import (
    SolutionAlreadyExistsError, SolutionBlockNotFoundError,
    SolutionBlockOrderSetMismatchError, SolutionBlockTypeMismatchError,
    SolutionRevisionConflictError,
)

NOW = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)


def document(text="Step"):
    return {"type": "document", "content": [{"type": "paragraph", "attrs": None, "content": [{"type": "text", "text": text, "marks": []}]}]}


class QuestionSolutionApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(
            id=uuid.uuid4(), last_active_role_id=uuid.uuid4()
        )
        self.client = TestClient(app)
        self.revision_id = uuid.uuid4()
        self.solution_id = uuid.uuid4()
        self.text_id = uuid.uuid4()
        self.formula_id = uuid.uuid4()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @property
    def path(self) -> str:
        return f"/api/v1/question-editor/revisions/{self.revision_id}/solution"

    def text_read(self) -> SolutionTextBlockRead:
        return SolutionTextBlockRead(
            id=self.text_id, block_type="text", sort_order=1000,
            source_text="Step", document=document(), format_version=1,
        )

    def formula_read(self) -> SolutionFormulaBlockRead:
        return SolutionFormulaBlockRead(
            id=self.formula_id, block_type="formula", sort_order=2000,
            source_latex="x^2", format_version=1,
        )

    @patch("app.api.question_editor.QuestionSolutionService")
    def test_get_absent_and_create_solution(self, service_class) -> None:
        service_class.return_value.get_solution.return_value = None
        self.assertIsNone(self.client.get(self.path).json())

        service_class.return_value.create_solution.return_value = SolutionRead(
            id=self.solution_id, blocks=[]
        )
        response = self.client.post(self.path, json={"expected_revision_updated_at": NOW.isoformat()})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["id"], str(self.solution_id))

    @patch("app.api.question_editor.QuestionSolutionService")
    def test_text_and_formula_create_update_routes(self, service_class) -> None:
        service_class.return_value.create_text_block.return_value = self.text_read()
        response = self.client.post(f"{self.path}/blocks/text", json={
            "block_type": "text", "payload": {"document": document(), "format_version": 1},
            "expected_revision_updated_at": NOW.isoformat(),
        })
        self.assertEqual(response.status_code, 201)
        service_class.return_value.update_text_block.return_value = self.text_read()
        self.assertEqual(self.client.patch(f"{self.path}/blocks/{self.text_id}/text", json={
            "payload": {"document": document(), "format_version": 1},
            "expected_revision_updated_at": NOW.isoformat(),
        }).status_code, 200)

        service_class.return_value.create_formula_block.return_value = self.formula_read()
        self.assertEqual(self.client.post(f"{self.path}/blocks/formula", json={
            "block_type": "formula", "payload": {"source_latex": "x^2", "format_version": 1},
            "expected_revision_updated_at": NOW.isoformat(),
        }).status_code, 201)
        service_class.return_value.update_formula_block.return_value = self.formula_read()
        self.assertEqual(self.client.patch(f"{self.path}/blocks/{self.formula_id}/formula", json={
            "payload": {"source_latex": "x^2", "format_version": 1},
            "expected_revision_updated_at": NOW.isoformat(),
        }).status_code, 200)

    @patch("app.api.question_editor.QuestionSolutionService")
    def test_delete_block_reorder_and_delete_solution(self, service_class) -> None:
        response = self.client.delete(
            f"{self.path}/blocks/{self.text_id}",
            params={"expected_revision_updated_at": NOW.isoformat()},
        )
        self.assertEqual(response.status_code, 204)
        service_class.return_value.reorder_blocks.return_value = [self.formula_read(), self.text_read()]
        response = self.client.put(f"{self.path}/blocks/actions/order", json={
            "block_ids": [str(self.formula_id), str(self.text_id)],
            "expected_revision_updated_at": NOW.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        response = self.client.request(
            "DELETE", self.path,
            json={"expected_revision_updated_at": NOW.isoformat()},
        )
        self.assertEqual(response.status_code, 204)

    @patch("app.api.question_editor.QuestionSolutionService")
    def test_safe_conflict_and_not_found_mapping(self, service_class) -> None:
        cases = (
            (SolutionAlreadyExistsError(), "POST", self.path, 409),
            (SolutionRevisionConflictError(), "POST", self.path, 409),
            (SolutionBlockNotFoundError(), "PATCH", f"{self.path}/blocks/{self.text_id}/text", 404),
            (SolutionBlockTypeMismatchError(), "PATCH", f"{self.path}/blocks/{self.text_id}/text", 409),
            (SolutionBlockOrderSetMismatchError(), "PUT", f"{self.path}/blocks/actions/order", 409),
        )
        for error, method, path, expected in cases:
            with self.subTest(error=type(error).__name__):
                target = {
                    "POST": service_class.return_value.create_solution,
                    "DELETE": service_class.return_value.delete_block,
                    "PATCH": service_class.return_value.update_text_block,
                    "PUT": service_class.return_value.reorder_blocks,
                }[method]
                target.side_effect = error
                payload = {"expected_revision_updated_at": NOW.isoformat()}
                if method == "PATCH": payload["payload"] = {"document": document(), "format_version": 1}
                if method == "PUT": payload["block_ids"] = [str(self.text_id)]
                response = self.client.request(method, path, json=payload if method != "DELETE" else None)
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("SQL", response.text)
                target.reset_mock(side_effect=True)

    def test_anonymous_solution_mutation_is_rejected(self) -> None:
        app.dependency_overrides.pop(get_current_active_user)
        response = self.client.post(self.path, json={"expected_revision_updated_at": NOW.isoformat()})
        self.assertIn(response.status_code, {401, 403})

    def test_non_admin_solution_mutation_is_rejected(self) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        response = self.client.post(self.path, json={"expected_revision_updated_at": NOW.isoformat()})
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
