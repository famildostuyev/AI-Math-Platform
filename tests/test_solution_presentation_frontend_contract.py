from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SolutionPresentationFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.presentation = (ROOT / "frontend/src/components/SolutionPresentation.tsx").read_text(encoding="utf-8")
        cls.model = (ROOT / "frontend/src/components/solutionPresentationModel.ts").read_text(encoding="utf-8")
        cls.styles = (ROOT / "frontend/src/components/SolutionPresentation.css").read_text(encoding="utf-8")

    def test_consecutive_equal_steps_group_once_without_reordering_items(self) -> None:
        self.assertIn("previous.stepIndex === item.stepIndex", self.model)
        self.assertIn("previous.items.push(item)", self.model)
        self.assertIn("group.items.map((item)", self.presentation)
        self.assertNotIn(".sort(", self.model)

    def test_null_steps_are_unnumbered_and_distinct_steps_have_headers(self) -> None:
        self.assertIn("group.stepIndex !== null &&", self.presentation)
        self.assertIn("Addım {group.stepIndex}", self.presentation)
        self.assertIn("solution-presentation__group--unnumbered", self.presentation)

    def test_roles_have_deterministic_labeled_non_color_treatments(self) -> None:
        for role, label in {
            "governing_formula": "Düstur / qayda",
            "result": "Nəticə",
            "final_answer": "Yekun cavab",
            "verification": "Yoxlama",
            "note": "Qeyd",
            "property": "Xassə / qayda",
        }.items():
            self.assertIn(role, self.presentation)
            self.assertIn(label, self.presentation)
            self.assertIn(f"solution-presentation__item--{role}", self.styles)
        self.assertIn("solution-presentation__role-label", self.presentation)
        self.assertIn("border-left", self.styles)

    def test_reasoning_is_neutral_and_no_content_heuristics_exist(self) -> None:
        self.assertIn("item.role === 'reasoning' ? null", self.presentation)
        for forbidden in ("includes(", "match(", "RegExp", "lastIndex", "sourceText.includes"):
            self.assertNotIn(forbidden, self.presentation)

    def test_math_uses_math_content_and_long_formulas_scroll(self) -> None:
        self.assertIn("<MathContent", self.presentation)
        self.assertIn("overflow-x: auto", self.styles)
        self.assertNotIn("dangerouslySetInnerHTML", self.presentation)

    def test_editor_and_admin_ai_share_the_renderer_without_replacing_editing(self) -> None:
        editor = (ROOT / "frontend/src/components/SolutionEditorSection.tsx").read_text(encoding="utf-8")
        panel = (ROOT / "frontend/src/components/AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        self.assertIn("solutionBlocksToPresentationItems", editor)
        self.assertIn("structuredExplanationToPresentationItems", panel)
        self.assertIn("createSolutionTextBlock", editor)
        self.assertIn("updateSolutionFormulaBlock", editor)

    def test_layout_is_single_column_and_dom_order_is_responsive_order(self) -> None:
        self.assertIn("display: grid", self.styles)
        self.assertNotIn("grid-template-columns", self.styles)
        self.assertNotIn("column-count", self.styles)


if __name__ == "__main__":
    unittest.main()
