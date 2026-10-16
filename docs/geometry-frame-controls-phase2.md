# Universal Geometry Editor — Phase 2 frame controls

This UI-only phase preserves the existing uncommitted M4 and Phase 1 work. It does not change geometry contracts, backend endpoints, rendering mathematics, solid semantics or ribbon routing. No files are staged, committed or pushed.

## Presentation and ownership

`VisualFrame` provides the selected frame's upper-right menu host. The existing Save/Cancel callbacks remain in `UniversalQuestionCanvas`, in the same order with the same disabled conditions. Shared CSS places both V1 and V2 action toolbars above the canvas. Saved frames retain Edit/Save-placement/Delete and expose their existing edit lifecycle through the secondary properties action.

`GeometryEditorPanels` only places existing editor-owned fields and callbacks. It portals contextual actions into the frame menu, properties into the existing native **Sənəd** drawer, and concise guidance into the existing header status area. `universalEditorSession` exposes DOM hosts and an opener for that drawer. It does not contain geometry data or a second properties state model. An editor embedded without the Universal Editor hosts uses the same fields in a small local properties disclosure dialog; closing it preserves mounted input state.

The existing drawer is modal. Use **Sənədi bağla** before interacting with the canvas. Properties remain mounted while it is closed, preserving description typing groups and existing coordinate/solid form state. Annotation editing and ambiguous attachment choices open these existing properties automatically. Closing the drawer does not cancel a frame edit.

## Controls

| Area | Before | After |
| --- | --- | --- |
| Frame actions | Different 2D/3D placement, including a bottom strip | Shared compact labeled toolbar immediately above the selected frame |
| 2D description and attachment/annotation fields | Permanent bottom controls | Existing Sənəd properties drawer via ⋮ → Xassələr |
| 3D scene/object/coordinate/solid fields | Bottom disclosure panels | Same existing properties drawer |
| 3D camera | Permanent row | ⋮ → Görünüş, preserving seven views, reset and explicit saved-question-view command |
| Working plane | Permanent row | Frame menu; existing XY/XZ/YZ interaction state |
| Cancel construction / clear selection | Permanent buttons | Relevant contextual commands; separate from frame Cancel |
| Polygon side count | Canvas overlay | Frame menu only for the regular-N-gon tool |
| Guidance | Long bottom paragraphs | Concise current tool/step and notices in the existing status area |

Geometry algorithms and history providers retain ownership of all operations. Ordinary camera navigation still bypasses geometry history. Explicit saved-view changes still commit through the existing history. Existing frame drag/resize code and geometry board/viewport pointer handlers are preserved. Menus stop event propagation and close on outside pointer presses or Escape; Escape from a contextual menu can also cancel a pending construction through its editor.

## Phase 2 file manifest (14)

- `frontend/src/components/GeometryEditorPanels.tsx` and `.css`: shared presentation hosts, contextual menus and properties placement.
- `VisualFrame.tsx` and `.css`: menu host and consistent above-frame actions; original gestures unchanged.
- `UniversalQuestionCanvas.tsx`: labeled action toolbar and saved-frame properties entry using existing callbacks.
- `AdminQuestionEditor.tsx`, `universalEditorSession.ts`: small extension of existing document properties/status UI.
- `GeometryEditor.tsx`: relocate V1 properties/commands and concise guidance.
- `GeometrySceneEditor.tsx`, `GeometrySceneViewport.css`: relocate V2 properties/camera/working-plane commands; remove bottom inspector positioning.
- `tests/geometry_frame_controls_browser.mjs`: focused real Edge acceptance using production components and fixture HTTP.
- `tests/geometry_frame_browser.mjs`: register focused acceptance and navigate the existing modal drawer/portaled fields in older acceptance scenarios.
- `tests/geometry_3d_m4_browser.mjs`: update the existing inspector selector to its properties host; preserve all solid acceptance assertions.
- This document.

## Focused verification

Commands used for validation:

```text
node tests/test_geometry_frame_model.mjs
node tests/test_geometry_history_model.mjs
node tests/test_geometry_unified_menu.mjs
node tests/test_geometry_line_model.mjs
node tests/test_geometry_3d_m3.mjs
node tests/test_geometry_3d_m4.mjs
.venv/Scripts/python.exe -B -m unittest discover -s tests -p test_universal_*frontend_contract.py
npm.cmd --prefix frontend run build
node tests/geometry_frame_browser.mjs --frame-controls
node tests/geometry_frame_browser.mjs --unified-menu
node tests/geometry_frame_browser.mjs
node tests/geometry_frame_browser.mjs --scene-3d-m4
git diff --check
```

Browser acceptance uses real headless Microsoft Edge, CDP pointer/keyboard events and the production editor. The HTTP transport is a fixture, not a new authenticated backend acceptance run. The existing build warnings concern JSXGraph direct eval and bundle size. Broad suites, dependency installation and backend changes are outside this phase.

Validation passed: all six focused Node model/menu suites, 49 Universal Editor frontend compatibility tests, TypeScript and production build, the Phase 2 and Phase 1 real Edge scenarios, the existing 2D frame regression, and M4 framed/unframed solid acceptance. `git diff --check` passed. Acceptance navigation waits for drawer closure/painting before calculating pointer coordinates; existing properties now live outside the frame, so the M4 inspector selector was updated without weakening its semantic assertions.

## Manual product review

1. Create a 2D frame. Check the labeled toolbar above it, ⋮ placement, eight handles and a clean bottom edge. Drag/resize it and create/select points.
2. Open ⋮ → Xassələr. Edit Əlçatan təsvir; close Sənəd, Undo/Redo, Save, reopen and reload. Make another edit and Cancel to verify the saved description is retained.
3. Choose regular-N-gon: side count should appear only in its frame menu. Start/cancel a construction, including Escape from the menu. Check contextual clear-selection and polyline/polygon completion.
4. Create a 3D frame. Check all seven Görünüş views, reset, explicit saved question view, Undo/Redo and ordinary orbit/pan/zoom. Switch XY/XZ/YZ and cancel a pending segment.
5. Open properties to inspect objects, coordinates, scene description and the existing solid controls. Close the drawer before selecting/dragging geometry on the canvas.
6. Save/reload mixed 2D/3D frames, check saved-view SVG/print output, then review controls at the browser width used for teaching. User visual approval remains separate from automated acceptance.
