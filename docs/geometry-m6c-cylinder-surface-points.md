# M6-C Step 3A: cylinder lateral-surface point foundation

This step adds semantic evaluation and a programmatic creation API only. No
ribbon command, pointer placement, dragging, handle or visible UI is registered.
Cone and sphere surface recipes remain unavailable.

## Contract and coordinates

The existing V2 construction is unchanged, including its `id`:

```json
{"id":"P_attachment","kind":"point_on_surface","surface_id":"C_surface","uv":[0.25,0.5],"output_point_id":"P"}
```

The target is an existing `scene.surfaces` cylinder record, owned through the
solid's existing `surface` feature slot. Custom carrier IDs are preserved; no
mesh, cap or transient rendering IDs are accepted.

For frame origin O, axes X/Y and Z = X cross Y, radius r and height h:

`P = O + r*cos(2*pi*u)*X + r*sin(2*pi*u)*Y + h*v*Z`.

O is the bottom center O1 and O+h*Z is the top center O2. Azimuth zero points
along local X and increases toward local Y. The existing analytic frame and
surface evaluator provide exactly these conventions.

`createPointOnCylinderSurface3D(scene, surfaceId, uv, pointId, label = null)`
wraps finite azimuths with the existing bounded analytic wrapping helper. In
particular u=1 becomes 0. It rejects invalid v rather than clamping it. Stored
UV remains strict: 0 <= u < 1 and 0 <= v <= 1. Direct persisted u=1 remains
invalid, matching the existing TypeScript/Python contract; callers canonicalize
through the foundation API before persistence. Nonfinite and boolean coordinates,
duplicate IDs, missing references and non-cylinder parents fail atomically.

## Evaluation and lifecycle

The existing graph validator enforces reference types, unique ownership and
acyclic dependencies. Evaluation waits for the cylinder before evaluating its
surface recipes, then evaluates downstream constructions in dependency order.
Point caches are recomputed from current native dimensions, frame and fixed UV;
old world-space caches never become transform input.

Transform isolation permits surface outputs and their construction descendants
to follow the parent. Existing guards for unrelated geometry and other solids
remain. Cylinder deletion evaluates first, removes its surface constructions,
reports attachment losses and retains the output point IDs, labels and final
coordinates. Downstream recipes survive. Existing history and serialization
store the same semantic scene without a migration or schema change.

Backend normalization and payload validation remain unchanged. Backend analytic
evaluation supplies the numeric parity oracle; no new Python editor/evaluation
architecture is introduced.

## Verification and remaining work

The focused frontend suite exports 42 canonical scenes across XY/XZ/YZ and
rotated frames, with 54 created attachments and 324 attached-point observations.
It checks endpoint/interior axial values, seam wrapping, transforms and independent
dimensions, stale caches, descendant ordering, deletion, Undo/Redo, canonical
reload, custom carrier IDs, isolation, invalid input and cone/sphere gating.
The backend suite checks those scenes through normalization and Create/Update
payloads and compares derived coordinates with the Python analytic evaluator.

Step 3B can build placement/picking and constrained interaction on this API.
Browser visibility still requires wiring an intentional UI flow, surface hit/UV
selection, snapping/reuse and interaction history, followed by browser, print and
real save/reload acceptance. None of that acceptance is claimed by Step 3A.
