import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { commitGeometryCircle: commit, circleRadius, circleBounds, MIN_CIRCLE_RADIUS: min } = await loadGeometryModule('geometryCircleModel')
const { emptyGeometryV1, normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const { moveGeometryPoint, deleteGeometrySelection, addGeometryPoint } = await loadGeometryModule('geometryAuthoringModel')
const { geometryFrameMetrics, defaultGeometryPlacement, GEOMETRY_FRAME_SCALE } = await loadGeometryModule('geometryFrameModel')
const { resizeVisualPlacement, FRAME_HANDLES } = await loadGeometryModule('visualPlacement')
const base={...emptyGeometryV1(),description:'Circular acceptance'},center={x:20,y:30},pointer={x:50,y:70}
assert.deepEqual(normalize(base),base); assert.ok(!Object.hasOwn(normalize(base),'circles'))
assert.equal(circleRadius(center,pointer),50)
assert.deepEqual(circleBounds(center,50),{left:-30,right:70,top:-20,bottom:80})
for(const kind of ['circle','disk']) {
  const next=commit(base,kind,center,pointer)
  assert.equal(next.points.length,1); assert.equal(next.circles.length,1); assert.equal(next.polygons.length,0)
  assert.deepEqual(next.points[0],{id:'point-1',...center,label:null})
  assert.deepEqual(next.circles[0],{id:`${kind}-1`,kind,center_point_id:'point-1',radius:50})
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(next))),next)
  const metrics=geometryFrameMetrics(next),bounds=circleBounds(center,50),snapshot=JSON.stringify(next)
  assert.ok((bounds.left-metrics.originX)*GEOMETRY_FRAME_SCALE>=16)
  assert.ok((bounds.top-metrics.originY)*GEOMETRY_FRAME_SCALE>=16)
  assert.ok((bounds.right-metrics.originX)*GEOMETRY_FRAME_SCALE<=metrics.minimum.width-16)
  assert.ok((bounds.bottom-metrics.originY)*GEOMETRY_FRAME_SCALE<=metrics.minimum.height-16)
  for(const handle of FRAME_HANDLES) {
    const p=resizeVisualPlacement(defaultGeometryPlacement(next),handle,-1000,-1000,metrics.minimum)
    assert.ok(p.size.width>=metrics.minimum.width && p.size.height>=metrics.minimum.height)
  }
  assert.equal(JSON.stringify(next),snapshot)
  const moved=moveGeometryPoint(next,'point-1',-40,60); assert.deepEqual(moved.circles,next.circles)
  const shared=commit(next,kind,center,{x:60,y:30}); assert.equal(shared.points.length,1)
  const deleted=deleteGeometrySelection(shared,{kind:'circle',id:next.circles[0].id})
  assert.deepEqual(deleted.points,next.points); assert.deepEqual(deleted.circles,shared.circles.slice(1))
  assert.equal(deleteGeometrySelection(shared,{kind:'point',id:'point-1'}).circles.length,0)
  for(const patch of [{kind:'ellipse'},{center_point_id:'missing'},{radius:0},{radius:-1},{radius:min},{radius:NaN},{radius:Infinity},{radius:'5'},{radius:true},{id:'0bad'},{id:'point-1'},{extra:1}]) {
    const bad=structuredClone(next);Object.assign(bad.circles[0],patch);assert.equal(normalize(bad),null)
  }
  const missing=structuredClone(next);delete missing.circles[0].center_point_id;assert.equal(normalize(missing),null)
  const duplicate=structuredClone(next);duplicate.circles.push({...duplicate.circles[0]});assert.equal(normalize(duplicate),null)
  for(const radius of [0,-1,min/2,min]) assert.equal(commit(base,kind,center,{x:center.x+radius,y:center.y}),base)
}
// IDs remain global even when loaded objects use another collection's prefix.
const conflict=commit(base,'circle',center,pointer);conflict.circles[0].id='point-2'
assert.equal(addGeometryPoint(conflict,0,0).points.at(-1).id,'point-3')
assert.equal(commit(base,'ellipse',center,pointer),base)
assert.equal(commit(base,'circle',center,{x:Infinity,y:0}),base)
console.log('PASS: exact circle/disk semantics, local radius, atomic creation, shared centers, center movement, safe deletion, strict validation, global IDs and legacy omission')
