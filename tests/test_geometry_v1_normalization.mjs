import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadGeometryModule } from './geometry_test_modules.mjs'

const { normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const root = fileURLToPath(new URL('../', import.meta.url))
const python = process.env.GEOMETRY_TEST_PYTHON ?? fileURLToPath(new URL('../.venv/Scripts/python.exe', import.meta.url))
// Execute the exact shared fixtures against the authoritative persisted write contract.
const cases = JSON.parse(execFileSync(python, ['-m', 'tests.test_geometry_v1_normalization_parity', '--fixtures'], { cwd: root, encoding: 'utf8' }))
for (const { name, data, canonical } of cases) {
  const before = structuredClone(data)
  assert.deepEqual(normalize(data), canonical, name)
  assert.deepEqual(data, before, `${name}: normalization must not mutate input`)
}
for (const name of ['numeric leading BOM', 'numeric leading NEL', 'underscore before decimal', 'underscore after decimal']) {
  const fixture = cases.find(c => c.name === name)
  assert.ok(fixture, `Required numeric counterexample: ${name}`)
  console.log(`PASS: ${name}: backend/frontend ${fixture.canonical === null ? 'REJECT' : 'ACCEPT as ' + fixture.canonical.points[0].x}`)
}
const base = cases.find(c => c.name === 'null label').data
for (const value of [NaN, Infinity, -Infinity]) {
  for (const name of ['points', 'texts']) {
    const bad = structuredClone(base)
    bad[name][0].x = value
    assert.equal(normalize(bad), null)
  }
}
const coincident = structuredClone(base)
Object.assign(coincident.points[1], { x: coincident.points[0].x, y: coincident.points[0].y })
assert.ok(normalize(coincident), 'Distinct coincident endpoint IDs retain existing segment semantics')
console.log(`PASS: ${cases.length} shared backend/frontend boundary fixtures, input immutability, 6 nonfinite cases, and coincident segment compatibility`)
