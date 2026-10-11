# Geometry 3D M1 integration checkpoint

M1 integrates semantic V2 scenes into the existing Universal Question Editor's
Geometry block lifecycle. No renderer, mesh, drawing tool, orbit control or
export was introduced. The existing `format_version: 1` envelope, JSONB,
optimistic revision concurrency, raw read payloads and M0 write validation remain.

## Document and lifecycle

The document adapter uses the version boundary to populate exactly one of
`geometryV1`/`geometryV2`. `sourceData` still retains the original complete JSON.
There is no V1 migration or independent 3D document. Unsupported versions remain
non-editable and are shown through the existing unsupported-content fallback.

“3D səhnə əlavə et” creates an empty valid V2 scene through the existing create
endpoint, with shared visual placement and immediate editor activation. V2 uses
the shared VisualFrame for selection, eight resize handles and layout saves.
The clearly labeled non-interactive placeholder shows description, entity counts
and evaluator availability. Loaded V2 scenes can be edited, saved, cancelled,
reloaded and deleted through existing block/revision operations. Existing 2D and
3D blocks coexist. Frame-only saves do not rewrite scene data.

Visible M1 edits are description and the saved camera position. These operations
are complete and validated; no unfinished 3D drawing controls were enabled.
Other camera fields remain part of the contract for future view controls.

## Evaluation and transactions

`geometry3dModel.ts` is independent of the V1 evaluator. It normalizes a cloned
candidate, resolves stable point references and evaluates recipes in deterministic
dependency order. Its explicit result is `ok`, `invalid`, or `unavailable`.

Implemented recipes: midpoint, point-on-line/ray/segment/vector, point-on-edge,
and point-on-planar-face. Line parameters remain unbounded; all domain and finite
checks use M0. Derived positions are fresh results, never mutations of the source.
Final evaluated geometry must again pass the complete M0 validator. A candidate
must pass M0 structural/geometric validation before evaluation; this conservative
boundary can reject transient degenerate snapshot arrangements rather than
attempting a repair. Invalid mutations are atomic and produce no history.

Parametric solid evaluation and point-on-analytic-surface recipes are explicitly
unavailable until M4–M7. A scene containing them is retained losslessly and can
still receive validated metadata or saved-view changes, but no geometric edit or
parent deletion can release/reinterpret its unverified snapshots. Owned/derived
points cannot be dragged as free points. Freeform polyhedra retain their M0
topology validation; topology editing and global self-intersection checks remain
future capabilities. No general constraint solver was added.

## History, camera and deletion

The V2 snapshot history implements the existing `EditorHistoryProvider` and
registers with the Universal Editor session under the block ID. Each commit is
one logical entry; semantic no-ops and invalid edits create none. Restored scenes
are validated, IDs persist, redo branches truncate normally, and the bound is
100 operations. It is separate from V1 history and unrelated document blocks.

Session editing camera is independently validated and held outside snapshots.
Navigation changes neither persisted print camera nor geometry history. Saved
print-camera changes use scene commits and are undoable. M1 exposes no navigation
controls. The editor registers/unregisters its history through the same session
ownership mechanism as V1.

Deletion transactions support independent linear targets, edges, planar faces
and planes. They evaluate before deleting, remove dependent point recipes, keep
their point IDs at the last computed world positions, preserve valid downstream
geometry/constructions, and return explicit attachment-loss reports. Edge/face
annotations detach to a computed world anchor. The transaction validates the
whole result and rejects if any dangling reference or invalid geometry remains.
Undo restores the pre-deletion recipe and attachment.

Point deletion, parametric solid/analytic surface deletion, and freeform topology
member deletion are not operational in M1. Their safe recovery/topology behavior
is deferred; these commands return rejection, not guessed geometry or retargeting.
Semantic deletion is a tested model operation; no 3D object-selection UI is
claimed before M2/M3.

## Validation evidence

- Focused frontend M1 model tests: empty scene, mixed document dispatch/JSON
  restoration, recipes/chains, atomic mutation, stable identities, history,
  saved/session cameras, downstream preservation, deletion and unavailable modes.
- Focused backend tests: create/update/read contracts, V1 compatibility, empty
  scenes, saved camera, malformed/unsupported data and required concurrency token.
- Existing canonical parity tests: 93 V2 and 171 V1 cases.
- Real Edge/CDP: production AdminQuestionEditor with fixture HTTP transport;
  create/select/edit, Undo/Redo, invalid camera rejection, frame-only save, mixed
  V1/V2 reload, cancel and block deletion. No rendering acceptance is claimed.
- Separate opt-in local HTTP/PostgreSQL acceptance: real login, mixed-version
  create/reload, frontend evaluation after reload, saved camera, point detachment,
  database-row equality, 409/422 rejection without mutation and V2 block deletion.
  Dedicated test admin is deactivated, roles disabled and sessions revoked in
  cleanup. No migrations are applied.

Browser runner: `node tests/geometry_frame_browser.mjs --scene-3d-m1`.
Real API/DB runner: `.venv/Scripts/python.exe -B
tests/geometry_3d_m1_real_backend.py --temporary-admin`.

Next: M2 renderer/camera and screen-versus-print feasibility, then M3 primitive
authoring/selection and gestures. The first interactive 3D scene requires those
accepted capabilities; M1's placeholder is not that scene.
