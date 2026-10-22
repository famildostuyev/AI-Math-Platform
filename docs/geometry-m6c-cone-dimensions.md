# Step 4F: independent cone dimensions

Selected cones expose the existing dimension-handle chrome: green circular R
handles at base radial directions and a green diamond H handle at the base
center, offset with leaders away from semantic point markers. Unselected cones
and saved SVG/print output do not contain editing handles. Uniform scaling is
unchanged; cylinder R/H retain their centered resize convention.

Radius edits retain the frame and height. Height edits retain radius and the
world-space apex, translating the base along the local cone axis by
old_height-new_height. Thus S stays fixed while O/A/B follow the new base.
This also keeps the standard perspective eye at apex height and preserves the
clean textbook tangency without changing camera position, target or zoom.
The H handle points from apex toward base; dragging outward increases height.

The authoring interaction uses the existing local-axis perspective-aware drag
mapping, source snapshot, pointer capture, cancellation and single-commit
history. Dimension values must be positive/finite and satisfy existing analytic
precision and representability guards. Each move derives a preview from the
original gesture snapshot rather than accumulating deltas.

All semantic points are re-evaluated by the existing cone feature evaluator.
SO=h, AB=2r, SA=SB=sqrt(r*r+h*h). IDs and labels stay intact, while deleted
display segments stay absent. Existing sharing/isolation protections remain in
place. Existing sparse cones can use handles without new persisted handle data
or a schema migration.

Verification:

```
node tests/test_geometry_3d_cone_dimensions.mjs
node tests/test_geometry_3d_cylinder_dimensions.mjs
node tests/cone_silhouette_browser.mjs --dimensions --textbook
```

External PowerShell:

```powershell
$env:PYTHONPATH='D:\AI-Math-Platform\backend;D:\AI-Math-Platform'
.\.venv\Scripts\python.exe -B -m unittest tests.test_geometry_3d_cone_dimensions_backend tests.test_geometry_3d_cone_generators_backend tests.test_geometry_3d_cone_diameter_backend tests.test_geometry_3d_cone_height_backend tests.test_geometry_3d_cone_authoring_backend tests.test_geometry_3d_cylinder_dimensions_backend tests.test_geometry_3d_cylinder_centers_backend
.\.venv\Scripts\python.exe -B tests/cone_dimensions_real_persistence.py --temporary-admin
```

The opt-in persistence check uses a temporary local development admin, disabled
and its sessions revoked afterward, and an isolated question revision. It
verifies API reload plus exact PostgreSQL JSONB equality for edited dimensions,
labels, camera and deleted-generator state. It does not claim full-browser
Apply/Save/page-refresh or actual PDF visual acceptance.

Handles whose axes project too close to a point cannot safely map dragging;
orbit to another view. Large edits may require manual pan/zoom to fit the scene.
No radius/height change automatically resets or reframes the teacher's camera.
