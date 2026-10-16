# Geometry Editor — Phase 2.1 Step 1

This step changes only frame control presentation. Existing uncommitted M4, Phase 1 and Phase 2 work is preserved. No staging, commit or push is performed.

## Entry and behavior

Right-click inside an available 2D/3D frame opens a compact popup at the pointer. `VisualFrame` handles the event in capture before JSXGraph or the 3D viewport can interpret it as a geometry gesture. Native context menus are suppressed inside the frame. Properties portaled into the existing Sənəd drawer are outside that DOM boundary and retain their existing input behavior.

Keyboard users can focus the frame with Tab, then use **Shift+F10** or the **Context Menu** key. Focus enters the popup; Tab/Shift+Tab cycle its visible enabled controls, including native form fields and nested disclosures. Escape closes the popup and restores focus without invoking frame Cancel or cancelling a pending construction. Outside pointer presses close it without stealing the new target's focus.

The popup is portaled to the document body to avoid canvas clipping. Its dimensions and pointer coordinates are clamped to the visible viewport; resizing the viewport or expanding a submenu repositions it. It is hidden in print output. The visible above-frame toolbar and ⋮ trigger are removed for both dimensions. Existing drag buttons and eight resize handles remain.

## Existing actions reused

`UniversalQuestionCanvas` supplies the same callbacks and disabled conditions through the `VisualFrame.actions` presentation slot:

- Editing: **Tətbiq et** calls the existing `onSaveEdit(node.id)`; **Ləğv et** calls the existing `onCancelEdit`. No new confirmation, persistence, rollback or cancellation logic is introduced.
- Saved frames: existing Edit, layout-only Save (now labeled Tətbiq et), Delete and properties/edit entry remain available. There is no active editing-session Cancel in this state; no new layout rollback action is invented.
- `GeometryEditorPanels` portals the existing properties button and contextual V1/V2 commands into the popup's secondary host. Camera views, reset, explicit saved-question view, working planes, construction cancellation, selection clearing, polygon parameters and completion commands retain their original handlers.

The global document Yadda saxla button, Sənəd drawer, status indicator, geometry editors/evaluators, models, backend contracts, rendering algorithms and Phase 1 routing are not modified by this step. Frame move/resize calculations and handlers are unchanged. Right-click is reserved for the context menu inside framed geometry; existing left-button editing and camera interaction are retained. Standalone/unframed editor presentation is outside this step and retains its existing entry.

## Files (9)

1. `frontend/src/components/VisualFrame.tsx`: shared popup, capture routing, viewport/focus handling; existing gestures retained.
2. `frontend/src/components/VisualFrame.css`: frame actions become popup content.
3. `frontend/src/components/GeometryEditorPanels.tsx`: reuse the secondary popup host, retaining existing fields/callbacks.
4. `frontend/src/components/GeometryEditorPanels.css`: compact popup styles and print hiding.
5. `frontend/src/components/UniversalQuestionCanvas.tsx`: pass existing actions to the frame; rename frame Save to Tətbiq et.
6. `tests/geometry_frame_context_browser.mjs`: focused real Edge right-click, keyboard, dismissal, bounds, mutation-safety and document Save regression.
7. `tests/geometry_frame_controls_browser.mjs`: retain prior Apply/Cancel/properties/camera/plane/history/save-reload assertions with the new entry and presentation.
8. `tests/geometry_frame_browser.mjs`: register the scenario and adapt existing frame action navigation to its portaled host.
9. This document.

## Focused validation

```text
node tests/test_geometry_frame_model.mjs
node tests/test_geometry_history_model.mjs
node tests/test_geometry_unified_menu.mjs
.venv/Scripts/python.exe -B -m unittest discover -s tests -p test_universal_*frontend_contract.py
node tests/geometry_frame_browser.mjs --frame-context
node tests/geometry_frame_browser.mjs --unified-menu
node tests/geometry_frame_browser.mjs
npm.cmd --prefix frontend run build
git diff --check
```

Real Edge uses production editor components and pointer/keyboard events with fixture HTTP transport. It is not an authenticated backend acceptance rerun. Existing build warnings concern JSXGraph eval and bundle size. Product visual acceptance remains with the user.

Results: all three focused Node suites and 49 frontend compatibility tests passed. Real Edge context-menu acceptance passed, including the existing document Save action, frame Apply/Cancel and previous properties/camera/plane/history/save-reload assertions. Phase 1 routing acceptance and the existing frame/print/legacy V1 regression passed. TypeScript/production build and `git diff --check` passed.

## Manual acceptance

1. Create/open an editable 2D frame. Verify no above-frame Apply/Cancel/⋮ controls. Right-click empty canvas and an existing point; no point should be created or moved. Check Tətbiq et, reopen, make an edit and Ləğv et.
2. Repeat in 3D. Check Görünüş, XY/XZ/YZ, properties, construction cancellation and clear-selection. Opening or dismissing the popup must not move geometry or the camera.
3. Open the popup near the viewport edge, expand a submenu, press Escape and click outside. Focus the frame and repeat with Shift+F10/Context Menu, Tab and Shift+Tab.
4. Check frame drag/resize, mixed save/reload and the global Yadda saxla button. Existing Sənəd properties and status should look unchanged.

Stop after this step; further Phase 2.1 changes await user acceptance.
