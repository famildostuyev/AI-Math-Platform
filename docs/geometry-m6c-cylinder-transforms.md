# M6-C Step 2D: cylinder transform integration

Cylinder transforms reuse the existing solid gesture/history controller and V2
frame/dimension contract. No rendering, camera, UV, schema or API changes.

- Transform capability is separate from polyhedral topology capability.
- Rotation uses Rodrigues rotation about the analytic cylinder center.
- Translation changes frame.origin along the current working plane.
- Uniform scaling multiplies radius and height, compensating frame.origin to
  keep the analytic center fixed. Axes, feature IDs and proportions remain fixed.
- Bounds/handles use the analytic oriented eight corners, never mesh vertices.
- Independent geometry guards apply to all three cylinder transforms. Directly
  shared center references are conservatively rejected. Existing annotation and
  marking scale restrictions remain; unsupported operations return null.
- Existing drag snapshots provide preview, one commit, cancellation and no-op
  semantics. Editing/saved cameras remain separate. Cone/sphere/surface-point
  authoring remain disabled.

Focused tests: test_geometry_3d_cylinder_transforms.mjs covers 30 combinations
of working plane, camera projection and independent second solid, canonical
serialization, analytic bounds, handle gestures, cancellation and history.
The Python counterpart validates those scenes through backend normalization and
Create/Update payloads. Cylinder authoring Edge acceptance now also drags all
three transforms before each real persistence round trip, checks isolation,
unchanged camera and exact Undo/Redo. Existing Step 2C scenarios remain included.

Manual acceptance is still required for both Steps 2C and 2D: create/select a
cylinder, rotate/move/resize it next to another solid, Undo/Redo, right-click
Properties, delete/Undo, Apply, Save and reload. Check the saved print view.

Validation in this step:
- 30 new frontend/backend transform fixture scenes passed.
- Existing backend focused suite: 7 tests passed (695 analytic + 225 closed-ray
  parity records, cylinder authoring and M6-B edge/face contracts).
- M4/M5 rotation, translation, scale, combined history, visibility and M6-B
  edge/face model regressions passed; TypeScript and production build passed.
- Real Edge cylinder authoring plus transforms passed twice through actual
  HTTP/PostgreSQL persistence. JSONB matched the second reloaded scene exactly.
  Development acceptance revision: b141e93b-11d6-4577-8e41-73d241677ffd.
- First fixture Edge run passed assertions but exited with a temporary-profile
  EBUSY cleanup error; cleanup retries were increased. The real persistence run
  completed with exit code zero. No credentials are stored in this report.
- Real Edge camera regression also passed: 100 horizontal and diagonal moves
  each produced approximately 180 degrees, zero stale camera applications and
  zero backward jumps. Pan/zoom, reset/restoration, context menu, frame move and
  resize checks passed. Software-rendered draw timings are not a performance
  acceptance claim.
