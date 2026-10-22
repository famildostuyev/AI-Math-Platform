# M6-C Step 2C: cylinder authoring and selection

This supersedes the read-only capability boundary described at Step 2B. It does
not enable cylinder rotation, translation, uniform scaling, numeric parameter
editing, surface-point construction, cone or sphere authoring.

## Semantic creation

The existing Silindr ribbon entry activates the scene cylinder tool. A completed
left click intersects the active XY/XZ/YZ working plane at pointerdown, creates
one cylinder, selects it and returns to Select. The default radius is 1 and
height is 2, matching the scale of the existing side-2 cube. Its positive axis
follows the existing working-plane normal (+Z/+Y/+X respectively).

Creation uses the existing scene transaction/evaluator/history. Escape,
pointercancel, invalid/parallel-plane intersections and movement beyond the
existing click threshold do not publish partial geometry. The gesture consumes
the left pointer interaction, so it does not move the camera or outer frame.

The ordinary evaluator now supports cylinder alongside the existing polyhedral
solids, using analytic bounds and feature evaluation. Other unsupported solids
and point_on_surface remain unavailable. The display evaluator delegates to the
same graph; authoritative data still consists only of the existing V2 contract.

The default feature map materializes only one stable lateral `surface` carrier.
There are no polygonal cap faces, circular semantic edges or generated center
points. Imported sparse feature maps, including an empty map or optional v_0
and v_1 center points, remain supported. Render tessellation is not persisted.

## Selection and interaction boundary

Closed-cylinder analytic ray intersections pick the semantic solid through its
lateral surface or either cap. They do not expose transient display patch IDs.
The existing generic picker still controls Select and right-click capture.

When a cylinder participates in a hit, polygon surface depth is evaluated at
the pointer rather than using average face depth. Occluded surface candidates
are rejected before the existing priority sort. Visible point/edge snapping
retains priority and existing tolerances; near-edge checks use their actual
world position. Depth ties use the existing stable semantic-ID ordering.

Transform command handlers reject a selected cylinder with a short explanation.
The existing polyhedral transform/bounds capability gate is deliberately not
widened. No resize handles or legacy technical cylinder creation form appear.
The Point tool refuses unsupported cylinder-surface attachment rather than
silently placing a point behind the cylinder or inventing a planar cap face.

## Deletion, history and persistence

Default deletion removes the cylinder and its lateral carrier atomically,
without orphan points. Optional materialized center points in imported scenes
follow the existing parent-deletion policy: they become free points at their
last evaluated world coordinates, retaining IDs/labels and valid downstream
constructions. Surface annotation anchors detach to world coordinates and
produce attachment-loss reports. Unsupported surface recipes cause safe
rejection before deletion; they are not discarded or cascaded.

Creation and deletion each publish one evaluated scene snapshot. Undo/Redo
restore exact identities and carrier ownership. Selection and no-op interactions
do not commit geometry history. Existing frame Apply/Cancel and question Save
persist the unchanged V2 representation. Editing and saved print cameras keep
their existing independent semantics.

No backend endpoint, database schema, migration or persisted UV contract changes.
Step 2B's vector compositor, occlusion and hidden-line conventions are retained.

## Focused acceptance entry points

- `node tests/test_geometry_3d_cylinder_authoring.mjs`
- `python -B -m unittest tests.test_geometry_3d_cylinder_authoring_backend`
- `node tests/geometry_frame_browser.mjs --cylinder-authoring`
- `python -B tests/geometry_m5_real_backend.py --temporary-admin --cylinder-authoring`

The real-backend command uses the existing development-only harness: native
HTTP, a temporary admin, an isolated draft, two browser page reloads and an exact
PostgreSQL JSONB comparison against the second saved scene. Credentials stay in
process environment; the temporary admin/roles are disabled and sessions revoked
afterward. This is not a mocked persistence claim.
