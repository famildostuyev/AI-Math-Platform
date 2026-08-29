from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import RoleName
from app.services.admin_ai_orchestrator import (
    AdminAIAnswerSynthesis,
    AdminAIAssistantContent,
    AdminAIGeneratedDraft,
)
from tests.test_admin_ai_general_assistant import (
    REVISION_ID,
    FakeAssistantProvider,
    decision,
    inspect_envelope,
)


def content(*segments: dict) -> AdminAIAssistantContent:
    return AdminAIAssistantContent.model_validate({
        "format_version": 1, "segments": segments,
    })


def multiple_choice_draft() -> AdminAIGeneratedDraft:
    return AdminAIGeneratedDraft.model_validate({
        "draft_kind": "question", "format_hint": "multiple_choice",
        "title": "Dəyişdirilmiş məsələ",
        "content": {"format_version": 1, "segments": [
            {"type": "text", "text": "Bucaq əmsalı -1 olan yeni məsələ."},
        ]},
        "answer_options": [
            {"label": "A", "text": "2", "content": None},
            {"label": "B", "text": "3", "content": None},
            {"label": "C", "text": "4", "content": None},
            {"label": "D", "text": "5", "content": None},
        ],
        "correct_option_labels": ["B"],
        "explanation": {"format_version": 1, "segments": [
            {"type": "text", "text": "Bucaq əmsalı düsturundan istifadə edirik:"},
            {"type": "math", "latex": "-1=\\frac{5-n}{3-2}",
             "source_text": "-1=(5-n)/(3-2)", "display_mode": True},
        ]},
        "is_canonical": False,
    })


class DraftProvider(FakeAssistantProvider):
    def __init__(self) -> None:
        super().__init__(decision(
            "direct_answer", answer="Ungrounded",
            context_requirement="current_question",
            requirements=("current_question_content", "content_generation"),
        ))

    def synthesize(self, *, request):
        self.synthesis_requests.append(request)
        return AdminAIAnswerSynthesis(
            schema_version=1,
            answer_text="Dəyişdirilmiş, saxlanılmamış qaralama hazırlandı.",
            assistant_content=content(
                {"type": "text", "text": "Düstur belə tətbiq edilir:"},
                {"type": "math", "latex": "m=\\frac{y_2-y_1}{x_2-x_1}",
                 "source_text": "m=(y2-y1)/(x2-x1)", "display_mode": True},
            ),
            generated_draft=multiple_choice_draft(),
        )


class AdminAIFreeFormGenerationTest(unittest.TestCase):
    def test_grounded_transformation_returns_noncanonical_consistent_draft(self) -> None:
        from tests.test_admin_ai_general_assistant import AdminAIGeneralAssistantTest

        provider = DraftProvider()
        orchestrator, executor = AdminAIGeneralAssistantTest().build(provider)
        executor.inspect_current_question.return_value = inspect_envelope()
        result = orchestrator.run(
            actor_role=RoleName.ADMIN,
            instruction="Safe fake grounded transformation instruction",
            current_revision_id=REVISION_ID,
        )
        executor.inspect_current_question.assert_called_once()
        self.assertEqual(result.fulfillment_status, "complete")
        self.assertFalse(result.generated_draft.is_canonical)
        self.assertEqual(result.generated_draft.format_hint, "multiple_choice")
        self.assertEqual(result.generated_draft.correct_option_labels, ("B",))
        self.assertEqual(len(result.generated_draft.answer_options), 4)
        self.assertIn("bucaq əmsalı", provider.synthesis_requests[0].capability_results[0].payload["blocks"][0]["source_text"].casefold())

    def test_math_aware_content_preserves_text_math_order_and_latex(self) -> None:
        value = content(
            {"type": "text", "text": "Düstur:"},
            {"type": "math", "latex": "\\frac{5-n}{3-2}=2",
             "source_text": "(5-n)/(3-2)=2", "display_mode": True},
            {"type": "text", "text": "Buradan nəticə alınır."},
        )
        self.assertEqual([segment.type for segment in value.segments], ["text", "math", "text"])
        self.assertEqual(value.segments[1].latex, "\\frac{5-n}{3-2}=2")

    def test_provider_markup_and_html_entities_reject(self) -> None:
        invalid = (
            {"type": "text", "text": "Nəticə &#x20; budur"},
            {"type": "math", "latex": "```latex x```", "source_text": "x", "display_mode": False},
            {"type": "math", "latex": "<math>x</math>", "source_text": "x", "display_mode": False},
        )
        for segment in invalid:
            with self.subTest(segment=segment), self.assertRaises(ValidationError):
                content(segment)

    def test_multiple_choice_draft_rejects_inconsistent_correct_reference(self) -> None:
        payload = multiple_choice_draft().model_dump(mode="json")
        payload["correct_option_labels"] = ["Z"]
        with self.assertRaises(ValidationError):
            AdminAIGeneratedDraft.model_validate(payload)

    def test_multiple_choice_draft_requires_exactly_one_correct_option(self) -> None:
        payload = multiple_choice_draft().model_dump(mode="json")
        payload["correct_option_labels"] = ["A", "B"]
        with self.assertRaises(ValidationError):
            AdminAIGeneratedDraft.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
