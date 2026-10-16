# M4: semantic parametric solids

Starting checkpoint: `main` at `e4d53932d47e1ac103dd3929951b0e988ed4eda4`, clean working tree. M4 adds cube, cuboid, prism and pyramid authoring to the existing Universal Editor. It adds no dependencies, database migration, parallel scene format or mesh persistence.

## Changed files (22)

| Area | Files | Responsibility |
| --- | --- | --- |
| Backend schemas | `backend/app/schemas/geometry_3d.py`, `geometry_3d_contract.json`, `geometry_3d_solids.py` | Strict alternative parameters, source references, semantic topology validation. |
| Frontend semantic model | `frontend/src/components/geometry3dContract.ts`, `geometry3d.ts`, `geometry3dSolids.ts`, `geometry3dSolidAuthoring.ts`, `geometry3dModel.ts`, `geometry3dAuthoring.ts` | Typed contract, normalization, deterministic solids, transactions, dependency scheduling, batch deletion and semantic picking. |
| Frontend integration | `frontend/src/components/GeometrySolidControls.tsx`, `GeometrySceneEditor.tsx`, `UniversalEditorRibbon.tsx`, `universalEditorSession.ts` | Solid inspector, parameter authoring/editing, owner highlighting and ribbon commands. |
| Focused tests and fixtures | `tests/test_geometry_3d_m4.mjs`, `test_geometry_3d_m4_backend.py`, `geometry_3d_m4_canonical.json`, `test_geometry_3d_contract.py` | Invariants, topology, boundaries, shared canonical data and legacy shape fixture generation. |
| Real acceptance | `tests/geometry_3d_m4_browser.mjs`, `geometry_3d_m4_reload_edit.mjs`, `geometry_frame_browser.mjs`, `geometry_3d_m1_real_backend.py` | Production Edge interactions with fixture transport; separate real HTTP/PostgreSQL acceptance. |
| Documentation | `docs/geometry-3d-m4.md` | Contract semantics, implementation boundaries and validation checkpoint. |

## Contract and ownership

V2 remains the document contract; V1 is untouched. Cube and cuboid retain their M0 parameter shapes. Prism/pyramid accept their original strict regular-template parameters or a new strict alternative:

- Prism: `sides`, `height`, `base`, `direction`.
- Pyramid: `sides`, `height`, `base`, `apex_offset`.
- Template base: `{kind: 'template', radius}`.
- Existing base: `{kind: 'face', face_id, point_ids}`. The ordered source vertex IDs are provenance, not a coordinate copy. The referenced face must retain this boundary order and vertex count.

Direction is a unit vector in the source base's local basis with a nonzero normal component. Prism height is positive perpendicular distance; signed direction supports either extrusion side. Oblique displacement is scaled accordingly. The new pyramid definition uses nonzero signed normal height (physical height is its absolute value), allowing an apex on either side of the base. Its apex is the base vertex centroid plus local XY offsets and normal height. The inspector also accepts world XYZ and converts it into these authoritative parameters. The original M0 regular-template height remains strictly positive.

An orthonormal frame stores position/orientation. For an existing source, its first vertex is the anchor: `frame.origin` is an offset, and its axes rotate the source's world-relative shape around that anchor. Template frames use absolute origins. Euler degrees are UI input only; the persisted basis remains authoritative.

Feature slots `v_i`, `e_i`, `f_i` map to allocated-once semantic entity IDs. Evaluation never allocates IDs. Owned point coordinates are evaluated snapshots of the parametric definition; renderer geometry is derived from them. Backend validates shape, dimensions, source integrity, topology and graph safety; the frontend evaluator computes coordinates and construction outputs before committing edits. Legacy incomplete M0 feature maps retain unavailable evaluation rather than being silently completed or migrated.

## Topology and validation

- Cube/cuboid: 8 vertices, 12 edges, 6 faces; box dimensions and frame preserve perpendicular edges and rectangular faces (square/equal-edge invariants for cube).
- N-gon prism: 2N vertices, 3N edges, N+2 faces.
- N-gon pyramid: N+1 vertices, 2N edges, N+1 faces.
- Stable ordering: base vertices first; top vertices or apex next. Bottom edges precede top/spoke edges. Bottom face precedes top/side faces.

The existing strict planar/simple-face validators reject repeated, self-intersecting, nonplanar and degenerate bases. Concave prisms are supported. Concave pyramids require the apex projection in the polygon kernel; unsuitable apex/base changes are rejected. Convex oblique pyramids may have projections outside their base. Existing finite coordinate, 1 MiB, 2,000-entity and 128-side boundaries remain enforced, along with existing geometric degeneracy tolerances.

The evaluator schedules parametric solids and point constructions together. A solid waits for its source vertices' producers; point recipes wait for owning solids. Cycles are rejected at normalization. Source movement updates owned features and downstream recipes deterministically. Invalid source movement is rejected atomically.

## UI, history and deletion

Only Kub, Düzbucaqlı paralelepiped, Prizma and Piramida are enabled. Teachers can choose templates or an existing face. They can also identify an ordered closed cycle of existing segments/edges using semantic point selectors; creation validates and persists the source face and solid in one transaction. Open cycles are rejected.

Dimension, frame, extrusion and apex edits commit once after validation. Invalid/no-op operations create no history entry. Camera navigation remains M2 session state; explicit saved print view changes remain undoable. Solid faces/edges pick their semantic owner; vertices remain individually inspectable and protected against ordinary dragging. Selected solid features use existing renderer highlighting.

Deletion preserves solid vertices as free points at their evaluated coordinates so downstream point references remain valid. Edge/face attachments detach through M1 rules with last coordinates and explicit loss reports. Deleting a source face or a solid whose face is another solid's source is rejected when preservation cannot be handled safely. Undo restores ownership and constraints. The freeform conversion action is disabled with an explanation.

## Rendering and acceptance boundaries

Existing Three.js and deterministic SVG adapters consume evaluated semantic points/edges/faces, including planar concave boundaries. Saved print camera drives SVG; no WebGL screenshot is used for export. Existing resource disposal, frame interaction and mixed V1/V2 document paths are reused. M2 convex orthographic hidden-edge behavior remains a feasibility subset, not M9 completion.

Focused tests cover invariants, topology through 128 sides, convex/concave sources, source and solid dependencies, invalid dimensions/bases/cycles, orientation roundtrip including gimbal lock, apex XYZ on both sides, extrusion on both sides, stable features, atomic edits/history, safe deletion, serialization and SVG determinism. Shared M4 canonical data contains cube, cuboid, concave existing-base prism, template pyramid, concave existing-base pyramid and reverse-side prism/pyramid examples. Python validates the same fixture and compares evaluated topology coordinates with frontend values.

Validation includes 57 focused Python tests, 93 V2 and 171 V1 parity cases, M1/M2/M3 frontend regressions, M4 authoring tests and the production build. Solid topology deletion batches M1 attachment handling into one validated operation; a local 128-side deletion check improved from approximately 13 seconds to 113 ms. This timing is an observation, not a cross-machine performance guarantee. Frontend and backend should be released together for the extended parameter alternative; old payloads require no migration.

Real Edge acceptance uses production components with a fixture document API and software WebGL (SwiftShader). Separate opt-in authenticated HTTP/PostgreSQL acceptance uses the real backend and runtime-generated credentials, cleaning up account roles/sessions afterward. These are separate validation layers. Physical GPU qualification and final print/PDF acceptance remain outside M4.

Final M4 Edge acceptance passed, including both extrusion/apex sides, framed mixed persistence and unframed dependency/deletion/Undo checks. Real M3 and legacy 2D frame regressions also passed. Final real HTTP/PostgreSQL acceptance revision: `bfd60dd8-cfaf-44ec-a8c8-db21e3d0d50e`; temporary account inactive, roles disabled and sessions revoked. Tracked and untracked whitespace checks passed. No commit or push was performed.

Topology-changing edits (side-count/source retarget), semantic freeform conversion, advanced polyhedra, curved solids/attachments, sections and complete hidden-edge rendering remain disabled/deferred. M5 should extend the same ownership/evaluation rules for advanced polyhedra, with independent invariant, persistence, history and browser acceptance checkpoints.
