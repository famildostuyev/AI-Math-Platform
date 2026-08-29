from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import RoleName
from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_mutation_proposal_service import AdminAIMutationProposalService
from app.services.admin_ai_orchestrator import (
    AdminAIAnswerFallbackResponse,
    AdminAIConversationContext,
    AdminAIConversationTurn,
    AdminAIHostContext,
    AdminAIOptionalPlanningError,
    AdminAIOrchestrator,
)
from app.services.admin_ai_planner_grounding import (
    AdminAIPlannerCatalogGrounding,
    AdminAIQuestionTypeGrounding,
)
from tests.test_admin_ai_free_form_generation import DraftProvider, multiple_choice_draft
from tests.test_admin_ai_general_assistant import REVISION_ID, decision
from tests.test_admin_ai_host_conversation_context import HostExecutor, QUESTION_TYPE_ID, host_envelope


def host_context() -> AdminAIHostContext:
    envelope = host_envelope()
    return AdminAIHostContext(
        context_type="question_revision",
        revision_id=REVISION_ID,
        question_type_id=QUESTION_TYPE_ID,
        question_type_name="multiple_choice",
        inspect_result=envelope.capability_results[0],
    )


class MutationDraftProvider(DraftProvider):
    def __init__(self) -> None:
        super().__init__()
        self.decision = decision(
            "mutation_proposal",
            answer="A pending canonical proposal can be reviewed.",
            context_requirement="current_question",
            requirements=("current_question_content", "content_generation", "platform_mutation"),
        )


class MutationFallbackProvider(DraftProvider):
    def plan(self, **_):
        raise AdminAIOptionalPlanningError("safe fake planner parse failure")

    def answer_without_tools(self, *, request):
        self.fallback_request = request
        return AdminAIAnswerFallbackResponse(
            schema_version=1,
            outcome_kind="mutation_proposal",
            requirements=("current_question_content", "content_generation", "platform_mutation"),
            context_requirement="current_question",
            answer_text="The exact draft is ready for Admin approval.",
            generated_draft=multiple_choice_draft(),
            mutation_code="admin_approval_required",
        )


class AmbiguousMutationFallbackProvider(MutationFallbackProvider):
    def answer_without_tools(self, *, request):
        return AdminAIAnswerFallbackResponse(
            schema_version=1,
            outcome_kind="mutation_proposal",
            requirements=("current_question_content", "platform_mutation"),
            context_requirement="current_question",
            answer_text="No unambiguous draft is available.",
            generated_draft=None,
            mutation_code="admin_approval_required",
        )


class ReferencedDraftMutationFallbackProvider(AmbiguousMutationFallbackProvider):
    def answer_without_tools(self, *, request):
        return AdminAIAnswerFallbackResponse(
            schema_version=1,
            outcome_kind="mutation_proposal",
            requirements=("current_question_content", "content_generation", "platform_mutation"),
            context_requirement="current_question",
            answer_text="The referenced draft is ready for approval.",
            generated_draft=None,
            mutation_code="admin_approval_required",
        )


class AdminAIMutationProposalServiceTest(unittest.TestCase):
    @staticmethod
    def orchestrator(provider, persister):
        return AdminAIOrchestrator(
            planner=provider, synthesizer=provider,
            registry=build_admin_ai_foundation_registry(), read_executor=HostExecutor(),
            mutation_proposal_persister=persister,
            catalog_grounding=AdminAIPlannerCatalogGrounding(question_types=(
                AdminAIQuestionTypeGrounding(
                    id=QUESTION_TYPE_ID, name="multiple_choice", display_name="Multiple choice",
                ),
            )),
        )

    @patch("app.services.admin_ai_mutation_proposal_service.AIAuthoringProposalService")
    def test_generated_draft_becomes_exact_pending_action_proposal(self, proposal_service_type) -> None:
        expected = SimpleNamespace(id=uuid.uuid4())
        proposal_service_type.return_value.create_pending_proposal.return_value = expected
        service = AdminAIMutationProposalService(
            MagicMock(), provider_name="openai", model_name="gpt-5-mini",
            prompt_version="admin-ai-v1", provider_schema_version=1,
        )

        result = service.create_from_generated_draft(
            host_context=host_context(), draft=multiple_choice_draft(),
            requested_by_user_id=uuid.uuid4(),
        )

        self.assertIs(result, expected)
        kwargs = proposal_service_type.return_value.create_pending_proposal.call_args.kwargs
        actions = kwargs["action_envelope"].actions
        created = [action for action in actions if action.action_type == "create_answer_option"]
        correct = [action for action in actions if action.action_type == "set_correct_answers"][-1]
        self.assertEqual([action.label for action in created], ["A", "B", "C", "D"])
        self.assertEqual(correct.option_ids, [created[1].option_id])
        self.assertEqual(kwargs["source_revision_id"], REVISION_ID)

    def test_orchestrator_persists_only_mutation_draft_and_returns_pending_identity(self) -> None:
        provider = MutationDraftProvider()
        persister = MagicMock()
        proposal_id = uuid.uuid4()
        persister.create_from_generated_draft.return_value = SimpleNamespace(id=proposal_id)
        orchestrator = AdminAIOrchestrator(
            planner=provider, synthesizer=provider,
            registry=build_admin_ai_foundation_registry(), read_executor=HostExecutor(),
            mutation_proposal_persister=persister,
            catalog_grounding=AdminAIPlannerCatalogGrounding(question_types=(
                AdminAIQuestionTypeGrounding(
                    id=QUESTION_TYPE_ID, name="multiple_choice", display_name="Multiple choice",
                ),
            )),
        )
        actor_id = uuid.uuid4()

        result = orchestrator.run(
            actor_role=RoleName.ADMIN, actor_user_id=actor_id,
            instruction="Apply the exact generated draft", current_revision_id=REVISION_ID,
        )

        self.assertEqual(result.proposal_id, proposal_id)
        self.assertEqual(result.proposal_status, "pending")
        self.assertEqual(result.envelope.result_kind, "informational")
        self.assertIsNone(result.limitation_code)
        persister.create_from_generated_draft.assert_called_once()
        self.assertEqual(
            persister.create_from_generated_draft.call_args.kwargs["requested_by_user_id"], actor_id,
        )

    def test_ordinary_generated_draft_never_persists_proposal(self) -> None:
        provider = DraftProvider()
        persister = MagicMock()
        orchestrator = AdminAIOrchestrator(
            planner=provider, synthesizer=provider,
            registry=build_admin_ai_foundation_registry(), read_executor=HostExecutor(),
            mutation_proposal_persister=persister,
            catalog_grounding=AdminAIPlannerCatalogGrounding(question_types=(
                AdminAIQuestionTypeGrounding(
                    id=QUESTION_TYPE_ID, name="multiple_choice", display_name="Multiple choice",
                ),
            )),
        )
        result = orchestrator.run(
            actor_role=RoleName.ADMIN, actor_user_id=uuid.uuid4(),
            instruction="Generate only", current_revision_id=REVISION_ID,
        )
        self.assertIsNone(result.proposal_id)
        persister.create_from_generated_draft.assert_not_called()

    def test_provider_parse_fallback_preserves_typed_mutation_and_persists_once(self) -> None:
        provider = MutationFallbackProvider()
        persister = MagicMock()
        proposal_id = uuid.uuid4()
        persister.create_from_generated_draft.return_value = SimpleNamespace(id=proposal_id)
        with self.assertLogs("app.services.admin_ai_orchestrator", level="WARNING") as captured:
            result = self.orchestrator(provider, persister).run(
                actor_role=RoleName.ADMIN, actor_user_id=uuid.uuid4(),
                instruction="Safe fake canonical replacement request", current_revision_id=REVISION_ID,
            )
        self.assertEqual(result.response_kind, "mutation_proposal")
        self.assertEqual((result.proposal_id, result.proposal_status), (proposal_id, "pending"))
        self.assertIsNotNone(result.generated_draft)
        persister.create_from_generated_draft.assert_called_once()
        record = captured.records[-1]
        self.assertEqual(record.outcome_kind, "mutation_proposal")
        self.assertTrue(record.proposal_persisted)
        self.assertNotIn("canonical replacement request", captured.output[-1])

    def test_provider_parse_fallback_missing_draft_fails_closed(self) -> None:
        persister = MagicMock()
        with self.assertRaises(AdminAIOptionalPlanningError):
            self.orchestrator(AmbiguousMutationFallbackProvider(), persister).run(
                actor_role=RoleName.ADMIN, actor_user_id=uuid.uuid4(),
                instruction="Safe fake ambiguous replacement", current_revision_id=REVISION_ID,
            )
        persister.create_from_generated_draft.assert_not_called()

    def test_provider_parse_fallback_reuses_exact_typed_referenced_draft(self) -> None:
        persister = MagicMock()
        proposal_id = uuid.uuid4()
        persister.create_from_generated_draft.return_value = SimpleNamespace(id=proposal_id)
        referenced = multiple_choice_draft()
        result = self.orchestrator(ReferencedDraftMutationFallbackProvider(), persister).run(
            actor_role=RoleName.ADMIN, actor_user_id=uuid.uuid4(),
            instruction="Safe typed replacement", current_revision_id=REVISION_ID,
            conversation_context=AdminAIConversationContext(
                turns=(AdminAIConversationTurn(role="assistant", content="Visible prior draft"),),
                referenced_draft=referenced,
            ),
        )
        self.assertEqual(result.proposal_id, proposal_id)
        self.assertEqual(result.generated_draft, referenced)
        self.assertEqual(
            persister.create_from_generated_draft.call_args.kwargs["draft"], referenced,
        )


if __name__ == "__main__":
    unittest.main()
