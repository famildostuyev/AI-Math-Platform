# 3D Geometry M2: renderer, camera and SVG projection

Starting checkpoint: `main @ b42fbd9d6b7c93ec09dfddb3c8128092dfd2d88b`.
M2 introduces no semantic schema migration, backend production changes or authoring tools.

## Components and boundaries

- `geometry3dProjection.ts`: immutable M1 evaluation adapter, camera basis, standard
  views, frustum clipping, plane/frustum intersection, deterministic SVG and a
  limited orthographic convex-face hidden-line feasibility implementation.
- `GeometrySceneViewport.tsx`: direct Three.js / OrbitControls integration,
  demand rendering, resize observation, resource cleanup and static fallback.
- `GeometrySceneViewport.css`: bounded viewport, point labels, controls and print
  rules. Print always uses the saved-camera SVG, never the WebGL canvas.
- `GeometrySceneEditor.tsx`: existing history provider, session navigation,
  explicit saved-view command and retained M1 metadata editing.
- `GeometryScenePlaceholder.tsx`: retains the M1 integration entry point; now
  renders the saved-view static preview in the existing canvas and content renderer.
- `universalEditorSession.ts`: per-block transient camera cache scoped to the
  existing editor session. It is neither persisted nor part of geometry history.
- `frontend/package.json` / lockfile: Three.js 0.186.1 and types 0.186.0.
  React Three Fiber and a second document/layout system are not introduced.

Three objects contain semantic IDs in `userData` for future selection integration.
Only evaluated M1 primitives are rendered. Invalid or unsupported evaluation
produces explicit feedback and no fabricated geometry. Parametric solids and
curved-surface constructions remain unavailable. Empty scenes display feedback.

## Geometry and projection

Points, segments, infinite lines, rays, vectors, independent edges, planar faces
and planes are supported. Point labels are displayed; annotation and marking
rendering remains outside M2. Planes intersect the actual camera frustum; no
arbitrary finite plane patch is stored. Linear primitives retain their semantic
parameter domains and are clipped against all six frustum half-spaces. Infinite
lines are never clamped to the defining segment.

The pure camera basis and clipping functions are shared by the SVG foundation and
Three adapter. Orthographic projection preserves world proportions using the
vertical span and actual viewport aspect ratio. Existing perspective camera
payloads are also rendered; M2 does not add a projection-switching UI.

SVG uses `print_camera`, sorted semantic IDs, deterministic six-decimal coordinate
formatting and XML escaping. It is independent of WebGL screenshots. The function
`geometrySceneSVG3D(scene, width, height)` is the export foundation; there is no
download UI or server PDF endpoint in this milestone.

Orthographic line intervals behind convex planar faces are split and dashed.
Depth crossings and partial overlap are tested. Concave faces and perspective
hidden-line classification deliberately bypass this limited calculation.
Face ordering uses average depth; intersecting faces, complete point visibility,
transparent compositing equivalence, hidden vector heads and advanced surface
visibility are **not** solved here. These are M9 work, not complete SVG/PDF acceptance.

## Camera and document lifecycle

Default new scenes remain orthographic. Left drag orbits, right drag pans and
wheel zooms; OrbitControls also supplies touch navigation. Camera controls consume
viewport gestures while frame handles retain the existing VisualFrame behavior.
Viewport resize updates aspect and clipping without editing geometry.

Front, back, left, right, top, bottom and isometric views retain the current target,
distance and span. Reset returns to the currently saved question camera.
`Sual üçün görünüşü təyin et` explicitly copies the current session camera into
`print_camera` through the existing M1 commit/history mechanism. It is undoable;
navigation and reset create no geometry Undo/Redo entry. Subsequent navigation
does not alter saved SVG or saved camera. Switching out of and back into block
editing retains the session camera; a full document reload restores saved data.

The renderer schedules a frame only on scene/view/size changes, with damping and
autorotation disabled. On update/unmount it cancels frames, disconnects observers,
disposes controls, geometry, materials and the renderer, and removes its canvas.
WebGL initialization failure and context loss expose saved-camera SVG and a clear
message. Document metadata/history/save remain available. Camera gestures need
WebGL; standard-view commands still operate on the session camera during fallback.

Existing V1 normalization/evaluation, V2 contract and backend limits are unchanged.
Mixed blocks and A4/A5 placement continue through the existing document adapters,
VisualFrame and geometry endpoints. Unfinished 3D ribbon tools remain disabled.

## Focused validation

- `node tests/test_geometry_3d_m2.mjs`: adapter entity kinds, derived positions,
  camera projections, seven views, viewport aspect/resize, line/ray/segment,
  near/far/polygon/plane clipping, SVG determinism and escaping, convex occlusion,
  invalid views and saved-camera history/session isolation.
- Existing M1 model and geometry history tests; 93 V2 and 171 V1 canonical parity
  fixtures; 24 existing document/history/canvas compatibility tests.
- Frontend production build and `git diff --check`.
- `node tests/geometry_frame_browser.mjs --scene-3d-m2`: real Edge/CDP, production
  editor, fixture API transport, deterministic nonempty fixture. Uses software
  WebGL2 (SwiftShader), not a physical GPU acceptance claim. Covers empty/nonempty
  scenes, orbit/pan/zoom, no idle render loop, no navigation history entries,
  standard views, session retention, saved-camera Undo/Redo, frame resizing,
  print CSS, mixed V1/V2 save/reload, unframed editing, actual context loss and
  forced initialization failure. Screenshot is written to OS temp, not repository.
- Existing real Edge V1 frame and M1 lifecycle acceptance.
- `.venv/Scripts/python.exe -B tests/geometry_3d_m1_real_backend.py --temporary-admin --m2`:
  separate real authenticated localhost HTTP/PostgreSQL acceptance; camera changes
  and SVG are computed after actual API reload, then persisted and read back.
  Includes mixed versions, conflict/invalid atomic rejection and block deletion.
  Temporary credentials are generated at runtime; account/roles/sessions are
  disabled/revoked and checked in cleanup. This is not an Edge-to-real-API claim.

Before primitive authoring, M3 needs picking/selection, explicit creation commands,
semantic authoring transactions and their focused interaction acceptance. Solid
evaluation/editing, surface attachments, sections and full visibility remain in
later milestones. No M3 functionality is enabled by M2.
