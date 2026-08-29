from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import RoleName
from app.services.admin_ai_orchestrator import (
    AdminAIAnswerFallbackResponse,
    AdminAIAnswerSynthesis,
    AdminAIOrchestrationExecutionError,
    AdminAIOrchestrator,
    AdminAIPlanValidationError,
)
from tests.test_admin_ai_general_assistant import (
    REVISION_ID,
    FakeAssistantProvider,
    decision,
    inspect_envelope,
)


def fallback_response(
    *, requirements=("model_reasoning",), context="none", text="Təhlükəsiz cavab.",
    generated_draft=None, outcome_kind="direct_answer", mutation_code=None,
) -> AdminAIAnswerFallbackResponse:
    if "platform_mutation" in requirements:
        outcome_kind = "mutation_proposal"
        mutation_code = "admin_approval_required"
    return AdminAIAnswerFallbackResponse.model_validate({
        "schema_version": 1, "outcome_kind": outcome_kind, "requirements": requirements,
        "context_requirement": context, "answer_text": text,
        "assistant_content": {"format_version": 1, "segments": [
            {"type": "text", "text": text},
        ]},
        "generated_draft": generated_draft, "mutation_code": mutation_code,
    })


class AnswerFirstProvider:
    def __init__(self, plan_result: object, fallback: AdminAIAnswerFallbackResponse) -> None:
        self.plan_result = plan_result
        self.fallback = fallback
        self.plan_calls = 0
        self.fallback_calls = 0

    def plan(self, **_: object):
        self.plan_calls += 1
        return self.plan_result

    def answer_without_tools(self, *, request):
        self.fallback_calls += 1
        self.fallback_request = request
        return self.fallback


class GroundedFallbackProvider(FakeAssistantProvider):
    def __init__(self, fallback: AdminAIAnswerFallbackResponse) -> None:
        super().__init__(decision(
            "direct_answer", answer="Initial answer",
            context_requirement="current_question",
            requirements=("current_question_content", "model_reasoning"),
        ))
        self.fallback = fallback

    def synthesize(self, *, request):
        raise RuntimeError("safe fake optional generation failure")

    def answer_without_tools(self, *, request):
        self.fallback_request = request
        return self.fallback


def build(provider) -> tuple[AdminAIOrchestrator, MagicMock]:
    from app.services.admin_ai_foundation_registry import build_admin_ai_foundation_registry

    executor = MagicMock()
    executor.inspect_current_question.return_value = inspect_envelope()
    return AdminAIOrchestrator(
        planner=provider, synthesizer=provider,
        registry=build_admin_ai_foundation_registry(), read_executor=executor,
    ), executor


class AdminAIAnswerFirstTest(unittest.TestCase):
    def test_generic_answer_first_domains_need_no_capability(self) -> None:
        categories = ("mathematics", "pedagogy", "science", "writing", "planning", "technology")
        for category in categories:
            with self.subTest(category=category):
                malformed_safe_direct = {
                    "schema_version": 1, "outcome_kind": "direct_answer",
                    "context_requirement": "none", "requirements": ["model_reasoning"],
                    "answer_text": "Draft", "plan": None, "mutation_code": None,
                    "unsupported_code": None, "unexpected_optional_field": category,
                }
                provider = AnswerFirstProvider(malformed_safe_direct, fallback_response(text=f"{category} cavabı"))
                orchestrator, executor = build(provider)
                result = orchestrator.run(actor_role=RoleName.ADMIN, instruction="Safe generic request")
                self.assertEqual(result.response_kind, "direct_answer")
                self.assertEqual(result.execution_trace, ())
                self.assertEqual(provider.fallback_calls, 1)
                executor.assert_not_called()

    def test_fallback_cannot_answer_platform_external_file_visual_or_mutation_requirements(self) -> None:
        unsafe = ("platform_read", "external_research", "file_access", "visual_generation", "platform_mutation")
        for requirement in unsafe:
            with self.subTest(requirement=requirement):
                malformed = {
                    "outcome_kind": "direct_answer", "context_requirement": "none",
                    "requirements": ["model_reasoning"], "unexpected": True,
                }
                provider = AnswerFirstProvider(malformed, fallback_response(requirements=(requirement,)))
                orchestrator, executor = build(provider)
                with self.assertRaises(AdminAIPlanValidationError):
                    orchestrator.run(actor_role=RoleName.ADMIN, instruction="Safe fake request")
                executor.assert_not_called()

    def test_current_question_never_uses_ungrounded_fallback(self) -> None:
        malformed = {
            "outcome_kind": "direct_answer", "context_requirement": "current_question",
            "requirements": ["current_question_content", "model_reasoning"], "unexpected": True,
        }
        provider = AnswerFirstProvider(malformed, fallback_response(
            requirements=("current_question_content", "model_reasoning"), context="current_question",
        ))
        orchestrator, executor = build(provider)
        with self.assertRaises(AdminAIPlanValidationError):
            orchestrator.run(
                actor_role=RoleName.ADMIN, instruction="Safe current request",
                current_revision_id=REVISION_ID,
            )
        executor.inspect_current_question.assert_not_called()

    def test_grounded_fallback_after_inspect_uses_actual_inspect_result(self) -> None:
        provider = GroundedFallbackProvider(fallback_response(
            requirements=("current_question_content", "model_reasoning"),
            context="current_question", text="Grounded explanation",
        ))
        orchestrator, executor = build(provider)
        result = orchestrator.run(
            actor_role=RoleName.ADMIN, instruction="Safe current explanation",
            current_revision_id=REVISION_ID,
        )
        executor.inspect_current_question.assert_called_once()
        self.assertEqual(result.assistant_text, "Grounded explanation")
        self.assertEqual(len(provider.fallback_request.grounding_results), 1)
        self.assertEqual(len(result.execution_trace), 1)

    def test_solve_result_cannot_include_unrequested_generated_draft(self) -> None:
        draft = {
            "draft_kind": "question", "format_hint": "free_form", "title": None,
            "content": {"format_version": 1, "segments": [{"type": "text", "text": "Draft"}]},
            "answer_options": [], "correct_option_labels": [], "explanation": None,
            "is_canonical": False,
        }
        provider = FakeAssistantProvider(decision(
            "direct_answer", answer="Initial",
            context_requirement="current_question",
            requirements=("current_question_content", "model_reasoning"),
        ))
        provider.synthesize = lambda **_: AdminAIAnswerSynthesis(
            schema_version=1, answer_text="Solution", generated_draft=draft,
        )
        orchestrator, _ = build(provider)
        with self.assertRaises(AdminAIOrchestrationExecutionError):
            orchestrator.run(
                actor_role=RoleName.ADMIN, instruction="Safe solve request",
                current_revision_id=REVISION_ID,
            )

    def test_raw_provider_prose_is_not_a_typed_fallback(self) -> None:
        with self.assertRaises(ValidationError):
            AdminAIAnswerFallbackResponse.model_validate("raw provider prose")


if __name__ == "__main__":
    unittest.main()
