import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { geometryFrameMetrics, defaultGeometryPlacement, containGeometry } = await loadGeometryModule('geometryFrameModel')
const { resizeVisualPlacement, FRAME_HANDLES, FRAME_MINIMUM } = await loadGeometryModule('visualPlacement')
const geometry = { schema_version: 1, viewport: { min_x: 0, min_y: 0, width: 100, height: 100 }, description: 'Triangle',
  points: [{ id: 'a', x: -12, y: 20, label: 'Long point label' }, { id: 'b', x: 120, y: 80, label: null }, { id: 'c', x: 50, y: -10, label: 'C' }],
  segments: [{ id: 's', start_point_id: 'a', end_point_id: 'b' }], polygons: [{ id: 'p', point_ids: ['a', 'b', 'c'] }],
  texts: [{ id: 't', x: 150, y: 100, content: 'Wide annotation 漢字 😀' }] }
const before = JSON.stringify(geometry), original = defaultGeometryPlacement(geometry)
const metrics = geometryFrameMetrics(geometry)
assert.ok(metrics.originX < -12 && metrics.originY < -10, 'Negative coordinates and labels fit')
assert.ok(metrics.minimum.width > 600 && metrics.minimum.height > 400, 'Text bounds participate')
for (const handle of FRAME_HANDLES) {
  const resized = resizeVisualPlacement(original, handle, handle.includes('w') ? 10000 : -10000, handle.includes('n') ? 10000 : -10000, metrics.minimum)
  assert.ok(resized.size.width >= metrics.minimum.width && resized.size.height >= metrics.minimum.height)
  assert.equal(JSON.stringify(geometry), before)
  assert.deepEqual(geometryFrameMetrics(geometry), metrics, 'Presentation origin independent of dimensions')
}
assert.deepEqual(containGeometry(original, geometry), original)
const empty = { ...geometry, points: [], segments: [], polygons: [], texts: [] }
assert.deepEqual(geometryFrameMetrics(empty).minimum, FRAME_MINIMUM)
const emptyPlacement = defaultGeometryPlacement(empty)
assert.deepEqual(resizeVisualPlacement(emptyPlacement, 'se', -10000, -10000, FRAME_MINIMUM).size,
  { ...FRAME_MINIMUM, unit: 'px' })
assert.equal(original.position.x, 0)
assert.equal(JSON.stringify(geometry), before)
console.log('PASS: Geometry frame bounds, all eight resize directions, negative coordinates, labels/text, centralized empty minimum, immutable semantic data')
