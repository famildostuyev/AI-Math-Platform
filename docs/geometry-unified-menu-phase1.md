# Unified geometry menu — Phase 1

The working tree already contained the validated, uncommitted M4 implementation. Phase 1 preserves that work and changes only menu/routing and focused frontend acceptance coverage. No commit or push is performed.

## Existing workflow reused

`AdminQuestionEditor.createGeometryFrame(dimension: 2 | 3 = 2)` creates the corresponding V1/V2 source and visual placement, persists through the existing geometry-block API, selects the new block and starts editing. The existing `onCreateGeometryFrame` and `onCreateGeometryScene` callbacks now appear under one creation dropdown. Save/cancel, history, persistence, contracts, rendering, solid evaluation and frame controls are unchanged by Phase 1.

`GeometryEditor` registers V1 commands and `GeometrySceneEditor` registers V2 commands in `UniversalEditorSession`. A saved frame is not an editing command target. Opening its existing Edit action registers its owner ID; saving/cancelling unregisters it. Ribbon routing requires the active geometry owner ID to match exactly one command namespace. Missing, stale, disabled or ambiguous contexts are inert. The click handler checks the current context again rather than trusting the context in which a dropdown opened. Geometry context changes close contextual dropdowns.

## Menu changes

| Before | After |
| --- | --- |
| Separate 2D frame and 3D scene creation buttons | `Çərçivə əlavə et` → `2D çərçivə` / `3D çərçivə` |
| Separate 3D point/linear tool row | Shared `Seç`, `Nöqtə` and existing `Xətt` menu |
| Individual 3D plane/camera/solid buttons | Existing `3D` groups expose plane, camera, cube, cuboid, prism and pyramid |
| `2D fiqurlar` | `Müstəvi fiqurları`, retaining every existing V1 action |

Point, infinite line, segment and vector dispatch to the implemented tool for the current dimension. One direction entry displays `İstiqamətlənmiş düz xətt` in 2D and `Şüa` in 3D. These remain different geometric semantics: V1 is an infinite directed line; V2 is a ray. Their data models are not merged.

Plane-figure authoring, circles, polyline and other V1-only tools remain disabled in V2 until a corresponding authoring implementation exists. Existing future curved solids, truncated pyramids, dihedral angles and other unfinished actions remain inert. Regular N-gon template settings remain available inside the implemented Prism/Pyramid inspector; no duplicate regular-template shortcut is enabled.

## Files changed by this phase (14)

- Production: `frontend/src/components/UniversalEditorRibbon.tsx`, `geometryRibbonMenu.ts`.
- New focused tests: `tests/test_geometry_unified_menu.mjs`, `geometry_unified_menu_browser.mjs`.
- Browser harness/catalogue: `tests/geometry_frame_browser.mjs`, `geometry_ribbon_browser.mjs`, `geometry_3d_m4_browser.mjs`.
- Existing selector updates: `tests/geometry_2d_browser.mjs`, `geometry_triangle_browser.mjs`, `geometry_arc_browser.mjs`, `geometry_circle_browser.mjs`, `geometry_midpoint_browser.mjs`.
- Frontend contract assertions: `tests/test_universal_editor_frontend_contract.py`. Three prior assertions still expected pre-M1 frame signatures/cleanup; the new routing assertion checks current-context dispatch. No authoring engine code was changed for those assertion updates.
- Documentation: `docs/geometry-unified-menu-phase1.md`.

Focused coverage includes shared creation, action routing, owner integrity, unavailable tools, duplicate prevention, V1/V2 coexistence and real Edge use of production components with fixture API transport. Existing geometry line/history and M3/M4 model tests and 49 Universal Editor frontend contract tests pass. Type checking and production build pass. The existing build warnings concern JSXGraph direct eval and bundle size.

Manual product review: create a 2D frame and verify shared point/line tools, save it, create a 3D frame and verify Point, Ray, Plane and the four solids through their dropdowns. Save and reopen each frame explicitly to verify context-specific labels and disabled actions. Check compact ribbon/dropdown placement at the browser width used for teaching. The next phase waits for user review; no 3D planar-figure subsystem is introduced here.
