import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { loadGeometryModule } from './geometry_test_modules.mjs'

const { normalizeGeometryScene3D: normalize, serializeGeometryScene3D: serialize, normalizeGeometryEditingCamera3D } = await loadGeometryModule('geometry3d')
const { normalizeGeometrySourceData } = await loadGeometryModule('geometrySourceData')
const root = fileURLToPath(new URL('../', import.meta.url))
const python = process.env.GEOMETRY_TEST_PYTHON ?? fileURLToPath(new URL('../.venv/Scripts/python.exe', import.meta.url))
const cases = JSON.parse(execFileSync(python, ['-m', 'tests.test_geometry_3d_contract', '--fixtures'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }))
for (const { name, data, canonical } of cases) {
  const before = structuredClone(data)
  assert.deepEqual(normalize(data), canonical, name)
  assert.deepEqual(data, before, name + ': immutable input')
  assert.equal(serialize(data), canonical === null ? null : JSON.stringify(canonical), name + ': deterministic serialization')
  if (canonical) assert.deepEqual(normalize(canonical), canonical, name + ': idempotence')
}
const base = cases[0].data
assert.deepEqual(normalize(base), JSON.parse(await fs.readFile(new URL('./geometry_3d_canonical.json', import.meta.url), 'utf8')))
assert.deepEqual(normalizeGeometrySourceData(base), normalize(base))
assert.equal(normalizeGeometrySourceData({ schema_version: 99 }), null)
const editedCamera = structuredClone(base.print_camera); editedCamera.position = [6, 4, 3]
assert.ok(normalizeGeometryEditingCamera3D(editedCamera))
assert.notDeepEqual(editedCamera, base.print_camera)
editedCamera.near = editedCamera.far
assert.equal(normalizeGeometryEditingCamera3D(editedCamera), null)
for (const value of [NaN, Infinity, -Infinity, true, '2']) {
  const data = structuredClone(base); data.points[0].position[0] = value
  assert.equal(normalize(data), null)
}
const reordered = structuredClone(base); reordered.points.reverse()
assert.equal(serialize(reordered), serialize(base))
const cyclic = structuredClone(base); cyclic.extra = cyclic
assert.equal(normalize(cyclic), null)
console.log(`PASS: ${cases.length} shared 3D cases, canonical parity, serialization, nonfinite rejection and immutability`)
