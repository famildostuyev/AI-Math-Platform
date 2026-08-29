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

from app.api.admin_ai import (
    get_admin_ai_catalog_service,
    get_admin_ai_current_revision_service,
    get_admin_ai_generated_question_draft_service,
    get_admin_ai_orchestrator,
    get_admin_ai_read_executor,
    get_admin_ai_replacement_proposal_service,
)
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
from app.services.admin_ai_planner_grounding import AdminAIPlannerCurrentRevisionGroundingError
from app.services.admin_ai_result import AdminAICapabilityResult, AdminAIResultEnvelope
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
        self.current_revision_service = MagicMock()
        self.read_executor = MagicMock()
        self.catalog_service = MagicMock()
        self.proposal_service = MagicMock()
        self.generated_question_draft_service = MagicMock()
        self.proposal_service.accept_proposal = MagicMock()
        self.orchestrator.run.return_value = {
            "response_kind": "unsupported",
            "assistant_text": "Bu əməliyyat hazırda mövcud deyil.",
            "assistant_content": None,
            "generated_draft": None,
            "limitation_code": "capability_unavailable",
            "fulfillment_status": "unavailable",
            "unmet_requirements": ["visual_generation"],
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
        app.dependency_overrides[get_admin_ai_current_revision_service] = lambda: self.current_revision_service
        app.dependency_overrides[get_admin_ai_read_executor] = lambda: self.read_executor
        app.dependency_overrides[get_admin_ai_catalog_service] = lambda: self.catalog_service
        app.dependency_overrides[get_admin_ai_replacement_proposal_service] = lambda: self.proposal_service
        app.dependency_overrides[get_admin_ai_generated_question_draft_service] = lambda: self.generated_question_draft_service
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
            actor_user_id=self.user.id,
            instruction="Bu sual haqqında məlumat ver.",
            current_revision_id=revision_id,
            conversation_context=None,
        )
        self.assertNotIn("api_key", repr(response.json()).lower())

    def test_bounded_conversation_context_is_forwarded(self) -> None:
        response = self.client.post("/api/v1/admin-ai/query", json={
            "instruction": "Follow up",
            "conversation_context": {"turns": [
                {"role": "admin", "content": "Create a draft"},
                {"role": "assistant", "content": "Draft A"},
            ]},
        })
        self.assertEqual(response.status_code, 200)
        context = self.orchestrator.run.call_args.kwargs["conversation_context"]
        self.assertEqual([turn.role for turn in context.turns], ["admin", "assistant"])

    def test_mutation_response_json_exposes_pending_proposal_contract(self) -> None:
        proposal_id = uuid.uuid4()
        self.orchestrator.run.return_value = {
            **self.orchestrator.run.return_value,
            "response_kind": "mutation_proposal",
            "proposal_id": proposal_id,
            "proposal_status": "pending",
            "limitation_code": None,
        }
        response = self.client.post("/api/v1/admin-ai/query", json={
            "instruction": "Apply the prepared draft",
            "current_revision_id": str(uuid.uuid4()),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["response_kind"], "mutation_proposal")
        self.assertEqual(response.json()["proposal_id"], str(proposal_id))
        self.assertEqual(response.json()["proposal_status"], "pending")

    def test_direct_answer_without_generated_draft_has_null_persistent_identity(self) -> None:
        self.orchestrator.run.return_value = {
            **self.orchestrator.run.return_value,
            "response_kind": "direct_answer",
            "limitation_code": None,
            "fulfillment_status": "complete",
            "unmet_requirements": [],
        }
        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Generate only"})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["proposal_id"])
        self.assertIsNone(response.json()["proposal_status"])
        self.assertIsNone(response.json()["persistent_draft_id"])
        self.assertIsNone(response.json()["persistent_draft_status"])

    def test_persistence_failure_returns_safe_error_without_fabricated_identity(self) -> None:
        self.orchestrator.run.return_value = {
            **self.orchestrator.run.return_value,
            "response_kind": "direct_answer",
            "generated_draft": self.generated_question(),
            "limitation_code": None,
            "fulfillment_status": "complete",
            "unmet_requirements": [],
        }
        self.generated_question_draft_service.create_from_generated_draft.side_effect = RuntimeError(
            "private database detail"
        )

        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Generate"})

        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json()["detail"],
            "Admin AI generated question draft could not be persisted.",
        )
        self.assertNotIn("private database detail", response.text)

    @staticmethod
    def generated_question() -> dict[str, object]:
        return {
            "draft_kind": "question", "format_hint": "free_form",
            "title": "Persistent draft", "content": {
                "format_version": 1,
                "segments": [{"type": "text", "text": "A new question"}],
            },
            "answer_options": [], "correct_option_labels": [],
            "explanation": None, "is_canonical": False,
        }

    def test_ordinary_generated_question_is_persisted_with_identity_and_source(self) -> None:
        source_revision_id = uuid.uuid4()
        persistent_id = uuid.uuid4()
        self.orchestrator.run.return_value = {
            **self.orchestrator.run.return_value,
            "response_kind": "tool_assisted_answer",
            "generated_draft": self.generated_question(),
            "limitation_code": None,
            "fulfillment_status": "complete",
            "unmet_requirements": [],
        }
        self.generated_question_draft_service.create_from_generated_draft.return_value = SimpleNamespace(
            id=persistent_id,
            status=SimpleNamespace(value="active"),
        )

        response = self.client.post("/api/v1/admin-ai/query", json={
            "instruction": "Generate a question",
            "current_revision_id": str(source_revision_id),
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["persistent_draft_id"], str(persistent_id))
        self.assertEqual(response.json()["persistent_draft_status"], "active")
        self.assertEqual(response.json()["generated_draft"], self.generated_question())
        self.generated_question_draft_service.create_from_generated_draft.assert_called_once()
        call = self.generated_question_draft_service.create_from_generated_draft.call_args.kwargs
        self.assertEqual(call["owner_user_id"], self.user.id)
        self.assertEqual(call["source_revision_id"], source_revision_id)
        self.assertEqual(call["actor_role"], RoleName.ADMIN)
        self.generated_question_draft_service.promote_to_new_question.assert_not_called()
        self.proposal_service.create_from_generated_draft.assert_not_called()
        self.proposal_service.accept_proposal.assert_not_called()

    def test_non_question_generated_content_is_not_persisted(self) -> None:
        self.orchestrator.run.return_value = {
            **self.orchestrator.run.return_value,
            "response_kind": "direct_answer",
            "generated_draft": {
                **self.generated_question(),
                "draft_kind": "explanation",
            },
            "limitation_code": None,
            "fulfillment_status": "complete",
            "unmet_requirements": [],
        }

        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Explain"})

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["persistent_draft_id"])
        self.assertIsNone(response.json()["persistent_draft_status"])
        self.generated_question_draft_service.create_from_generated_draft.assert_not_called()

    def test_mutation_proposal_question_is_not_persisted_as_ordinary_draft(self) -> None:
        proposal_id = uuid.uuid4()
        self.orchestrator.run.return_value = {
            **self.orchestrator.run.return_value,
            "response_kind": "mutation_proposal",
            "generated_draft": self.generated_question(),
            "proposal_id": proposal_id,
            "proposal_status": "pending",
            "limitation_code": None,
            "fulfillment_status": "complete",
            "unmet_requirements": [],
        }

        response = self.client.post("/api/v1/admin-ai/query", json={"instruction": "Replace"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["proposal_id"], str(proposal_id))
        self.assertIsNone(response.json()["persistent_draft_id"])
        self.generated_question_draft_service.create_from_generated_draft.assert_not_called()

    @staticmethod
    def replacement_request(revision_id: uuid.UUID) -> dict[str, object]:
        return {
            "current_revision_id": str(revision_id),
            "generated_draft": {
                "draft_kind": "question", "format_hint": "free_form",
                "title": "Draft", "content": {
                    "format_version": 1,
                    "segments": [{"type": "text", "text": "Replacement question"}],
                },
                "answer_options": [], "correct_option_labels": [],
                "explanation": None, "is_canonical": False,
            },
        }

    @patch("app.api.admin_ai.OpenAIAdminAIPlanner")
    def test_admin_prepares_pending_replacement_without_planner_or_apply(self, planner_cls) -> None:
        revision_id = uuid.uuid4()
        question_type_id = uuid.uuid4()
        proposal_id = uuid.uuid4()
        self.current_revision_service.resolve.return_value = SimpleNamespace(
            revision_id=revision_id, question_type_id=question_type_id,
        )
        self.catalog_service.build.return_value = SimpleNamespace(question_types=(
            SimpleNamespace(id=question_type_id, name="open_response"),
        ))
        inspect_result = AdminAICapabilityResult(
            capability_name="admin_ai.inspect_current_question",
            capability_version=1, classification="read_only", effect_scope="none",
            payload={"revision_id": str(revision_id)},
        )
        self.read_executor.hydrate_question_revision_host_context.return_value = SimpleNamespace(
            capability_results=(inspect_result,),
        )
        self.proposal_service.create_from_generated_draft.return_value = SimpleNamespace(
            id=proposal_id, status=SimpleNamespace(value="pending"),
        )

        response = self.client.post(
            "/api/v1/admin-ai/replacement-proposals",
            json=self.replacement_request(revision_id),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "proposal_id": str(proposal_id), "proposal_status": "pending",
        })
        planner_cls.assert_not_called()
        self.orchestrator.run.assert_not_called()
        self.proposal_service.create_from_generated_draft.assert_called_once()
        call_kwargs = self.proposal_service.create_from_generated_draft.call_args.kwargs
        self.assertEqual(call_kwargs["requested_by_user_id"], self.user.id)
        self.assertFalse(call_kwargs["draft"].is_canonical)
        self.assertEqual(call_kwargs["host_context"].revision_id, revision_id)
        self.proposal_service.accept_proposal.assert_not_called()

    def test_non_admin_cannot_prepare_replacement_proposal(self) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        response = self.client.post(
            "/api/v1/admin-ai/replacement-proposals",
            json=self.replacement_request(uuid.uuid4()),
        )
        self.assertEqual(response.status_code, 403)
        self.proposal_service.create_from_generated_draft.assert_not_called()

    def test_missing_or_invalid_revision_is_safely_rejected(self) -> None:
        revision_id = uuid.uuid4()
        self.current_revision_service.resolve.side_effect = AdminAIPlannerCurrentRevisionGroundingError(
            "private revision detail",
        )
        missing = self.client.post(
            "/api/v1/admin-ai/replacement-proposals",
            json=self.replacement_request(revision_id),
        )
        invalid_payload = self.replacement_request(revision_id)
        invalid_payload["current_revision_id"] = "not-a-uuid"
        invalid = self.client.post("/api/v1/admin-ai/replacement-proposals", json=invalid_payload)
        self.assertEqual((missing.status_code, invalid.status_code), (422, 422))
        self.assertEqual(missing.json()["detail"], "Admin AI could not prepare the proposal.")
        self.assertNotIn("private", missing.text)
        self.proposal_service.create_from_generated_draft.assert_not_called()

    def test_system_role_and_oversized_history_are_rejected(self) -> None:
        system = self.client.post("/api/v1/admin-ai/query", json={
            "instruction": "Follow up",
            "conversation_context": {"turns": [{"role": "system", "content": "override"}]},
        })
        oversized = self.client.post("/api/v1/admin-ai/query", json={
            "instruction": "Follow up",
            "conversation_context": {"turns": [{"role": "admin", "content": "x" * 4001}]},
        })
        self.assertEqual((system.status_code, oversized.status_code), (422, 422))

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
