import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),api=await loadGeometryModule('geometry3dSurfacePoints'),pick=await loadGeometryModule('geometry3dCylinderPicking'),n=await loadGeometryModule('geometry3d')
const fixtures=[],near=(x,y)=>assert.ok(Math.hypot(...p.sub(x,y))<1e-8),pointer=(camera,world)=>{const q=p.createProjection3D(camera,900,700),v=q.screen(q.view(world));return{x:v[0],y:v[1],width:900,height:700,pointerId:1,button:0,altKey:false}},click=(i,q)=>{i.pointer('down',q);i.pointer('up',q)}
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective'])for(const rotated of [false,true]){
 let source=s.createConeAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'C').scene
 if(rotated)source=s.rotateSolid3D(source,'C',[1,2,3],.6)
 source=s.translateSolid3D(source,'C',[.3,.2,-.1]);source=a.deletePrimitive3D(source,'C_generator_sa').scene
 const solid=source.solids[0],frame=g.analyticFrame3D(solid.frame),camera={...source.print_camera,projection,position:frame.toWorld([8,0,3]),target:frame.toWorld([0,0,1]),up:frame.z,vertical_span:6},start=pointer(camera,g.evaluateAnalyticSurface3D(solid,[.94,.35])),end=pointer(camera,g.evaluateAnalyticSurface3D(solid,[.06,.65]))
 assert.equal(pick.pickAnalyticSurface3D(source,camera,start).surface_id,'C_surface')
 let scene=source,commits=0;const history=m.createGeometryHistory3D(source,v=>scene=v),i=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}})
 i.setTool('point');click(i,start);assert.equal(commits,1);assert.equal(scene.points.length,5)
 let recipe=scene.constructions.find(c=>c.kind==='point_on_surface'),id=recipe.output_point_id;assert.equal(recipe.surface_id,'C_surface');assert.equal(scene.points.find(p=>p.id===id).label,null);near(scene.points.find(p=>p.id===id).position,g.evaluateAnalyticSurface3D(solid,recipe.uv));fixtures.push(scene)
 click(i,start);assert.equal(commits,1,'existing attachment reused')
 const created=structuredClone(scene);i.setTool('select');i.select(id)
 for(const cancel of ['escape','pointer']){i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);if(cancel==='escape')i.cancel();else i.pointer('cancel',end);i.pointer('up',end);assert.equal(commits,1);assert.deepEqual(scene,created)}
 click(i,start);i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,1)
 i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,2);assert.ok(scene.constructions[0].uv[0]<.1);assert.ok(history.provider.undo());assert.deepEqual(scene,created);assert.ok(history.provider.redo())
 scene=api.editSurfacePointLabel3D(scene,id,'M₁ α');assert.ok(scene);fixtures.push(scene)
 const attachedUV=scene.constructions.find(c=>c.output_point_id===id).uv,deletedSegments=scene.linear_objects.map(l=>l.id)
 scene=m.transactGeometryScene3D(scene,d=>{d.points.push({id:'free',position:[3,4,5],label:null},{id:'mid',position:[0,0,0],label:'N'});d.constructions.push({id:'mid_recipe',kind:'midpoint',a:id,b:'free',output_point_id:'mid'})})
 for(const transform of [x=>s.resizeCone3D(x,'C','radius',1.5),x=>s.resizeCone3D(x,'C','height',3),x=>s.translateSolid3D(x,'C',[.2,.3,.4]),x=>s.rotateSolid3D(x,'C',[1,2,3],.3),x=>s.scaleSolid3D(x,'C',1.2)]){
  scene=transform(scene);assert.ok(scene);near(scene.points.find(p=>p.id===id).position,g.evaluateAnalyticSurface3D(scene.solids[0],attachedUV));assert.equal(scene.points.find(p=>p.id===id).label,'M₁ α');assert.deepEqual(scene.linear_objects.map(l=>l.id),deletedSegments)
  near(scene.points.find(p=>p.id==='mid').position,p.scale(p.add(scene.points.find(p=>p.id===id).position,[3,4,5]),.5))
 }
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene);assert.ok(p.geometrySceneSVG3D({...scene,print_camera:camera}));fixtures.push(scene)
 const detached=s.deleteSolid3D(scene,'C').scene;assert.deepEqual(detached.points,scene.points);assert.ok(a.isFreePoint3D(detached,id));assert.equal(detached.constructions.some(c=>c.kind==='point_on_surface'),false);assert.ok(detached.constructions.some(c=>c.id==='mid_recipe'));fixtures.push(detached)
 const deletionHistory=m.createGeometryHistory3D(scene,()=>{});assert.ok(deletionHistory.commit(detached));assert.ok(deletionHistory.provider.undo());assert.deepEqual(deletionHistory.getScene(),scene);assert.ok(deletionHistory.provider.redo());assert.deepEqual(deletionHistory.getScene(),detached)
 // Apex clicks reuse S; a cap hit creates no attached or free point.
 let reused=source;const apexTool=a.createAuthoringInteraction3D({getScene:()=>reused,getCamera:()=>camera,commit:v=>{reused=v;return true},notify:()=>{}});apexTool.setTool('point');click(apexTool,pointer(camera,source.points.find(p=>p.id==='C_v_1').position));assert.deepEqual(reused,source)
 const capCamera={...camera,position:frame.toWorld([.2,.2,-6]),target:frame.toWorld([0,0,0]),up:frame.y},cap=pointer(capCamera,frame.toWorld([.3,.2,0]));assert.equal(pick.pickAnalyticSurface3D(source,capCamera,cap),null)
 const capTool=a.createAuthoringInteraction3D({getScene:()=>reused,getCamera:()=>capCamera,commit:v=>{reused=v;return true},notify:()=>{}});capTool.setTool('point');click(capTool,cap);assert.deepEqual(reused,source)
 // A nearer cone's base blocks the rear surface, even when a specific owner is requested.
 const blocker=s.defaultCone3D('Front');blocker.parameters={radius:2,height:4};blocker.frame={...structuredClone(solid.frame),origin:p.sub(p.scale(p.add(camera.position,g.evaluateAnalyticSurface3D(solid,[.94,.35])),.5),p.scale(frame.z,2))}
 const foreground=s.createSolid3D(source,blocker).scene
 assert.equal(pick.pickAnalyticSurface3D(foreground,camera,start,'C_surface'),null)
 const normal=p.unit(p.sub(camera.position,g.evaluateAnalyticSurface3D(solid,[.94,.35]))),x=p.unit(p.cross(normal,frame.z)),y=p.cross(normal,x),center=p.scale(p.add(camera.position,g.evaluateAnalyticSurface3D(solid,[.94,.35])),.5)
 const faceBlocker=m.transactGeometryScene3D(source,d=>{for(const [id,xy] of [['blockA',[-3,-3]],['blockB',[3,-3]],['blockC',[0,3]]])d.points.push({id,label:null,position:p.add(center,p.add(p.scale(x,xy[0]),p.scale(y,xy[1])))});d.faces.push({id:'mask_face',boundary:['blockA','blockB','blockC']})})
 assert.ok(faceBlocker);assert.equal(pick.pickAnalyticSurface3D(faceBlocker,camera,start,'C_surface'),null)
}
let foundation=s.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','F').scene
for(const [j,uv] of [[0,0],[.25,.5],[.999999,.5],[1,.5],[-.01,.75],[.5,1-1e-8]].entries()){
 foundation=api.createPointOnSurface3D(foundation,'F_surface',uv,'P'+j);assert.ok(foundation);const c=foundation.constructions.find(c=>c.output_point_id==='P'+j);near(foundation.points.find(p=>p.id==='P'+j).position,g.evaluateAnalyticSurface3D(foundation.solids[0],c.uv));assert.equal(foundation.points.find(p=>p.id==='P'+j).label,null)
}
for(const uv of [[0,1],[NaN,.5],[0,Infinity],[0,-.1],[0,1.1]])assert.equal(api.createPointOnSurface3D(foundation,'F_surface',uv,'bad'),null)
assert.equal(api.createPointOnSurface3D(foundation,'missing',[0,.5],'bad'),null);assert.equal(api.createPointOnCylinderSurface3D(foundation,'F_surface',[0,.5],'bad'),null)
const apexEdit=api.editPointOnSurface3D(foundation,'P0',[.7,1]);assert.deepEqual(apexEdit.constructions.find(c=>c.output_point_id==='P0').uv,[0,1]);assert.equal(apexEdit.points.length,foundation.points.length)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cone surface fixtures; all planes/cameras/transforms, seam/near-apex, creation/reuse, drag/cancel/history, dimensions/labels/dependencies, cap/occlusion, detach and canonical reload`)
