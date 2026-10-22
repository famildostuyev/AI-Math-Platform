# Step 4E: textbook cone creation view

The former elevated orthographic camera had a non-antipodal silhouette contact
chord. Semantic A/B are antipodal; their generators therefore produced distinct,
near-parallel strokes beside the silhouette. This is mathematically expected.

In perspective the tangent equation is
Ex*cos(theta)+Ey*sin(theta)+(r/h)*Ez-r=0. With local eye height Ez=h, contacts
are antipodal. The A/B diameter direction (-0.6,0.8,0) is perpendicular to
horizontal eye direction (0.8,0.6,0). This gives exact SA/SB silhouette alignment
without moving any semantic geometry.

For the first cone in a pristine scene with the uncustomized standard camera,
`createConeAt3D` saves a perspective camera in the cone frame:

- d = 2.5*max(radius,height)
- eye = (0.8d,0.6d,height)
- target = (0,0,height/2), up = local cone axis
- vertical_span = max(4radius,1.6height); existing fov/clip settings retained

This applies to XY, XZ and YZ through the existing frame conventions. Both input
projection modes use the perspective preset for this new-cone default. A scene
with any existing geometry, or with customized camera position/target/framing,
retains its camera. Reopening/evaluation/transforms do not apply presets.
The editor synchronizes its live/session camera on that creation commit only;
ordinary camera navigation and saved-camera behavior remain independent.

Exact alignment with a nondegenerate base ellipse is impossible in orthographic
projection: antipodal tangents require axial view component zero, collapsing
the projected base to a line. Teachers may still orbit/use orthographic views;
the correct separate silhouettes and generators then remain visible.

Cone labels use outward projected offsets: S/A/B away from O with suitable text
anchors; O sits below/right of the base center, clear of SO and the standard AB.
This shared SVG path is used by editor and saved-camera print output. It does
not move points or affect ordinary point labels/cylinders. Long labels and
arbitrary dense scenes do not receive a general collision-avoidance layout.

Verification:

```
node tests/test_geometry_3d_cone_textbook.mjs
node tests/cone_silhouette_browser.mjs --textbook
```

External PowerShell:

```powershell
$env:PYTHONPATH='D:\AI-Math-Platform\backend;D:\AI-Math-Platform'
.\.venv\Scripts\python.exe -B -m unittest tests.test_geometry_3d_cone_textbook_backend tests.test_geometry_3d_cone_generators_backend tests.test_geometry_3d_cone_diameter_backend tests.test_geometry_3d_cone_height_backend tests.test_geometry_3d_cone_authoring_backend tests.test_geometry_3d_cylinder_centers_backend tests.test_geometry_3d_contract
.\.venv\Scripts\python.exe -B tests/cone_textbook_real_persistence.py --temporary-admin
```

Edge checks real pointer creation in all three working planes, live/saved camera
agreement, label bounds, orbit without saved-scene mutation, and fixture reopen.
The separate API/PostgreSQL harness verifies exact saved-camera/geometry JSONB
round trips with an isolated development draft and disabled-afterward temporary
admin. Neither claims full production-browser Apply/Save/page-refresh or new
actual PDF visual acceptance.
