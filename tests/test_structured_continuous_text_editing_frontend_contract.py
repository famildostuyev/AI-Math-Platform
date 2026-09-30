from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class StructuredContinuousTextEditingFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        components = ROOT / "frontend/src/components"
        cls.editor = (components / "StructuredContinuousTextEditor.tsx").read_text(encoding="utf-8")
        cls.commands = (components / "structuredContinuousTextEditorCommands.ts").read_text(encoding="utf-8")
        cls.model = (components / "structuredContinuousTextEditorModel.ts").read_text(encoding="utf-8")
        cls.adapter = (components / "structuredTextTiptapAdapter.ts").read_text(encoding="utf-8")
        cls.canvas = (components / "UniversalQuestionCanvas.tsx").read_text(encoding="utf-8")
        cls.admin_editor = (components / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")

    def test_project_owned_command_and_active_state_apis_are_complete(self) -> None:
        for command in (
            "toggleBold", "toggleItalic", "toggleUnderline", "setFontFamily",
            "setFontSize", "setAlignment", "toggleBulletList", "toggleOrderedList",
            "insertHardBreak", "insertInlineMath", "getActiveState",
        ):
            self.assertIn(command, self.commands + self.model)
        for state in (
            "bold: boolean", "italic: boolean", "underline: boolean",
            "fontFamily:", "fontSize:", "alignment:", "bulletList:", "orderedList:",
        ):
            self.assertIn(state, self.model)
        self.assertNotIn("@tiptap/ui", self.commands + self.editor)

    def test_keyboard_editing_semantics_and_shallow_list_guards(self) -> None:
        self.assertIn("Enter: () => this.editor.commands.splitListItem('list_item')", self.editor)
        self.assertIn("|| this.editor.commands.splitBlock()", self.editor)
        self.assertIn("'Shift-Enter': () => this.editor.commands.insertContent({ type: 'hard_break' })", self.editor)
        self.assertIn("Backspace: () => deleteAdjacentInlineMath(this.editor, 'before')", self.editor)
        self.assertIn("|| this.editor.commands.joinBackward()", self.editor)
        self.assertIn("Delete: () => deleteAdjacentInlineMath(this.editor, 'after')", self.editor)
        self.assertIn("|| this.editor.commands.joinForward()", self.editor)
        self.assertIn("Tab: () => true", self.editor)
        self.assertIn("'Shift-Tab': () => true", self.editor)
        self.assertNotIn("sinkListItem", self.editor + self.commands)

    def test_only_v1_tokens_are_available_to_commands(self) -> None:
        for token in (
            "default", "serif", "sans", "math-compatible",
            "small", "normal", "large", "x-large",
            "start", "center", "end", "justify",
        ):
            self.assertIn(token, self.commands + self.model)
        for forbidden in ("'16px'", "'1rem'", "color:", "style:", "href", "highlight", "strike"):
            self.assertNotIn(forbidden, self.commands + self.model)

    def test_plain_text_paste_is_deterministic_and_html_is_not_parsed(self) -> None:
        self.assertIn("getData('text/plain')", self.editor)
        self.assertIn("replace(/\\r\\n?/g, '\\n')", self.editor)
        self.assertIn("plainText.split('\\n')", self.editor)
        self.assertIn("Slice.maxOpen(Fragment.from(paragraphs))", self.editor)
        self.assertIn("parseFormulaClipboardHtml(html)", self.editor)
        self.assertIn("getData('text/plain')", self.editor)
        self.assertNotIn("parseHTML", self.editor)

    def test_inline_math_is_explicit_and_has_no_inference(self) -> None:
        self.assertIn("insertInlineMath: (latex, onReady)", self.commands)
        self.assertIn("type: 'inline_math'", self.commands)
        self.assertIn("attrs: { latex }", self.commands)
        combined = self.editor + self.commands
        self.assertIn("addNodeView", self.editor)
        for forbidden in ("MathfieldElement", "RegExp", ".match(", "looksLike", "OpenAI", "planner", "classify"):
            self.assertNotIn(forbidden, combined)

    def test_outgoing_state_is_validated_and_normalized_before_callback(self) -> None:
        self.assertIn("tiptapToStructuredTextDocument", self.editor)
        self.assertIn("structuredTextDocumentToTiptap", self.editor)
        self.assertIn("onChangeRef.current(validatedEditorState(updatedEditor.getJSON()))", self.editor)
        self.assertNotIn("getHTML", self.editor)
        self.assertNotIn("dangerouslySetInnerHTML", self.editor)

    def test_component_exposes_commands_and_active_state_without_raw_editor(self) -> None:
        self.assertIn("onCommandsReady?:", self.editor)
        self.assertIn("onActiveStateChange?:", self.editor)
        self.assertIn("createStructuredContinuousTextCommands(editor)", self.editor)
        self.assertIn("readStructuredContinuousTextActiveState(updatedEditor)", self.editor)
        self.assertNotIn("onEditorReady", self.editor)

    def test_runtime_command_routing_and_active_state_tokens(self) -> None:
        commands_url = (ROOT / "frontend/src/components/structuredContinuousTextEditorCommands.ts").as_uri()
        script = f"""
          const api = await import({commands_url!r});
          const calls = [];
          const chain = {{
            focus() {{ calls.push(['focus']); return this; }},
            toggleMark(type) {{ calls.push(['toggleMark', type]); return this; }},
            setMark(type, attrs) {{ calls.push(['setMark', type, attrs]); return this; }},
            updateAttributes(type, attrs) {{ calls.push(['updateAttributes', type, attrs]); return this; }},
            toggleList(type, item) {{ calls.push(['toggleList', type, item]); return this; }},
            insertContent(content) {{ calls.push(['insertContent', content]); return this; }},
            run() {{ calls.push(['run']); return true; }},
          }};
          const editor = {{
            commands: {{ focus: () => true }},
            chain: () => chain,
            isActive: (type) => ['bold', 'underline', 'bullet_list'].includes(type),
            getAttributes: (type) => type === 'font_family' ? {{ value: 'serif' }}
              : type === 'font_size' ? {{ value: 'large' }}
              : {{ alignment: 'justify' }},
          }};
          const commands = api.createStructuredContinuousTextCommands(editor);
          commands.toggleBold(); commands.toggleItalic(); commands.toggleUnderline();
          for (const value of ['default', 'serif', 'sans', 'math-compatible']) commands.setFontFamily(value);
          for (const value of ['small', 'normal', 'large', 'x-large']) commands.setFontSize(value);
          for (const value of ['start', 'center', 'end', 'justify']) commands.setAlignment(value);
          commands.toggleBulletList(); commands.toggleOrderedList(); commands.insertHardBreak();
          commands.insertInlineMath('x^2');
          const state = commands.getActiveState();
          if (JSON.stringify(state) !== JSON.stringify({{
            bold: true, italic: false, underline: true, fontFamily: 'serif',
            fontSize: 'large', foregroundColor: null, backgroundColor: null,
            alignment: 'justify', bulletList: true, orderedList: false,
          }})) throw new Error(`Wrong active state: ${{JSON.stringify(state)}}`);
          if (!calls.some((call) => call[0] === 'insertContent' && call[1].type === 'inline_math' && call[1].attrs.latex === 'x^2')) {{
            throw new Error('Explicit inline math command was not routed structurally.');
          }}
          if (!calls.some((call) => call[0] === 'toggleList' && call[1] === 'ordered_list')) {{
            throw new Error('Ordered-list command was not routed.');
          }}
        """
        result = subprocess.run(
            ["node", "--experimental-strip-types", "--input-type=module", "-e", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)

    def test_no_domain_persistence_inside_editor_and_question_canvas_mount(self) -> None:
        combined = self.editor + self.commands
        for forbidden in ("../api/", "ContentBlock", "requestJson", "fetch(", ".innerHTML", "eval("):
            self.assertNotIn(forbidden, combined)
        self.assertIn("StructuredContinuousTextEditor", self.canvas)
        self.assertIn("<UniversalQuestionCanvas", self.admin_editor)


if __name__ == "__main__":
    unittest.main()
