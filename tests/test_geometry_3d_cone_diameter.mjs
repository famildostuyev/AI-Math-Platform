import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const fixtures=[],near=(x,y)=>assert.ok(Math.hypot(...x.map((v,i)=>v-y[i]))<1e-9)
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 let scene=s.createConeAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'C').scene
 const feature=slot=>scene.solids[0].features.find(f=>f.slot===slot).entity_id,A=feature('v_2'),B=feature('v_3'),O=feature('v_0'),S=feature('v_1'),diameter=scene.linear_objects.find(l=>l.a===A&&l.b===B).id
 assert.equal(scene.points.length,4);assert.equal(scene.linear_objects.length,4)
 assert.equal(scene.points.find(p=>p.id===A).label,'A');assert.equal(scene.points.find(p=>p.id===B).label,'B')
 const verify=()=>{const solid=scene.solids[0],frame=g.analyticFrame3D(solid.frame),get=id=>scene.points.find(p=>p.id===id).position,al=frame.toLocal(get(A)),bl=frame.toLocal(get(B));near(al,[-.6*solid.parameters.radius,.8*solid.parameters.radius,0]);near(bl,al.map(x=>-x));near(get(O),get(A).map((x,i)=>(x+get(B)[i])/2));assert.ok(Math.abs(Math.hypot(...get(A).map((x,i)=>x-get(B)[i]))-2*solid.parameters.radius)<1e-9);near(get(S),frame.toWorld([0,0,solid.parameters.height]))}
 verify()
 const frame=g.analyticFrame3D(scene.solids[0].frame)
 scene={...scene,print_camera:{...scene.print_camera,projection,position:frame.toWorld([4,3,5]),target:frame.toWorld([0,0,0]),up:frame.z}}
 for(const id of [A,B]){
  const q=p.createProjection3D(scene.print_camera,800,600),screen=q.screen(q.view(scene.points.find(p=>p.id===id).position))
  assert.equal(a.pickGeometry3D(scene,scene.print_camera,{x:screen[0],y:screen[1],width:800,height:600},true).id,id)
  assert.equal(a.isFreePoint3D(scene,id),false);assert.equal(a.deletePrimitive3D(scene,id),null)
  for(const label of ['Ə₁ α','',null,id===A?'A′':'B′']){scene=a.editConeCenterLabel3D(scene,id,label);assert.ok(scene);assert.equal(scene.points.find(p=>p.id===id).label,label||null);assert.deepEqual(m.prepareAnalyticCenters3D(scene),scene)}
 }
 for(const transform of [x=>s.translateSolid3D(x,'C',[1,-.5,.2]),x=>s.rotateSolid3D(x,'C',[1,2,3],.8),x=>s.scaleSolid3D(x,'C',1.4),x=>s.editSolid3D(x,{...x.solids[0],parameters:{radius:2.7,height:3.2}})]){scene=transform(scene);assert.ok(scene);verify();assert.equal(feature('v_2'),A);assert.equal(scene.points.find(p=>p.id===B).label,'B′')}
 const finalFrame=g.analyticFrame3D(scene.solids[0].frame);scene={...scene,print_camera:{...scene.print_camera,position:finalFrame.toWorld([8,6,10]),target:finalFrame.toWorld([0,0,1]),up:finalFrame.z}}
 const svg=p.geometrySceneSVG3D(scene);assert.ok(svg.includes('>A′</text>'));assert.ok(svg.includes('>B′</text>'));assert.ok(svg.includes(`data-id="${diameter}"`));assert.ok(svg.includes('data-render-curve="silhouette"'))
 const removed=a.deletePrimitive3D(scene,diameter).scene;assert.deepEqual(removed.points,scene.points);assert.deepEqual(removed.solids,scene.solids);assert.equal(removed.linear_objects.length,3);assert.equal(removed.linear_objects.find(l=>l.id==='C_height').a,S);assert.equal(removed.linear_objects.find(l=>l.id==='C_height').b,O)
 assert.deepEqual(m.prepareAnalyticCenters3D(removed),removed);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(removed))),removed)
 assert.equal(s.translateSolid3D(removed,'C',[1,0,0]).linear_objects.some(l=>l.id===diameter),false)
 const history=m.createGeometryHistory3D(scene,()=>{});assert.ok(history.commit(removed));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),removed)
 const neither=a.deletePrimitive3D(removed,'C_height').scene;assert.equal(neither.linear_objects.length,2);assert.equal(neither.points.length,4)
 const detached=s.deleteSolid3D(scene,'C').scene;assert.deepEqual(detached.points,scene.points);assert.deepEqual(detached.linear_objects,scene.linear_objects);for(const id of [A,B,O,S])assert.ok(a.isFreePoint3D(detached,id))
 fixtures.push(scene,removed,detached)
}
// Sparse legacy cones remain valid, without implicitly adding a diameter.
const legacy=s.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','legacy').scene,oldIds=legacy.solids[0].features.filter(f=>['v_2','v_3'].includes(f.slot)).map(f=>f.entity_id)
legacy.solids[0].features=legacy.solids[0].features.filter(f=>!oldIds.includes(f.entity_id));legacy.points=legacy.points.filter(p=>!oldIds.includes(p.id));legacy.linear_objects=legacy.linear_objects.filter(l=>!oldIds.includes(l.a)&&!oldIds.includes(l.b))
assert.deepEqual(m.prepareAnalyticCenters3D(legacy),legacy)
assert.equal(a.createPoint3D(legacy,[3,4,5]).scene.points.at(-1).label,null)
// No feature/segment ID collisions with existing unrelated entities.
const occupied=m.emptyGeometryScene3D();occupied.points.push({id:'C_v_2',position:[7,7,7],label:null},{id:'C_diameter',position:[8,8,8],label:null})
const collision=s.createConeAt3D(occupied,[0,0,0],'XY','C').scene;assert.ok(collision);assert.equal(new Set(collision.points.map(p=>p.id)).size,6);assert.ok(collision.linear_objects.some(l=>l.id==='C_diameter_2'))
const longId='C'.repeat(55),longScene=m.emptyGeometryScene3D(),stem=longId.slice(0,50)+'_diameter'
longScene.points.push({id:stem,position:[9,9,9],label:null})
assert.ok(s.createConeAt3D(longScene,[0,0,0],'XY',longId))
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cone diameter fixtures; all planes/cameras, exact antipodes/midpoint/length, labels/picking, dimensions/transforms, independent removal/history/reload, detach, legacy and collisions`)
