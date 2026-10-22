# M6-C Step 1: analytic calculation foundation

This milestone adds pure frontend/backend math for the existing V2 cylinder,
cone and sphere contracts. It does not enable runtime evaluation, rendering,
solid tools, transforms, surface-point authoring or new persisted entities.
Existing planar face UV remains measured distance.

## Coordinates and identity

The existing frame is authoritative: world = origin + x*X + y*Y + z*(X cross Y).
The frame helper validates the existing orthonormal tolerance and uses dual
axes for its inverse without repairing or mutating the persisted frame.

Surface UV uses azimuth theta = 2*pi*u, u in [0,1). Cylinder/cone v in [0,1]
is base-to-top axial fraction. Sphere latitude is pi*(v-0.5), south to north.
Cylinder local radius is r; cone radius is r*(1-v). No mesh data is used.
Evaluation rejects invalid UV. A separate authoring-only azimuth wrapper is
provided; normalization is never silently performed on persisted recipes.

Poles and the cone tip evaluate exactly on the local axis. Inverse calculations
accept a previous valid azimuth hint at those singularities (default zero).
They do not require historical pole/apex azimuth values to be zero.

Sparse features are preserved. The feature helper returns only materialized
v_0/v_1 positions, indexed by the original IDs: sphere center; cylinder base/top
centers; cone base center/tip. It never allocates IDs or fills missing slots.
The existing `surface` carrier has no artificial point position.

## Rays and bounds

Camera rays support perspective/orthographic projection and reject invalid or
outside-viewport input. Clip origin/forward/near/far describe camera depth,
which differs from world ray distance for off-axis perspective rays.
Direct analytic rays need not carry camera clipping. Directions are normalized.

Intersection returns sorted nonnegative lateral-surface hits, not a visibility
or selection decision. Cylinder/cone caps, cross-object occlusion, rim/silhouette
semantics and hidden-surface editing are not implemented. Coincident cylinder
generators/cone generators have no isolated hit. Cone linear and tangent cases
are handled separately; tangent duplicate roots are merged.

The sphere/cylinder solver uses closest approach rather than subtracting large
squared quadratic coefficients. Cone calculations shift near the solid before
solving a scaled stable quadratic. Hit positions are reconstructed locally,
avoiding cancellation from a distant world ray origin.

Bounds include the local box, its eight transformed corners and a tight world
AABB calculated from analytic support extrema. Pivot is the sphere center or
the cylinder/cone axis midpoint (bounds center, not cone mass centroid).
Dimensions below world-coordinate resolution and nonfinite/unsafe calculations
are rejected. This is double-precision geometry, not arbitrary-precision math.

## Verification and next boundary

Shared fixtures cover known coordinates, rotated/translated frames, seams,
singularities, finite lateral intersections, tangent/linear/coincident cases,
clipping, exact analytic bounds, sparse features and unchanged capability gates.
Frontend/backend calculations are compared with a roundoff-aware tolerance;
canonical V2 scene normalization is checked exactly. Far-origin ray comparisons
include the conditioning error implied by their input coordinates.

Before enabling cylinder runtime, add semantic carrier lifecycle, evaluator
dependencies, closed rendering and cap occlusion, SVG/print, analytic transform
bounds/pivot integration, surface-aware deletion and attachment losses. Enable
teacher-facing authoring only after those paths have separate acceptance.
