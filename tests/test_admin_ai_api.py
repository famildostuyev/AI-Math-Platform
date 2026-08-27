from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = "test-verification-code-hash-key-01"

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient

from app.api.admin_ai import get_admin_ai_orchestrator
from app.api.deps import get_current_active_user
from app.core.enums import RoleName
from app.database.session import get_db
from app.main import app
from app.services.admin_ai_orchestrator import (
    AdminAIOrchestrationExecutionError,
    AdminAIPlanValidationError,
)
from app.services.admin_ai_validation_diagnostic import (
    AdminAIValidationCategory,
    AdminAIValidationDiagnostic,
    AdminAIValidationStage,
)
from app.services.admin_ai_result import AdminAIResultEnvelope
from app.services.openai_admin_ai_planner import (
    OpenAIAdminAIPlannerInvalidRequestError,
    OpenAIAdminAIPlannerTimeoutError,
)


class AdminAIQueryApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        self.user = SimpleNamespace(id=uuid.uuid4(), last_active_role_id=uuid.uuid4())
        self.orchestrator = MagicMock()
        self.orchestrator.run.return_value = {
            "envelope": AdminAIResultEnvelope(
                schema_version=1,
                result_kind="unsupported",
                capability_results=(),
                source_snapshots=(),
                warnings=(),
                unsupported_reason="Requested operation is not available in read-only Admin AI.",
            ),
            "execution_trace": (),
        }

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_active_user] = lambda: self.user
        app.dependency_overrides[get_admin_ai_orchestrator] = lambda: self.orchestrator
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_admin_query_returns_typed_safe_result(self) -> None:
        revision_id = uuid.uuid4()
        response = self.client.post("/api/v1/admin-ai/query", json={
            "instruction": "Bu sual haqqında məlumat ver.",
            "current_revision_id": str(revision_id),
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["envelope"]["result_kind"], "unsupported")
        self.orchestrator.run.assert_called_once_with(
            actor_role=RoleName.ADMIN,
            instruction="Bu sual haqqında məlumat ver.",
            current_revision_id=revision_id,
        )
        self.assertNotIn("api_key", repr(response.json()).lower())

    def test_anonymous_is_rejected_before_orchestrator(self) -> None:
        app.dependency_overrides.pop(get_current_active_user)
        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Inspect"})
        self.assertIn(response.status_code, (401, 403))
        self.orchestrator.run.assert_not_called()

    def test_non_admin_is_rejected_before_orchestrator(self) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Inspect"})
        self.assertEqual(response.status_code, 403)
        self.orchestrator.run.assert_not_called()

    def test_request_rejects_unknown_fields_and_invalid_uuid(self) -> None:
        unknown = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Inspect", "model": "override"})
        invalid_uuid = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Inspect", "current_revision_id": "bad"})
        self.assertEqual((unknown.status_code, invalid_uuid.status_code), (422, 422))
        self.orchestrator.run.assert_not_called()

    def test_timeout_is_safely_mapped(self) -> None:
        self.orchestrator.run.side_effect = OpenAIAdminAIPlannerTimeoutError("secret provider detail")
        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Inspect"})
        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.json()["detail"], "Admin AI request timed out.")
        self.assertNotIn("secret", response.text)

    def test_execution_failure_is_safely_mapped(self) -> None:
        self.orchestrator.run.side_effect = AdminAIOrchestrationExecutionError(
            "internal detail", execution_trace=(),
        )
        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Inspect"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("internal", response.text)

    def test_plan_diagnostic_remains_internal_and_public_error_is_generic(self) -> None:
        self.orchestrator.run.side_effect = AdminAIPlanValidationError(
            AdminAIValidationDiagnostic(
                category=AdminAIValidationCategory.GROUNDING_ID_INVALID,
                stage=AdminAIValidationStage.GROUNDING_VALIDATION,
                capability_name="admin_ai.search_questions", capability_version=1,
                call_index=1,
            )
        )
        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Inspect"})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Admin AI returned an invalid plan.")
        self.assertNotIn("grounding", response.text)
        self.assertNotIn("search_questions", response.text)

    @patch("app.api.admin_ai.OpenAIAdminAIPlanner")
    def test_missing_credentials_are_safely_mapped_by_factory(self, planner_cls) -> None:
        planner_cls.side_effect = OpenAIAdminAIPlannerInvalidRequestError("credential detail")
        with self.assertRaises(Exception) as raised:
            get_admin_ai_orchestrator(self.db)
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.detail, "Admin AI is not configured.")


if __name__ == "__main__":
    unittest.main()
