# M6-C Step 2D.1: independent cylinder dimensions

The existing V2 cylinder parameters remain authoritative. No new schema,
migration, API or teacher-facing coordinate form is introduced.

## Interaction

Select a cylinder. Green circular **R** handles edit radius along a local radial
direction parallel to the base plane. Green diamond **H** handles edit height
along the local cylinder axis. Existing cyan square corner handles continue to
scale both dimensions proportionally. Dimension handles take placement priority
when their projected positions overlap uniform handles.

Both operations keep the analytic center and the persisted frame axes fixed.
Radius leaves height and frame origin unchanged. Height moves the two ends
symmetrically by compensating frame.origin along the unit local axis. This works
after rotation and translation, independently of the active working plane.

Pointer mapping reuses the camera-aware projected-line inverse with the initial
grab offset and camera frozen for the gesture. Height changes by twice the cap
handle displacement. Near end-on or clipped mappings are rejected safely; orbit
the camera to expose the desired direction. Non-finite, non-positive or
numerically unrepresentable dimensions are rejected by the existing strict
evaluation boundary. There is no fixed radius-to-height ratio.

## Safety and persistence

All three resize modes reuse the current preview/snapshot transaction: one
completed drag is one history operation, Escape/pointercancel restores the
snapshot, and a no-op adds no history. Stable feature IDs and sparse feature maps
are preserved. Independent-object guards reject changes to directly shared
geometry. No derived mesh vertices are mutated. Bounds, picking, occlusion and
saved-camera SVG/print reevaluate the same native cylinder dimensions.

## Focused checks

- `node tests/test_geometry_3d_cylinder_dimensions.mjs`: 48 canonical scenes and
  24 dimension gestures across XY/XZ/YZ, perspective/orthographic and rotated
  frames; increases/decreases, sequential unequal dimensions, circular caps,
  fixed center, bounds, isolation, history/cancellation and serialization.
- `python -B -m unittest tests.test_geometry_3d_cylinder_dimensions_backend`:
  those scenes pass backend normalization and Create/Update payload parity.
- `node tests/geometry_frame_browser.mjs --cylinder-authoring`: real pointer
  drags for rotation/translation, radius, height and uniform scale; preview,
  cancellation, independent camera/solids, history, Apply/Cancel and print.
- `python -B tests/geometry_m5_real_backend.py --temporary-admin --cylinder-authoring`:
  two actual HTTP/PostgreSQL Save/reload cycles, exact second JSONB comparison.

Manual acceptance: create two cylinders, rotate/move one, drag R and H separately
in both directions, check the other solid and center remain fixed, Undo/Redo,
Apply, Save, reload and inspect the saved print view. Cone/sphere and surface
point authoring remain disabled.

## Recorded validation

- All 48 dimension scenes and 24 gestures passed, including rotation and
  translation after independently changing the dimensions.
- Nine focused backend tests passed: dimension and transform payload parity,
  cylinder authoring, 695 analytic and 225 closed-cylinder records, and M6-B
  edge/face contracts. Existing polyhedral rotation/translation/uniform scaling,
  cylinder rendering and M6-B frontend regressions passed.
- TypeScript, production frontend build and whitespace checks passed. Existing
  JSXGraph eval and bundle-size build warnings remain unchanged.
- Final real Edge run passed increases/decreases, unequal dimensions, live
  preview, Escape/pointercancel, independent camera/solids, exact Undo/Redo,
  creation/deletion, Properties, Apply/Cancel and saved-camera SVG/print.
- Two actual HTTP/PostgreSQL reload cycles passed. HTTP Create returned 201;
  Update/GET returned 200; JSONB exactly matched the second reloaded scene.
  Development acceptance revision: fa04a699-34e9-46e6-a59d-4fed03d19fcd;
  block: 33e6e8cd-e9b2-417b-a262-204a87906c7e. The temporary development admin
  and roles were disabled and sessions revoked afterward.
- An earlier prolonged real run ended with GET 401. A later raw SVG snapshot
  assertion was replaced by comparison against regenerated semantic SVG after
  redraw, excluding hover colors. The final fresh-session run exited zero.
  Picking searches in the test harness now try the projected pivot and then
  the analytic projected bounds, rather than scanning the entire viewport.

Manual acceptance remains pending. No staging, commit or push was performed.
