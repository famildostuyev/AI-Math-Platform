# Step 4G: cone lateral surface points

The existing V2 `point_on_surface` recipe is shared by cylinders and cones:
`surface_id`, `uv:[u,v]`, `output_point_id`. Cone local coordinates are
`[r*(1-v)*cos(2*pi*u), r*(1-v)*sin(2*pi*u), h*v]`, transformed by the current
authoritative cone frame. v runs from base (0) to apex (1); u is periodic.
Authoring APIs normalize u into [0,1); stored contracts remain strict about
finite values and the original UV domain. No contract or database model changes
are required. The existing Python cone evaluator already implements this map.

`geometry3dSurfacePoints` now exposes shared creation, UV edit and label edit
helpers. Existing cylinder-only API names remain compatibility wrappers and do
not accept cone references. Sphere surface authoring/evaluation remains gated.

The existing Point tool uses the nearest analytic closed-solid hit. Only a
visible lateral hit qualifies. Caps, the singular apex, nearer solids and
foreground semantic faces cannot be traversed to reach a rear surface. Existing
eligible point snaps retain priority. New points have label null; Properties →
Etiket allows teacher entry, editing and clearing without changing attachment.

Exact apex clicks reuse S. The creation helper rejects an extra point at v=1;
near-apex points remain supported where distinguishable from existing-point
snapping. Editing an existing recipe to v=1 preserves its identity and normalizes
u to 0, rather than allocating or replacing a point. Pointer dragging at the
singular apex holds the last valid lateral hit.

Select-tool dragging updates UV from the original gesture snapshot and captured
camera, with existing grab-offset handling. It cannot switch surface owners.
Caps, occlusion or missed rays retain the last valid preview. A completed change
has one history entry; cancellation and no-op gestures have none. Camera orbit
and projection changes between gestures use the current camera normally.

Existing dependency ordering waits for the cone before evaluating attachments.
Translations, rotations, scaling and R/H edits recompute XYZ from UV, not cached
world deltas. Stable IDs, labels and downstream dependents are preserved. Cone
deletion evaluates first, removes surface recipes and detaches outputs at their
last valid positions; Undo/Redo restores the complete attachment state. Removed
SO/AB/SA/SB display segments are never regenerated.

Verification:

```
node tests/test_geometry_3d_cone_surface_points.mjs
node tests/cone_silhouette_browser.mjs --cone-surface
```

External PowerShell:

```powershell
$env:PYTHONPATH='D:\AI-Math-Platform\backend;D:\AI-Math-Platform'
.\.venv\Scripts\python.exe -B -m unittest tests.test_geometry_3d_cone_surface_points_backend tests.test_geometry_3d_cylinder_surface_points_backend tests.test_geometry_3d_cylinder_surface_interaction_backend tests.test_geometry_3d_cylinder_surface_labels_backend tests.test_geometry_3d_analytic_backend
.\.venv\Scripts\python.exe -B tests/cone_surface_real_persistence.py --temporary-admin
```

The real Edge fixture verifies Point/Select interaction in both projections,
apex/existing-point reuse, seam drag, cancel/history, Unicode label entry,
canonical reopen and base-cap rejection. The separate development PostgreSQL
API harness verifies exact JSONB round trips using an isolated revision and a
temporary admin disabled afterward. These checks do not claim a full production
browser Apply/Save/page-refresh run or actual exported PDF visual acceptance.
