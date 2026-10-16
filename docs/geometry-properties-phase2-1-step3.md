# Geometry Editor — Phase 2.1 Step 3

This step separates geometry properties from document metadata. Existing uncommitted M4, Phase 1, Phase 2 and Phase 2.1 Steps 1–2 work is preserved. No files are staged, committed or pushed.

## Document and geometry UI

The Sənəd drawer retains its existing revision, status, question type, source, difficulty, update information, errors and synchronization actions. Its geometry portal host and the effect that opened this drawer for geometry properties are removed.

`GeometryEditorPanels` reuses the existing standalone nonmodal properties dialog for framed and unframed editors. The same editor-owned React fields and callbacks now render in that panel through a body portal. There is no new geometry model, persistence path or duplicate coordinate/solid editing logic. Closing the panel hides it without unmounting the fields. Existing field synchronization on selection/geometry changes remains owned by the editors.

Right-click → **Xassələr** opens the active editor's panel. A saved frame's existing properties/edit entry starts the existing edit lifecycle and records only a transient owner-ID request in `universalEditorSession`; its matching editor consumes that request and opens properties. Unsupported fields are not copied between V1/V2 editors.

The panel is nonmodal: it does not make the canvas inert. It has a visible sticky close control and closes on Escape without invoking frame Cancel or cancelling construction. Focus returns to an available prior control or the frame, and the geometry history context is restored. Reinvoking properties focuses the already-open panel. The existing solid-authoring and annotation/ambiguous-target entry points reuse this same presentation.

On wide viewports it sits beside the active frame. When gutters are insufficient, it becomes a compact scrollable inset within the frame, leaving visible frame borders/handles available. Resize, scroll and frame placement changes update its position without changing geometry drag/resize code. It is hidden during printing.

## Selection limitation

The shared frame context-menu boundary does not expose passive object picking. Existing JSXGraph selection callbacks and 3D authoring picking remain unchanged. Synthesizing a left click or reusing construction selection would risk creating geometry or cancelling a pending construction. This step therefore preserves the current selection on right-click, including right-clicking empty space, rather than guessing a target.

Select an object through the existing Select tool or object list before opening its properties. Use **Seçimi təmizlə** for an empty scene selection. Scene metadata, the object list, existing coordinate-based creation and saved-camera fields remain available through their existing disclosures.

## Preserved behavior

- Stable IDs, point coordinates/labels, supported reference/solid controls and safe deletion still use the original handlers.
- 2D description, point labels, annotation editing and attachments remain editor-owned.
- Frame Apply/Cancel, global Save, Undo/Redo and mixed save/reload retain their existing paths.
- The right-click menu, working-plane and camera actions, removed header badge behavior and geometry rendering/model/backend contracts are preserved.

## Files (12)

- `frontend/src/components/AdminQuestionEditor.tsx`: remove geometry integration from Sənəd.
- `universalEditorSession.ts`: replace obsolete drawer host/opener with an owner-scoped transient properties request.
- `UniversalQuestionCanvas.tsx`: saved-frame properties entry uses that request and the existing edit handler.
- `GeometryEditorPanels.tsx`, `.css`: reuse the nonmodal panel, placement/focus/close behavior and mounted fields.
- `GeometryEditor.tsx`, `GeometrySceneEditor.tsx`: pass the existing frame owner ID to the presentation component; editing methods are unchanged.
- `tests/geometry_frame_browser.mjs`: nonmodal-aware acceptance navigation and scenario registration.
- `geometry_frame_controls_browser.mjs`: preserve prior properties/frame acceptance with the separate panel.
- `geometry_properties_browser.mjs`: focused document/panel/coordinate/draft/selection/viewport/persistence acceptance.
- `test_universal_editor_frontend_contract.py`: document metadata/separation regression.
- This document.

## Focused verification

```text
.venv/Scripts/python.exe -B -m unittest discover -s tests -p test_universal_*frontend_contract.py
node tests/test_geometry_unified_menu.mjs
node tests/test_geometry_history_model.mjs
node tests/test_geometry_frame_model.mjs
node tests/geometry_frame_browser.mjs --geometry-properties
node tests/geometry_frame_browser.mjs --unified-menu
npm.cmd --prefix frontend run build
git diff --check
```

Browser tests use real headless Microsoft Edge, production components and fixture HTTP. They do not rerun authenticated backend/PostgreSQL acceptance. Existing build warnings concern JSXGraph eval and bundle size.

Results: 50 frontend compatibility tests and all three focused Node suites passed. Real Edge separate-properties acceptance passed, including Steps 1–2, coordinate/ID/label editing, creation/deletion, history, unapplied-draft preservation, metadata separation, saved-frame entry, narrow-viewport handle access and mixed save/reload. Phase 1 real Edge routing/solid entry acceptance, TypeScript/production build and `git diff --check` passed.

## Manual acceptance

1. Open Sənəd: verify document metadata remains and geometry controls are absent.
2. Open/edit a 2D frame and use right-click → Xassələr. Edit accessibility description and supported labels/annotations; close/reopen, Undo/Redo, Apply/Cancel and reload.
3. Select a 3D point through Select or the object list. Check its ID/label, XYZ, coordinate Apply, coordinate-based creation and safe deletion. Close with Escape and reopen an unapplied draft.
4. Clear selection and inspect scene/object/camera information. Check the existing solid controls and camera/working-plane context actions.
5. With properties open, select geometry and drag/resize the frame. Repeat at a narrow viewport; visible frame handles must remain reachable. Verify global Save and mixed 2D/3D reload.

Further changes, including a common passive right-click targeting interface, await user acceptance and a separate scope.
