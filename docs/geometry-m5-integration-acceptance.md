# M4/M5 integration checkpoint and proposed file set

Branch: `main`. Baseline HEAD: `e4d53932d47e1ac103dd3929951b0e988ed4eda4`.
Baseline worktree: 32 modified tracked files and 62 untracked files (94 total).
All pre-existing changes were preserved. No files were staged, committed or pushed.

This integration step changes only acceptance tests, their test harness and this report.
No production defect required a fix. The proposed aggregate checkpoint includes the
accepted M4/M5 implementation and its existing Phase 1/2/2.1 UI dependencies;
the compatibility test updates are intentional menu/action routing changes.

## Evidence

- Four solid kinds: rotate, translate, scale, rotate, translate using real gesture state.
  Other-solid/camera isolation, stable topology, tight bounds, cancellation/no-op,
  exact five-step Undo/Redo and Redo invalidation passed.
- Real Edge used production `AdminQuestionEditor` with native fetch through a local
  backend proxy, not fixture HTTP responses. The initial revision was a new local
  development draft. The browser created a frame and two consumed-base pyramids,
  performed the combined transform sequence, applied, clicked document Save,
  fully reloaded the page, reopened the frame, edited again and saved/reloaded again.
- Real HTTP: draft/frame Create 201, geometry Update 200, revision GET 200.
  Geometry persistence occurs at frame Apply in the existing application; the
  document Save button does not issue a separate geometry update when nothing is dirty.
- PostgreSQL `geometry_block_contents.source_data` JSONB exactly matched the second
  saved/reloaded scene, including stable feature IDs and both solids.
- Development acceptance revision: `7e096edf-9011-4bf2-832c-f3c2ca9c3e4d`.
  Block: `9e5be50a-7c5d-4271-bef4-3b119ea83784`.
  The temporary admin was disabled, roles disabled and sessions revoked afterward.
  Existing questions were not changed. The isolated acceptance draft remains in development.
- Saved-camera SVG/screen/print agreement and print CSS exclusion of selection
  bounds/handles passed, including the active editing state.
- 51 focused backend/contract tests, 93 shared V2 cases, 171 legacy V1 parity cases,
  1062 visibility comparisons and relevant apex/base/history/menu tests passed.
- Frontend TypeScript (`tsc -b`) and production build passed. Existing JSXGraph eval
  and chunk-size build warnings remain. `git diff --check` passed.

## Reproduction commands

```powershell
node tests/test_geometry_3d_m5_integration.mjs
.venv/Scripts/python.exe tests/geometry_m5_real_backend.py --temporary-admin
node tests/geometry_frame_browser.mjs --camera-sync
node tests/geometry_frame_browser.mjs --frame-context
npm.cmd run build --prefix frontend
git diff --check
```

The real test requires a local development PostgreSQL environment, launches an
isolated local backend process and uses a temporary admin. Credentials/tokens exist
only at runtime and are not written to this report or committed files.

Existing scope limits remain: freeform solids are unsupported by whole-solid
transforms; scaling shared face bases or unsafe shared dependencies is rejected.
No new functionality or schema was added during integration acceptance.

## Proposed commit inventory

Total: 98 files (66 untracked, 32 modified tracked).

### Backend M4/M5 contract and evaluator (3)

- `backend/app/schemas/geometry_3d.py` (modified)
- `backend/app/schemas/geometry_3d_contract.json` (modified)
- `backend/app/schemas/geometry_3d_solids.py` (new)

### Frontend M4/M5 scene, model, evaluator, renderer and solid authoring (13)

- `frontend/src/components/GeometrySceneEditor.tsx` (modified)
- `frontend/src/components/GeometryScenePlaceholder.tsx` (modified)
- `frontend/src/components/GeometrySceneViewport.css` (modified)
- `frontend/src/components/GeometrySceneViewport.tsx` (modified)
- `frontend/src/components/geometry3d.ts` (modified)
- `frontend/src/components/geometry3dAuthoring.ts` (modified)
- `frontend/src/components/geometry3dContract.ts` (modified)
- `frontend/src/components/geometry3dModel.ts` (modified)
- `frontend/src/components/geometry3dProjection.ts` (modified)
- `frontend/src/components/GeometrySolidControls.tsx` (new)
- `frontend/src/components/geometry3dSolidAuthoring.ts` (new)
- `frontend/src/components/geometry3dSolidBounds.ts` (new)
- `frontend/src/components/geometry3dSolids.ts` (new)

### Accepted shared 2D/3D ribbon, frame, context menu and properties integration (12)

- `frontend/src/components/AdminQuestionEditor.tsx` (modified)
- `frontend/src/components/GeometryAuthoringBoard.tsx` (modified)
- `frontend/src/components/GeometryEditor.tsx` (modified)
- `frontend/src/components/UniversalEditorRibbon.tsx` (modified)
- `frontend/src/components/UniversalQuestionCanvas.tsx` (modified)
- `frontend/src/components/VisualFrame.css` (modified)
- `frontend/src/components/VisualFrame.tsx` (modified)
- `frontend/src/components/geometryRibbonMenu.ts` (modified)
- `frontend/src/components/universalEditorSession.ts` (modified)
- `frontend/src/components/GeometryEditorPanels.css` (new)
- `frontend/src/components/GeometryEditorPanels.tsx` (new)
- `frontend/src/components/geometryContextMenuPlacement.ts` (new)

### Focused tests, canonical fixtures and browser acceptance infrastructure (64)

- `tests/geometry_2d_browser.mjs` (modified)
- `tests/geometry_3d_m1_real_backend.py` (modified)
- `tests/geometry_3d_m2_browser.mjs` (modified)
- `tests/geometry_arc_browser.mjs` (modified)
- `tests/geometry_circle_browser.mjs` (modified)
- `tests/geometry_frame_browser.mjs` (modified)
- `tests/geometry_midpoint_browser.mjs` (modified)
- `tests/geometry_ribbon_browser.mjs` (modified)
- `tests/geometry_triangle_browser.mjs` (modified)
- `tests/test_geometry_3d_contract.py` (modified)
- `tests/test_geometry_3d_m2.mjs` (modified)
- `tests/test_universal_editor_frontend_contract.py` (modified)
- `tests/geometry_3d_base_vertex_canonical.json` (new)
- `tests/geometry_3d_m4_browser.mjs` (new)
- `tests/geometry_3d_m4_canonical.json` (new)
- `tests/geometry_3d_m4_reload_edit.mjs` (new)
- `tests/geometry_3d_planar_canonical.json` (new)
- `tests/geometry_3d_pyramid_consumption_canonical.json` (new)
- `tests/geometry_3d_visibility_oracle.mjs` (new)
- `tests/geometry_apex_apply_browser.mjs` (new)
- `tests/geometry_apex_drag_browser.mjs` (new)
- `tests/geometry_apex_height_browser.mjs` (new)
- `tests/geometry_base_alignment_browser.mjs` (new)
- `tests/geometry_base_vertex_browser.mjs` (new)
- `tests/geometry_camera_sync_browser.mjs` (new)
- `tests/geometry_context_picking_browser.mjs` (new)
- `tests/geometry_edge_visibility_browser.mjs` (new)
- `tests/geometry_frame_context_browser.mjs` (new)
- `tests/geometry_frame_controls_browser.mjs` (new)
- `tests/geometry_m5_real_backend.py` (new)
- `tests/geometry_m5_real_browser.mjs` (new)
- `tests/geometry_menu_placement_browser.mjs` (new)
- `tests/geometry_planar_browser.mjs` (new)
- `tests/geometry_properties_browser.mjs` (new)
- `tests/geometry_pyramid_consumption_browser.mjs` (new)
- `tests/geometry_scene_pyramid_browser.mjs` (new)
- `tests/geometry_scene_pyramid_helpers.mjs` (new)
- `tests/geometry_solid_rotation_browser.mjs` (new)
- `tests/geometry_solid_scale_browser.mjs` (new)
- `tests/geometry_solid_translation_browser.mjs` (new)
- `tests/geometry_unified_menu_browser.mjs` (new)
- `tests/test_geometry_3d_apex_drag.mjs` (new)
- `tests/test_geometry_3d_apex_height.mjs` (new)
- `tests/test_geometry_3d_base_alignment.mjs` (new)
- `tests/test_geometry_3d_base_alignment_backend.py` (new)
- `tests/test_geometry_3d_base_vertex.mjs` (new)
- `tests/test_geometry_3d_base_vertex_backend.py` (new)
- `tests/test_geometry_3d_m4.mjs` (new)
- `tests/test_geometry_3d_m4_backend.py` (new)
- `tests/test_geometry_3d_m5_integration.mjs` (new)
- `tests/test_geometry_3d_planar.mjs` (new)
- `tests/test_geometry_3d_planar_backend.py` (new)
- `tests/test_geometry_3d_pyramid_consumption.mjs` (new)
- `tests/test_geometry_3d_pyramid_consumption_backend.py` (new)
- `tests/test_geometry_3d_rotation.mjs` (new)
- `tests/test_geometry_3d_rotation_backend.py` (new)
- `tests/test_geometry_3d_scale.mjs` (new)
- `tests/test_geometry_3d_scale_backend.py` (new)
- `tests/test_geometry_3d_scene_pyramid.mjs` (new)
- `tests/test_geometry_3d_translation.mjs` (new)
- `tests/test_geometry_3d_translation_backend.py` (new)
- `tests/test_geometry_3d_visibility.mjs` (new)
- `tests/test_geometry_context_menu_placement.mjs` (new)
- `tests/test_geometry_unified_menu.mjs` (new)

### Architecture and accepted UI/integration documentation (6)

- `docs/geometry-3d-m4.md` (new)
- `docs/geometry-frame-context-phase2-1-step1.md` (new)
- `docs/geometry-frame-controls-phase2.md` (new)
- `docs/geometry-m5-integration-acceptance.md` (new)
- `docs/geometry-properties-phase2-1-step3.md` (new)
- `docs/geometry-unified-menu-phase1.md` (new)
