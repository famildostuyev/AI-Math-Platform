# M6-C Step 3B: cylinder lateral-surface point interaction

The existing unified Point ribbon action (`action3D: point`) creates points on
visible cylinder lateral surfaces. Existing visible semantic points retain snap
priority, including O1/O2 and existing attachments. Existing polyhedral edge/face
creation and empty-space working-plane free-point creation remain available.
There is no separate editor or ribbon command. Cone/sphere tools remain disabled.

## Picking

`pickCylinderSurface3D` starts with the nearest exact closed-cylinder ray hit in
the existing analytic infrastructure. Only a lateral region with its existing
semantic `surface` carrier is eligible. A cap/rim hit never searches through to
the lateral surface behind it. Nearer semantic polygon faces block the target.
An optional carrier ID restricts dragging to the original parent; a nearer
cylinder blocks rather than retargets the attachment. Both camera projections,
current native dimensions and arbitrary valid frames use the same ray path.

The Point tool passes canonical hit UV to Step 3A's creation API. Point IDs and
null default labels follow existing point-tool conventions. Subsequent clicks
reuse visible points through the established screen-space snap priority.

## Dragging and history

Select and drag a visible attached point. Its owning carrier, camera, viewport
dimensions and screen grab offset are fixed at pointer-down. Each valid sample
updates UV against the original semantic scene, then evaluates derived XYZ and
descendants. Identity, label and parent construction remain unchanged.

The nearest visible lateral hit keeps v in [0,1] and azimuth canonical across the
seam. Cap, occluded, out-of-range and missed rays hold the last valid preview;
they do not project a point onto a cap or another cylinder. This is a boundary
hold policy, not a cursor extrapolation or hidden-back-side editing mechanism.

Previews stay outside the document. Pointer-up publishes at most one history
entry. Returning to the grab position or making no geometric change publishes
nothing. Escape uses the existing editor cancellation path; pointer cancellation
and lost capture discard the draft. Foreign pointer events cannot finish or
cancel the active gesture. Existing viewport pointer capture and wheel suppression
remain in use. Attached-point hits take precedence over selected-solid resize
handles so a point grab cannot change cylinder dimensions.

Apply/Save use the unchanged semantic payload and editor history paths. Step 3A
parent deletion still detaches to free semantic points and preserves dependents.

## Automated verification and browser acceptance

`test_geometry_3d_cylinder_surface_interaction.mjs` covers twelve combinations of
XY/XZ/YZ orientation, rotation and camera projection. Scenes include translation,
independent radius/height changes and multiple cylinders. It exports 36 canonical
creation/drag/deletion scenes for Python normalization, Create/Update payload and
analytic-coordinate parity. Additional checks cover both caps, seam crossing,
occlusion, point reuse, grab offsets, fixed gesture camera, cancellation, foreign
pointers, no-op, one-step Undo/Redo, dependent updates, isolation, SVG/reload,
center priority and existing polyhedron point authoring.

Real browser acceptance remains required: create a cylinder, use Point on its
visible side, repeat the click, select/drag across the seam and toward both ends,
cancel with Escape and exercise Undo/Redo. Repeat with perspective and
orthographic cameras, a rotated/resized cylinder and foreground cylinders or
polyhedra. Verify centers and cap rejection, then Apply, Save, reload, re-edit,
delete/Undo and compare saved-camera SVG/print. No manual browser acceptance or
real HTTP/database round trip is claimed by the automated model tests.
