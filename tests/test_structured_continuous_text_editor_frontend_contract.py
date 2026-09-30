from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StructuredContinuousTextEditorFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        frontend = ROOT / "frontend"
        components = frontend / "src/components"
        cls.editor = (components / "StructuredContinuousTextEditor.tsx").read_text(encoding="utf-8")
        cls.model = (components / "structuredContinuousTextEditorModel.ts").read_text(encoding="utf-8")
        cls.canvas = (components / "UniversalQuestionCanvas.tsx").read_text(encoding="utf-8")
        cls.question_editor = (components / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")
        cls.package = json.loads((frontend / "package.json").read_text(encoding="utf-8"))

    def test_minimal_headless_tiptap_dependency_boundary(self) -> None:
        dependencies = self.package["dependencies"]
        for dependency in ("@tiptap/core", "@tiptap/react", "@tiptap/pm"):
            self.assertIn(dependency, dependencies)
        self.assertNotIn("@tiptap/starter-kit", dependencies)
        self.assertIn("useEditor", self.editor)
        self.assertIn("<EditorContent editor={editor}", self.editor)

    def test_editor_has_no_persistence_or_domain_service_dependency(self) -> None:
        for forbidden in ("../api/", "ContentBlock", "fetch(", "requestJson", "OpenAI", "planner", "classify"):
            self.assertNotIn(forbidden, self.editor)

    def test_restricted_v1_nodes_are_explicit(self) -> None:
        for node in ("document", "paragraph", "text", "hard_break", "bullet_list", "ordered_list", "list_item"):
            self.assertIn(f"name: '{node}'", self.editor)
        self.assertIn("content: 'paragraph+'", self.editor)
        self.assertNotIn("heading", self.editor)
        self.assertNotIn("blockquote", self.editor)

    def test_restricted_marks_and_attributes_are_explicit(self) -> None:
        for mark in ("bold", "italic", "underline", "font_family", "font_size"):
            self.assertIn(mark, self.editor + self.model)
        self.assertIn("alignment", self.editor + self.model)
        for forbidden in ("strike", "link", "highlight"):
            self.assertNotIn(forbidden, self.editor + self.model)
        self.assertIn("tokenMark('foreground_color')", self.editor)
        self.assertIn("tokenMark('background_color')", self.editor)

    def test_inline_math_remains_a_restricted_structural_atom(self) -> None:
        self.assertIn("name: 'inline_math'", self.editor)
        self.assertIn("inline: true", self.editor)
        self.assertIn("atom: true", self.editor)
        self.assertIn("selectable: true", self.editor)
        self.assertIn("latex: { default: '' }", self.editor)
        self.assertNotIn("MathfieldElement", self.editor)
        self.assertIn("ReactNodeViewRenderer(InlineMathNodeView", self.editor)
        self.assertNotIn("RegExp", self.editor)
        self.assertNotIn("looksLike", self.editor)

    def test_structured_json_and_future_canonical_adapter_are_explicit(self) -> None:
        self.assertIn("StructuredContinuousTextEditorState", self.model)
        self.assertIn("RestrictedTiptapDocument", self.model)
        self.assertIn("StructuredContinuousTextDocumentAdapter", self.model)
        self.assertIn("toEditorState(document: StructuredTextDocument)", self.model)
        self.assertIn("toCanonicalDocument(state: StructuredContinuousTextEditorState)", self.model)
        self.assertIn("updatedEditor.getJSON()", self.editor)
        self.assertNotIn("getHTML", self.editor)
        self.assertNotIn("setContent(", self.editor)

    def test_security_and_plain_text_paste_boundary(self) -> None:
        combined = self.editor + self.model
        for forbidden in ("dangerouslySetInnerHTML", ".innerHTML", "eval(", "parseHTML", "script", "onerror"):
            self.assertNotIn(forbidden, combined)
        self.assertIn("getData('text/plain')", self.editor)
        self.assertIn("tr.insertText(lines[0])", self.editor)
        self.assertIn("Slice.maxOpen(Fragment.from(paragraphs))", self.editor)

    def test_question_canvas_mounts_editor_without_changing_geometry_path(self) -> None:
        self.assertIn("StructuredContinuousTextEditor", self.canvas)
        self.assertIn("<UniversalQuestionCanvas", self.question_editor)
        self.assertIn("<GeometryEditor value={editingGeometry}", self.canvas)
        self.assertIn("<VisualContentRenderer node={node}", self.canvas)


if __name__ == "__main__":
    unittest.main()
