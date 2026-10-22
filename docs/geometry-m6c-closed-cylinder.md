# M6-C Step 2A: closed finite cylinder intersections

This adds analytic calculations only. Cylinder runtime, authoring, picking,
ribbon activation, viewport/SVG rendering and solid transforms remain unchanged.
Cone, sphere and surface-point authoring remain unavailable.

## Calculation API

- TypeScript: `intersectClosedCylinder3D(cylinder, ray)` in `geometry3dAnalytic.ts`.
- Python: `intersect_closed_cylinder(cylinder, ray)` in `geometry_3d_analytic.py`.
- Existing `intersectAnalyticSurface3D` / `intersect_analytic_surface` retain
  their lateral-only cylinder behavior and UV semantics.

The local cylinder is `x*x + y*y <= radius*radius`, `0 <= z <= height`.
The existing analytic frame maps it into world space. Sparse feature maps do
not change the calculation and no feature IDs or polygonal faces are allocated.

Each returned hit has `position`, `distance`, `depth`, `region` and `uv`:

| Field | Meaning |
| --- | --- |
| `position` | World-space boundary position |
| `distance` | Strictly positive distance along the normalized world ray |
| `depth` | Camera-forward depth when clipping is supplied; otherwise distance |
| `region` | `lateral`, `bottom_cap` or `top_cap` |
| `uv` | Existing normalized lateral UV, or `null` for either cap |

Results are ordered nearest first. Camera clipping is inclusive at near/far
and uses depth rather than perspective ray distance. Invalid geometry, frames,
directions and clipping inputs throw, following the existing calculation API.
These are transient calculation results, not a new persisted schema or new
`point_on_face` / `point_on_surface` attachment semantics.

## Boundary conventions and numerical safety

- A rim hit is returned once, with cap precedence over lateral classification.
- An isolated tangent returns one hit.
- A ray starting inside returns its positive exit hit.
- The starting boundary point at distance zero is excluded. An inward ray can
  still return the opposite boundary; an outward ray returns no hit.
- A ray lying in a cap plane returns finite disk/rim endpoints. A ray following
  a lateral generator returns its cap endpoints. The continuum of coincident
  boundary points is not enumerated.
- Solve near the cylinder center and reconstruct local hit positions to avoid
  unnecessary far-origin cancellation. Ray distances remain IEEE-754 numbers.
- Cancel a rotated ray's spurious axial velocity only within its dot-product
  round-off bound. Do not treat every small angle as parallel.
- Use separate radius/height round-off budgets for deduplication. Strict finite
  height tests prevent a near-parallel cap crossing from creating a third hit.
- Hits indistinguishable from the ray origin within the documented arithmetic
  error budgets are excluded as numerical self-hits. This is not an interactive
  snap tolerance. Existing world-coordinate resolution guards still apply.

## Validation and next boundary

`test_geometry_3d_closed_cylinder.mjs` generates shared calculation records;
`test_geometry_3d_closed_cylinder_backend.py` verifies Python parity and strict
validation. Canonical geometry remains covered by the original 695 analytic
records and the existing M6-B edge/face tests.

Step 2B still needs closed-surface display geometry, silhouette/rim generation,
shared viewport/print opaque occlusion and analytic picking integration. The
full operational cylinder also needs evaluator/ownership, analytic transform
bounds/pivot, scene insertion and lifecycle/persistence acceptance. None is
enabled by this calculation-only step.
