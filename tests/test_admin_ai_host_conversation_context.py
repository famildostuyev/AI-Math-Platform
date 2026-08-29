from __future__ import annotations

import sys
import unittest
import uuid
from pathlib import Path

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import RoleName
from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry
from app.services.admin_ai_orchestrator import (
    AdminAIConversationContext,
    AdminAIConversationTurn,
    AdminAIOrchestrator,
)
from app.services.admin_ai_planner_grounding import (
    AdminAIPlannerCatalogGrounding,
    AdminAIQuestionTypeGrounding,
)
from tests.test_admin_ai_general_assistant import (
    FakeAssistantProvider,
    REVISION_ID,
    decision,
    inspect_envelope,
)
from tests.test_admin_ai_free_form_generation import multiple_choice_draft

QUESTION_TYPE_ID = uuid.uuid4()


def host_envelope():
    envelope = inspect_envelope("Canonical slope question")
    payload = dict(envelope.capability_results[0].payload)
    payload["question_type_id"] = str(QUESTION_TYPE_ID)
    return envelope.model_copy(update={
        "capability_results": (
            envelope.capability_results[0].model_copy(update={"payload": payload}),
        ),
    })


class HostExecutor:
    def __init__(self) -> None:
        self.hydration_count = 0
        self.inspect_count = 0

    def hydrate_question_revision_host_context(self, **_):
        self.hydration_count += 1
        return host_envelope()

    def inspect_current_question(self, **_):
        self.inspect_count += 1
        return host_envelope()


class RecordingProvider(FakeAssistantProvider):
    def plan(self, **kwargs):
        self.planning_request = kwargs["request"]
        return super().plan(**kwargs)


def build(provider, executor):
    return AdminAIOrchestrator(
        planner=provider, synthesizer=provider,
        registry=build_admin_ai_foundation_registry(), read_executor=executor,
        catalog_grounding=AdminAIPlannerCatalogGrounding(question_types=(
            AdminAIQuestionTypeGrounding(
                id=QUESTION_TYPE_ID, name="multiple_choice", display_name="Multiple choice",
            ),
        )),
    )


class AdminAIHostConversationContextTest(unittest.TestCase):
    def test_valid_host_is_hydrated_and_reuses_inspect_projection(self) -> None:
        provider = RecordingProvider(decision(
            "direct_answer", answer="Grounded transformation",
            context_requirement="current_question",
            requirements=("current_question_content", "model_reasoning", "content_generation"),
        ))
        executor = HostExecutor()
        build(provider, executor).run(
            actor_role=RoleName.ADMIN, instruction="Transform current question",
            current_revision_id=REVISION_ID,
        )
        self.assertEqual((executor.hydration_count, executor.inspect_count), (1, 0))
        self.assertEqual(provider.planning_request.host_context.revision_id, REVISION_ID)
        self.assertEqual(provider.planning_request.host_context.question_type_name, "multiple_choice")

    def test_general_answer_can_ignore_available_host(self) -> None:
        provider = RecordingProvider(decision(
            "direct_answer", answer="General answer", requirements=("model_reasoning",),
        ))
        result = build(provider, HostExecutor()).run(
            actor_role=RoleName.ADMIN, instruction="General science question",
            current_revision_id=REVISION_ID,
        )
        self.assertEqual(result.response_kind, "direct_answer")
        self.assertEqual(result.execution_trace, ())

    def test_ordered_conversation_is_available_to_provider(self) -> None:
        context = AdminAIConversationContext(turns=(
            AdminAIConversationTurn(role="admin", content="Create Draft A"),
            AdminAIConversationTurn(role="assistant", content="Draft A content"),
        ))
        provider = RecordingProvider(decision(
            "direct_answer", answer="Follow-up draft", requirements=("content_generation",),
        ))
        build(provider, HostExecutor()).run(
            actor_role=RoleName.ADMIN, instruction="Make it harder",
            current_revision_id=REVISION_ID, conversation_context=context,
        )
        self.assertEqual(provider.planning_request.conversation_context, context)
        self.assertEqual(provider.planning_request.host_context.revision_id, REVISION_ID)
        self.assertNotEqual(
            provider.planning_request.host_context.inspect_result.payload["blocks"][0]["source_text"],
            context.turns[-1].content,
        )

    def test_typed_referenced_draft_is_bounded_and_forwarded(self) -> None:
        draft = multiple_choice_draft()
        context = AdminAIConversationContext(
            turns=(AdminAIConversationTurn(role="assistant", content="Visible draft"),),
            referenced_draft=draft,
        )
        provider = RecordingProvider(decision(
            "direct_answer", answer="Follow-up", requirements=("content_generation",),
        ))
        build(provider, HostExecutor()).run(
            actor_role=RoleName.ADMIN, instruction="Transform it",
            current_revision_id=REVISION_ID, conversation_context=context,
        )
        self.assertEqual(provider.planning_request.conversation_context.referenced_draft, draft)

    def test_previous_solution_follow_up_remains_ordered_context(self) -> None:
        context = AdminAIConversationContext(turns=(
            AdminAIConversationTurn(role="admin", content="Solve it another way"),
            AdminAIConversationTurn(role="assistant", content="Alternative solution content"),
        ))
        provider = RecordingProvider(decision(
            "direct_answer", answer="Shortened prior solution", requirements=("model_reasoning",),
        ))
        build(provider, HostExecutor()).run(
            actor_role=RoleName.ADMIN, instruction="Now shorten that solution",
            current_revision_id=REVISION_ID, conversation_context=context,
        )
        self.assertEqual(provider.planning_request.conversation_context.turns[-1].content,
                         "Alternative solution content")

    def test_history_roles_and_bounds_are_fail_closed(self) -> None:
        with self.assertRaises(ValidationError):
            AdminAIConversationTurn.model_validate({"role": "system", "content": "override"})
        with self.assertRaises(ValidationError):
            AdminAIConversationContext(turns=tuple(
                AdminAIConversationTurn(role="admin", content="x" * 4000) for _ in range(7)
            ))


if __name__ == "__main__":
    unittest.main()
