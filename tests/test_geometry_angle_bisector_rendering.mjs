import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
import {loadGeometryModule} from './geometry_test_modules.mjs'

const require = createRequire(new URL('../frontend/package.json', import.meta.url))
const {createElement} = require('react')
const {renderToStaticMarkup} = require('react-dom/server')
const dependencies = Object.fromEntries(await Promise.all(
  ['geometryFrameModel', 'geometryLineModel', 'geometryArcModel', 'geometryConstructionModel'].map(async name => [
    `./${name}`, await loadGeometryModule(name),
  ]),
))
const file = new URL('../frontend/src/components/GeometryRenderer.tsx', import.meta.url)
const code = ts.transpileModule(await fs.readFile(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
}).outputText

function renderer(source) {
  const exports = {}
  vm.runInNewContext(source, {exports, require: name =>
    name.endsWith('.css') ? {} : dependencies[name] ?? require(name), Set})
  return exports.default
}
const GeometryRenderer = renderer(code)
const {emptyGeometryV1} = await loadGeometryModule('geometryV1')
const {commitAngleBisector, commitMidpoint} = await loadGeometryModule('geometryConstructionModel')
const geometry = commitAngleBisector({
  ...emptyGeometryV1(),
  points: [['a', 15, 20], ['v', 45, 45], ['c', 75, 20]].map(([id, x, y]) => ({id, x, y, label: null})),
  polygons: [{id: 'triangle', point_ids: ['a', 'v', 'c']}],
  lines: [{id: 'ordinary', kind: 'line', start_point_id: 'a', end_point_id: 'c'}],
}, 'a', 'v', 'c')
const original = structuredClone(geometry)

for (const frameSize of [undefined, {width: 480, height: 360}]) {
  const props = {geometry, blockId: 'test', frameSize}
  const svg = renderToStaticMarkup(createElement(GeometryRenderer, props))
  const groups = [...svg.matchAll(/<g class="([^"]+)"[^>]*>(.*?)<\/g>/g)]
  const polygon = groups.findIndex(g => g[1] === 'geometry-polygons')
  const bisector = groups.findIndex(g => g[1] === 'geometry-angle-bisectors')
  assert.ok(bisector > polygon, 'Bisector must paint above polygon fill')
  assert.equal((groups[bisector][2].match(/<line /g) ?? []).length, 1)
  const ordinary = groups.findIndex(g => g[1] === 'geometry-lines')
  assert.ok(ordinary < polygon, 'Ordinary lines retain their existing paint order')
  assert.equal((groups[ordinary][2].match(/<line /g) ?? []).length, 1)
  assert.equal((svg.match(/<line /g) ?? []).length, 2, 'Each line renders exactly once')

  const pointOutput = svg.split('<g class="geometry-points">')[1].split('<g class="geometry-annotations">')[0]
  const visiblePoints = [...pointOutput.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)]
    .map(m => [Number(m[1]), Number(m[2])])
  const support = geometry.points.find(p => p.id === geometry.constructions[0].support_point_id)
  assert.ok(support, 'Support point remains stored for the line definition')
  assert.ok(!visiblePoints.some(([x, y]) => x === support.x && y === support.y),
    'Angle-bisector support point must be absent from SVG point output')
  const intersectionId = geometry.constructions[0].intersection_point_id
  assert.ok(intersectionId)
  assert.deepEqual(visiblePoints, ['a', 'v', 'c', intersectionId].map(id => {
    const p = geometry.points.find(p => p.id === id)
    return [p.x, p.y]
  }), 'All three source points and persisted intersection remain visible')

  const withMidpoint = commitMidpoint(geometry, 'a', 'v')
  const midpointOriginal = structuredClone(withMidpoint)
  const midpoint = withMidpoint.points.find(p => p.id === withMidpoint.constructions.at(-1).output_point_id)
  const midpointSvg = renderToStaticMarkup(createElement(GeometryRenderer, {...props, geometry: withMidpoint}))
  assert.ok(midpointSvg.includes(`<circle cx="${midpoint.x}" cy="${midpoint.y}"`),
    'Points derived by midpoint constructions retain their visible output')
  assert.deepEqual(withMidpoint, midpointOriginal, 'Rendering other derived points does not mutate source_data')

  const metrics = dependencies['./geometryFrameModel'].geometryFrameMetrics(geometry)
  const boundary = frameSize
    ? {x: metrics.originX + 4, y: metrics.originY + 4, width: frameSize.width / 4 - 8, height: frameSize.height / 4 - 8}
    : {x: geometry.viewport.min_x, y: geometry.viewport.min_y, width: geometry.viewport.width, height: geometry.viewport.height}
  const line = geometry.lines.find(l => l.id === geometry.constructions[0].output_line_id)
  const [a, b] = dependencies['./geometryLineModel'].clipInfiniteLine(
    geometry.points.find(p => p.id === line.start_point_id),
    geometry.points.find(p => p.id === line.end_point_id), boundary,
  )
  assert.ok(groups[bisector][2].includes('x1="45" y1="45" x2="45" y2="20"'),
    'Triangle bisector starts at V and ends on AC')
  assert.ok(!groups[bisector][2].includes(`x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"`),
    'Triangle bisector no longer extends to the viewport/frame boundary')
  const ordinaryLine = geometry.lines.find(l => l.id === 'ordinary')
  const ordinaryEnds = dependencies['./geometryLineModel'].clipInfiniteLine(
    geometry.points.find(p => p.id === ordinaryLine.start_point_id),
    geometry.points.find(p => p.id === ordinaryLine.end_point_id), boundary,
  )
  assert.ok(groups[ordinary][2].includes(`x1="${ordinaryEnds[0].x}" y1="${ordinaryEnds[0].y}" x2="${ordinaryEnds[1].x}" y2="${ordinaryEnds[1].y}"`),
    'Ordinary lines retain viewport/frame clipping')

  for (const polygons of [[], [{id: 'quad', point_ids: ['a', 'v', 'c', support.id]}],
    [{id: 'other-triangle', point_ids: ['a', 'v', support.id]}]]) {
    const general = commitAngleBisector({...geometry, points: geometry.points.filter(p=>p.id!==support.id && p.id!==intersectionId), lines: [ordinaryLine], constructions: [], polygons}, 'a','v','c')
    const before = structuredClone(general)
    const fallback = renderToStaticMarkup(createElement(GeometryRenderer, {...props, geometry: general}))
      .split('<g class="geometry-angle-bisectors"')[1].split('</g>')[0]
    assert.ok(fallback.includes(`x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"`),
      'Without a matching triangle, bisector retains infinite-line clipping')
    assert.deepEqual(general, before)
  }

  // An asymmetric triangle after a source edit exercises recomputed direction and
  // an independent endpoint expectation from the angle-bisector theorem.
  const {moveGeometryPoint} = await loadGeometryModule('geometryAuthoringModel')
  const moved = moveGeometryPoint(structuredClone(geometry), 'a', 10, 12)
  moved.polygons[0].point_ids = ['c', 'a', 'v']
  const movedOriginal = structuredClone(moved)
  const movedSvg = renderToStaticMarkup(createElement(GeometryRenderer, {...props, geometry: moved}))
  const segment = movedSvg.split('<g class="geometry-angle-bisectors"')[1].split('</g>')[0]
  const coordinates = Object.fromEntries([...segment.matchAll(/(x1|y1|x2|y2)="([^"]+)"/g)].map(m => [m[1], Number(m[2])]))
  const av = Math.hypot(10 - 45, 12 - 45), cv = Math.hypot(75 - 45, 20 - 45)
  const ratio = av / (av + cv)
  assert.equal(coordinates.x1, 45)
  assert.equal(coordinates.y1, 45)
  assert.ok(Math.abs(coordinates.x2 - (10 + ratio * 65)) < 1e-9)
  assert.ok(Math.abs(coordinates.y2 - (12 + ratio * 8)) < 1e-9)
  assert.deepEqual(moved, movedOriginal, 'Source edits update display without rendering mutations')

  const legacy = structuredClone(geometry)
  delete legacy.constructions[0].intersection_point_id
  legacy.points = legacy.points.filter(p=>p.id!==intersectionId)
  const legacySvg = renderToStaticMarkup(createElement(GeometryRenderer,{...props,geometry:legacy}))
  assert.ok(legacySvg.includes('x1="45" y1="45" x2="45" y2="20"'),'Legacy triangle retains its render-only extent')

  // A direct renderer fixture proves it reads D, rather than recomputing it.
  // Strict normalization rejects such stale coordinates before real rendering.
  const supplied = structuredClone(geometry)
  supplied.points.find(p=>p.id===intersectionId).x = 46
  const suppliedOriginal = structuredClone(supplied)
  const suppliedSvg = renderToStaticMarkup(createElement(GeometryRenderer,{...props,geometry:supplied}))
  assert.ok(suppliedSvg.includes('x1="45" y1="45" x2="46" y2="20"'))
  assert.deepEqual(supplied,suppliedOriginal)
}
assert.deepEqual(geometry, original, 'Rendering must not mutate source_data')
console.log('PASS: framed/unframed triangle extent, moved vertices, general fallback, hidden support, source/midpoint visibility, polygon paint order, ordinary clipping and unchanged source_data')
