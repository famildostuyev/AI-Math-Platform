# Semantic 3D primitive authoring (M3)

M3 starts at `41c70abc349147c1710a7b1e438e161d39bf65d6`. It enables points, infinite lines, rays, segments, vectors and planes through three non-collinear existing points. Solids and subsequent roadmap features remain disabled. The M0 schema, M1 evaluator/history/document integration and M2 renderer/projection remain authoritative; no backend schema migration or dependency change is required.

## Authoritative data and interaction

`geometry3dAuthoring.ts` implements immutable validated transactions and a pointer state machine. Creation and editing use stable semantic IDs and existing V2 arrays. Coordinates must be finite and satisfy existing limits. Duplicate point creation reuses evaluated positions; primitive reuse respects unordered line/segment endpoints, ordered ray/vector endpoints and unordered plane point sets. References and degeneracy are checked before committing.

Working-plane selection is session state, initially XY. Pointer creation intersects the camera ray with XY, XZ or YZ through the world origin. Free-point dragging uses the corresponding parallel plane through the selected point, preserving its normal coordinate. Parallel or near-parallel rays, non-finite intersections and intersections outside camera depth limits are rejected. Exact XYZ entry remains available.

Picking projects semantic geometry using the M2 camera math. Points have priority over linear objects, which have priority over planes; distance, depth and semantic ID resolve ties deterministically. Three.js mesh identity is never authoritative. The inspector provides an explicit semantic object selector for overlapping geometry.

Multi-step tools choose existing points and persist only a completed valid construction. Escape, tool changes and working-plane changes cancel pending work. Drag previews stay local; a completed valid changed gesture commits once. Invalid, cancelled and no-op gestures do not create history entries. Moving a point onto another point on the drag plane is rejected instead of merging identities.

Camera mode, Alt-left drag, right drag and middle drag preserve M2 navigation. Empty selection-mode canvas can orbit. Ordinary navigation remains outside geometry history; explicit saved-view changes retain M2 undo behavior. Pointer capture separates point dragging from orbit and frame movement.

## Editing and deletion boundaries

Free-point coordinates and labels and primitive point references are editable. Constrained and solid-owned points are explicitly read-only in M3. Linear and plane deletion delegates to M1 attachment-loss handling: dependent constrained points retain their last evaluated coordinates and valid downstream objects survive. The UI reports lost attachments. A referenced free point cannot be deleted; leaf free points can. Unsupported deletion is disabled.

Framed scenes use the shared ribbon and VisualFrame; unframed scenes expose the same tools locally. V1 controls and mixed V1/V2 persistence remain unchanged. WebGL failure keeps the saved-camera SVG fallback. Pointer authoring is disabled in that fallback to avoid a mismatch between saved and interactive camera projections; coordinate editing remains available.

## Focused validation checkpoint

- Frontend M3 authoring tests, M1 model/history tests and relevant compatibility tests.
- 53 focused Python/backend/contract compatibility tests.
- 93 shared V2 and 171 legacy V1 canonical parity fixtures, plus the shared M3 fixture in frontend and backend.
- Frontend production build and whitespace diff check.
- Real Microsoft Edge M3 acceptance: working planes, exact coordinates, all primitive tools, picking, cancel/invalid handling, dragging, Undo/Redo, camera coexistence, frame movement, mixed save/reload and unframed dependency/deletion behavior. The browser document API is a fixture API.
- Real Edge M2 camera/fallback and legacy 2D frame regression checks.
- Separate authenticated HTTP/PostgreSQL acceptance using the shared M3 fixture and edit/reload helper. Temporary credentials are generated at runtime; test account roles and sessions are disabled/revoked during cleanup.

Edge rendering acceptance uses software WebGL (SwiftShader), not a physical GPU qualification. M3 does not implement solid authoring, freeform topology editing, sections, curved-surface attachment or advanced hidden-edge algorithms. Before M4, extend the evaluator and authoring around parametric solid invariants, owned stable feature IDs and dimensions, with focused persistence/history/browser acceptance.
