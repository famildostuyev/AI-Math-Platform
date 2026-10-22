import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d'),r=await loadGeometryModule('geometry3dRenderGeometry'),b=await loadGeometryModule('geometry3dSolidBounds'),surface=await loadGeometryModule('geometry3dSurfacePoints')
const fixtures=[],close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8)
const pointer=(camera,world)=>{const q=p.createProjection3D(camera,800,600),v=q.screen(q.view(world));return{x:v[0],y:v[1],width:800,height:600,pointerId:1,button:0,altKey:false}}
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 let scene=s.createSphereAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'Sphere').scene
 const sphere=scene.solids[0],id=sphere.features.find(f=>f.slot==='v_0').entity_id,original=structuredClone(scene)
 assert.deepEqual(sphere.parameters,{radius:1,equator:'visible'});assert.equal(scene.points.length,1);assert.equal(scene.points[0].label,'O');close(scene.points[0].position,sphere.frame.origin)
 assert.deepEqual(scene.print_camera,m.emptyGeometryScene3D().print_camera)
 assert.equal(scene.linear_objects.length,0);assert.equal(scene.edges.length,0);assert.equal(scene.faces.length,0)
 assert.deepEqual(scene,m.prepareAnalyticCenters3D(scene));assert.equal(a.isFreePoint3D(scene,id),false);assert.equal(a.editPoint3D(scene,id,[0,0,0],'bad'),null)
 const frame=g.analyticFrame3D(sphere.frame),camera={...scene.print_camera,projection,position:frame.toWorld([4,-6,3]),target:sphere.frame.origin,up:frame.z}
 scene={...scene,print_camera:camera}
 const render=r.sphereRenderGeometry3D(sphere,camera),projected=p.projectScene3D(scene,camera,800,600,true)
 assert.equal(render.curves.length,2);assert.equal(render.curves[0].role,'silhouette');assert.ok(projected.points.some(point=>point.id===id))
 const eye=p.sub(camera.position,sphere.frame.origin),view=p.unit(p.sub(camera.position,camera.target))
 for(const vertex of render.curves[0].vertices){const radial=p.sub(vertex,sphere.frame.origin);assert.ok(Math.abs(Math.hypot(...radial)-1)<1e-8);assert.ok(Math.abs(p.dot(radial,projection==='perspective'?p.sub(eye,radial):view))<1e-8)}
 assert.ok(p.projectedEdgeStrokes3D(projected,projection).filter(line=>line.role==='silhouette').every(line=>!line.hidden))
 assert.ok(p.geometrySceneSVG3D(scene).includes('>O</text>'));assert.equal(a.pickGeometry3D(scene,camera,pointer(camera,scene.points[0].position)).id,id)
 const saved=p.geometrySceneSVG3D(scene);p.projectScene3D(scene,{...camera,position:frame.toWorld([-6,4,2])},800,600,true);assert.equal(p.geometrySceneSVG3D(scene),saved)
 assert.doesNotThrow(()=>r.sphereRenderGeometry3D(sphere,{...camera,projection:'perspective',position:sphere.frame.origin,target:frame.toWorld([0,1,0])}))
 const body=pointer(camera,frame.toWorld([.4,0,0]));assert.equal(a.pickGeometry3D(scene,camera,body).id,'Sphere')
 for(const label of ['Q','Ö₁ α','',null]){scene=a.editConeCenterLabel3D(scene,id,label);assert.ok(scene);assert.equal(scene.points[0].label,label||null)}
 scene=a.editConeCenterLabel3D(scene,id,'K');scene=s.translateSolid3D(scene,'Sphere',[1,2,-.5]);assert.ok(scene)
 scene=s.rotateSolid3D(scene,'Sphere',[1,2,3],.4);assert.ok(scene);scene=s.scaleSolid3D(scene,'Sphere',1.5);assert.ok(scene);assert.equal(scene.solids[0].parameters.radius,1.5)
 close(scene.points[0].position,scene.solids[0].frame.origin);assert.equal(scene.points[0].id,id);assert.equal(scene.points[0].label,'K')
 assert.equal(b.projectedSolidBounds3D(scene,camera,800,600,'Sphere').handles.filter(h=>h.kind==='radius').length,1)
 assert.deepEqual(n.normalizeGeometryScene3D(scene),scene);fixtures.push(scene)
 const deleted=s.deleteSolid3D(scene,'Sphere').scene;assert.equal(deleted.solids.length,0);assert.equal(deleted.surfaces.length,0);assert.deepEqual(deleted.points,scene.points);assert.ok(a.isFreePoint3D(deleted,id));fixtures.push(deleted)
 const dependent=m.transactGeometryScene3D(scene,d=>{d.points.push({id:'Q',position:[8,8,8],label:null},{id:'Mid',position:[0,0,0],label:null});d.constructions.push({id:'midpoint',kind:'midpoint',a:id,b:'Q',output_point_id:'Mid'})})
 const detached=s.deleteSolid3D(dependent,'Sphere').scene;assert.deepEqual(detached.points,dependent.points);assert.deepEqual(detached.constructions,dependent.constructions)
 let historyScene=original;const history=m.createGeometryHistory3D(original,next=>{historyScene=next});assert.ok(history.commit(scene));assert.ok(history.provider.undo());assert.deepEqual(historyScene,original);assert.ok(history.provider.redo());assert.deepEqual(historyScene,scene)
 // Foreground closed spheres hide a rear sphere's center and win body picking.
 const frontCenter=p.add(sphere.frame.origin,p.scale(view,3)),mixed=s.createSphereAt3D({...original,print_camera:camera},frontCenter,plane,'Front').scene
 assert.ok(!p.projectScene3D(mixed,camera,800,600,true).points.some(point=>point.id===id))
 assert.equal(a.pickGeometry3D(mixed,camera,body).id,'Front')
 assert.ok(surface.createPointOnSurface3D(original,'Sphere_surface',[0,.5],'attached'))
 // Actual tool gesture creates one canonical sphere and cancellation creates none.
 let current=m.emptyGeometryScene3D(),commits=0
 const interaction=a.createAuthoringInteraction3D({getScene:()=>current,getCamera:()=>camera,commit:next=>{current=next;commits++;return true},notify:()=>{}})
 interaction.setPlane(plane);interaction.setTool('sphere');const at=pointer(camera,[0,0,0]);interaction.pointer('down',at);interaction.cancel();assert.equal(commits,0)
 interaction.pointer('down',at);interaction.pointer('up',at);assert.equal(commits,1);assert.equal(current.solids[0].kind,'sphere');assert.equal(current.points.length,1)
}
for(const radius of [0,-1,NaN,Infinity])assert.equal(s.createSolid3D(m.emptyGeometryScene3D(),{...s.defaultSphere3D('bad'),parameters:{radius}}),null)
assert.equal(s.createSphereAt3D(m.emptyGeometryScene3D(),[0,0,0],'bad'),null)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} sphere canonical fixtures; planes/projections, tangent silhouette, center/labels, picking/occlusion, transforms, history, detach, tool gestures and invalid dimensions`)
