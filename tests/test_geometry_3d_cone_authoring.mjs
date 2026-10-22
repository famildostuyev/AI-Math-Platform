import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d'),r=await loadGeometryModule('geometry3dRenderGeometry'),pick=await loadGeometryModule('geometry3dCylinderPicking'),bounds=await loadGeometryModule('geometry3dSolidBounds'),surface=await loadGeometryModule('geometry3dSurfacePoints')
const fixtures=[],close=(x,y)=>assert.ok(Math.hypot(...p.sub(x,y))<1e-8,`${x} ~= ${y}`)
const center=scene=>{const solid=scene.solids.find(s=>s.kind==='cone'),id=solid.features.find(f=>f.slot==='v_0').entity_id;return scene.points.find(point=>point.id===id)}
const screen=(scene,camera,world)=>{const q=p.createProjection3D(camera,800,600),v=q.screen(q.view(world));return {x:v[0],y:v[1],width:800,height:600,pointerId:1,button:0,altKey:false}}
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 let scene=s.createConeAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'Cone').scene
 const solid=scene.solids[0],frame=g.analyticFrame3D(solid.frame),id=center(scene).id,featureMap=structuredClone(solid.features),initial=structuredClone(scene)
 assert.deepEqual(solid.parameters,{radius:1,height:2});assert.deepEqual(frame.z.map(x=>x||0),a.planeNormal3D(plane));close(center(scene).position,solid.frame.origin)
 close(g.evaluateAnalyticSurface3D(solid,[0,1]),frame.toWorld([0,0,2]));assert.equal(center(scene).label,'O');assert.equal(scene.points.length,4);assert.equal(scene.faces.length,0);assert.equal(scene.edges.length,0)
 assert.equal(m.evaluateGeometryScene3D(scene).status,'ok');assert.equal(a.isFreePoint3D(scene,id),false);assert.equal(a.editPoint3D(scene,id,[8,8,8],'bad'),null)
 const camera={...scene.print_camera,projection,position:frame.toWorld([5,-6,4]),target:frame.toWorld([0,0,1]),up:frame.z}
 scene={...scene,print_camera:camera}
 assert.ok(p.geometrySceneSVG3D(scene).includes('>O</text>'));assert.ok(p.geometrySceneSVG3D(scene).includes(`data-id="${id}"`))
 assert.equal(a.pickGeometry3D(scene,camera,screen(scene,camera,center(scene).position)).id,id)
 for(const label of ['K','Ə₁ α','',null,'O′']){
  const before=structuredClone(scene),next=a.editConeCenterLabel3D(scene,id,label);assert.ok(next);assert.deepEqual(scene,before);scene=next
  assert.equal(center(scene).label,label||null);assert.equal(center(scene).id,id);assert.deepEqual(scene.solids[0].features,featureMap)
  assert.deepEqual(m.prepareAnalyticCenters3D(scene),scene,'cleared teacher label must not be regenerated')
 }
 for(const operation of [x=>s.translateSolid3D(x,'Cone',[.3,.4,-.2]),x=>s.rotateSolid3D(x,'Cone',[1,2,3],.6),x=>s.scaleSolid3D(x,'Cone',1.5)]){
  scene=operation(scene);assert.ok(scene);close(center(scene).position,scene.solids[0].frame.origin);assert.equal(center(scene).id,id);assert.equal(center(scene).label,'O′');assert.deepEqual(scene.solids[0].features,featureMap)
 }
 assert.ok(p.geometrySceneSVG3D(scene).includes('>O′</text>'))
 assert.equal(s.resizeCylinder3D(scene,'Cone','radius',3),null)
 const box=bounds.projectedSolidBounds3D(scene,camera,800,600,'Cone');assert.ok(box);assert.ok(box.handles.some(h=>h.kind==='radius'));assert.ok(box.handles.some(h=>h.kind==='height'))
 const history=m.createGeometryHistory3D(initial,()=>{});assert.ok(history.commit(scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),initial);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),scene)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 // A dependent survives detachment at its final evaluated coordinates.
 const dependent=m.transactGeometryScene3D(scene,d=>{d.points.push({id:'free',position:[2,3,4],label:null},{id:'mid',position:[0,0,0],label:'N'});d.constructions.push({id:'mid_recipe',kind:'midpoint',a:id,b:'free',output_point_id:'mid'})})
 const deleted=s.deleteSolid3D(dependent,'Cone');assert.ok(deleted);assert.deepEqual(deleted.scene.points,dependent.points);assert.deepEqual(deleted.scene.constructions,dependent.constructions);assert.equal(deleted.scene.surfaces.length,0);assert.equal(a.isFreePoint3D(deleted.scene,id),true)
 assert.ok(history.commit(deleted.scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene)
 fixtures.push(scene,deleted.scene)
}
// Pointer creation is one history operation; cancel/drag do not create a cone.
for(const plane of ['XY','XZ','YZ']){
 let scene=m.emptyGeometryScene3D();const camera=structuredClone(scene.print_camera),history=m.createGeometryHistory3D(scene,next=>{scene=next})
 const interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:next=>history.commit(next),notify:()=>{}}),pointer={x:400,y:300,width:800,height:600,pointerId:1,button:0,altKey:false}
 interaction.setPlane(plane);interaction.setTool('cone');interaction.pointer('down',pointer);interaction.cancel();interaction.pointer('up',pointer);assert.equal(scene.solids.length,0)
 interaction.pointer('down',pointer);interaction.pointer('move',{...pointer,x:430});interaction.pointer('up',{...pointer,x:430});assert.equal(scene.solids.length,0)
 interaction.pointer('down',pointer);interaction.pointer('up',pointer);assert.equal(scene.solids[0].kind,'cone');assert.equal(center(scene).label,'O');assert.equal(interaction.snapshot().tool,'select');assert.equal(scene.print_camera.projection,'perspective');assert.deepEqual(camera,m.emptyGeometryScene3D().print_camera)
 assert.ok(history.provider.undo());assert.equal(scene.solids.length,0);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());fixtures.push(scene)
}
// Closed shape geometry and exact cap/lateral/apex hit oracles, in both cameras.
let scene=s.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','C').scene,solid=scene.solids[0]
for(const projection of ['orthographic','perspective'])for(const [eye,region] of [[[5,0,1],'lateral'],[[0,0,-5],'bottom_cap'],[[0,0,5],'apex']]){
 const camera={...scene.print_camera,projection,position:eye,target:[0,0,1],up:eye[0]?[0,0,1]:[0,1,0]},q={x:400,y:300,width:800,height:600}
 const hit=pick.pickAnalyticSolid3D(scene,camera,q);assert.equal(hit?.id,'C');assert.equal(hit?.region,region)
 const display=r.coneRenderGeometry3D(solid,camera);assert.ok(display.patches.length);assert.equal(display.curves.filter(c=>c.role==='rim').length,1)
 assert.ok(display.patches.every(p=>p.vertices.every(v=>g.analyticFrame3D(solid.frame).toLocal(v)[2]>=0)))
 const svg=p.geometrySceneSVG3D({...scene,print_camera:camera});assert.ok(svg.includes('data-render-surface'));assert.ok(svg.includes('data-id="C_v_0"'))
}
// Cone reference O is shown through its owner, but not through a foreground solid.
{
 for(const [ray,expected] of [
  [{origin:[5,0,1],direction:[-1,0,0]},[.5,0,1]],
  [{origin:[0,0,-5],direction:[0,0,1]},[0,0,0]],
  [{origin:[0,0,5],direction:[0,0,-1]},[0,0,2]],
  [{origin:[2,0,-2],direction:[-1,0,2]},[1,0,0]],
 ])close(g.intersectClosedCone3D(solid,ray)[0].position,expected)
 const clipped=g.intersectClosedCone3D(solid,{origin:[0,0,-5],direction:[0,0,1],clip:{origin:[0,0,-5],forward:[0,0,1],near:6,far:10}})
 assert.equal(clipped.length,1);assert.equal(clipped[0].region,'apex')
 const explicit={...s.defaultCone3D('explicit'),features:[{slot:'v_0',entity_id:'custom_center'}]}
 const resolved=s.createSolid3D(m.emptyGeometryScene3D(),explicit).scene
 assert.equal(resolved.points[0].id,'custom_center');assert.equal(resolved.points[0].label,'O')
 const sparse=m.emptyGeometryScene3D();sparse.solids=[s.defaultCone3D('sparse')]
 const prepared=m.prepareAnalyticCenters3D(sparse);assert.equal(prepared.points[0].label,'O');assert.deepEqual(m.prepareAnalyticCenters3D(prepared),prepared)
}
{
 const camera={...scene.print_camera,position:[0,-10,2],target:[0,0,0],up:[0,0,1]},point=scene.points[0]
 const front=s.defaultCylinder3D('front');front.frame.origin=[0,-4,0];front.parameters={radius:2,height:4}
 const mixed=s.createSolid3D(scene,front).scene
 assert.ok(!p.projectScene3D(mixed,camera,800,600).points.some(p=>p.id===point.id))
 const cylinder=s.createCylinderAt3D(m.emptyGeometryScene3D(),[0,4,0],'XY','behind').scene
 const combined=s.createConeAt3D(cylinder,[0,0,0],'XY','frontCone').scene
 assert.equal(pick.pickCylinderSurface3D(combined,camera,{x:400,y:300,width:800,height:600}),null)
}
// Cone surface construction is enabled; sphere authoring and ordinary naming remain unchanged.
{
 let current=scene;const camera={...scene.print_camera,position:[5,0,1],target:[0,0,1],up:[0,0,1]},before=structuredClone(scene)
 const interaction=a.createAuthoringInteraction3D({getScene:()=>current,getCamera:()=>camera,commit:next=>{current=next;return true},notify:()=>{}})
 const body={x:400,y:300,width:800,height:600,pointerId:1,button:0,altKey:false}
 interaction.setTool('point');interaction.pointer('down',body);interaction.pointer('up',body);assert.equal(current.points.length,before.points.length+1);assert.equal(current.constructions.length,1);const attached=structuredClone(current)
 const atCenter=screen(current,camera,current.points[0].position)
 interaction.setTool('select');interaction.pointer('down',atCenter);interaction.pointer('move',{...atCenter,x:atCenter.x+30});interaction.pointer('up',{...atCenter,x:atCenter.x+30});assert.deepEqual(current,attached)
}
assert.equal(surface.createPointOnCylinderSurface3D(scene,'C_surface',[0,.5],'bad'),null)
assert.equal(m.evaluateGeometryScene3D({...scene,points:[...scene.points,{id:'P',position:[.5,0,1],label:null}],constructions:[{id:'recipe',kind:'point_on_surface',surface_id:'C_surface',uv:[0,.5],output_point_id:'P'}]}).status,'ok')
assert.equal(a.editConeCenterLabel3D(scene,'C_v_0','x'.repeat(4097)),null)
assert.equal(s.createConeAt3D(scene,[0,0,0],'bad'),null)
assert.equal(s.createSolid3D(scene,{...s.defaultCone3D('bad'),parameters:{radius:0,height:2}}),null)
assert.equal(a.createPoint3D(scene,[4,4,4],'ordinary').scene.points.find(p=>p.id==='ordinary').label,null)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cone scenes; XY/XZ/YZ, default O/rename/clear, ownership/IDs, closed render/pick/occlusion, transforms, radius/height/uniform handles, cancellation/history/reload, detach/dependents and surface activation`)
