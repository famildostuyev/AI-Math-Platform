# M6-C Step 4A: right circular cone creation

The existing V2 parametric `cone` contract is used unchanged: positive `radius`
and `height`, an orthonormal local frame, optional feature slots `v_0`, `v_1`,
and `surface`. Defaults are radius 1 and height 2 in existing scene units.
The base is local z=0; the apex is local (0,0,height). XY/XZ/YZ placements use
the cylinder conventions, with positive axes +Z/+Y/+X respectively.

The 3D ribbon's **Fırlanma cisimləri → Konus** command starts click placement
on the selected working plane. Escape and a drag cancel/do not create geometry.
Creation is one history operation and selects the cone.

Creation materializes one owned base-center point through feature `v_0`, with
default label **O**. Its position is evaluated from the cone frame, never moved
independently. Select its marker or the existing object selector, open Properties,
edit **Etiket**, and apply. Labels may be renamed or cleared without changing IDs.
No ordinary free point receives an automatic label.

As a predefined geometric reference, the base center remains visible/selectable
through its own cone (including the default view). Other foreground analytic
solids and polygon faces still occlude it. Display tessellation contains only
transient triangles, the circular base, a rim, and analytic silhouette generators;
it does not create semantic polygon faces or edges. Shared SVG/viewport clipping,
depth masking, and hidden-line conventions are reused.

Translation, rotation, and uniform scaling reuse existing frame transactions.
Only uniform resize handles appear for cones. Deletion evaluates first, removes
the solid/carrier, and keeps the center at its last valid world position with the
same ID/label and downstream constructions intact. Existing V2 serialization and
question block persistence need no schema changes. Saved camera SVG uses the
same cone geometry as the viewport.

Cone `point_on_surface` authoring/evaluation remains gated; sphere authoring and
independent cone radius/height handles remain unavailable. PDF source code is not
changed by this step.

## Automated verification

```powershell
node tests/test_geometry_3d_cone_authoring.mjs
node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.app.json --noEmit
node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.node.json --noEmit
$env:PYTHONPATH='D:\AI-Math-Platform\backend;D:\AI-Math-Platform'
.\.venv\Scripts\python.exe -B -m unittest tests.test_geometry_3d_cone_authoring_backend tests.test_geometry_3d_cylinder_centers_backend tests.test_geometry_3d_analytic_backend tests.test_geometry_3d_closed_cylinder_backend tests.test_geometry_3d_cylinder_surface_labels_backend
```

## Remaining real-browser acceptance

1. In Edge, open a development question's unified Geometry Editor and a 3D frame.
2. Choose XY, activate Konus, click to place; repeat on XZ/YZ and in both cameras.
3. Verify closed shape, base orientation, apex, dashed hidden rim, and O marker.
4. Select O; rename to a Unicode name in Properties, apply, undo and redo.
5. Translate/rotate/uniformly scale the cone; verify O follows and other solids
   remain unchanged. Verify that O cannot be dragged away from its base center.
6. Test foreground occlusion, cone body selection, cancel/no-op creation, and
   that Point cannot create a cone surface attachment.
7. Apply/Save to PostgreSQL, reload/reopen, verify IDs, name, ownership and camera.
8. Delete the cone, verify the free center and dependent points persist, then undo.
9. Inspect saved-camera SVG/print and recheck cylinder O1/O2 and polyhedron tools.

Automated tests do not constitute real Edge/PostgreSQL acceptance of this step.
