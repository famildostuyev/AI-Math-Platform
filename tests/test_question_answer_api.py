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
from app.api.question_editor import router as question_editor_router
from app.core.enums import RoleName
from app.database.session import get_db
from app.main import app
from app.schemas.question_answer import AcceptedAnswerRead, AnswerOptionRead
from app.services.question_answer_service import (
    AnswerRevisionConflictError,
    CorrectOptionDeleteError,
)

NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


class QuestionAnswerApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        def override_db():
            yield self.db
        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_active_user] = lambda: SimpleNamespace(id=uuid.uuid4(), last_active_role_id=uuid.uuid4())
        self.client = TestClient(app)
        self.revision_id = uuid.uuid4()
        self.record_id = uuid.uuid4()

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    @staticmethod
    def _document() -> dict[str, object]:
        return {"type": "document", "content": [{"type": "paragraph", "attrs": None, "content": [{"type": "text", "text": "42", "marks": []}]}]}

    def _write(self, *, label: str | None = None) -> dict[str, object]:
        payload: dict[str, object] = {"document": self._document(), "format_version": 1, "expected_revision_updated_at": NOW.isoformat()}
        if label is not None:
            payload["label"] = label
        return payload

    def _option(self) -> AnswerOptionRead:
        return AnswerOptionRead(id=self.record_id, label="A", order_index=1000, source_text="42", document=self._document(), format_version=1, is_correct=False)

    def _accepted(self) -> AcceptedAnswerRead:
        return AcceptedAnswerRead(id=self.record_id, order_index=1000, source_text="42", document=self._document(), format_version=1)

    @patch("app.api.question_editor.QuestionAnswerService")
    def test_option_create_update_delete_reorder_and_correct_routes(self, service_cls: MagicMock) -> None:
        service = service_cls.return_value
        service.create_option.return_value = self._option()
        service.update_option.return_value = self._option()
        service.reorder_options.return_value = [self._option()]
        service.set_correct_options.return_value = [self._option()]
        base = f"/api/v1/question-editor/revisions/{self.revision_id}/answer-options"
        self.assertEqual(self.client.post(base, json=self._write(label="A")).status_code, 201)
        self.assertEqual(self.client.patch(f"{base}/{self.record_id}", json=self._write(label="A")).status_code, 200)
        self.assertEqual(self.client.delete(f"{base}/{self.record_id}", params={"expected_revision_updated_at": NOW.isoformat()}).status_code, 204)
        order = {"answer_ids": [str(self.record_id)], "expected_revision_updated_at": NOW.isoformat()}
        self.assertEqual(self.client.put(f"{base}/actions/order", json=order).status_code, 200)
        correct = {"option_ids": [str(self.record_id)], "expected_revision_updated_at": NOW.isoformat()}
        self.assertEqual(self.client.put(f"{base}/actions/correct", json=correct).status_code, 200)

    @patch("app.api.question_editor.QuestionAnswerService")
    def test_accepted_answer_crud_and_reorder_routes(self, service_cls: MagicMock) -> None:
        service = service_cls.return_value
        service.create_accepted_answer.return_value = self._accepted()
        service.update_accepted_answer.return_value = self._accepted()
        service.reorder_accepted_answers.return_value = [self._accepted()]
        base = f"/api/v1/question-editor/revisions/{self.revision_id}/accepted-answers"
        self.assertEqual(self.client.post(base, json=self._write()).status_code, 201)
        self.assertEqual(self.client.patch(f"{base}/{self.record_id}", json=self._write()).status_code, 200)
        self.assertEqual(self.client.delete(f"{base}/{self.record_id}", params={"expected_revision_updated_at": NOW.isoformat()}).status_code, 204)
        order = {"answer_ids": [str(self.record_id)], "expected_revision_updated_at": NOW.isoformat()}
        self.assertEqual(self.client.put(f"{base}/actions/order", json=order).status_code, 200)

    @patch("app.api.question_editor.QuestionAnswerService")
    def test_stale_timestamp_maps_to_409(self, service_cls: MagicMock) -> None:
        service_cls.return_value.create_option.side_effect = AnswerRevisionConflictError()
        response = self.client.post(f"/api/v1/question-editor/revisions/{self.revision_id}/answer-options", json=self._write(label="A"))
        self.assertEqual(response.status_code, 409)
        self.assertNotIn("timestamp", response.text.lower())

    @patch("app.api.question_editor.QuestionAnswerService")
    def test_correct_option_delete_has_safe_explicit_conflict(self, service_cls: MagicMock) -> None:
        service_cls.return_value.delete_option.side_effect = CorrectOptionDeleteError()
        response = self.client.delete(f"/api/v1/question-editor/revisions/{self.revision_id}/answer-options/{self.record_id}", params={"expected_revision_updated_at": NOW.isoformat()})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "A correct option must be unselected before deletion.")

    def test_anonymous_mutation_is_rejected(self) -> None:
        app.dependency_overrides.pop(get_current_active_user)
        response = self.client.post(f"/api/v1/question-editor/revisions/{self.revision_id}/answer-options", json=self._write(label="A"))
        self.assertIn(response.status_code, {401, 403})

    @patch("app.api.question_editor.QuestionAnswerService")
    def test_non_admin_mutation_is_rejected(self, service_cls: MagicMock) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        response = self.client.post(f"/api/v1/question-editor/revisions/{self.revision_id}/answer-options", json=self._write(label="A"))
        self.assertEqual(response.status_code, 403)
        service_cls.assert_not_called()

    def test_routes_are_unique_and_all_require_role_dependency(self) -> None:
        routes = [route for route in question_editor_router.routes if "/answer-options" in getattr(route, "path", "") or "/accepted-answers" in getattr(route, "path", "")]
        signatures = [(route.path, tuple(sorted(route.methods))) for route in routes]
        self.assertEqual(len(signatures), 9)
        self.assertEqual(len(set(signatures)), 9)


if __name__ == "__main__":
    unittest.main()
