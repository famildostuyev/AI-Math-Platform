import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const fixtures=[]
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 let scene=s.createConeAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'C').scene
 const ids=Object.fromEntries(scene.solids[0].features.map(f=>[f.slot,f.entity_id])),sa='C_generator_sa',sb='C_generator_sb'
 assert.equal(scene.points.length,4);assert.equal(scene.linear_objects.length,4)
 assert.deepEqual(scene.linear_objects.find(l=>l.id===sa),{id:sa,kind:'segment',a:ids.v_1,b:ids.v_2});assert.deepEqual(scene.linear_objects.find(l=>l.id===sb),{id:sb,kind:'segment',a:ids.v_1,b:ids.v_3})
 const check=()=>{const solid=scene.solids[0],frame=g.analyticFrame3D(solid.frame),r=solid.parameters.radius,h=solid.parameters.height
  for(const id of [sa,sb]){const line=scene.linear_objects.find(l=>l.id===id),A=scene.points.find(p=>p.id===line.a).position,B=scene.points.find(p=>p.id===line.b).position
   assert.ok(Math.abs(Math.hypot(...A.map((x,i)=>x-B[i]))-Math.hypot(r,h))<1e-9)
   for(const t of [0,.1,.5,.9,1]){const local=frame.toLocal(A.map((x,i)=>x+(B[i]-x)*t));assert.ok(Math.abs(Math.hypot(local[0],local[1])-r*(1-local[2]/h))<1e-9);assert.ok(local[2]>=-1e-9&&local[2]<=h+1e-9)}
  }
 }
 check()
 for(const transform of [x=>s.translateSolid3D(x,'C',[1,-2,.4]),x=>s.rotateSolid3D(x,'C',[1,2,3],.7),x=>s.scaleSolid3D(x,'C',1.6),x=>s.editSolid3D(x,{...x.solids[0],parameters:{radius:2.4,height:3.3}})]){scene=transform(scene);assert.ok(scene);check();assert.deepEqual(Object.fromEntries(scene.solids[0].features.map(f=>[f.slot,f.entity_id])),ids)}
 const frame=g.analyticFrame3D(scene.solids[0].frame);scene={...scene,print_camera:{...scene.print_camera,projection,position:frame.toWorld([8,6,10]),target:frame.toWorld([0,0,1]),up:frame.z}}
 const before=structuredClone(scene),svg=p.geometrySceneSVG3D(scene);for(const id of [sa,sb])assert.ok(svg.includes(`data-id="${id}"`));assert.deepEqual(scene,before)
 const visibilityCamera={...scene.print_camera,position:frame.toWorld([-8,10,5]),target:frame.toWorld([0,0,0])}
 const strokes=p.projectedEdgeStrokes3D(p.projectScene3D(scene,visibilityCamera,800,600,true),projection)
 assert.ok(strokes.some(l=>l.id===sa&&!l.hidden),'front generator visible')
 assert.ok(strokes.some(l=>l.id===sb&&l.hidden),'back generator dashed')
 for(const id of [sa,sb]){const line=scene.linear_objects.find(l=>l.id===id),q=p.createProjection3D(scene.print_camera,800,600),world=scene.points.find(p=>p.id===line.a).position.map((v,i)=>(v+scene.points.find(p=>p.id===line.b).position[i])/2),screen=q.screen(q.view(world));assert.equal(a.pickGeometry3D(scene,scene.print_camera,{x:screen[0],y:screen[1],width:800,height:600}).id,id)}
 const removed=a.deletePrimitive3D(scene,sa).scene;assert.ok(removed.linear_objects.some(l=>l.id===sb));assert.deepEqual(removed.points,scene.points);assert.deepEqual(removed.solids,scene.solids)
 const otherRemoved=a.deletePrimitive3D(scene,sb).scene;assert.ok(otherRemoved.linear_objects.some(l=>l.id===sa));assert.equal(otherRemoved.linear_objects.length,3)
 const both=a.deletePrimitive3D(removed,sb).scene;assert.equal(both.linear_objects.length,2);assert.ok(both.linear_objects.some(l=>l.id==='C_height'));assert.ok(both.linear_objects.some(l=>l.id==='C_diameter'))
 for(const deleted of [removed,otherRemoved,both]){assert.deepEqual(m.prepareAnalyticCenters3D(deleted),deleted);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(deleted))),deleted);const moved=s.translateSolid3D(deleted,'C',[.5,0,0]);assert.deepEqual(moved.linear_objects,deleted.linear_objects)}
 const history=m.createGeometryHistory3D(scene,()=>{});assert.ok(history.commit(removed));assert.ok(history.commit(both));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),removed);assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),both)
 const detached=s.deleteSolid3D(scene,'C').scene;assert.deepEqual(detached.points,scene.points);assert.deepEqual(detached.linear_objects,scene.linear_objects);for(const id of Object.values(ids).filter(id=>id!=='C_surface'))assert.ok(a.isFreePoint3D(detached,id))
 fixtures.push(scene,removed,both,detached)
}
// At apex-height perspective, A/B generators are the exact silhouette.
// Semantic strokes survive; coincident automatic strokes do not double them.
let aligned=s.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','T').scene
for(const [projection,position] of [['perspective',[4,3,2]],['orthographic',[4,3,0]]]){
 aligned={...aligned,print_camera:{...aligned.print_camera,projection,position,target:[0,0,0],up:[0,0,1]}}
 const display=p.projectScene3D(aligned,aligned.print_camera,800,600,true)
 assert.equal(display.lines.filter(l=>l.role==='silhouette').length,0)
 for(const id of ['T_generator_sa','T_generator_sb'])assert.ok(display.lines.some(l=>l.id===id))
 const removed=a.deletePrimitive3D(aligned,'T_generator_sa').scene
 assert.equal(p.projectScene3D(removed,removed.print_camera,800,600,true).lines.filter(l=>l.role==='silhouette').length,1)
}
// Legacy scenes and deleted generators remain sparse; no lazy re-creation.
aligned.linear_objects=aligned.linear_objects.filter(l=>!l.id.includes('generator'))
assert.deepEqual(m.prepareAnalyticCenters3D(aligned),aligned)
const occupied=m.emptyGeometryScene3D();occupied.points.push({id:'C_generator_sa',position:[9,9,9],label:null});assert.ok(s.createConeAt3D(occupied,[0,0,0],'XY','C').scene.linear_objects.some(l=>l.id==='C_generator_sa_2'))
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cone generator fixtures; planes/cameras, exact lengths/lateral positions, selection, transforms/dimensions, independent deletion/history/reload, detachment and silhouette overlap`)
