# Step 4B: cone apex and removable height

New cones contain owned semantic `v_0` (O) and `v_1` (S) points, evaluated
from the authoritative cone frame at local [0,0,0] and [0,0,height]. Their
IDs are stable and their labels can be renamed or cleared using Properties →
Etiket → Nöqtəyə tətbiq et. Coordinates remain controlled by the cone.

Cone creation adds one ordinary V2 `segment` between these points. Its ID is
collision-safe and it is not an owned topology feature. Select it in Properties
under the object selector (normally `<cone ID>_height`) and use
“3D seçiləni sil” to remove it. Hidden SO uses the existing dashed-line rule;
the object selector permits selection even when a hidden segment cannot be
picked through the cone. Undo/Redo uses the existing scene history.

Preparation of legacy cones can materialize a missing S, but never creates a
height segment. Consequently a deleted height stays absent on save/reload.
Deleting a cone detaches both points with their final positions and labels;
ordinary segments between them survive under the existing downstream policy.

The transform isolation guard permits cone-axis segments between that cone's
own O/S; unrelated sharing restrictions are retained. The existing `v_1`
contract is shared with Python; no schema, migration or backend implementation
changes are needed. Cylinder O1/O2 naming and ordinary point naming are unchanged.

Verification commands:

```
node tests/test_geometry_3d_cone_height.mjs
node tests/cone_silhouette_browser.mjs --height
```

External PowerShell backend verification:

```powershell
$env:PYTHONPATH='D:\AI-Math-Platform\backend;D:\AI-Math-Platform'
.\.venv\Scripts\python.exe -B -m unittest tests.test_geometry_3d_cone_height_backend tests.test_geometry_3d_cone_authoring_backend tests.test_geometry_3d_cylinder_centers_backend
.\.venv\Scripts\python.exe -B tests/cone_height_real_persistence.py --temporary-admin
```

The opt-in persistence script creates an isolated development draft and temporary
admin, verifies API reload plus PostgreSQL JSONB for present/removed/restored
height, and disables that admin and revokes its sessions afterward. It is not a
substitute for a complete real-browser Apply/Save acceptance run.
