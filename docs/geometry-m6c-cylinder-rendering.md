# M6-C Step 2B: read-only closed cylinder display

## Capability boundary

`evaluateGeometryRenderScene3D` is a separate read-only entry point into the
existing dependency evaluator. It evaluates sparse cylinder feature caches from
the analytic definition, then the existing supported point/face/edge dependency
graph. The ordinary evaluator, transactions, history commits, solid editing,
ribbon and authoring still reject cylinder scenes as unavailable. Cone, sphere
and `point_on_surface` evaluation/authoring remain unavailable.

No V2 contract, database or backend endpoint changes are needed. A scene is
normalized before and after read-only evaluation; inputs are never mutated.

## Display adapters and compositor

`geometry3dRenderGeometry.ts` defines transient patch and curve representations.
The first adapter is a closed finite cylinder: camera-facing lateral patches,
circular disk caps, analytic tangent generators and circular rims. Faces and
curves carry the existing solid ID, not generated semantic mesh IDs. The
ordinary semantic picking projection excludes these display-only patches.

Resolution defaults to 128 samples around a circle (explicit adapter quality
range 16–1024). It is not persisted and does not define geometry, ownership,
bounds, attachments or feature identities. No tessellation spokes/generators
are emitted as edge strokes. Coincident orthographic axial rims are deduplicated
  in favor of their visible representative.

Hidden curves carry cumulative screen-length dash phase across tessellation
chords and visibility splits; a short chord does not restart the dash pattern.

The projection and compositor consume patches/curves independently of the
cylinder adapter. Future analytic kinds can supply their own patch/curve and
closed-ray adapters without replacing planar depth masks or the SVG compositor.

## Visibility

- Point and text-anchor occlusion uses Step 2A closed-cylinder intersections,
  independent of tessellation.
- Ordinary planar occlusion keeps the existing hidden-line interval algorithm.
- Analytic line visibility uses exact closed-ray tests, seeded by projected
  patch crossings and samples at most 4 px apart (4096-step safety cap).
  Detected transitions are refined to .01 px. Rim tests evaluate positions on
  the analytic circle, avoiding self-occlusion of inscribed display chords.
- Hidden edge strokes keep the existing dashed convention; occluded points and
  plain-text annotation anchors are omitted only from the display. Semantic
  entities remain present and unchanged.
- Fill masks compare planar depth at every projected patch. Orthographic depth
  and perspective reciprocal depth are affine in screen space. Mask polygons
  are clipped at depth-order crossings; average-depth painter order does not
  decide opaque cylinder overlap. Same convex-cylinder patches do not mask one
  another. Existing polyhedron-only fill/hidden-line conventions are retained.
- Cylinder fill is opaque. Polyhedron fill keeps its previous light/translucent
  style, but a cylinder behind a nearer polygon is masked rather than showing
  through its fill. Plane display patches retain their non-occluding convention.

## Viewport, camera and print

Scenes containing analytic display solids use the shared vector compositor for
the live viewport as well as saved-view SVG. Existing polyhedron-only viewports
keep their WebGL renderer. The WebGL canvas/OrbitControls remains responsible
for navigation. The live compositor reads its current camera inside the draw
callback, never a delayed React camera echo. No second camera state is added.

Saved-view output always uses `print_camera`; editing orbit/pan/zoom does not
change it. Screen-only selection color is passed separately and never enters
the saved SVG. Mask identifiers depend deterministically on projected geometry,
camera and dimensions so different frame/view SVGs do not reuse unrelated masks.
Print CSS hides the live vector layer and shows the saved vector layer within
the application's existing PDF document wrapper.

## Limits and remaining runtime work

Display fills/rims are polygonal approximations at a deterministic quality,
while semantic positions, tangent generators and closed-ray tests are analytic.
Extreme zoom can require a higher quality setting. A grazing analytic occlusion
sliver smaller than the display/sample tolerance may be missed; this is not a
semantic attachment or geometry error. This work does not claim exact symbolic
conic SVG export. The vector compositor also costs more than the old WebGL-only
path for dense overlapping analytic scenes; adapters are not a general CSG engine.

Existing plain-text annotation anchors participate in mixed-scene visibility.
LaTeX annotation typesetting and marking authoring/rendering are not introduced
by this step; their persisted payloads remain intact.

Step 2C still needs ordinary cylinder evaluator/ownership support, semantic
selection, working-plane insertion, analytic transform pivot/bounds integration,
deletion/history and full Apply/Cancel plus HTTP/PostgreSQL persistence acceptance.
Do not activate the ribbon until that complete runtime slice passes acceptance.

## Focused checks

- `node tests/test_geometry_3d_cylinder_render.mjs`
- `node tests/geometry_frame_browser.mjs --cylinder-render`
- Existing M4/M5 visibility/integration, M6-B edge/face, Step 2A and analytic parity.
- TypeScript, production frontend build and whitespace checks.
