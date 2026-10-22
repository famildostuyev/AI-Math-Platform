# M6-C Step 3C.1: teacher-controlled surface-point labels

New cylinder lateral-surface points remain selected and unnamed (`label: null`).
No automatic A/B/C naming is introduced.

Open Properties, expand **Obyektlər və koordinatlar**, enter a name in **Etiket**,
then use the existing **Nöqtəyə tətbiq et** button. The same input and button edit
an existing name or clear it. Clearing stores null, which intentionally renders
no label text. Coordinates stay disabled for cylinder surface points; applying
their Properties changes only the selected semantic point's label.

The label-only API uses the existing scene transaction, validation and history.
It preserves point ID, XYZ, UV, construction ID and all references, and does not
allocate points. The existing label renderer handles escaping, visibility,
screen placement and saved-camera SVG/print. Existing free-point editing and
O1/O2 naming behavior are unchanged. No schema or backend production change is
needed.

Focused regressions cover 84 canonical scenes across XY/XZ/YZ and both camera
projections: initial null, entry, Unicode/XML-sensitive edit, clearing, null/no-op,
Undo/Redo, validation, surface motion, all transforms and independent dimensions,
occluded text, SVG, canonical reload, deletion detachment and subsequent free-point
label editing. The Python counterpart validates all scenes through normalization
and Create/Update payload serialization. Real Edge acceptance additionally checks
the existing Properties input/button and real HTTP/PostgreSQL save/reload; model
tests alone do not establish browser acceptance.

## Recorded verification

- The 84-scene label suite, nine related frontend suites, 93 V2 contract cases,
  four backend tests and both TypeScript checks passed.
- Real headless Edge verified Properties entry `P`, edit `Q`, clear, Unicode
  `R₁`, per-edit Undo/Redo, selected-point retention, locked XYZ and visible text.
  Labels survived seam dragging in both projections, cylinder transforms,
  radius/height changes, deletion detachment and restoration.
- Two real Apply/Save/page-reload cycles passed. Properties reopened with `R₁`;
  a subsequent manual edit to `S₁` survived the second reload. PostgreSQL JSONB
  exactly matched that second saved scene. HTTP Create returned 201 and
  Update/GET returned 200. Saved-camera SVG/print DOM checks passed.
- Acceptance revision: `e07131a8-0924-4c08-994c-591212d415c3`.
  Block: `d58a92f0-1312-4ac4-9444-a47612dc0eb4`.
  Temporary development admins were disabled and sessions revoked.
- An initial broader temporary harness timed out at unrelated second-cylinder
  placement after Properties inspection. The final focused label edit/reload run
  passed; that broader placement step is not claimed as accepted here.

The earlier Step 3C bottom-cap placement and exported-PDF visual checks remain
separate acceptance items. Unnamed/cleared points intentionally have no text label.
