# Geometry 3D M0: semantic boundary

Status: contract foundation only. No 3D tool, renderer, evaluator, authoring
gesture, camera controller, export pipeline or browser acceptance is enabled.

## Version and persistence

The existing geometry block remains `format_version: 1` (the block envelope).
Its `source_data` is discriminated by `schema_version`: existing 2D V1 or the
separate 3D scene V2 with `dimension: 3`. These are separate models, not a `z`
extension of V1. Create/update schemas accept both; JSONB storage and the
existing service serialization require no migration. Read payloads remain raw
JSON so old/future payloads can be retained. Unknown versions fail writes.

The frontend API types and the new version-boundary normalizer recognize V2.
Existing canvas/renderer/editor adapters continue to expose only V1. M1 must
add explicit V2 document dispatch without routing V2 through V1 normalization
or letting a legacy editing session overwrite it. M0 enables no ribbon item.
No V1 evaluator, normalization, history or rendering code was changed.

## Authoritative scene

`geometry_3d_contract.json` defines the shared strict shapes, variant tags and
limits. Backend models are generated as typed Pydantic models, including
discriminated unions in OpenAPI; frontend types explicitly name the same
entities and the frontend validator consumes the same shape specification.
Semantic reference checks are implemented in each runtime and tested against
shared fixtures, including canonical expected output.

Scene collections are `points`, `linear_objects`, `planes`, `edges`, `faces`,
`surfaces`, `solids`, `constructions`, `annotations`, and `markings`.
All collections and fields are required; all unknown fields/kinds are rejected.
IDs are globally unique ASCII tokens, 1–64 characters, starting with a letter.
References must resolve to the correct collection. Entity arrays sort by ID;
feature maps sort by slot; object keys sort lexically. Boundary winding,
parameter tuples and ordered reference lists retain their semantic order.
Normalization creates new data and never renames IDs, clamps parameters,
silently detaches, or repairs unsupported data. Integer-valued numbers and
negative zero have canonical numeric values. Canonical JSON has stable key and
collection ordering; numeric JSON spelling follows the runtime, so cross-runtime
parity is defined on parsed JSON, not float spelling or content hashes.

Coordinates use a right-handed Cartesian world, Z up, arbitrary consistent
world units. Paper placement is independent of world units. Values are strict
finite JSON numbers with absolute value at most 1e12. No numeric strings or
booleans are coerced. IDs never depend on coordinates, array indices, a mesh,
renderer UUIDs or tessellation. Points contain a world `position` and a nullable
label. For free points the position is authoritative; owned/constructed points
store their last valid world position as a recovery snapshot. Their recipe or
solid parameters are authoritative. M0 validates structure and graph integrity;
it deliberately does not evaluate recipes or regenerate/verify solid vertex
snapshots against dimensions. M1's evaluator must compute these before rendering
or editing, and reject evaluation failure atomically. Cached position changes
must never be interpreted as edits to parametric solid vertices.

Linear objects reference distinct point IDs and have line/ray/segment/vector
tags. Edges are distinct semantic topology entities with straight endpoints.
Planes reference three noncollinear points. Faces are simple planar ordered
polygon boundaries with three noncollinear initial vertices. Analytic surfaces
are stable carriers belonging to sphere/cylinder/cone/frustum solids; cap disks
and spherical trims are not polygon faces. Additional surface variants must
be introduced explicitly, with shared validation and fixtures.

## Ownership, modes and feature identity

Parametric solids are cube, cuboid, regular prism, regular pyramid, truncated
regular pyramid, regular polyhedron (five Platonic families), cylinder, cone,
frustum and sphere. Their typed dimensions are positive; base side counts are
integers from 3 to 128. A solid frame contains origin and orthonormal X/Y axes;
Z is X cross Y. Parameters and frame are authoritative. The freeform variant is
an explicitly tagged `polyhedron` with point/edge/face references and no
parametric fields. M0 requires closed, consistently oriented, nonzero-volume
genus-zero topology with unique edges and referenced boundary vertices.
Global solid self-intersection is a later authoring/evaluator acceptance gate.

Each parametric feature entry maps a stable template slot to a stable entity ID.
Slots `v_N`, `e_N`, `f_N` have kind-specific cardinality limits in the shared
contract. The renderer's triangle index is never a feature slot. Analytic
carriers use `surface`. Sphere `v_0` is its center; cylinders/frustums `v_0/v_1`
are bottom/top axis centers; cones use base center/tip. Polyhedral slots will be
assigned fixed ordered template definitions by M4/M5, never current array order.
Feature maps may be sparse: semantic features materialize as they are needed.
Each materialized feature has one owner, and owned edges/faces must reference
vertices with that same owner. Surface kind, owner and feature slot must agree.
A point cannot simultaneously belong to a solid and a construction.

Changing dimensions retains slots/IDs. A topology-changing side count or an
explicit freeform conversion is an atomic future command: preserve surviving
slots, allocate IDs for new features, and report removed attachments. It must
not guess an identity mapping from nearest mesh vertices. Ordinary vertex
dragging never converts a parametric object to freeform.

## Constructions and attachments

The M0 typed recipe set is midpoint, point-on-linear, point-on-edge,
point-on-face and point-on-surface. Each recipe owns exactly one existing output
point. Input references plus ownership form an acyclic graph, checked with an
iterative topological pass. A general solver and intersections are unsupported
recipe tags at M0; M8 will add explicit recipes and output identities.

Infinite-line `t` is unbounded. Rays require `t >= 0`; segments, vectors and
edges require `0 <= t <= 1`. Parameters are rejected outside their domain,
never clamped. Planar face UV is in world units: origin is its first boundary
vertex, U is its normalized first edge, V is oriented normal cross U. UV must
lie inside/on its polygon. Analytic UV uses normalized azimuth U in `[0,1)`;
V is `[0,1]`, bottom-to-top height for cylinder/cone/frustum, and south-to-north
latitude for a sphere. Axis orientation follows the owner's frame. The seam
is canonicalized by authoring, not silently repaired by validation. Pole/apex
azimuth and downstream evaluation remain M6/M7 work.

Deletion behavior is a future atomic command, not a validator side effect.
Before removing a parent, evaluate the valid scene; remove its attachment
recipe, preserve the output point's ID and last valid world coordinates, and
retain all downstream objects whose references remain valid. Deleted analytic
carriers also require detaching their constrained points/annotations. Return
an attachment-loss report (`subject_id`, `parent_id`, reason, optional preserved
world position), while persisting only a valid graph. Undo restores the entire
pre-command scene, including original recipes and ownership. Failure to obtain
a valid recovery position must be reported rather than inventing coordinates.

## Cameras, annotation and print

Both cameras have projection, position, target, normalized up, orthographic
vertical span, perspective vertical FOV in degrees, and positive near/far.
Position/target must differ, up cannot be parallel to viewing direction, near
must precede far. Vertical FOV is 1–179 degrees. Both projection parameters
persist to make switching explicit; frame aspect ratio supplies horizontal
extent. Camera state does not reference or modify geometry IDs.

Only `print_camera` belongs to source_data. A saved-question-view change is a
scene command and must use geometry history. Editing camera belongs to session
state, initialized from the saved view, and is independently validated. Orbit,
pan and zoom update that session state without a geometry Undo entry. M1 wires
this separation into shared history; no history behavior is implemented in M0.

Future annotation anchors are world, point, edge, planar face and analytic
surface attachments with the same parameter domains. Content is plain text or
LaTeX, not HTML; offsets are paper millimeters, independent of camera/world
scale. Markings are typed length, angle, right-angle and equal-length point
references; equal segments may share an endpoint. Annotation rendering,
structured text integration, measurement evaluation and marking styles are M7.

The print path consumes semantic scene + saved camera + shared visual placement.
Interactive renderer meshes are disposable. Deterministic SVG and browser PDF
must be built from evaluated semantic geometry, with no WebGL screenshot as the
source of truth. A future server PDF adapter consumes that same contract.
Use the Universal Editor's shared page/frame architecture for A4/A5; do not put
paper dimensions, duplicate layout state or renderer resources in the scene.

## Validation and rollout gates

Existing limits remain 1,048,576 encoded UTF-8 bytes and depth 32; M0 also caps
the total entity count at 2,000 and text at 4,096 Unicode scalar values. Invalid
Unicode, malformed fields, non-finite/over-limit numbers, unsupported kinds,
duplicate IDs, wrong references, multiple owners, degenerate carriers, invalid
camera, and cycles reject the complete write. The existing raw JSON boundary
still runs before backend semantic validation. No migration or dependency was
installed.

M1: version-dispatched document integration, independent 3D evaluator/history,
save/reload, editing/saved-camera commands and deletion recovery transactions.
M2: interactive renderer/camera and semantic SVG feasibility acceptance.
M3: primitive authoring, selection, snapping and atomic gestures.
M4: cube/cuboid/prism/pyramid templates and dimension edits.
M5: regular/truncated templates and explicit freeform topology editing.
M6: analytic solids and verified surface parameterization.
M7: semantic edge/face/surface points, annotations and markings.
M8: typed sections/intersection recipes with deterministic output identity.
M9: hidden-edge intervals, transparency and styling.
M10: shared A4/A5 document export, performance, accessibility and final real
Edge plus authenticated persistence acceptance. Each milestone enables only
accepted functionality; passing M0 is not release approval for 3D UI.
