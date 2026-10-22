# Step 4C: semantic cone base diameter

New cones materialize four owned reference points: `v_0` O, `v_1` S,
`v_2` A and `v_3` B. The shared V2 contract's cone point-slot limit is four;
all other solid limits are unchanged. Sparse legacy cone feature maps remain
valid. Existing scene preparation never adds A/B or an AB segment to old scenes.

In the authoritative cone frame, A = (-0.6r, 0.8r, 0) and
B = (0.6r, -0.8r, 0). This fixed unit direction makes AB horizontal in the
default XY camera (horizontal eye direction (4,3)); it is independent of the
live camera and of scene pixels. O is exactly the mathematical midpoint and
AB has length 2r. Changing height does not move the base endpoints; changing
radius recomputes them from source dimensions without cumulative drift.
TypeScript and Python use the same feature evaluation.

Cone creation adds ordinary persisted segments `<cone ID>_height` and
`<cone ID>_diameter` with collision-safe IDs. These are not owned topology.
Delete either through the existing Properties object selector and
“3D seçiləni sil”; points and the other segment remain. Undo/Redo restores
the full canonical scene. Deleted display segments are never regenerated.

Select A/B in the viewport or Properties object selector and use Etiket plus
“Nöqtəyə tətbiq et” to rename or clear their labels. Their positions are owned
by the cone. Ordinary new points remain unnamed. As with O/S, cone reference
markers remain visible through their owner; other solids retain occlusion.
AB itself uses the existing analytic hidden-line classification and may be
dashed. Cone deletion detaches all four references at their last world positions
and retains surviving dependent geometry under the established deletion policy.

No attempt is made to align the diameter with camera-dependent silhouette
contacts in oblique views. In the elevated default orthographic view those
contacts are not antipodal, so exact coincidence would be false geometry.
The camera, base rim and silhouette algorithm are unchanged.

Verification:

```
node tests/test_geometry_3d_cone_diameter.mjs
node tests/cone_silhouette_browser.mjs --diameter-ui
```

External PowerShell:

```powershell
$env:PYTHONPATH='D:\AI-Math-Platform\backend;D:\AI-Math-Platform'
.\.venv\Scripts\python.exe -B -m unittest tests.test_geometry_3d_cone_diameter_backend tests.test_geometry_3d_cone_height_backend tests.test_geometry_3d_cone_authoring_backend tests.test_geometry_3d_cylinder_centers_backend tests.test_geometry_3d_contract
.\.venv\Scripts\python.exe -B tests/cone_diameter_real_persistence.py --temporary-admin
```

The browser harness uses real Edge and production editor/SVG components in an
isolated fixture. The persistence harness separately verifies real API and
PostgreSQL JSONB save/reload, including removed/restored AB, with an isolated
development draft and temporary admin disabled afterward. These checks do not
claim full browser Apply/Save/page-refresh or new PDF visual acceptance.
