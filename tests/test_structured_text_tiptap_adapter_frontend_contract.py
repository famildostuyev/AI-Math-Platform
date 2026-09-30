from __future__ import annotations

import unittest
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StructuredTextTiptapAdapterFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        components = ROOT / "frontend/src/components"
        cls.adapter = (components / "structuredTextTiptapAdapter.ts").read_text(encoding="utf-8")
        cls.model = (components / "structuredContinuousTextEditorModel.ts").read_text(encoding="utf-8")
        cls.canvas = (components / "UniversalQuestionCanvas.tsx").read_text(encoding="utf-8")
        cls.editor = (components / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")

    def test_pure_bidirectional_canonical_boundary_exists(self) -> None:
        self.assertIn("structuredTextDocumentToTiptap", self.adapter)
        self.assertIn("tiptapToStructuredTextDocument", self.adapter)
        self.assertIn("StructuredContinuousTextDocumentAdapter", self.adapter)
        self.assertIn("toEditorState: structuredTextDocumentToTiptap", self.adapter)
        self.assertNotIn("fetch(", self.adapter)
        self.assertNotIn("requestJson", self.adapter)

    def test_every_v1_node_has_explicit_forward_and_reverse_mapping(self) -> None:
        for node in (
            "document", "paragraph", "text", "inline_math", "hard_break",
            "bullet_list", "ordered_list", "list_item",
        ):
            self.assertIn(node, self.adapter)
        self.assertIn("canonicalBlockToTiptap", self.adapter)
        self.assertIn("tiptapBlockToCanonical", self.adapter)

    def test_marks_have_fixed_normalization_order_and_duplicate_rejection(self) -> None:
        self.assertIn("['bold', 'italic', 'underline', 'font_family', 'font_size', 'foreground_color', 'background_color']", self.adapter)
        self.assertIn("normalizeCanonicalMarks", self.adapter)
        self.assertIn("normalizeTiptapMarks", self.adapter)
        self.assertGreaterEqual(self.adapter.count("Duplicate mark type"), 2)
        for validator in ("validFontFamily", "validFontSize", "validTextColor"):
            self.assertIn(validator, self.adapter)

    def test_alignment_null_and_all_tokens_are_mapped_without_css(self) -> None:
        self.assertIn("node.attrs?.alignment ?? null", self.adapter)
        self.assertIn("['start', 'center', 'end', 'justify']", self.adapter)
        self.assertIn("Unsupported alignment", self.adapter)
        self.assertNotIn("style", self.adapter)

    def test_inline_math_preserves_only_latex(self) -> None:
        self.assertIn("{ type: 'inline_math', attrs: { latex: node.latex } }", self.adapter)
        self.assertIn("{ type: 'inline_math', latex: string(attrs.latex", self.adapter)
        self.assertIn("exactKeys(attrs, ['latex']", self.adapter)
        for forbidden in ("RegExp", ".match(", "looksLike", "normalizeLatex", "MathfieldElement"):
            self.assertNotIn(forbidden, self.adapter)

    def test_shallow_lists_are_preserved_and_nested_lists_are_rejected_by_shape(self) -> None:
        self.assertIn("tiptapListItemToCanonical", self.adapter)
        self.assertIn("tiptapParagraphToCanonical(paragraph", self.adapter)
        self.assertIn("A list item requires at least one paragraph", self.adapter)
        self.assertNotIn("flatten", self.adapter)

    def test_empty_content_unicode_and_whitespace_are_not_trimmed(self) -> None:
        self.assertIn("content.length > 0 ? { content } : {}", self.adapter)
        self.assertIn("text: node.text", self.adapter)
        self.assertNotIn(".trim()", self.adapter)
        self.assertNotIn("normalize('NFC')", self.adapter)

    def test_reverse_mapping_rejects_unknown_nodes_marks_attrs_and_html_like_content(self) -> None:
        self.assertIn("class StructuredTextAdapterError", self.adapter)
        self.assertIn("readonly path: string", self.adapter)
        self.assertIn("Unsupported block node type", self.adapter)
        self.assertIn("Unsupported inline node type", self.adapter)
        self.assertIn("Unsupported mark type", self.adapter)
        self.assertIn("Unsupported attribute or field", self.adapter)
        for unsupported in ("heading", "blockquote", "code_block", "horizontal_rule", "image", "table", "link", "strike", "highlight", "html"):
            self.assertNotIn(f"type === '{unsupported}'", self.adapter)

    def test_adapter_has_no_ai_unsafe_dom_or_input_mutation(self) -> None:
        for forbidden in (
            "OpenAI", "planner", "classify", "dangerouslySetInnerHTML", ".innerHTML",
            "eval(", ".push(", ".splice(", "Object.assign(document",
        ):
            self.assertNotIn(forbidden, self.adapter)

    def test_production_canvas_uses_adapter_without_exposing_raw_editor_to_parent(self) -> None:
        self.assertIn("StructuredContinuousTextEditor", self.canvas)
        self.assertIn("structuredTextTiptapAdapter", self.canvas)
        self.assertNotIn("StructuredContinuousTextEditor", self.editor)
        self.assertIn("<UniversalQuestionCanvas", self.editor)

    def test_runtime_round_trips_and_strict_rejections(self) -> None:
        adapter_url = (ROOT / "frontend/src/components/structuredTextTiptapAdapter.ts").as_uri()
        script = f"""
          const adapter = await import({adapter_url!r});
          const assert = (condition, message) => {{ if (!condition) throw new Error(message); }};
          const equal = (actual, expected, message) => assert(
            JSON.stringify(actual) === JSON.stringify(expected),
            `${{message}}\nactual=${{JSON.stringify(actual)}}\nexpected=${{JSON.stringify(expected)}}`,
          );
          const marks = [
            {{ type: 'font_size', value: 'x-large' }},
            {{ type: 'underline' }},
            {{ type: 'bold' }},
            {{ type: 'font_family', value: 'math-compatible' }},
            {{ type: 'italic' }},
          ];
          const canonical = {{
            type: 'document',
            content: [
              {{ type: 'paragraph', attrs: null, content: [
                {{ type: 'text', text: '  Azərbaycan: ', marks }},
                {{ type: 'inline_math', latex: '\\\\frac{{x}}{{2}}' }},
                {{ type: 'inline_math', latex: '' }},
                {{ type: 'hard_break' }},
                {{ type: 'text', text: ' son  ', marks: [] }},
              ] }},
              ...['start', 'center', 'end', 'justify'].map((alignment) => ({{
                type: 'paragraph', attrs: {{ alignment }}, content: [],
              }})),
              {{ type: 'bullet_list', content: [
                {{ type: 'list_item', content: [
                  {{ type: 'paragraph', attrs: null, content: [{{ type: 'text', text: 'Bir', marks: [] }}] }},
                  {{ type: 'paragraph', attrs: null, content: [] }},
                ] }},
                {{ type: 'list_item', content: [
                  {{ type: 'paragraph', attrs: null, content: [{{ type: 'text', text: 'İki', marks: [] }}] }},
                ] }},
              ] }},
              {{ type: 'ordered_list', content: [
                {{ type: 'list_item', content: [
                  {{ type: 'paragraph', attrs: null, content: [{{ type: 'text', text: '\\tÜç\\n', marks: [] }}] }},
                ] }},
              ] }},
            ],
          }};
          const untouched = JSON.stringify(canonical);
          const state = adapter.structuredTextDocumentToTiptap(canonical);
          assert(JSON.stringify(canonical) === untouched, 'Forward adapter mutated its input.');
          const roundTrip = adapter.tiptapToStructuredTextDocument(state.document);
          assert(JSON.stringify(state.document) === JSON.stringify(
            adapter.structuredTextDocumentToTiptap(roundTrip).document
          ), 'Reverse/forward normalization is not deterministic.');
          equal(roundTrip.content[0].content[0].marks.map((mark) => mark.type),
            ['bold', 'italic', 'underline', 'font_family', 'font_size'],
            'Canonical mark order is not deterministic.');
          equal(roundTrip.content.slice(1, 5).map((node) => node.attrs.alignment),
            ['start', 'center', 'end', 'justify'], 'Alignments did not round-trip.');
          assert(roundTrip.content[0].content[1].latex === '\\\\frac{{x}}{{2}}', 'LaTeX changed.');
          assert(roundTrip.content[0].content[0].text === '  Azərbaycan: ', 'Unicode/whitespace changed.');
          equal(adapter.tiptapToStructuredTextDocument({{ type: 'document' }}),
            {{ type: 'document', content: [] }}, 'Empty document failed.');
          const typography = {{ type: 'document', content: [{{ type: 'paragraph', attrs: null, content: [
            {{ type: 'text', text: 'Styled', marks: [
              {{ type: 'font_family', value: 'times-new-roman' }},
              {{ type: 'font_size', value: 16 }},
              {{ type: 'foreground_color', value: '#ff0000' }},
              {{ type: 'background_color', value: '#ffff00' }},
            ] }},
          ] }}] }};
          equal(adapter.tiptapToStructuredTextDocument(adapter.structuredTextDocumentToTiptap(typography).document), typography,
            'Canonical typography and colors did not round-trip.');

          const expectError = (document, expectedPath) => {{
            const before = JSON.stringify(document);
            try {{
              adapter.tiptapToStructuredTextDocument(document);
              throw new Error(`Expected rejection at ${{expectedPath}}.`);
            }} catch (error) {{
              assert(error instanceof adapter.StructuredTextAdapterError, 'Wrong adapter error type.');
              assert(error.path.includes(expectedPath), `Unexpected error path: ${{error.path}}`);
            }}
            assert(JSON.stringify(document) === before, 'Reverse adapter mutated rejected input.');
          }};
          expectError({{ type: 'document', content: [{{ type: 'heading' }}] }}, 'content[0].type');
          expectError({{ type: 'document', content: [{{ type: 'raw_html', html: '<b>x</b>' }}] }}, 'content[0].type');
          expectError({{ type: 'document', content: [{{ type: 'paragraph', content: [
            {{ type: 'text', text: 'x', marks: [{{ type: 'link', attrs: {{ href: 'x' }} }}] }},
          ] }}] }}, 'marks[0].type');
          expectError({{ type: 'document', content: [{{ type: 'paragraph', rogue: true }}] }}, 'rogue');
          expectError({{ type: 'document', content: [{{ type: 'paragraph', attrs: {{ alignment: 'left' }} }}] }}, 'alignment');
          expectError({{ type: 'document', content: [{{ type: 'paragraph', content: [
            {{ type: 'inline_math', attrs: {{ latex: 'x', html: '<i>x</i>' }} }},
          ] }}] }}, 'html');
          expectError({{ type: 'document', content: [{{ type: 'ordered_list', content: [
            {{ type: 'list_item', content: [{{ type: 'bullet_list' }}] }},
          ] }}] }}, 'content[0].content[0].content[0].type');
          expectError({{ type: 'document', content: [{{ type: 'paragraph', content: [
            {{ type: 'text', text: 'x', marks: [{{ type: 'bold' }}, {{ type: 'bold' }}] }},
          ] }}] }}, 'marks[1]');
          for (const [type, value] of [
            ['font_family', 'url(x)'], ['font_size', 7], ['font_size', 73],
            ['foreground_color', 'var(--x)'], ['background_color', 'expression(x)'],
          ]) expectError({{ type: 'document', content: [{{ type: 'paragraph', content: [
            {{ type: 'text', text: 'x', marks: [{{ type, attrs: {{ value }} }}] }},
          ] }}] }}, 'marks[0].attrs.value');
        """
        result = subprocess.run(
            ["node", "--experimental-strip-types", "--input-type=module", "-e", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)


if __name__ == "__main__":
    unittest.main()
