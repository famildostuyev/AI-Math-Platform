import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),a=await loadGeometryModule('geometry3dSolidAuthoring'),n=await loadGeometryModule('geometry3d'),api=await loadGeometryModule('geometry3dSurfacePoints')
const fixtures=[]
const close=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8,`${a} ~= ${b}`)
function verify(scene){
 assert.ok(scene)
 const evaluated=m.evaluateGeometryScene3D(scene);assert.equal(evaluated.status,'ok');assert.deepEqual(evaluated.scene,scene)
 for(const c of scene.constructions.filter(c=>c.kind==='point_on_surface')){
  const surface=scene.surfaces.find(s=>s.id===c.surface_id),solid=scene.solids.find(s=>s.id===surface.solid_id),{origin,x_axis:x,y_axis:y}=solid.frame
  const z=[x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],theta=2*Math.PI*c.uv[0],{radius:r,height:h}=solid.parameters
  close(scene.points.find(p=>p.id===c.output_point_id).position,origin.map((o,i)=>o+r*Math.cos(theta)*x[i]+r*Math.sin(theta)*y[i]+h*c.uv[1]*z[i]))
  assert.equal(scene.points.find(p=>p.id===c.output_point_id).label,`label ${c.output_point_id}`)
 }
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 fixtures.push(scene)
}
for(const plane of ['XY','XZ','YZ'])for(const rotated of [false,true]){
 let scene=a.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],plane,'C').scene
 if(rotated)scene=a.rotateSolid3D(scene,'C',[1,2,3],.7)
 const carrier=scene.surfaces[0].id,source=structuredClone(scene)
 let i=0
 for(const u of [0,1-1e-12,1])for(const v of [0,.5,1]){
  const id=`P${i++}`;scene=api.createPointOnCylinderSurface3D(scene,carrier,[u,v],id,`label ${id}`);assert.ok(scene)
  assert.deepEqual(scene.constructions.find(c=>c.output_point_id===id).uv,[u===1?0:u,v])
 }
 assert.deepEqual(source.points.length,2,'original scene untouched')
 // Descendant precedes its producers lexically: scheduling must use dependencies.
 scene=m.transactGeometryScene3D(scene,d=>{
  d.points.push({id:'middle',position:[0,0,0],label:'downstream'})
  d.constructions.push({id:'AAA',kind:'midpoint',a:'P0',b:'P1',output_point_id:'middle'})
 });assert.ok(scene)
 const ids=scene.points.map(p=>[p.id,p.label]),recipes=structuredClone(scene.constructions)
 verify(scene)
 for(const transform of [s=>a.translateSolid3D(s,'C',[2,-3,.5]),s=>a.rotateSolid3D(s,'C',[2,1,-1],.4),s=>a.resizeCylinder3D(s,'C','radius',2.3),s=>a.resizeCylinder3D(s,'C','height',4.7),s=>a.scaleSolid3D(s,'C',.6)]){
  const previous=scene;scene=transform(scene);verify(scene)
  assert.deepEqual(scene.points.map(p=>[p.id,p.label]),ids);assert.deepEqual(scene.constructions,recipes)
  close(scene.points.find(p=>p.id==='middle').position,scene.points.find(p=>p.id==='P0').position.map((v,i)=>(v+scene.points.find(p=>p.id==='P1').position[i])/2))
  const history=m.createGeometryHistory3D(previous,()=>{});assert.ok(history.commit(scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),previous);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),scene)
 }
 // Cached positions are never authoritative; reevaluation cannot accumulate drift.
 const stale=structuredClone(scene);for(const p of stale.points)if(p.id.startsWith('P'))p.position=[99,98,97]
 assert.deepEqual(m.evaluateGeometryScene3D(stale).scene,scene)
 const deleted=a.deleteSolid3D(stale,'C');assert.ok(deleted);assert.equal(deleted.losses.length,9)
 assert.deepEqual(deleted.scene.points,scene.points);assert.deepEqual(deleted.scene.constructions,scene.constructions.filter(c=>c.kind==='midpoint'));verify(deleted.scene)
 const history=m.createGeometryHistory3D(scene,()=>{});assert.ok(history.commit(deleted.scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),deleted.scene)
 for(const uv of [[0,-.1],[0,1.1],[NaN,0],[Infinity,0],[0,-Infinity],[true,0],[0],[0,0,0]])assert.equal(api.createPointOnCylinderSurface3D(scene,carrier,uv,'bad'),null)
 for(const target of ['missing','C','C_v_0'])assert.equal(api.createPointOnCylinderSurface3D(scene,target,[0,.5],'bad'),null)
 assert.equal(api.createPointOnCylinderSurface3D(scene,carrier,[0,.5],'P0'),null)
 const wrapped=api.createPointOnCylinderSurface3D(scene,carrier,[-.25,.5],'wrapped');assert.deepEqual(wrapped.constructions.find(c=>c.output_point_id==='wrapped').uv,[.75,.5])
 for(const uv of [[1,0],[-.1,0],[0,1.1],[NaN,0],[0,Infinity]]){
  const bad=structuredClone(scene);bad.constructions.find(c=>c.kind==='point_on_surface').uv=uv;assert.equal(n.normalizeGeometryScene3D(bad),null)
 }
 const bad=structuredClone(scene);bad.constructions.find(c=>c.kind==='point_on_surface').surface_id='missing';assert.equal(n.normalizeGeometryScene3D(bad),null)
 const cycle=structuredClone(scene);cycle.constructions.find(c=>c.id==='AAA').a='middle';assert.equal(m.evaluateGeometryScene3D(cycle).status,'invalid')
 const cone=structuredClone(scene);cone.solids[0].kind='cone';cone.surfaces[0].kind='cone';assert.equal(m.evaluateGeometryScene3D(cone).status,'ok');assert.equal(api.createPointOnCylinderSurface3D(cone,carrier,[0,0],'bad'),null)
}
// Stable custom carrier identity, a second cylinder and unrelated free geometry.
{
 let scene=a.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','C').scene
 const carrier=scene.surfaces[0].id
 scene.surfaces[0].id='custom_lateral';scene.solids[0].features.find(f=>f.entity_id===carrier).entity_id='custom_lateral'
 scene=a.createCylinderAt3D(scene,[8,0,0],'YZ','Other').scene
 scene=m.transactGeometryScene3D(scene,d=>d.points.push({id:'free',label:'free',position:[7,8,9]}))
 scene=api.createPointOnCylinderSurface3D(scene,'custom_lateral',[.125,.5],'attached','stable')
 const frozen=scene.points.filter(p=>p.id!=='attached'&&!p.id.startsWith('C_'))
 const moved=a.translateSolid3D(scene,'C',[1,2,3]);assert.ok(moved)
 assert.deepEqual(moved.points.filter(p=>p.id!=='attached'&&!p.id.startsWith('C_')),frozen)
 assert.equal(moved.constructions.find(c=>c.output_point_id==='attached').surface_id,'custom_lateral')
 for(const mutate of [d=>{d.surfaces.find(s=>s.id==='custom_lateral').solid_id='Other'},d=>{d.constructions[0].output_point_id='missing'}]){
  const bad=structuredClone(scene);mutate(bad);assert.equal(n.normalizeGeometryScene3D(bad),null)
 }
 const sphere=structuredClone(scene);const solid=sphere.solids.find(s=>s.id==='C');solid.kind='sphere';delete solid.parameters.height;solid.features=solid.features.filter(f=>f.slot!=='v_1');sphere.surfaces.find(s=>s.id==='custom_lateral').kind='sphere'
 assert.equal(m.evaluateGeometryScene3D(sphere).status,'ok');assert.equal(api.createPointOnCylinderSurface3D(sphere,'custom_lateral',[0,0],'bad'),null)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cylinder surface scenes; 54 attachments, frame/UV oracle, transforms/dimensions, dependencies, stale caches, detach/history/reload, invalid inputs and cone gate`)
