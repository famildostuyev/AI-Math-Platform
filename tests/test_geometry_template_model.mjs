import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { templateVertices, commitGeometryTemplate, regularPolygon } = await loadGeometryModule('geometryTemplateModel')
const { MIN_TEMPLATE_CREATION_LENGTH: min, REGULAR_POLYGON_LIMITS: limits, parseRegularSides } = await loadGeometryModule('geometryTemplateContract')
const { normalizeGeometrySourceDataV1: normalize, emptyGeometryV1 } = await loadGeometryModule('geometryV1')
const { deleteGeometrySelection, moveGeometryPoint } = await loadGeometryModule('geometryAuthoringModel')
const { commitGeometryLine } = await loadGeometryModule('geometryLineModel')
const { geometryFrameMetrics } = await loadGeometryModule('geometryFrameModel')
const { resizeVisualPlacement, FRAME_HANDLES } = await loadGeometryModule('visualPlacement')
const { defaultGeometryPlacement, GEOMETRY_FRAME_SCALE } = await loadGeometryModule('geometryFrameModel')
const base = { ...emptyGeometryV1(), description: 'Triangle acceptance' }
const vector = (a, b) => ({ x: b.x - a.x, y: b.y - a.y })
const dot = (a, b) => a.x * b.x + a.y * b.y
const cross = (a, b) => a.x * b.y - a.y * b.x
let document = base
for (const tool of ['triangle', 'right_triangle']) {
  for (const [a, b] of [[{ x: 10, y: 20 }, { x: 45, y: 35 }], [{ x: -50, y: 15 }, { x: -70, y: -45 }]]) {
    const vertices = templateVertices(tool, a, b)
    assert.equal(vertices.length, 3)
    const edges = vertices.map((v, i) => vector(v, vertices[(i + 1) % 3]))
    assert.ok(Math.abs(cross(edges[0], edges[1])) > 1)
    const angles = edges.map((e, i) => dot(e, edges[(i + 1) % 3]))
    if (tool === 'triangle') {
      assert.ok(angles.every(angle => Math.abs(angle) > 1))
      assert.equal(new Set(edges.map(e => dot(e, e))).size, 3, 'Scalene general triangle')
    } else assert.equal(angles.filter(angle => Math.abs(angle) < 1e-8).length, 1)
    const next = commitGeometryTemplate(base, tool, a, b)
    assert.equal(next.polygons.length, 1); assert.equal(next.points.length, 3)
    assert.ok(next.points.every(p => p.label === null))
    assert.equal(new Set(next.polygons[0].point_ids).size, 3)
    assert.deepEqual(next.polygons[0].template, { kind: tool })
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(next))), next)
    const deleted = deleteGeometrySelection(next, { kind: 'polygon', id: next.polygons[0].id })
    assert.equal(deleted.polygons.length, 0); assert.deepEqual(deleted.points, next.points)
    const edited = moveGeometryPoint(next, next.points[0].id, a.x + 3, a.y + 7)
    assert.deepEqual(edited.polygons, next.polygons, 'Creation identity is not a hidden constraint')
    assert.ok(normalize(edited))
    const bounds = geometryFrameMetrics(next)
    assert.ok(bounds.minimum.width >= 160 && bounds.minimum.height >= 120)
    assert.equal(base.points.length, 0)
  }
  document = commitGeometryTemplate(document, tool, { x: 20, y: 20 }, { x: 60, y: 20 })
  for (const length of [0, min / 2]) assert.equal(commitGeometryTemplate(base, tool, { x: 0, y: 0 }, { x: length, y: 0 }), base)
}
assert.equal(document.points.length, 4, 'Shared baseline points reused')
assert.equal(deleteGeometrySelection(document, { kind: 'polygon', id: document.polygons[0].id }).polygons[0].id, document.polygons[1].id)
const closed = commitGeometryLine(document, 'polyline', [{ x: 100, y: 100 }, { x: 130, y: 100 }, { x: 120, y: 130 }], true)
assert.equal(closed.polygons.at(-1).template, undefined, 'No automatic classification')
assert.deepEqual(normalize(closed), closed)
for (const template of [null, {}, { kind: 'square' }, { kind: 'regular_polygon', n: 4 }, { kind: 'triangle', preview: true }, { kind: 'right_triangle', n: 3 }]) {
  const bad = structuredClone(document); bad.polygons[0].template = template; assert.equal(normalize(bad), null)
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} ≈ ${b}`)
for (const tool of ['rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid']) {
  for (const [a, b] of [[{ x: 10, y: 20 }, { x: 50, y: 35 }], [{ x: -40, y: -30 }, { x: -65, y: 45 }]]) {
    const vertices = templateVertices(tool, a, b)
    assert.equal(vertices.length, 4)
    const edges = vertices.map((v, i) => vector(v, vertices[(i + 1) % 4]))
    assert.ok(Math.abs(cross(edges[0], edges[1])) > 1)
    near(cross(edges[0], edges[2]), 0)
    if (tool !== 'trapezoid') {
      near(cross(edges[1], edges[3]), 0)
      near(dot(edges[0], edges[0]), dot(edges[2], edges[2])); near(dot(edges[1], edges[1]), dot(edges[3], edges[3]))
    } else {
      assert.ok(Math.abs(cross(edges[1], edges[3])) > 1, 'Exactly one intended parallel pair')
      assert.ok(Math.abs(dot(edges[1], edges[1]) - dot(edges[3], edges[3])) > 1, 'General non-isosceles trapezoid')
    }
    if (['rectangle', 'square'].includes(tool)) edges.forEach((e, i) => near(dot(e, edges[(i + 1) % 4]), 0))
    if (['square', 'rhombus'].includes(tool)) edges.forEach(e => near(dot(e, e), dot(edges[0], edges[0])))
    if (['parallelogram', 'rhombus'].includes(tool)) assert.ok(Math.abs(dot(edges[0], edges[1])) > 1, 'Not accidentally rectangular')
    const next = commitGeometryTemplate(document, tool, a, b)
    const polygon = next.polygons.at(-1)
    assert.equal(next.polygons.length, document.polygons.length + 1)
    assert.equal(new Set(polygon.point_ids).size, 4); assert.deepEqual(polygon.template, { kind: tool })
    assert.deepEqual(polygon.point_ids.map(id => next.points.find(p => p.id === id)).map(({ x, y }) => ({ x, y })), vertices)
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(next))), next)
    assert.deepEqual(deleteGeometrySelection(next, { kind: 'polygon', id: polygon.id }).polygons, document.polygons)
    const edited = moveGeometryPoint(next, polygon.point_ids[0], a.x + 3, a.y + 7)
    assert.deepEqual(edited.polygons, next.polygons)
    assert.deepEqual(edited.points.filter(p => p.id !== polygon.point_ids[0]), next.points.filter(p => p.id !== polygon.point_ids[0]), 'No hidden constraint propagation')
    const metrics = geometryFrameMetrics(next), snapshot = JSON.stringify(next)
    for (const p of vertices) {
      const x = (p.x - metrics.originX) * GEOMETRY_FRAME_SCALE, y = (p.y - metrics.originY) * GEOMETRY_FRAME_SCALE
      assert.ok(x >= 16 && y >= 16 && x <= metrics.minimum.width - 16 && y <= metrics.minimum.height - 16)
    }
    for (const handle of FRAME_HANDLES) {
      const placement = resizeVisualPlacement(defaultGeometryPlacement(next), handle, -1000, -1000, metrics.minimum)
      assert.ok(placement.size.width >= metrics.minimum.width && placement.size.height >= metrics.minimum.height)
      assert.equal(JSON.stringify(next), snapshot)
    }
  }
  for (const length of [0, min / 2]) assert.equal(commitGeometryTemplate(base, tool, { x: 0, y: 0 }, { x: length, y: 0 }), base)
}
for (const n of [limits.minSides, 5, 6, 7, limits.maxSides]) {
  const center = { x: -20, y: 30 }, pointer = { x: 10, y: 70 }, radius = 50
  const vertices = templateVertices('regular_polygon', center, pointer, n)
  assert.deepEqual(vertices, regularPolygon(center, radius, n, Math.atan2(40, 30)))
  assert.deepEqual(vertices, templateVertices('regular_polygon', center, pointer, n))
  assert.equal(vertices.length, n); assert.equal(new Set(vertices.map(p => JSON.stringify(p))).size, n)
  near(vertices[0].x, pointer.x); near(vertices[0].y, pointer.y)
  vertices.forEach((p, i) => {
    const q = vertices[(i + 1) % n], a = vector(center, p), b = vector(center, q)
    near(Math.hypot(a.x, a.y), radius)
    near(Math.hypot(q.x - p.x, q.y - p.y), 2 * radius * Math.sin(Math.PI / n))
    near(Math.atan2(cross(a, b), dot(a, b)), 2 * Math.PI / n)
  })
  const next = commitGeometryTemplate(document, 'regular_polygon', center, pointer, n), polygon = next.polygons.at(-1)
  assert.deepEqual(polygon.template, { kind: 'regular_polygon', n }); assert.equal(polygon.point_ids.length, n)
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(next))), next)
  assert.deepEqual(deleteGeometrySelection(next, { kind: 'polygon', id: polygon.id }).polygons, document.polygons)
  const edited = moveGeometryPoint(next, polygon.point_ids[0], 111, 222)
  assert.deepEqual(edited.polygons, next.polygons); assert.ok(normalize(edited))
  assert.deepEqual(edited.points.filter(p => p.id !== polygon.point_ids[0]), next.points.filter(p => p.id !== polygon.point_ids[0]))
  const metrics = geometryFrameMetrics(next), snapshot = JSON.stringify(next)
  vertices.forEach(p => {
    const x = (p.x - metrics.originX) * GEOMETRY_FRAME_SCALE, y = (p.y - metrics.originY) * GEOMETRY_FRAME_SCALE
    assert.ok(x >= 16 && y >= 16 && x <= metrics.minimum.width - 16 && y <= metrics.minimum.height - 16)
  })
  for (const handle of FRAME_HANDLES) resizeVisualPlacement(defaultGeometryPlacement(next), handle, -1000, -1000, metrics.minimum)
  assert.equal(JSON.stringify(next), snapshot)
}
for (const [tool, n] of [['regular_pentagon', 5], ['regular_hexagon', 6]]) {
  assert.deepEqual(templateVertices(tool, { x: 0, y: 0 }, { x: 0, y: 20 }), templateVertices('regular_polygon', { x: 0, y: 0 }, { x: 0, y: 20 }, n))
  assert.deepEqual(commitGeometryTemplate(base, tool, { x: 0, y: 0 }, { x: 0, y: 20 }).polygons[0].template, { kind: 'regular_polygon', n })
}
for (const n of [undefined, null, true, '5', 2, 4.5, NaN, Infinity, limits.maxSides + 1]) {
  assert.equal(commitGeometryTemplate(base, 'regular_polygon', { x: 0, y: 0 }, { x: 20, y: 0 }, n), base)
  const bad = structuredClone(document); bad.polygons[0].template = { kind: 'regular_polygon', n }; assert.equal(normalize(bad), null)
}
for (const text of ['', 'NaN', 'Infinity', '4.5', 'abc', '2', String(limits.maxSides + 1), '5e0']) assert.equal(parseRegularSides(text), null)
assert.equal(parseRegularSides('3'), 3)
for (const radius of [0, min / 2]) assert.equal(commitGeometryTemplate(base, 'regular_polygon', { x: 0, y: 0 }, { x: radius, y: 0 }, 7), base)
console.log('PASS: seven existing templates and regular polygons through maximum n, shared generator, radius/orientation, equal sides/angles, strict metadata and input, degeneracy, atomic creation, delete, free editing, frame bounds/invariants and legacy/G2-C compatibility')
