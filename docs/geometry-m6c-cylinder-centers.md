# M6-C Step 2D.2: semantic cylinder base centers

## Files in this step

- `frontend/src/components/geometry3dModel.ts`: deterministic center preparation.
- `frontend/src/components/geometry3dSolidAuthoring.ts`: atomic creation.
- `frontend/src/components/geometry3dProjection.ts`: legacy read-only display.
- `frontend/src/components/AdminQuestionEditor.tsx`: prepared editing draft.
- `tests/test_geometry_3d_cylinder_centers.mjs`: new center regressions/fixtures.
- `tests/test_geometry_3d_cylinder_centers_backend.py`: schema and analytic parity.
- `tests/test_geometry_3d_cylinder_authoring.mjs`: center priority/deletion policy.
- `tests/test_geometry_3d_cylinder_dimensions.mjs`: independent-point isolation.
- `tests/test_geometry_3d_cylinder_transforms.mjs`: owned-point transform oracle.
- `tests/geometry_cylinder_authoring_browser.mjs`: actual center interactions.
- `tests/geometry_m5_real_backend.py`: forward the focused center acceptance flag.
- `docs/geometry-m6c-cylinder-centers.md`: design and acceptance record.

The existing V2 cylinder feature slots `v_0` and `v_1` own ordinary semantic
point records, labeled O1 and O2 by default. Positions are analytic frame-local
`[0,0,0]` and `[0,0,height]`, equivalently center minus/plus half-height along the
unit cylinder axis. Cached XYZ is evaluated from the solid, never authoritative
free-point input. No schema, construction kind, API or migration is introduced.

## Lifecycle

- New cylinder creation atomically includes both centers and existing lateral
  carrier. Undo/Redo restores the same IDs and point records.
- `prepareCylinderCenters3D` completes old sparse cylinder maps without changing
  the normalizer's sparse contract. Existing IDs/custom labels are preserved.
  Missing IDs are deterministic, collision-safe across all semantic entities,
  bounded to 64 characters, and independent of solid array order.
- Read-only projection prepares a copy, leaving saved source untouched. Starting
  a frame edit prepares its draft before the history provider is created. Apply
  persists the centers; Cancel preserves the original source. Reopening/reload
  uses the same IDs, without extra points or an initialization Undo operation.
- Radial resize preserves center coordinates exactly. Axial resize updates both
  ends symmetrically. Rotation, translation and uniform scale use existing solid
  ownership and analytic evaluation. Solid-owned centers cannot be freely moved.
- Existing parent-deletion policy remains: semantic centers survive at their
  last coordinates as free points, preserving valid downstream references.

## Rendering and interaction

Centers reuse the current point marker, label offset, semantic point picking,
snap tolerance and Properties implementation. Opaque analytic ray occlusion
filters both markers and labels, including the opposite cap center and centers
behind another solid. No overlay that bypasses depth is added. Viewport and
saved-camera SVG/print share the same prepared semantic geometry. Existing
solid picking still works away from point snap zones; resize handles retain
their placement clearance from semantic vertices.

## Focused validation

- `test_geometry_3d_cylinder_centers.mjs` exports 14 canonical fixtures covering
  all working planes, rotated frames, O1/O2 identity/ownership, old sparse maps,
  custom IDs/labels, collisions/long IDs, all transforms, symmetric height,
  radius invariance, occlusion, point priority/snapping, locked dragging, history,
  canonical reload and SVG visibility.
- `test_geometry_3d_cylinder_centers_backend.py` checks normalization and actual
  Create/Update payload parity for the same fixtures.
- `geometry_cylinder_authoring_browser.mjs` exercises upper/lower center labels,
  selection/right-click Properties, occlusion, Point-tool reuse and non-drift,
  then transforms and two Save/reload cycles. Pointer coordinates are sampled
  after toolbar actions, which may scroll the document.
- Real persistence can use `python -B tests/geometry_m5_real_backend.py
  --temporary-admin --cylinder-authoring --cylinder-centers`. This keeps center
  interactions, all transform types, two-solid isolation, history, Apply/Cancel,
  print and two actual page reloads, without repeating the full resize matrix.
  Reload verification waits for a different document time origin, the real API
  helper and the frame SVG, rather than accepting stale DOM before navigation.

No cone/sphere/surface-point authoring is enabled. Existing payload/entity limits
and shared-reference safety guards remain in force. Center labels follow the
existing point-label conventions; no new global label-layout system is added.

Manual acceptance: create a cylinder, view it from above and below, select O2/O1
and inspect Properties; orbit, translate, rotate and resize R/H, then Undo/Redo,
Apply, Save, reload and inspect print. Hidden centers must remain hidden.

## Recorded results

- Fourteen shared center fixtures passed frontend/backend normalization and
  Create/Update payload parity. Python analytic feature positions matched the
  frontend point caches within 1e-8 across all fixtures.
- Ten focused backend tests passed (centers, dimensions, transforms, authoring,
  695 analytic cases, 225 closed-cylinder cases, M6-B edge and face contracts).
- Frontend cylinder authoring/rendering, 48 dimension scenes/24 gestures,
  30 transform combinations, M4/M5 rotation/translation/scale and M6-B edge/face
  regressions passed. The 93 V2 canonical cases and 28 Universal Editor/history
  compatibility tests passed.
- TypeScript and production build passed. Existing JSXGraph eval and bundle-size
  warnings remain. Tracked and new-file whitespace checks passed.
- Full fixture Edge acceptance passed O1/O2 visibility/labels, top/bottom semantic
  picking and Properties, point reuse, locked dragging, full transform/cancel/
  history regression, Apply/Cancel, two fixture reloads and saved-camera print.
- Focused real Edge acceptance passed all transform types, two-solid isolation,
  history, frame lifecycle and two actual HTTP/PostgreSQL page reloads. Create
  returned 201; Update/GET returned 200. PostgreSQL JSONB exactly equaled the
  second reloaded scene, including center IDs, labels and coordinates.
  Development revision: 5dbf464d-e583-4454-9187-9395edd39edf;
  block: c3d5d8b0-965b-4bc1-90d0-8b737284413e. Temporary admin/roles were disabled
  and sessions revoked after the test.
- Earlier browser attempts exposed test-harness issues: coordinates sampled
  before toolbar scrolling and a reload check accepting the old document DOM.
  The final harness samples after toolbar actions and waits for the new document
  bootstrap; no production camera/picking workaround was introduced.

Manual acceptance is pending. All previous uncommitted work is preserved;
nothing was staged, committed or pushed.
