import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const model = await loadGeometryModule('geometryLineModel')
const { normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const { deleteGeometrySelection, moveGeometryPoint } = await loadGeometryModule('geometryAuthoringModel')
const legacy = { schema_version: 1, description: 'Line acceptance', viewport: { min_x: 0, min_y: 0, width: 100, height: 100 }, points: [], segments: [], polygons: [], texts: [] }
const vertices = [{ x: 10, y: 10 }, { x: 30, y: 20 }, { x: 20, y: 40 }, { x: 50, y: 60 }]
let g = legacy
for (const tool of ['line', 'directed_line', 'vector', 'polyline']) g = model.commitGeometryLine(g, tool, tool === 'polyline' ? vertices : vertices.slice(0, 2))
g = model.commitGeometryLine(g, 'polyline', vertices.slice(0, 3), true)
assert.equal(g.points.length, 4, 'Existing coincident locations reused')
assert.deepEqual(g.lines.map(l => l.kind), ['line', 'directed_line', 'vector'])
assert.deepEqual(g.polylines[0].point_ids, g.points.map(p => p.id))
assert.deepEqual(g.polygons[0].point_ids, g.points.slice(0, 3).map(p => p.id))
assert.deepEqual(normalize(JSON.parse(JSON.stringify(g))), g)
assert.deepEqual(normalize(legacy), legacy)
assert.equal(legacy.points.length, 0, 'No draft writes')
assert.equal(model.commitGeometryLine(g, 'vector', [vertices[0], vertices[0]]), g)
assert.equal(model.canClosePolyline(vertices.slice(0, 3), { x: 12, y: 10 }), true)
assert.equal(model.canClosePolyline(vertices.slice(0, 2), vertices[0]), false)
assert.equal(model.canClosePolyline(vertices, { x: 14, y: 10 }), false)
for (const line of g.lines) {
  const deleted = deleteGeometrySelection(g, { kind: 'line', id: line.id })
  assert.equal(deleted.lines.length, 2); assert.deepEqual(deleted.polylines, g.polylines); assert.deepEqual(deleted.points, g.points)
}
assert.equal(deleteGeometrySelection(g, { kind: 'polyline', id: g.polylines[0].id }).polylines.length, 0)
assert.equal(deleteGeometrySelection(g, { kind: 'point', id: g.points[0].id }).lines.length, 0)
assert.equal(moveGeometryPoint(g, g.points[0].id, 30, 20), g, 'Point editing cannot create degenerate new line objects')
const movedPoint = moveGeometryPoint(g, g.points[0].id, 5, 5)
assert.deepEqual(movedPoint.lines, g.lines, 'Defining references survive point movement')
for (const mutate of [x => x.lines[0].kind = 'ray', x => x.lines[0].preview = true, x => x.lines[0].end_point_id = 'missing', x => x.polylines[0].closed = true, x => x.polylines[0].point_ids.push(x.polylines[0].point_ids[0]), x => x.lines[0].id = x.points[0].id]) {
  const bad = structuredClone(g); mutate(bad); assert.equal(normalize(bad), null)
}
assert.deepEqual(model.clipInfiniteLine({ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 0, y: 0, width: 100, height: 100 }), [{ x: 0, y: 20 }, { x: 100, y: 20 }])
assert.deepEqual(model.clipInfiniteLine({ x: 30, y: 20 }, { x: 10, y: 20 }, { x: 0, y: 0, width: 100, height: 100 }), [{ x: 100, y: 20 }, { x: 0, y: 20 }])
assert.deepEqual(model.clipInfiniteLine({ x: 20, y: 10 }, { x: 20, y: 30 }, { x: 0, y: 0, width: 100, height: 100 }), [{ x: 20, y: 0 }, { x: 20, y: 100 }])
assert.equal(model.clipInfiniteLine({ x: -20, y: 10 }, { x: -20, y: 30 }, { x: 0, y: 0, width: 100, height: 100 }), null)
const { geometryFrameMetrics, defaultGeometryPlacement } = await loadGeometryModule('geometryFrameModel')
const { resizeVisualPlacement, FRAME_HANDLES } = await loadGeometryModule('visualPlacement')
const metrics = geometryFrameMetrics(g), placement = defaultGeometryPlacement(g), snapshot = JSON.stringify(g)
assert.deepEqual(metrics, geometryFrameMetrics({ ...g, lines: [], polylines: [] }), 'Referenced finite points bound all primitives; infinite clipping introduces no minimum feedback')
assert.ok(Number.isFinite(metrics.minimum.width) && metrics.minimum.width < 1000)
for (const handle of FRAME_HANDLES) {
  const resized = resizeVisualPlacement(placement, handle, 100, 100, metrics.minimum)
  assert.ok(resized.size.width >= metrics.minimum.width && resized.size.height >= metrics.minimum.height)
  assert.equal(JSON.stringify(g), snapshot)
}
console.log('PASS: additive line-family model, strict normalization, legacy, references, direction, open completion, polygon conversion, tolerance, delete and clipping')
