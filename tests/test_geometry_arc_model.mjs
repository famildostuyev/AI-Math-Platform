import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { commitGeometryArc: commit, arcFromPointers, arcPoint, arcBounds, arcPath, TAU, MIN_ARC_SWEEP } = await loadGeometryModule('geometryArcModel')
const { MIN_CIRCLE_RADIUS, commitGeometryCircle } = await loadGeometryModule('geometryCircleModel')
const { emptyGeometryV1, normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const { deleteGeometrySelection, moveGeometryPoint } = await loadGeometryModule('geometryAuthoringModel')
const { geometryFrameMetrics, GEOMETRY_FRAME_SCALE, defaultGeometryPlacement } = await loadGeometryModule('geometryFrameModel')
const { FRAME_HANDLES, resizeVisualPlacement } = await loadGeometryModule('visualPlacement')
const base={...emptyGeometryV1(),description:'Arc acceptance'},center={x:30,y:40},radius=20
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
assert.deepEqual(normalize(base),base);assert.ok(!Object.hasOwn(normalize(base),'arcs'))
for(const kind of ['arc','sector']) for(const [start,sweep] of [[0,Math.PI/2],[11*Math.PI/6,Math.PI/3],[Math.PI/4,3*Math.PI/2]]) {
  const a=arcPoint(center,radius,start),b=arcPoint(center,radius,start+sweep)
  const d=arcFromPointers(center,a,b);near(d.radius,radius);near(d.start_angle,start);near(d.sweep_angle,sweep)
  const next=commit(base,kind,center,a,b),object=next.arcs[0]
  assert.equal(next.points.length,1);assert.equal(next.arcs.length,1);assert.equal(next.polygons.length,0)
  assert.equal(next.points[0].label,null);assert.equal(object.center_point_id,next.points[0].id)
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(next))),next)
  const bounds=arcBounds(center,object)
  for(let i=0;i<=100;i++){const p=arcPoint(center,radius,start+sweep*i/100);assert.ok(p.x>=bounds.left-1e-8&&p.x<=bounds.right+1e-8&&p.y>=bounds.top-1e-8&&p.y<=bounds.bottom+1e-8)}
  if(start===0){near(bounds.left,center.x);near(bounds.right,center.x+radius);near(bounds.top,center.y);near(bounds.bottom,center.y+radius)}
  if(start>5){near(bounds.right,center.x+radius);near(bounds.top,center.y-radius/2);near(bounds.bottom,center.y+radius/2);near(bounds.left,kind==='sector'?center.x:center.x+radius*Math.cos(Math.PI/6))}
  assert.ok(arcPath(center,object).includes(`0 ${sweep>Math.PI?1:0} 1`));assert.equal(arcPath(center,object).endsWith('Z'),kind==='sector')
  const moved=moveGeometryPoint(next,next.points[0].id,-20,80);assert.deepEqual(moved.arcs,next.arcs)
  const mixed=commitGeometryCircle(next,'circle',center,{x:60,y:40})
  assert.equal(mixed.points.length,1);const deleted=deleteGeometrySelection(mixed,{kind:'arc',id:object.id});assert.deepEqual(deleted.circles,mixed.circles);assert.deepEqual(deleted.points,mixed.points)
  const removedCenter=deleteGeometrySelection(mixed,{kind:'point',id:next.points[0].id});assert.equal(removedCenter.arcs.length,0);assert.equal(removedCenter.circles.length,0)
  const m=geometryFrameMetrics(next),snapshot=JSON.stringify(next)
  assert.ok((bounds.left-m.originX)*GEOMETRY_FRAME_SCALE>=16-1e-8 && (bounds.right-m.originX)*GEOMETRY_FRAME_SCALE<=m.minimum.width-16+1e-8)
  for(const handle of FRAME_HANDLES) resizeVisualPlacement(defaultGeometryPlacement(next),handle,-1000,-1000,m.minimum)
  assert.equal(JSON.stringify(next),snapshot)
  for(const patch of [{kind:'ellipse'},{center_point_id:'missing'},{id:'point-1'},{extra:true},{radius:MIN_CIRCLE_RADIUS},{radius:0},{radius:-1},{radius:Infinity},{start_angle:-1},{start_angle:TAU},{start_angle:NaN},{start_angle:'0'},{sweep_angle:0},{sweep_angle:MIN_ARC_SWEEP},{sweep_angle:TAU-MIN_ARC_SWEEP},{sweep_angle:TAU},{sweep_angle:Infinity}]) {
    const bad=structuredClone(next);Object.assign(bad.arcs[0],patch);assert.equal(normalize(bad),null)
  }
}
for(const kind of ['arc','sector']) {
  for(const r of [0,MIN_CIRCLE_RADIUS/2,MIN_CIRCLE_RADIUS]) assert.equal(commit(base,kind,center,arcPoint(center,r,0),arcPoint(center,20,1)),base)
  for(const sweep of [0,MIN_ARC_SWEEP/2,TAU-MIN_ARC_SWEEP/2]) assert.equal(commit(base,kind,center,arcPoint(center,20,0),arcPoint(center,20,sweep)),base)
}
console.log('PASS: common exact arc/sector math, wrap/major sweeps, strict schema, radius reuse, atomic creation, exact extrema, derived paths, center editing/dependencies, frame bounds/invariants and legacy omission')

// E3: all four dependents share a center alongside unrelated line/polygon content.
const { commitGeometryLine } = await loadGeometryModule('geometryLineModel')
let family=commitGeometryLine(base,'vector',[{x:100,y:100},{x:120,y:120}])
family=commitGeometryLine(family,'polyline',[{x:130,y:100},{x:150,y:100},{x:140,y:120}],true)
for(const kind of ['circle','disk'])family=commitGeometryCircle(family,kind,center,{x:50,y:40})
for(const kind of ['arc','sector'])family=commit(family,kind,center,arcPoint(center,20,11*Math.PI/6),arcPoint(center,20,Math.PI/6))
const snapshot=structuredClone(family),centerId=family.circles[0].center_point_id
assert.ok([...family.circles,...family.arcs].every(o=>o.center_point_id===centerId))
const translated=moveGeometryPoint(family,centerId,-30,80)
for(const key of ['circles','arcs','lines','polygons'])assert.deepEqual(translated[key],family[key])
for(const [key,kind] of [['circles','circle'],['arcs','arc']])for(const object of family[key]){
  const removed=deleteGeometrySelection(family,{kind,id:object.id})
  assert.deepEqual(removed.points,family.points)
  assert.deepEqual(removed[key],family[key].filter(o=>o.id!==object.id))
  for(const other of ['circles','arcs','lines','polygons'].filter(k=>k!==key))assert.deepEqual(removed[other],family[other])
}
const removed=deleteGeometrySelection(family,{kind:'point',id:centerId})
assert.deepEqual(removed.circles,[]);assert.deepEqual(removed.arcs,[])
for(const key of ['lines','polygons'])assert.deepEqual(removed[key],family[key])
assert.deepEqual(removed.points,family.points.filter(p=>p.id!==centerId))
assert.deepEqual(family,snapshot)
console.log('PASS: E3 shared-center family dependency deletion and movement preserve unrelated vector/polygon and immutable source')
