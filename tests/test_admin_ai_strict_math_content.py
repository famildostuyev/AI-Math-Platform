from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.services.admin_ai_orchestrator import (
    AdminAIAnswerFallbackResponse,
    AdminAIAnswerSynthesis,
    AdminAIAssistantContent,
    AdminAIAssistantMathSegment,
    AdminAIAssistantTextSegment,
    AdminAIGeneratedDraft,
)


def structured_math():
    return {
        "format_version": 1,
        "segments": [
            {"type": "text", "text": "Bucaq əmsalı "},
            {
                "type": "math", "latex": r"m=\frac{5-n}{3-2}",
                "source_text": "m=(5-n)/(3-2)", "display_mode": False,
            },
            {"type": "text", "text": " olduğuna görə nəticəni tapırıq."},
        ],
    }


class AdminAIStrictMathContentTest(unittest.TestCase):
    def test_inline_fraction_is_ordered_text_math_text(self) -> None:
        content = AdminAIAssistantContent.model_validate(structured_math())
        self.assertEqual([segment.type for segment in content.segments], ["text", "math", "text"])

    def test_display_equation_is_valid_math_segment(self) -> None:
        segment = AdminAIAssistantMathSegment(
            type="math", latex=r"x^2+y^2=1", source_text="x²+y²=1", display_mode=True,
        )
        self.assertTrue(segment.display_mode)

    def test_raw_inline_and_display_delimiters_are_rejected_from_text(self) -> None:
        for value in (r"Use \(x+1\) here", r"Use \[x+1=2\] here", r"Use $x+1$ here", r"Use $$x+1=2$$ here"):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AdminAIAssistantTextSegment(type="text", text=value)

    def test_fraction_command_is_rejected_from_text(self) -> None:
        with self.assertRaises(ValidationError):
            AdminAIAssistantTextSegment(type="text", text=r"Value is \frac{a}{b}.")

    def test_math_segment_delimiters_are_rejected(self) -> None:
        for latex in (r"$x+1$", r"\(x+1\)", r"\[x+1\]"):
            with self.subTest(latex=latex), self.assertRaises(ValidationError):
                AdminAIAssistantMathSegment(
                    type="math", latex=latex, source_text="x+1", display_mode=False,
                )

    def test_legitimate_plain_backslash_is_not_false_positive(self) -> None:
        segment = AdminAIAssistantTextSegment(type="text", text=r"Windows path C:\Temp remains prose.")
        self.assertIn("Temp", segment.text)

    def test_synthesis_and_fallback_share_strict_contract(self) -> None:
        for model, payload in (
            (AdminAIAnswerSynthesis, {
                "schema_version": 1, "answer_text": r"Raw \frac{1}{2}",
                "assistant_content": None, "generated_draft": None,
            }),
            (AdminAIAnswerFallbackResponse, {
                "schema_version": 1, "requirements": ["model_reasoning"],
                "context_requirement": "none", "answer_text": r"Raw \(x\)",
                "assistant_content": None, "generated_draft": None,
            }),
        ):
            with self.subTest(model=model.__name__), self.assertRaises(ValidationError):
                model.model_validate(payload)

    def test_recoverable_legacy_answer_text_uses_valid_structured_content(self) -> None:
        synthesis = AdminAIAnswerSynthesis.model_validate({
            "schema_version": 1,
            "answer_text": r"Legacy \frac{1}{2} representation",
            "assistant_content": structured_math(),
            "generated_draft": None,
        })
        self.assertEqual(synthesis.assistant_content.segments[1].type, "math")

    def test_generated_draft_accepts_valid_structured_math(self) -> None:
        draft = AdminAIGeneratedDraft.model_validate({
            "draft_kind": "solution", "format_hint": "free_form", "title": "Həll",
            "content": structured_math(), "answer_options": [], "correct_option_labels": [],
            "explanation": structured_math(), "is_canonical": False,
        })
        self.assertEqual(draft.content.segments[1].type, "math")


if __name__ == "__main__":
    unittest.main()
