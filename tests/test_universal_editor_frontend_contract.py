from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UniversalEditorFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        components = ROOT / "frontend/src/components"
        cls.registry = (components / "universalEditorModules.ts").read_text(encoding="utf-8")
        cls.document_model = (components / "universalEditorDocument.ts").read_text(encoding="utf-8")
        cls.editor = (components / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")
        cls.ai_panel = (components / "AIAuthoringPanel.tsx").read_text(encoding="utf-8")
        cls.styles = (components / "UniversalEditor.css").read_text(encoding="utf-8")
        cls.ribbon = (components / "UniversalEditorRibbon.tsx").read_text(encoding="utf-8")
        cls.session = (components / "universalEditorSession.ts").read_text(encoding="utf-8")
        cls.prompt = (components / "AICommandInput.tsx").read_text(encoding="utf-8")
        cls.geometry = (components / "GeometryEditor.tsx").read_text(encoding="utf-8")
        cls.commands = (components / "structuredContinuousTextEditorCommands.ts").read_text(encoding="utf-8")

    def test_registry_has_stable_ids_and_azerbaijani_labels(self) -> None:
        expected = {
            "text": "Mətn",
            "algebra": "Cəbr",
            "geometry": "Həndəsə",
            "graph": "Qrafik",
            "table": "Cədvəl",
            "chart": "Diaqram",
            "image": "Şəkil",
            "diagram": "Sxem",
            "symbols": "Simvollar",
        }
        for module_id, label in expected.items():
            self.assertIn(f"id: '{module_id}', label: '{label}'", self.registry)

    def test_editor_tabs_are_registry_driven_and_default_to_text(self) -> None:
        self.assertIn("UNIVERSAL_EDITOR_MODULES.map", self.editor)
        self.assertIn("useState<UniversalEditorModuleId>('text')", self.editor)
        self.assertIn("setActiveModule(module.id)", self.editor)
        self.assertNotIn("setRevision(null); setActiveModule", self.editor)

    def test_module_icons_and_truthful_availability(self) -> None:
        for module_id in ("text", "algebra", "geometry", "graph", "table", "chart", "image", "diagram", "symbols"):
            self.assertIn(f"{module_id}:", self.editor)
        self.assertIn("const Icon = MODULE_ICONS[module.id]", self.editor)
        self.assertIn('<Icon size={15} aria-hidden="true" />', self.editor)
        self.assertIn("disabled={!module.available || activeSection !== 'question'}", self.editor)
        self.assertIn("aria-selected={activeModule === module.id}", self.editor)

    def test_symbol_palette_routes_to_the_retained_compatible_target(self) -> None:
        symbols = (ROOT / "frontend/src/components/universalEditorSymbols.ts").read_text(encoding="utf-8")
        for category in ("Tez-tez", "Əməliyyatlar", "Münasibətlər", "Çoxluqlar", "Yunan hərfləri", "Məntiq", "Oxlar", "Həndəsə"):
            self.assertIn(f"name: '{category}'", symbols)
        self.assertIn("universal-editor-symbol-grid", self.ribbon)
        self.assertIn("session?.restoreTextTarget()?.insertText(item.glyph)", self.ribbon)
        self.assertIn("session?.insertMath(item.latex)", self.ribbon)
        self.assertIn("insertText: (value)", self.commands)
        self.assertIn("aria-label={`${item.name} (${item.glyph})`}", self.ribbon)
        self.assertIn("grid-template-columns: repeat(8", self.styles)

    def test_font_controls_offer_validated_named_families_and_point_sizes(self) -> None:
        self.assertIn("<option value=\"serif\">Serif</option>", self.ribbon)
        for name in ("Times New Roman", "Arial", "Calibri", "Cambria", "Georgia", "Verdana"):
            self.assertIn(name, self.ribbon)
        self.assertIn("TEXT_SIZE_PRESETS.map", self.ribbon)
        self.assertNotIn('aria-label="Üslub"', self.ribbon)
        self.assertIn('className="universal-editor-global-keyboard"', self.ribbon)
        self.assertIn("canFormat(kind === 'foreground' ? 'format-foreground-color' : 'format-background-color')", self.ribbon)

    def test_contextual_colors_and_formula_clipboard_menu_are_functional(self) -> None:
        colors = self.ribbon.split('className="universal-editor-color-control"', 1)[1].split('</details>', 1)[0]
        self.assertNotIn('son rəngi tətbiq et', colors)
        self.assertEqual(colors.count('<summary'), 1)
        self.assertIn('className="universal-editor-color-icon"', colors)
        self.assertIn('backgroundColor: lastColor[kind]', colors)
        self.assertIn('<span aria-hidden="true">▾</span></summary>', colors)
        self.assertIn('open={activeMenu === menu}', colors)
        self.assertIn('.universal-editor-color-palette { position: absolute; top: 100%; left: 0;', self.styles)
        self.assertIn("textCommands?.setColor(kind", self.ribbon)
        self.assertIn("session?.formatMathColor(kind, color)", self.ribbon)
        self.assertIn("formulaClipboardHtml(latex)", self.ribbon)
        self.assertIn("navigator.clipboard.write", self.ribbon)
        self.assertIn("navigator.clipboard.read", self.ribbon)
        for command in ('copy', 'cut', 'paste', 'selectAll'):
            self.assertIn(f"runContextClipboard('{command}')", self.ribbon)
        self.assertIn("role=\"status\"", self.ribbon)
        self.assertIn("Ctrl+V istifadə edin", self.ribbon)

    def test_math_keyboard_and_context_menu_are_shared_capabilities(self) -> None:
        self.assertEqual(self.ribbon.count('className="universal-editor-global-keyboard"'), 1)
        self.assertIn("activeContext.kind !== 'text' && activeContext.kind !== 'formula'", self.ribbon)
        self.assertIn("text?.insertInlineMath('', (element)", self.session)
        self.assertIn("window.mathVirtualKeyboard?.show()", self.session)
        self.assertIn("document.addEventListener('contextmenu', open, true)", self.ribbon)
        self.assertIn('role="menu" aria-label="Redaktə menyusu"', self.ribbon)
        for command in ("'cut'", "'copy'", "'paste'", "'selectAll'"):
            self.assertIn(f"runContextClipboard({command})", self.ribbon)
        self.assertIn("window.innerWidth - 190", self.ribbon)
        self.assertIn("window.innerHeight - 180", self.ribbon)

    def test_geometry_tools_use_existing_engine_in_shared_ribbon(self) -> None:
        self.assertIn("setGeometryCommands({ id: targetId", self.geometry)
        self.assertIn("active.id !== targetId", self.geometry)
        self.assertIn("geometry?.run(item.action)", self.ribbon)
        self.assertIn("ref={session?.setGeometryToolbarHost}", self.ribbon)
        self.assertIn("<GeometryAuthoringBoard", self.geometry)
        self.assertIn("source_data: editingGeometry", self.editor)

    def test_future_modules_are_inert_not_fake_persistence(self) -> None:
        self.assertIn("available: false", self.registry)
        self.assertIn("!getUniversalEditorModule(activeModule).available", self.editor)
        self.assertIn("disabled={!module.available", self.editor)
        self.assertNotIn("createGraphBlock", self.editor)
        self.assertNotIn("createTableBlock", self.editor)

    def test_existing_authoring_engines_and_domain_sections_remain(self) -> None:
        for token in (
            "<UniversalEditorRibbon",
            "const createGeometryFrame = () => {",
            "onCreateGeometryFrame={createGeometryFrame}",
            "<AnswerEditorSection",
            "<SolutionEditorSection",
            "<AIAuthoringPanel",
            "createTextBlock(token, current.revision_id",
            "expected_revision_updated_at: current.updated_at",
        ):
            self.assertIn(token, self.editor)

    def test_algebra_is_inline_ribbon_without_redundant_formula_form(self) -> None:
        self.assertIn("data-active-module={activeModule}", self.editor)
        self.assertIn("textAuthoringEnabled={activeModule === 'text' || activeModule === 'algebra'}", self.editor)
        self.assertEqual(self.editor.count("const createGeometryFrame = () => {"), 1)
        self.assertEqual(self.editor.count("onCreateGeometryFrame={createGeometryFrame}"), 1)
        self.assertNotIn("newFormula", self.editor)
        self.assertNotIn("createFormulaBlock", self.editor)
        for label in ("Əlavə et", "Kəsr", "Qüvvət", "Kök", "Mötərizə", "Funksiya", "Cəm/hasil", "İnteqral", "Limit", "Matris", "Simvollar", "Klaviatura"):
            self.assertIn(label, self.ribbon)
        self.assertIn("session?.insertMath('', true)", self.ribbon)
        self.assertIn("text?.insertInlineMath(latex)", self.session)
        self.assertIn("restoreTextTarget()", self.session)
        self.assertIn("type: 'inline_math'", self.commands)
        self.assertIn("querySelectorAll<HTMLElement>('math-field')", self.commands)
        self.assertIn("onReady?.(field)", self.commands)
        self.assertNotIn("Yazmağa başla", self.editor)
        self.assertNotIn("Mətn blokları ilə işləyin", self.registry)

    def test_document_details_are_a_dismissible_modal_drawer_without_ids(self) -> None:
        self.assertIn("documentDrawerRef.current?.showModal()", self.editor)
        self.assertIn("onCancel={() => setDocumentDrawerOpen(false)}", self.editor)
        self.assertIn("documentButtonRef.current?.focus()", self.editor)
        self.assertNotIn("universal-editor-sidebar--right", self.editor + self.styles)
        self.assertIn('<section aria-label="Sənəd paneli">', self.editor)
        self.assertIn('className="universal-editor-document-properties"', self.editor)
        self.assertIn('workspace.getBoundingClientRect()', self.editor)
        self.assertIn('observer.disconnect()', self.editor)
        for token in ('width: min(320px, var(--document-drawer-width, 100vw))',
                      '.universal-editor-document-drawer::backdrop { background: transparent; }',
                      'overflow-y: auto', 'overflow-x: hidden',
                      '.universal-editor-document-properties dd { margin: 0;'):
            self.assertIn(token, self.styles)
        for token in (
            "revision.revision_number", "revision.status",
            "revision.source_display_name", "revision.source_detail",
            "revision.difficulty", "formatUpdatedAt(revision.updated_at)",
        ):
            self.assertIn(token, self.editor)
        for token in ("UUID", "<dd>{revision.question_type_id}", "<dd>{revision.source_id}", "<dd>{revision.revision_id}"):
            self.assertNotIn(token, self.editor)

    def test_document_labels_and_canvas_selection_survive_navigation_removal(self) -> None:
        self.assertIn("function universalDocumentNodeLabel", self.document_model)
        for label in ("Mətn", "Düstur", "Şəkil", "Həndəsə"):
            self.assertIn(label, self.document_model)
        self.assertIn("selectedNodeId={selectedDocumentNodeId}", self.editor)
        self.assertIn("setSelectedDocumentNodeId(nodeId)", self.editor)

    def test_current_document_properties_use_real_metadata_contract(self) -> None:
        drawer = self.editor.split("<dialog", 1)[1].split("</dialog>", 1)[0]
        for absent in ("Yeni sual qaralaması", "Qaralama yarat", "createDraft", "deleteBlock", "session.history"):
            self.assertNotIn(absent, drawer)
        for control in ("document-question-type", "document-difficulty"):
            opening = drawer.split(f'<select id="{control}"', 1)[1].split(">", 1)[0]
            self.assertIn("disabled={mutationDisabled", opening)
        self.assertIn("questionTypes.map", drawer)
        self.assertIn("questionTypeLabel(type)", drawer)
        self.assertNotIn("type.display_name", drawer)
        self.assertNotIn("{type.name}", drawer)
        self.assertIn("updateMetadata({ question_type_id:", drawer)
        self.assertIn("updateMetadata({ difficulty:", drawer)
        mutation = self.editor.split("const updateMetadata =", 1)[1].split("const blockForNode", 1)[0]
        self.assertIn("applyMetadata(persisted)", mutation)
        self.assertIn("expected_revision_updated_at: current.updated_at", mutation)
        self.assertIn("setIsStale(true)", mutation)
        self.assertNotIn("saveEditing", mutation)
        self.assertNotIn("session.history", mutation)
        self.assertIn("!revision &&", self.editor)
        self.assertEqual(self.editor.count("Yeni sual qaralaması"), 1)

    def test_property_labels_follow_existing_catalog_and_enum(self) -> None:
        labels = (ROOT / "frontend/src/components/questionPropertyLabels.ts").read_text(encoding="utf-8")
        enums = (ROOT / "backend/app/core/enums.py").read_text(encoding="utf-8")
        self.assertIn("type.name === 'multiple_choice') return 'Qapalı'", labels)
        self.assertIn("type.name === 'open_response') return 'Açıq'", labels)
        self.assertIn("return 'Tərcüməsi olmayan sual tipi'", labels)
        self.assertNotIn("return type.name", labels)
        self.assertNotIn("return type.display_name", labels)
        for key, label in (("easy", "Asan"), ("medium", "Orta"), ("hard", "Çətin")):
            self.assertIn(f'"{key}"', enums)
            self.assertIn(f"{key}: '{label}'", labels)
        # These are translations, never an alternative catalog with persistence IDs.
        self.assertNotIn("id:", labels)
        self.assertIn("Record<QuestionDifficulty, string>", labels)

    def test_formatting_uses_project_commands_and_unsupported_controls_are_inert(self) -> None:
        for command in ("setFontFamily", "setFontSize", "setAlignment", "toggleBold", "toggleItalic", "toggleUnderline", "toggleBulletList", "toggleOrderedList"):
            self.assertIn(f"textCommands?.{command}", self.ribbon)
        self.assertIn("textCommands?.setColor(kind", self.ribbon)
        self.assertIn("TEXT_COLOR_HEX[color]", self.ribbon)

    def test_workspace_header_and_typed_document_sections_exist(self) -> None:
        self.assertIn("Universal Sual Redaktoru", self.editor)
        self.assertIn("Sual bazası", self.editor)
        self.assertIn("type EditorDocumentSectionId", self.editor)
        for section_id in ("question", "answer", "solution", "hint", "assessment", "history"):
            self.assertIn(f"id: '{section_id}'", self.editor)
        self.assertIn("EDITOR_DOCUMENT_SECTIONS.map", self.editor)
        self.assertLess(self.editor.index('<header className="admin-editor-header">'), self.editor.index('className="universal-editor-sections"'))
        self.assertLess(self.editor.index('className="universal-editor-sections"'), self.editor.index('className="universal-editor-modules"'))
        self.assertLess(self.editor.index('className="universal-editor-modules"'), self.editor.index('<UniversalEditorRibbon'))
        self.assertIn("session.save.current?.()", self.editor)

    def test_answer_and_solution_are_exclusive_document_sections(self) -> None:
        self.assertIn("activeSection === 'answer' ? <AnswerEditorSection", self.editor)
        self.assertIn("activeSection === 'solution' ? <SolutionEditorSection", self.editor)
        question_branch = self.editor.split("activeSection === 'question' ? <>", 1)[1].split(
            ": activeSection === 'answer' ?", 1
        )[0]
        self.assertNotIn("<AnswerEditorSection", question_branch)
        self.assertNotIn("<SolutionEditorSection", question_branch)

    def test_page_navigation_retains_accessible_collapse(self) -> None:
        for token in (
            "leftPanelCollapsed", "setLeftPanelCollapsed",
            "Səhifələr panelini genişləndir", "aria-expanded={!leftPanelCollapsed}",
            "is-left-collapsed",
        ):
            self.assertIn(token, self.editor + self.styles)

    def test_left_rail_only_presents_existing_page_availability(self) -> None:
        rail = self.editor.split('<aside className="admin-authoring-source', 1)[1].split('</aside>', 1)[0]
        self.assertIn('>Səhifələr</strong>', rail)
        self.assertIn('className="universal-editor-page-preview"', rail)
        self.assertIn('Səhifə 1</span>', rail)
        self.assertIn('data-document-id={revision.revision_id}', rail)
        self.assertNotIn('aria-disabled="true"', rail)
        for obsolete in ('Struktur', 'Sənəd strukturu', 'universal-editor-block-nav', '<small>', 'role="tab', 'universalDocument.nodes'):
            self.assertNotIn(obsolete, rail)
        self.assertIn('onClick={() => setLeftPanelCollapsed((collapsed) => !collapsed)}', rail)
        self.assertIn('selectedNodeId={selectedDocumentNodeId}', self.editor)
        self.assertIn('document={universalDocument}', self.editor)

    def test_ai_is_presented_as_one_integrated_region(self) -> None:
        self.assertEqual(self.editor.count('className="universal-editor-ai"'), 1)
        self.assertNotIn('id="universal-ai-command"', self.editor)
        self.assertEqual(self.editor.count("<AIAuthoringPanel"), 1)
        self.assertIn("<AIAuthoringPanel embedded", self.editor)
        self.assertIn("embedded?: boolean", self.ai_panel)
        self.assertIn("{!embedded && <header>", self.ai_panel)
        self.assertIn(".universal-editor-ai .ai-authoring-panel", self.styles)
        default_panel = self.ai_panel.split("export default function AIAuthoringPanel", 1)[1].split("const warningLabels", 1)[0]
        self.assertEqual(default_panel.count("<AICommandInput"), 1)
        self.assertEqual(default_panel.count("const [instruction, setInstruction]"), 1)
        self.assertIn('id="ai-authoring-instruction"', self.prompt)
        self.assertIn("rows={expanded ? 2 : 1}", self.prompt)
        for label in ("AI əmri", "Bənzər suallar", "AI cavabı", "Çətinlik səviyyəsini qiymətləndir"):
            self.assertIn(label, default_panel)
        self.assertNotIn("Çətinlik səviyyəsini təyin et", default_panel)

    def test_shell_has_accessible_inert_foundations_and_no_unsafe_execution(self) -> None:
        self.assertNotIn("<PermanentFormatBar", self.editor)
        self.assertIn("aria-expanded={!leftPanelCollapsed}", self.editor)
        combined = self.registry + self.editor + self.styles
        self.assertNotIn("dangerouslySetInnerHTML", combined)
        self.assertNotIn("eval(", combined)

    def test_ai_and_keyboard_have_one_exclusive_bottom_panel_state(self) -> None:
        self.assertIn("useState<'compact' | 'ai' | 'keyboard'>('compact')", self.session)
        show_ai = self.session.split("const showAI", 1)[1].split("const toggleKeyboard", 1)[0]
        self.assertIn("window.mathVirtualKeyboard?.hide()", show_ai)
        self.assertIn("setBottomPanel(expanded ? 'ai' : 'compact')", show_ai)
        self.assertIn("setBottomPanel('keyboard')", self.session)
        self.assertIn("window.mathVirtualKeyboard?.show()", self.session)
        self.assertIn("hidden={session.bottomPanel === 'keyboard'}", self.editor)
        self.assertIn("expanded={session.bottomPanel === 'ai'}", self.editor)

    def test_module_tabs_preserve_persistent_active_context(self) -> None:
        components = ROOT / "frontend/src/components"
        session = (components / "universalEditorSession.ts").read_text(encoding="utf-8")
        ribbon = (components / "UniversalEditorRibbon.tsx").read_text(encoding="utf-8")
        geometry = (components / "GeometryEditor.tsx").read_text(encoding="utf-8")
        self.assertIn("restoreFormulaAfterModuleChange.current = module.id !== activeModule", self.editor)
        self.assertIn("setActiveModule(module.id)", self.editor)
        self.assertIn("session.restoreMathTarget()", self.editor)
        self.assertNotIn("useUniversalEditorSession(() => setActiveModule('algebra'))", self.editor)
        self.assertIn("kind: 'text'", session)
        self.assertIn("kind: 'formula'", session)
        self.assertIn("kind: 'geometry'", session)
        self.assertIn("restoreMathTarget", session)
        self.assertIn("restoreTextTarget", session)
        self.assertIn("session?.restoreMathTarget()", ribbon)
        self.assertIn("session?.activateGeometry(targetId, nextSelection)", geometry.replace("sessionRef.current?", "session?"))
        self.assertIn("if (targetId) sessionRef.current?.unregisterGeometry(targetId)", geometry)
        self.assertIn("onMouseDown={(event) => {", ribbon)
        self.assertIn("<summary {...trigger(label)} title={label}>", ribbon)

    def test_text_ribbon_uses_per_command_owner_capabilities(self) -> None:
        components = ROOT / "frontend/src/components"
        session = (components / "universalEditorSession.ts").read_text(encoding="utf-8")
        ribbon = (components / "UniversalEditorRibbon.tsx").read_text(encoding="utf-8")
        self.assertIn("FORMULA_FORMAT_CAPABILITIES", session)
        self.assertIn("'format-font-size', 'format-bold', 'format-italic'", session)
        self.assertIn("capabilities: ['geometry-edit']", session)
        self.assertIn("field.applyStyle({ variantStyle:", session)
        self.assertIn("field.applyStyle({ fontSize:", session)
        self.assertIn("field.dispatchEvent(new Event('input'", session)
        for capability in ("format-font-family", "format-font-size", "format-bold", "format-italic", "format-underline", "format-alignment", "format-list"):
            self.assertIn(f"!canFormat('{capability}')", ribbon)
        self.assertIn("session?.formatMath('bold')", ribbon)
        self.assertIn("session?.formatMath('italic')", ribbon)
        self.assertIn("session?.formatMath('font-size'", ribbon)


if __name__ == "__main__":
    unittest.main()