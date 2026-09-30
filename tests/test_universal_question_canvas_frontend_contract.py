from __future__ import annotations

import unittest
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UniversalQuestionCanvasFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        components = ROOT / "frontend/src/components"
        cls.canvas = (components / "UniversalQuestionCanvas.tsx").read_text(encoding="utf-8")
        cls.editor = (components / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")
        cls.model = (components / "universalEditorDocument.ts").read_text(encoding="utf-8")
        cls.adapter = (components / "universalEditorDocumentAdapter.ts").read_text(encoding="utf-8")
        cls.styles = (components / "UniversalEditor.css").read_text(encoding="utf-8")

    def test_document_focus_suppresses_only_the_region_browser_outline(self) -> None:
        selector = '.universal-question-node__structured-text .ProseMirror:focus'
        rule = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', self.styles)
        self.assertIsNotNone(rule)
        self.assertIn('outline: none', rule.group(1))
        self.assertNotRegex(self.styles, r'(?m)^\s*(?:\*|:focus|:focus-visible)\s*\{[^}]*outline:\s*(?:none|0)')
        browser = (ROOT / 'tests/mathlive_ribbon_browser.mjs').read_text(encoding='utf-8')
        self.assertIn("--focused-canvas", browser)
        self.assertIn('outline:s.outlineStyle', browser)
        self.assertIn("neutral('text focus-visible')", browser)
        self.assertIn("neutral('AI expand/collapse')", browser)

    def test_document_surface_has_no_legacy_frame_and_keeps_compact_focus_cues(self) -> None:
        def rule(selector: str) -> str:
            match = re.search(re.escape(selector) + r"\s*\{([^}]*)\}", self.styles)
            self.assertIsNotNone(match, selector)
            return match.group(1)

        canvas = rule(".universal-question-canvas")
        self.assertIn("min-height: 280px", canvas)
        self.assertIn("padding:", canvas)
        self.assertIn("background: #fff", canvas)
        self.assertNotIn("border:", canvas)
        self.assertNotIn("box-shadow:", canvas)
        text = rule(".universal-question-node__structured-text .ProseMirror")
        self.assertIn("border: 0", text)
        self.assertIn("padding:", text)
        focused = rule(".universal-question-node__structured-text .ProseMirror:focus")
        self.assertNotIn("border-color:", focused)
        self.assertNotIn("box-shadow:", focused)
        self.assertNotIn(".universal-question-node__structured-text .ProseMirror:hover", self.styles)
        self.assertNotIn(".universal-question-node__structured-text .ProseMirror:focus-visible", self.styles)
        self.assertIn(".structured-inline-math[data-active-formula]", self.styles)
        self.assertIn(".universal-question-node.is-selected", self.styles)

    def test_canvas_mounts_structured_editor_for_each_text_document_node(self) -> None:
        self.assertIn("document.nodes.map", self.canvas)
        self.assertIn("node.type === 'paragraph' ? <StructuredTextRegion", self.canvas)
        self.assertIn("document={node.document}", self.canvas)
        self.assertIn("<StructuredContinuousTextEditor", self.canvas)
        self.assertNotIn("supportsPlainTextEditing", self.canvas)
        self.assertNotIn("<textarea", self.canvas)

    def test_old_continue_writing_split_is_removed(self) -> None:
        self.assertNotIn("textDraft", self.canvas + self.editor)
        self.assertNotIn("onTextDraftChange", self.canvas + self.editor)
        self.assertNotIn("universal-question-text-entry", self.canvas)
        self.assertNotIn("Mətn yazmağa davam edin", self.canvas)

    def test_empty_question_starts_locally_and_only_meaningful_content_commits(self) -> None:
        self.assertIn("textAuthoringEnabled && !hasTextNode", self.canvas)
        self.assertIn("EMPTY_TEXT_DOCUMENT", self.canvas)
        self.assertIn("if (requireMeaningful && !hasMeaningfulContent(canonical)) {", self.canvas)
        self.assertIn("requireMeaningful", self.canvas)
        self.assertIn("onCommit={onCreateText}", self.canvas)
        self.assertIn("createTextBlock(token, current.revision_id", self.editor)
        self.assertNotIn("onFocus={onCreateText", self.canvas)

    def test_adapter_is_the_only_structured_persistence_boundary(self) -> None:
        self.assertIn("structuredTextDocumentToTiptap(document)", self.canvas)
        self.assertIn("tiptapToStructuredTextDocument(editorState.document)", self.canvas)
        self.assertIn("updateTextBlock(", self.editor)
        self.assertIn("payload: { document, format_version: 1 }", self.editor)
        self.assertNotIn("getHTML", self.canvas)
        self.assertNotIn("editorState.document, format_version", self.editor)

    def test_dirty_save_lifecycle_uses_outer_blur_or_explicit_shortcut(self) -> None:
        self.assertIn("const [dirty, setDirty] = useState(false)", self.canvas)
        self.assertIn("setDirty(true)", self.canvas)
        self.assertIn("savingRef.current", self.canvas)
        self.assertIn("window.requestAnimationFrame", self.canvas)
        self.assertIn("contains(window.document.activeElement)", self.canvas)
        self.assertIn("event.ctrlKey || event.metaKey", self.canvas)
        self.assertIn("const succeeded = await onCommit(canonical)", self.canvas)
        self.assertIn("if (succeeded) setDirty(false)", self.canvas)
        self.assertNotIn("onCommit(nextState", self.canvas)

    def test_optimistic_concurrency_and_failed_draft_retention_are_preserved(self) -> None:
        self.assertIn("expected_revision_updated_at: current.updated_at", self.editor)
        self.assertIn("return false", self.editor)
        self.assertIn("if (succeeded) setDirty(false)", self.canvas)
        self.assertNotIn("finally {\n      setDirty(false)", self.canvas)

    def test_editor_chrome_preserves_active_region_until_genuine_departure(self) -> None:
        self.assertIn("'[data-editor-ribbon], .universal-editor-modules'", self.canvas)
        self.assertIn("if (isEditorChrome(event.relatedTarget))", self.canvas)
        self.assertIn("if (isEditorChrome(window.document.activeElement))", self.canvas)
        self.assertIn("if (!isEditorChrome(event.relatedTarget)) return", self.canvas)
        self.assertIn("void commitRef.current()", self.canvas)

    def test_multiple_text_blocks_remain_independent_and_visually_continuous(self) -> None:
        self.assertIn("onUpdateText(node.id, nextDocument)", self.canvas)
        self.assertNotIn("merge", self.canvas.lower())
        self.assertNotIn("consolidate", self.canvas.lower())
        self.assertIn(".universal-question-node--text + .universal-question-node--text", self.styles)
        self.assertIn("border: 0", self.styles)

    def test_display_formula_geometry_and_visual_paths_remain_separate(self) -> None:
        self.assertIn("case 'display_formula'", self.canvas)
        self.assertIn("display_mode: true", self.canvas)
        self.assertIn("<VisualContentRenderer node={node} />", self.canvas)
        self.assertIn("<GeometryEditor value={editingGeometry}", self.canvas)
        self.assertIn("<VisualMathInput value={editingValue}", self.canvas)

    def test_pages_navigator_represents_the_single_loaded_document(self) -> None:
        self.assertIn("useState(true)", self.editor)
        navigator = self.editor.split('aria-label="Sənəd naviqasiyası"', 1)[1].split("</aside>", 1)[0]
        self.assertIn('Səhifələr</strong>', navigator)
        self.assertNotIn('Struktur', navigator)
        self.assertNotIn('role="tab"', navigator)
        self.assertIn('aria-expanded={!leftPanelCollapsed}', navigator)
        self.assertIn('setLeftPanelCollapsed((collapsed) => !collapsed)', navigator)
        self.assertEqual(navigator.count('className="universal-editor-page-item"'), 1)
        self.assertIn('data-document-id={revision.revision_id}', navigator)
        self.assertIn('aria-current="page"', navigator)
        self.assertIn('className="universal-editor-page-preview" aria-hidden="true"', navigator)
        self.assertIn('Səhifə 1</span>', navigator)
        self.assertNotIn('universalDocument.nodes.map', navigator)
        self.assertNotIn('MathLive', navigator)
        self.assertNotIn('onClick', navigator.split('<ol', 1)[1])
        for style in ('overflow-y: auto', 'overflow-x: hidden', 'aspect-ratio: 1 / 1.414', 'border-color: var(--ue-accent)'):
            self.assertIn(style, self.styles)

    def test_answer_solution_and_security_boundaries_remain_intact(self) -> None:
        self.assertIn("activeSection === 'answer' ? <AnswerEditorSection", self.editor)
        self.assertIn("activeSection === 'solution' ? <SolutionEditorSection", self.editor)
        combined = self.canvas + self.model + self.adapter
        for forbidden in (
            "OpenAI", "planner", "classify", "looksLike", "RegExp", ".match(",
            "dangerouslySetInnerHTML", "innerHTML", "eval(", "text/html",
        ):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()
