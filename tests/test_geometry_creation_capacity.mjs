import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'

const { emptyGeometryV1, normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const { canAllocateGeometry, GEOMETRY_COLLECTION_LIMITS: limits } = await loadGeometryModule('geometryCapacityModel')
const { addGeometryPoint, addGeometrySegment, addGeometryPolygon, addGeometryText } = await loadGeometryModule('geometryAuthoringModel')
const { commitGeometryLine } = await loadGeometryModule('geometryLineModel')
const { commitGeometryTemplate, templateVertices } = await loadGeometryModule('geometryTemplateModel')
const { commitGeometryCircle } = await loadGeometryModule('geometryCircleModel')
const { commitGeometryArc } = await loadGeometryModule('geometryArcModel')
const { commitMidpoint, commitMedian, commitTriangleMedian, findMidpoint, commitAltitude, commitAngleBisector, commitIntersection, commitLinearConstruction } = await loadGeometryModule('geometryConstructionModel')

const base = { ...emptyGeometryV1(), description: 'Capacity', points: [
  { id: 'a', x: 0, y: 0, label: null }, { id: 'b', x: 10, y: 0, label: null },
  { id: 'c', x: 0, y: 10, label: null }, { id: 'v', x: 5, y: 10, label: null },
], polygons: [{ id: 'triangle', point_ids: ['a', 'v', 'b'] }] }
function count(g, collection, length) {
  if (collection === 'points') return { ...g, points: [...g.points, ...Array.from({ length: length - g.points.length }, (_, i) => ({ id: `filler_${i}`, x: 1000 + i, y: 1000, label: null }))] }
  const seed = {
    segments: { start_point_id: 'a', end_point_id: 'b' }, polygons: { point_ids: ['a', 'b', 'c'] },
    texts: { x: 0, y: 0, content: 'Text' }, lines: { kind: 'line', start_point_id: 'a', end_point_id: 'b' },
    polylines: { point_ids: ['a', 'b'] }, circles: { kind: 'circle', center_point_id: 'a', radius: 10 },
    arcs: { kind: 'arc', center_point_id: 'a', radius: 10, start_angle: 0, sweep_angle: 1 },
  }[collection]
  return { ...g, [collection]: Array.from({ length }, (_, i) => ({ id: `${collection}_${i}`, ...seed })) }
}
let tests = 0
function test(name, run) { run(); tests++; console.log(`PASS: ${name}`) }
function rejected(g, operation, expected = g) {
  assert.ok(normalize(g), 'Capacity fixture must be a valid persisted document')
  const before = structuredClone(g)
  assert.equal(operation(g), expected)
  assert.deepEqual(g, before)
}
function accepted(g, operation, collection, expected) {
  const before = structuredClone(g), next = operation(g)
  assert.notEqual(next, g); assert.equal(next[collection].length, expected)
  assert.ok(normalize(next)); assert.deepEqual(g, before)
  return next
}
test('allocation predicate rejects unknown own enumerable keys', () => {
  assert.equal(canAllocateGeometry(base, { point: 1 }), false)
  assert.equal(canAllocateGeometry(base, { points: 0, point: 1 }), false)
  assert.equal(canAllocateGeometry(base, { points: 0, [Symbol('point')]: 1 }), false)
  assert.equal(canAllocateGeometry(base, { points: 0, toString: 1 }), false)
  assert.ok(canAllocateGeometry(base, { points: 1 }))
})
test('allocation predicate validates deltas, exact maxima and optional collections', () => {
  for (const collection of Object.keys(limits)) {
    const full = count(base, collection, limits[collection])
    assert.ok(canAllocateGeometry(full, { [collection]: 0 }))
    assert.equal(canAllocateGeometry(full, { [collection]: 1 }), false)
    for (const invalid of [-1, .5, Infinity, NaN]) assert.equal(canAllocateGeometry(base, { [collection]: invalid }), false)
  }
  assert.ok(canAllocateGeometry(base, { lines: 1, circles: 1, arcs: 1, polylines: 1 }))
})
for (const [collection, operation] of [
  ['points', g => addGeometryPoint(g, 20, 20)], ['segments', g => addGeometrySegment(g, 'a', 'c')],
  ['polygons', g => addGeometryPolygon(g, ['a', 'b', 'c'])], ['texts', g => addGeometryText(g, 20, 20)],
]) test(`${collection}: exact-boundary success and atomic full rejection`, () => {
  accepted(count(base, collection, limits[collection] - 1), operation, collection, limits[collection])
  const full = count(base, collection, limits[collection])
  rejected(full, operation, collection === 'polygons' ? null : full)
})
test('duplicate segment remains a no-op at full capacity', () => {
  const full = count(base, 'segments', limits.segments)
  rejected(full, g => addGeometrySegment(g, 'b', 'a'))
})
const newEnds = [{ x: 20, y: 20 }, { x: 30, y: 30 }]
const reusedEnds = [{ x: 0, y: 0, pointId: 'a' }, { x: 10, y: 0, pointId: 'b' }]
for (const kind of ['line', 'directed_line', 'vector']) test(`${kind}: endpoint demand and output capacity are atomic`, () => {
  const next = accepted(count(base, 'points', 498), g => commitGeometryLine(g, kind, newEnds), 'points', 500)
  const line = next.lines.at(-1)
  assert.deepEqual(next.points.find(p => p.id === line.start_point_id), { id: line.start_point_id, x: 20, y: 20, label: next.points.at(-2).label })
  assert.equal(next.points.find(p => p.id === line.end_point_id).x, 30)
  rejected(count(base, 'points', 499), g => commitGeometryLine(g, kind, newEnds))
  rejected(count(base, 'points', 500), g => commitGeometryLine(g, kind, newEnds))
  rejected(count(base, 'lines', 1000), g => commitGeometryLine(g, kind, newEnds))
  accepted(count(base, 'lines', 999), g => commitGeometryLine(g, kind, reusedEnds), 'lines', 1000)
  accepted(count(base, 'points', 500), g => commitGeometryLine(g, kind, reusedEnds), 'lines', 1)
  const partlyReused = [reusedEnds[0], newEnds[1]]
  accepted(count(base, 'points', 499), g => commitGeometryLine(g, kind, partlyReused), 'points', 500)
})
test('open and closed polylines charge their actual destination collections', () => {
  const draft = [...newEnds, { x: 40, y: 20 }]
  accepted(count(base, 'points', 497), g => commitGeometryLine(g, 'polyline', draft), 'points', 500)
  rejected(count(base, 'points', 498), g => commitGeometryLine(g, 'polyline', draft))
  rejected(count(base, 'polylines', 200), g => commitGeometryLine(g, 'polyline', draft))
  accepted(count(base, 'polylines', 199), g => commitGeometryLine(g, 'polyline', reusedEnds), 'polylines', 200)
  rejected(count(base, 'polygons', 200), g => commitGeometryLine(g, 'polyline', draft, true))
  accepted(count(base, 'polygons', 199), g => commitGeometryLine(g, 'polyline', draft, true), 'polygons', 200)
  const full = count(base, 'points', 500)
  accepted(full, g => commitGeometryLine(g, 'polyline', g.points.map(p => ({ ...p, pointId: p.id }))), 'polylines', 1)
  rejected(base, g => commitGeometryLine(g, 'polyline', Array.from({ length: 501 }, (_, i) => ({ x: i, y: 20 }))))
})
for (const tool of ['triangle', 'right_triangle', 'rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid', 'regular_pentagon', 'regular_hexagon', 'regular_polygon']) test(`${tool}: exact template resource demand, reuse and rollback`, () => {
  const a = { x: 20, y: 20 }, b = { x: 40, y: 20 }, n = 64
  const vertices = templateVertices(tool, a, b, n)
  const operation = g => commitGeometryTemplate(g, tool, a, b, n)
  accepted(count(base, 'points', 500 - vertices.length), operation, 'points', 500)
  rejected(count(base, 'points', 501 - vertices.length), operation)
  rejected(count(base, 'polygons', 200), operation)
  accepted(count(base, 'polygons', 199), operation, 'polygons', 200)
  const reused = { ...base, points: vertices.map((p, i) => ({ id: `vertex_${i}`, ...p, label: null })), polygons: [] }
  const full = count(reused, 'points', 500)
  accepted(full, operation, 'polygons', 1)
})
for (const kind of ['circle', 'disk', 'arc', 'sector']) test(`${kind}: center reuse and family capacity`, () => {
  const collection = ['circle', 'disk'].includes(kind) ? 'circles' : 'arcs'
  const operation = (g, center = { x: 20, y: 20 }) => collection === 'circles'
    ? commitGeometryCircle(g, kind, center, { x: center.x + 10, y: center.y })
    : commitGeometryArc(g, kind, center, { x: center.x + 10, y: center.y }, { x: center.x, y: center.y + 10 })
  accepted(count(base, 'points', 499), operation, 'points', 500)
  rejected(count(base, 'points', 500), operation)
  rejected(count(base, collection, 200), operation)
  accepted(count(base, collection, 199), operation, collection, 200)
  accepted(count(base, 'points', 500), g => operation(g, { x: 0, y: 0, pointId: 'a' }), collection, 1)
})
test('Median midpoint reuse at full point capacity and rollback when only one recipe fits', () => {
  const withMidpoint = commitMidpoint(base, 'a', 'b')
  const full = count(withMidpoint, 'points', 500)
  const result = commitTriangleMedian(full, 'a', 'v', 'b')
  assert.equal(result.status, 'created'); assert.equal(result.geometry.points.length, 500); assert.ok(normalize(result.geometry))
  const repeated = commitTriangleMedian(result.geometry, 'b', 'v', 'a')
  assert.equal(repeated.status, 'existing'); assert.equal(repeated.geometry, result.geometry)
  const segmentFull = count(base, 'segments', 1000)
  rejected(segmentFull, g => commitTriangleMedian(g, 'a', 'v', 'b').geometry)
  let chain = base
  for (let i = 0; i < 199; i++) {
    // Use the actual previous output; no synthetic ownership or recipe states.
    const previous = i === 0 ? 'v' : chain.constructions.at(-1).output_point_id
    chain = commitMidpoint(chain, i % 2 === 0 ? 'c' : 'v', previous)
    assert.equal(chain.constructions.length, i + 1)
  }
  rejected(chain, g => commitTriangleMedian(g, 'a', 'v', 'b').geometry)
})
test('existing construction guards retain their resource boundaries', () => {
  const fullPoints = count(base, 'points', 500)
  rejected(fullPoints, g => commitMidpoint(g, 'a', 'b'))
  rejected(fullPoints, g => commitAltitude(g, 'a', 'v', 'b'))
  rejected(count(base, 'points', 499), g => commitAngleBisector(g, 'a', 'v', 'b'))
  accepted(count(base, 'points', 498), g => commitAngleBisector(g, 'a', 'v', 'b'), 'points', 500)
  const sources = { ...base, segments: [{ id: 'ab', start_point_id: 'a', end_point_id: 'b' }, { id: 'av', start_point_id: 'a', end_point_id: 'v' }, { id: 'bc', start_point_id: 'b', end_point_id: 'c' }] }
  const intersection = g => commitIntersection(g, { kind: 'segment', id: 'av' }, { kind: 'segment', id: 'bc' })
  accepted(count(sources, 'points', 499), intersection, 'points', 500)
  rejected(count(sources, 'points', 500), intersection)
  for (const kind of ['parallel', 'perpendicular']) rejected(count(sources, 'lines', 1000), g => commitLinearConstruction(g, kind, { kind: 'segment', id: 'ab' }, 'v'))
  const m = commitMidpoint(base, 'a', 'b'), id = findMidpoint(m, 'a', 'b').output_point_id
  rejected(count(m, 'segments', 1000), g => commitMedian(g, 'v', id))
})
console.log(`PASS: ${tests} creation-capacity scenarios`)
