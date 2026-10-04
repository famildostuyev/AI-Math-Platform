import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'

const {
  commitAngleBisector,
  findAngleBisector,
  angleBisectorSupportCoordinates,
  commitMidpoint,
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

const triangle = commitAngleBisector({...base, polygons: [{id:'triangle', point_ids:['c','a','b']}]}, 'a', 'b', 'c')
const triangleRecipe = triangle.constructions[0]
const dId = triangleRecipe.intersection_point_id
assert.ok(dId)
assert.notEqual(dId, triangleRecipe.support_point_id)
const d = triangle.points.find(p => p.id === dId)
assert.equal(d.label, null)
assert.ok(Math.abs(d.x - 5) < 1e-9 && Math.abs(d.y - 5) < 1e-9)
assert.ok(normalize(triangle))
assert.equal(moveGeometryPoint(triangle, dId, 99, 99), triangle)
assert.equal(commitAngleBisector(triangle, 'c', 'b', 'a'), triangle)
for (const [id,x,y] of [['a',20,5], ['b',-5,-3], ['c',3,20]]) {
  const edited = moveGeometryPoint(triangle,id,x,y)
  assert.notEqual(edited,triangle)
  assert.ok(normalize(edited))
  const [a,v,c] = ['a','b','c'].map(id => edited.points.find(p=>p.id===id))
  const result = edited.points.find(p=>p.id===dId)
  const ratio = Math.hypot(a.x-v.x,a.y-v.y) / (Math.hypot(a.x-v.x,a.y-v.y)+Math.hypot(c.x-v.x,c.y-v.y))
  assert.ok(Math.abs(result.x-(a.x+ratio*(c.x-a.x)))<1e-9)
  assert.ok(Math.abs(result.y-(a.y+ratio*(c.y-a.y)))<1e-9)
}
assert.equal(moveGeometryPoint(triangle,'a',0,-10),triangle)
const chain = commitMidpoint(triangle,dId,'a')
for (const selection of [{kind:'line',id:triangleRecipe.output_line_id},{kind:'point',id:'a'},{kind:'point',id:dId}]) {
  const deleted = deleteGeometrySelection(chain,selection)
  assert.equal(deleted.constructions.length,0)
  for (const id of [dId,triangleRecipe.support_point_id,chain.constructions[1].output_point_id])
    assert.ok(!deleted.points.some(p=>p.id===id))
  assert.ok(deleted.points.some(p=>p.id==='c'))
  assert.ok(normalize(deleted))
}
for (const id of ['missing','a',triangleRecipe.support_point_id,null,'']) {
  const bad = structuredClone(triangle)
  bad.constructions[0].intersection_point_id=id
  assert.equal(normalize(bad),null)
}
const stale = structuredClone(triangle)
stale.points.find(p=>p.id===dId).x+=1
assert.equal(normalize(stale),null)
const duplicate = structuredClone(triangle)
duplicate.constructions.push({...duplicate.constructions[0],id:'duplicate',source_point_ids:['c','b','a']})
assert.equal(normalize(duplicate),null)
const legacy = structuredClone(triangle)
delete legacy.constructions[0].intersection_point_id
legacy.points=legacy.points.filter(p=>p.id!==dId)
assert.deepEqual(normalize(legacy),legacy,'Legacy triangle recipes remain valid without automatic migration')
assert.ok(!g.constructions[0].intersection_point_id,'General bisectors retain their original contract')

console.log(
  'PASS: angle bisector creation, symmetric identity, deterministic coordinates, source recompute, locked derived point, atomic degenerate edit, transitive deletion and strict normalization'
)
