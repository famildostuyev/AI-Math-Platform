import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),api=await loadGeometryModule('geometry3dSurfacePoints'),pick=await loadGeometryModule('geometry3dCylinderPicking'),n=await loadGeometryModule('geometry3d')
const fixtures=[],near=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8),pointer=(camera,world)=>{const q=p.createProjection3D(camera,900,700),v=q.screen(q.view(world));return{x:v[0],y:v[1],width:900,height:700,pointerId:1,button:0,altKey:false}},click=(i,q)=>{i.pointer('down',q);i.pointer('up',q)}
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective'])for(const rotated of [false,true]){
 let source=s.createSphereAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'S').scene
 if(rotated)source=s.rotateSolid3D(source,'S',[1,2,3],.6)
 source=s.translateSolid3D(source,'S',[.3,.2,-.1]);const solid=source.solids[0],frame=g.analyticFrame3D(solid.frame),camera={...source.print_camera,projection,position:frame.toWorld([7,0,.1]),target:solid.frame.origin,up:frame.z,vertical_span:5},start=pointer(camera,g.evaluateAnalyticSurface3D(solid,[.94,.4])),end=pointer(camera,g.evaluateAnalyticSurface3D(solid,[.06,.65]))
 assert.equal(pick.pickAnalyticSurface3D(source,camera,start).surface_id,'S_surface')
 let scene=source,commits=0;const history=m.createGeometryHistory3D(source,next=>scene=next),i=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:next=>{commits++;return history.commit(next)},notify:()=>{}})
 i.setTool('point');click(i,start);assert.equal(commits,1);assert.equal(scene.points.length,2);const id=scene.constructions[0].output_point_id;assert.equal(scene.points.find(p=>p.id===id).label,null);assert.equal(scene.points.find(p=>p.id==='S_v_0').label,'O')
 click(i,start);assert.equal(scene.points.length,2);assert.equal(commits,1)
 for(const label of ['M','Ö₁ α','',null]){scene=api.editSurfacePointLabel3D(scene,id,label);assert.ok(scene);assert.equal(scene.points.find(p=>p.id===id).label,label||null)}
 scene=api.editSurfacePointLabel3D(scene,id,'M');const labeled=structuredClone(scene)
 i.setTool('select');i.select(id);i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,1);i.cancel();assert.deepEqual(scene,labeled)
 i.pointer('down',start);i.pointer('up',start);assert.equal(commits,1)
 i.pointer('down',start);i.pointer('move',end);const valid=structuredClone(i.snapshot().draft);i.pointer('move',{...end,x:5,y:5});assert.deepEqual(i.snapshot().draft,valid);i.pointer('up',end);assert.equal(commits,2);assert.ok(scene.constructions[0].uv[0]<.1);const moved=structuredClone(scene)
 assert.ok(history.provider.undo());assert.equal(scene.constructions[0].uv[0]>.9,true);assert.ok(history.provider.redo());assert.deepEqual(scene,moved);fixtures.push(scene)
 // A downstream midpoint follows reevaluation and survives parent detachment.
 scene=m.transactGeometryScene3D(scene,d=>{d.points.push({id:'Q',position:[4,4,4],label:null},{id:'Mid',position:[0,0,0],label:null});d.constructions.push({id:'mid',kind:'midpoint',a:id,b:'Q',output_point_id:'Mid'})})
 for(const radius of [1.6,.7]){scene=s.resizeSphereRadius3D(scene,'S',radius);assert.ok(scene);const point=scene.points.find(p=>p.id===id);near(point.position,g.evaluateAnalyticSurface3D(scene.solids[0],scene.constructions.find(c=>c.output_point_id===id).uv));assert.equal(point.label,'M')}
 scene=s.translateSolid3D(scene,'S',[.2,.3,-.1]);scene=s.rotateSolid3D(scene,'S',[1,1,2],.2);scene=s.scaleSolid3D(scene,'S',1.2);assert.ok(scene);scene=s.setSphereEquator3D(scene,'S',false);assert.equal(scene.solids[0].parameters.equator,'hidden')
 near(scene.points.find(p=>p.id===id).position,g.evaluateAnalyticSurface3D(scene.solids[0],scene.constructions.find(c=>c.output_point_id===id).uv));assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene);fixtures.push(scene)
 const detached=s.deleteSolid3D(scene,'S').scene;assert.deepEqual(detached.points,scene.points);assert.ok(a.isFreePoint3D(detached,id));assert.deepEqual(detached.constructions.map(c=>c.id),['mid']);fixtures.push(detached)
 // Both poles use longitude zero, including serialized legacy nonzero longitudes.
 let poles=source
 for(const v of [0,1]){const pid=v?'North':'South';poles=api.createPointOnSurface3D(poles,'S_surface',[.73,v],pid);assert.ok(poles);assert.deepEqual(poles.constructions.find(c=>c.output_point_id===pid).uv,[0,v]);assert.equal(api.createPointOnSurface3D(poles,'S_surface',[.2,v],pid+'Duplicate'),null)}
 const raw=structuredClone(poles);raw.constructions.forEach(c=>c.uv[0]=.4);assert.deepEqual(n.normalizeGeometryScene3D(raw),poles);assert.deepEqual(raw.constructions[0].uv[0],.4)
 assert.equal(api.editPointOnSurface3D(poles,'North',[.1,0]),null);fixtures.push(poles)
 const poleCamera={...camera,position:frame.toWorld([5,0,7]),target:solid.frame.origin,up:frame.y},atPole=pointer(poleCamera,g.evaluateAnalyticSurface3D(solid,[0,1]));assert.deepEqual(pick.pickAnalyticSurface3D(source,poleCamera,atPole).uv,[0,1])
 let poleScene=source;const poleTool=a.createAuthoringInteraction3D({getScene:()=>poleScene,getCamera:()=>poleCamera,commit:next=>{poleScene=next;return true},notify:()=>{}});poleTool.setTool('point');click(poleTool,atPole);click(poleTool,atPole);assert.equal(poleScene.constructions.length,1)
 const foreground=s.createSphereAt3D(source,frame.toWorld([4,0,0]),plane,'Front').scene;assert.equal(pick.pickAnalyticSurface3D(foreground,camera,start,'S_surface'),null)
 for(const uv of [[NaN,.5],[0,Infinity],[0,-.1],[0,1.1]])assert.equal(api.createPointOnSurface3D(source,'S_surface',uv,'bad'),null)
 const seam=api.createPointOnSurface3D(source,'S_surface',[1,.5],'Seam');assert.deepEqual(seam.constructions[0].uv,[0,.5]);assert.equal(api.createPointOnSurface3D(source,'missing',[0,.5],'bad'),null)
 const print={...moved,print_camera:camera};assert.ok(p.geometrySceneSVG3D(print).includes('>M</text>'));assert.ok(p.projectScene3D(print,camera,900,700,true).points.some(p=>p.id===id))
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} sphere surface fixtures; planes/projections/transforms, create/reuse/labels, seam/poles, drag/miss/cancel/history, radius/equator, dependencies/detach, occlusion, canonical reload and SVG`)
