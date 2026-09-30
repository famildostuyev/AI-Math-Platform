from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class InlineMathNodeViewFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        components = ROOT / "frontend/src/components"
        cls.field = (components / "MathLiveField.tsx").read_text(encoding="utf-8")
        cls.node_view = (components / "InlineMathNodeView.tsx").read_text(encoding="utf-8")
        cls.visual_input = (components / "VisualMathInput.tsx").read_text(encoding="utf-8")
        cls.editor = (components / "StructuredContinuousTextEditor.tsx").read_text(encoding="utf-8")
        cls.adapter = (components / "structuredTextTiptapAdapter.ts").read_text(encoding="utf-8")
        cls.commands = (components / "structuredContinuousTextEditorCommands.ts").read_text(encoding="utf-8")
        cls.styles = (components / "UniversalEditor.css").read_text(encoding="utf-8")
        cls.canvas = (components / "UniversalQuestionCanvas.tsx").read_text(encoding="utf-8")
        cls.question_editor = (components / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")

    def test_reusable_mathlive_field_owns_safe_controlled_lifecycle(self) -> None:
        self.assertIn("new MathfieldElement()", self.field)
        self.assertIn("field.setValue(value, { silenceNotifications: true })", self.field)
        self.assertIn("field.addEventListener('input', handleInput)", self.field)
        self.assertIn("field.removeEventListener('input', handleInput)", self.field)
        self.assertIn("field.remove()", self.field)
        self.assertIn("field.mathVirtualKeyboardPolicy = 'manual'", self.field)
        self.assertIn("sessionRef.current?.activateMath(field, historyRef.current, activeId)", self.field)
        self.assertIn("field.smartFence = true", self.field)

    def test_visual_math_input_reuses_field_and_retains_palette_insertion(self) -> None:
        self.assertIn("from './MathLiveField'", self.visual_input)
        self.assertIn("<MathLiveField", self.visual_input)
        self.assertIn("fieldRef.current?.insert(serializedValue)", self.visual_input)
        self.assertNotIn("new MathfieldElement", self.visual_input)

    def test_inline_atom_uses_react_node_view_and_updates_only_latex(self) -> None:
        self.assertIn("ReactNodeViewRenderer(InlineMathNodeView", self.editor)
        self.assertIn("atom: true", self.editor)
        self.assertIn("selectable: true", self.editor)
        self.assertIn("const latex = typeof node.attrs.latex", self.node_view)
        self.assertIn("updateAttributes({ latex: nextLatex })", self.node_view)
        self.assertNotIn("deleteNode", self.node_view)
        self.assertNotIn("setContent", self.node_view)

    def test_mathlive_boundary_navigation_returns_selection_to_prosemirror(self) -> None:
        self.assertIn("field.selectionIsCollapsed", self.field)
        self.assertIn("field.position === 0", self.field)
        self.assertIn("field.position === field.lastOffset", self.field)
        self.assertIn("onExitBeforeRef.current?.()", self.field)
        self.assertIn("onExitAfterRef.current?.()", self.field)
        self.assertIn("position + node.nodeSize", self.node_view)
        self.assertIn(".setTextSelection(", self.node_view)
        self.assertIn("event.stopPropagation()", self.field)
        self.assertIn("contentEditable={false}", self.node_view)
        self.assertIn("focus: () => fieldRef.current?.focus()", self.field)

    def test_inline_formula_has_visible_focus_and_atomic_selection_styles(self) -> None:
        self.assertIn(".universal-editor .mathlive-field:focus-within", self.styles)
        self.assertIn(".universal-editor .mathlive-field:focus,", self.styles)
        self.assertIn(".universal-editor .ProseMirror-selectednode .mathlive-field", self.styles)
        self.assertIn(".universal-editor .mathlive-field { border-color: transparent; background-color: transparent; }", self.styles)
        self.assertIn("wrapperElement?.contains(activeContext.field)", self.node_view)
        self.assertIn("data-active-formula={ownsActiveFormula || undefined}", self.node_view)
        self.assertIn("outline: 1px solid var(--ue-accent); outline-offset: 1px", self.styles)

    def test_module_switch_restores_formula_after_toolset_render(self) -> None:
        self.assertIn("restoreFormulaAfterModuleChange.current = module.id !== activeModule", self.question_editor)
        self.assertIn("useLayoutEffect(() => {", self.question_editor)
        self.assertIn("session.restoreMathTarget()", self.question_editor)

    def test_outer_backspace_and_delete_remove_only_adjacent_inline_atom(self) -> None:
        self.assertIn("adjacentNode?.type.name !== 'inline_math'", self.editor)
        self.assertIn("editor.state.tr.delete(from, from + adjacentNode.nodeSize)", self.editor)
        self.assertIn("deleteAdjacentInlineMath(this.editor, 'before')", self.editor)
        self.assertIn("deleteAdjacentInlineMath(this.editor, 'after')", self.editor)
        self.assertIn("|| this.editor.commands.joinBackward()", self.editor)
        self.assertIn("|| this.editor.commands.joinForward()", self.editor)

    def test_empty_formula_is_retained_until_an_explicit_outer_delete(self) -> None:
        self.assertIn("latex: { default: '' }", self.editor)
        self.assertIn("updateAttributes({ latex: nextLatex })", self.node_view)
        self.assertNotIn("nextLatex.trim()", self.node_view)
        self.assertNotIn("deleteNode", self.node_view)

    def test_adapter_and_explicit_insert_command_remain_latex_only(self) -> None:
        self.assertIn("type: 'inline_math'", self.adapter)
        self.assertIn("attrs: { latex: node.latex }", self.adapter)
        self.assertIn("insertInlineMath: (latex, onReady)", self.commands)
        self.assertNotIn("infer", self.adapter + self.commands)
        self.assertNotIn("classify", self.adapter + self.commands)

    def test_plain_text_paste_and_question_only_production_mount_are_intact(self) -> None:
        self.assertIn("getData('text/plain')", self.editor)
        self.assertNotIn("dangerouslySetInnerHTML", self.editor + self.node_view + self.field)
        self.assertIn("StructuredContinuousTextEditor", self.canvas)
        self.assertIn("<UniversalQuestionCanvas", self.question_editor)

    def test_node_view_has_no_persistence_ai_or_api_dependency(self) -> None:
        combined = self.field + self.node_view
        for forbidden in ("../api/", "fetch(", "requestJson", "OpenAI", "planner", "ContentBlock"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()
