# Step 4D: semantic cone generators SA and SB

New cone creation adds ordinary V2 segments from owned S (`v_1`) to A (`v_2`)
and B (`v_3`). IDs are `<cone ID>_generator_sa` and `_generator_sb`, with bounded
stems and deterministic collision suffixes. No new points, feature slots,
construction kinds, schema changes, or camera changes are introduced.

Each generator's interior interpolates the actual apex and a base-circle
endpoint, so its local radial distance is r(1-z/h) and its length is
sqrt(r*r+h*h). Endpoint evaluation follows the authoritative cone frame and
dimensions. Cone transform isolation permits these two owned reference pairs
without relaxing unrelated sharing restrictions.

Generators are displayable semantic segments, not owned topology. Select them
by clicking a visible stroke or through the existing Properties object selector,
then use “3D seçiləni sil”. Each can be removed independently; all four owned
points, SO, AB and the other generator survive. Evaluation and legacy scene
preparation never regenerate segments. Undo/Redo and canonical persistence keep
the exact deletion state. Cone deletion retains endpoints at their evaluated
positions and preserves remaining segments under the existing detachment policy.

Analytic visibility classifies front/back generators through the existing
shared editor/SVG path. When an owned semantic segment exactly matches a cone
silhouette in world space, the automatic display-only silhouette is suppressed
and the semantic segment remains. Deleting that segment reveals the silhouette
again: removing semantic construction geometry does not remove the cone's
visible boundary. In oblique views generators and silhouettes generally differ;
they remain mathematically separate rather than being forced into alignment.

Verification:

```
node tests/test_geometry_3d_cone_generators.mjs
node tests/cone_silhouette_browser.mjs --generators
```

External PowerShell:

```powershell
$env:PYTHONPATH='D:\AI-Math-Platform\backend;D:\AI-Math-Platform'
.\.venv\Scripts\python.exe -B -m unittest tests.test_geometry_3d_cone_generators_backend tests.test_geometry_3d_cone_diameter_backend tests.test_geometry_3d_cone_height_backend tests.test_geometry_3d_cone_authoring_backend tests.test_geometry_3d_cylinder_centers_backend tests.test_geometry_3d_contract
.\.venv\Scripts\python.exe -B tests/cone_generators_real_persistence.py --temporary-admin
```

The Edge harness uses the production editor and SVG in an isolated Vite fixture.
The opt-in development database harness uses a temporary admin (disabled and
sessions revoked afterward) and an isolated draft to verify exact PostgreSQL
JSONB/API round trips for present, one-deleted, both-deleted and restored states.
These are separate checks, not full-browser Apply/Save/page-refresh acceptance
or actual PDF visual acceptance.
