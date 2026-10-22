import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),g=await loadGeometryModule('geometry3dAnalytic'),n=await loadGeometryModule('geometry3d')
const fixtures=[],near=(x,y)=>assert.ok(Math.hypot(...x.map((v,i)=>v-y[i]))<1e-9)
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 let scene=s.createConeAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'C').scene
 const solid=scene.solids[0],o=solid.features.find(f=>f.slot==='v_0').entity_id,apex=solid.features.find(f=>f.slot==='v_1').entity_id,height=scene.linear_objects.find(l=>l.a===apex&&l.b===o).id,frame=g.analyticFrame3D(solid.frame)
 assert.equal(scene.points.length,4);assert.equal(scene.points.find(p=>p.id===o).label,'O');assert.equal(scene.points.find(p=>p.id===apex).label,'S');assert.deepEqual(scene.linear_objects.find(l=>l.id===height),{id:height,kind:'segment',a:apex,b:o})
 scene={...scene,print_camera:{...scene.print_camera,projection,position:frame.toWorld([5,-6,4]),target:frame.toWorld([0,0,1]),up:frame.z}}
 const q=p.createProjection3D(scene.print_camera,800,600)
 for(const id of [o,apex]){
  const point=scene.points.find(p=>p.id===id),screen=q.screen(q.view(point.position))
  assert.equal(a.pickGeometry3D(scene,scene.print_camera,{x:screen[0],y:screen[1],width:800,height:600},true).id,id)
  assert.equal(a.isFreePoint3D(scene,id),false);assert.equal(a.deletePrimitive3D(scene,id),null)
  for(const label of ['T₁ α','',null,id===o?'O′':'S′']){scene=a.editConeCenterLabel3D(scene,id,label);assert.ok(scene);assert.equal(scene.points.find(p=>p.id===id).label,label||null);assert.deepEqual(m.prepareAnalyticCenters3D(scene),scene)}
 }
 const initial=structuredClone(scene)
 const resized=s.editSolid3D(scene,{...solid,parameters:{radius:2.3,height:3.1}})
 assert.ok(resized);near(resized.points.find(p=>p.id===apex).position,frame.toWorld([0,0,3.1]));assert.equal(resized.linear_objects.find(l=>l.id===height).id,height)
 for(const transform of [x=>s.translateSolid3D(x,'C',[1,2,-.3]),x=>s.rotateSolid3D(x,'C',[1,2,3],.8),x=>s.scaleSolid3D(x,'C',1.7)]){
  scene=transform(scene);assert.ok(scene);const current=scene.solids[0],f=g.analyticFrame3D(current.frame)
  near(scene.points.find(p=>p.id===o).position,f.toWorld([0,0,0]));near(scene.points.find(p=>p.id===apex).position,f.toWorld([0,0,current.parameters.height]));assert.equal(scene.points.find(p=>p.id===apex).label,'S′')
 }
 const finalFrame=g.analyticFrame3D(scene.solids[0].frame)
 scene={...scene,print_camera:{...scene.print_camera,position:finalFrame.toWorld([8,-9,6]),target:finalFrame.toWorld([0,0,1.7]),up:finalFrame.z}}
 const svg=p.geometrySceneSVG3D(scene);assert.ok(svg.includes('>S′</text>'));assert.ok(svg.includes('>O′</text>'));assert.ok(svg.includes(`data-id="${height}"`));assert.ok(svg.includes('stroke-dasharray'))
 const removed=a.deletePrimitive3D(scene,height).scene;assert.deepEqual(removed.points,scene.points);assert.deepEqual(removed.solids,scene.solids);assert.equal(removed.linear_objects.length,3)
 assert.deepEqual(m.prepareAnalyticCenters3D(removed),removed);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(removed))),removed)
 const history=m.createGeometryHistory3D(initial,()=>{});assert.ok(history.commit(scene));assert.ok(history.commit(removed));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),removed)
 const detached=s.deleteSolid3D(scene,'C').scene;assert.deepEqual(detached.points,scene.points);assert.deepEqual(detached.linear_objects,scene.linear_objects);assert.ok(a.isFreePoint3D(detached,apex));assert.ok(a.isFreePoint3D(detached,o))
 fixtures.push(scene,removed,detached)
}
// Existing scenes receive the apex but never an implicitly regenerated height.
const legacy=s.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','legacy').scene
legacy.linear_objects=[];const apexId=legacy.solids[0].features.find(f=>f.slot==='v_1').entity_id;legacy.solids[0].features=legacy.solids[0].features.filter(f=>f.slot!=='v_1');legacy.points=legacy.points.filter(p=>p.id!==apexId)
const prepared=m.prepareAnalyticCenters3D(legacy);assert.equal(prepared.points.length,4);assert.equal(prepared.linear_objects.length,0);assert.deepEqual(m.prepareAnalyticCenters3D(prepared),prepared)
const withPoint=a.createPoint3D(prepared,[3,4,5]);assert.equal(withPoint.scene.points.find(p=>p.id===withPoint.id).label,null)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cone apex/height fixtures; planes/cameras, labels/picking, transforms, removable height/history/reload, detachment and legacy preparation`)
