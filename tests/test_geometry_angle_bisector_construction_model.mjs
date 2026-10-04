import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'

const {
  commitAngleBisector,
  findAngleBisector,
  angleBisectorSupportCoordinates,
} = await loadGeometryModule('geometryConstructionModel')
const {
  moveGeometryPoint,
  deleteGeometrySelection,
} = await loadGeometryModule('geometryAuthoringModel')
const {
  emptyGeometryV1,
  normalizeGeometrySourceDataV1: normalize,
} = await loadGeometryModule('geometryV1')

const base = {
  ...emptyGeometryV1(),
  description: 'Angle bisector',
  points: [
    {id:'a',x:10,y:0,label:null},
    {id:'b',x:0,y:0,label:null},
    {id:'c',x:0,y:10,label:null},
  ],
}

let g = commitAngleBisector(base, 'a', 'b', 'c')
assert.notEqual(g, base)
assert.ok(normalize(g))
assert.equal(g.constructions.length, 1)

const recipe = findAngleBisector(g, 'a', 'b', 'c')
assert.ok(recipe)
assert.equal(recipe.kind, 'angle_bisector')
assert.deepEqual(recipe.source_point_ids, ['a', 'b', 'c'])

const support = g.points.find(p => p.id === recipe.support_point_id)
assert.ok(support)

const expected = angleBisectorSupportCoordinates(
  g.points.find(p => p.id === 'a'),
  g.points.find(p => p.id === 'b'),
  g.points.find(p => p.id === 'c'),
)
assert.ok(expected)
assert.ok(Math.abs(support.x - expected.x) < 1e-9)
assert.ok(Math.abs(support.y - expected.y) < 1e-9)

assert.equal(
  commitAngleBisector(g, 'c', 'b', 'a'),
  g,
  'Reversed angle arms must resolve to the same bisector',
)

const moved = moveGeometryPoint(g, 'a', 20, 5)
assert.notEqual(moved, g)
assert.ok(normalize(moved))

const movedRecipe = findAngleBisector(moved, 'a', 'b', 'c')
const movedSupport = moved.points.find(
  p => p.id === movedRecipe.support_point_id,
)
assert.notDeepEqual(
  [movedSupport.x, movedSupport.y],
  [support.x, support.y],
)

assert.equal(
  moveGeometryPoint(g, recipe.support_point_id, 99, 99),
  g,
  'Derived support point must remain locked',
)

const degenerate = moveGeometryPoint(g, 'a', 0, -10)
assert.equal(
  degenerate,
  g,
  'Degenerate straight-angle edit must be rejected atomically',
)

const deleted = deleteGeometrySelection(
  g,
  {kind:'line',id:recipe.output_line_id},
)
assert.equal(deleted.constructions.length, 0)
assert.ok(!deleted.points.some(p => p.id === recipe.support_point_id))
assert.ok(normalize(deleted))

const sourceDeleted = deleteGeometrySelection(
  g,
  {kind:'point',id:'a'},
)
assert.equal(sourceDeleted.constructions.length, 0)
assert.ok(!sourceDeleted.points.some(p => p.id === recipe.support_point_id))
assert.ok(normalize(sourceDeleted))

for (const patch of [
  {source_point_ids:['missing','b','c']},
  {source_point_ids:['a','a','c']},
  {output_line_id:'missing'},
  {support_point_id:'missing'},
  {extra:1},
]) {
  const bad = structuredClone(g)
  Object.assign(bad.constructions[0], patch)
  assert.equal(normalize(bad), null)
}

const wrongSupport = structuredClone(g)
wrongSupport.points.find(
  p => p.id === recipe.support_point_id,
).x += 1
assert.equal(normalize(wrongSupport), null)

console.log(
  'PASS: angle bisector creation, symmetric identity, deterministic coordinates, source recompute, locked derived point, atomic degenerate edit, transitive deletion and strict normalization'
)
