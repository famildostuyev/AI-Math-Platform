import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const s=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),a=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),b=await loadGeometryModule('geometry3dSolidBounds'),g=await loadGeometryModule('geometry3dAnalytic'),n=await loadGeometryModule('geometry3d'),r=await loadGeometryModule('geometry3dRenderGeometry')
const fixtures=[];let gestures=0
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective'])for(const rotated of [false,true])for(const equator of ['visible','hidden']){
 let scene=s.createSphereAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'Sphere').scene
 if(rotated)scene=s.rotateSolid3D(scene,'Sphere',[1,2,3],.6)
 scene=s.translateSolid3D(scene,'Sphere',[.3,.2,-.1]);scene=s.setSphereEquator3D(scene,'Sphere',equator==='visible');scene=a.editConeCenterLabel3D(scene,'Sphere_v_0','Ö₁ α')
 scene=s.createSphereAt3D(scene,[8,3,1],plane,'zOther').scene;scene=s.setSphereEquator3D(scene,'zOther',false)
 const original=structuredClone(scene),solid=scene.solids[0],id=solid.features.find(f=>f.slot==='v_0').entity_id
 for(const radius of [1.8,.7]){
  const before=structuredClone(scene);scene=s.resizeSphereRadius3D(scene,'Sphere',radius);assert.ok(scene)
  before.solids[0].parameters.radius=radius;assert.deepEqual(scene,before,'only radius may change')
  assert.deepEqual(scene.points,original.points);assert.deepEqual(scene.solids[0].frame,original.solids[0].frame);assert.equal(scene.solids[0].parameters.equator,equator)
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene);fixtures.push(scene)
 }
 const frame=g.analyticFrame3D(scene.solids[0].frame),camera={...scene.print_camera,projection,position:frame.toWorld([6,-7,5]),target:solid.frame.origin,up:frame.z},q=p.createProjection3D(camera,900,700)
 const handles=b.projectedSolidBounds3D(scene,camera,900,700,'Sphere').handles.filter(h=>h.kind==='radius');assert.equal(handles.length,1)
 const h=handles[0];assert.ok(Math.abs(Math.hypot(...p.sub(h.world,scene.solids[0].frame.origin))-scene.solids[0].parameters.radius)<1e-8)
 const start={x:h.x,y:h.y,width:900,height:700,pointerId:1,button:0,altKey:false},at=factor=>{const v=q.screen(q.view(p.add(h.world,p.scale(h.direction,h.length*(factor-1)))));return{...start,x:v[0]+h.x-h.screen[0],y:v[1]+h.y-h.screen[1]}},end=at(1.25)
 let doc=scene,commits=0;const history=m.createGeometryHistory3D(scene,next=>doc=next),i=a.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:next=>{commits++;return history.commit(next)},notify:()=>{}});i.select('Sphere')
 i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.deepEqual(i.snapshot().draft.points,scene.points);assert.equal(commits,0);i.cancel();assert.deepEqual(doc,scene)
 i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.equal(commits,0)
 i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
 i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,0)
 i.pointer('down',start);i.pointer('move',at(-1));assert.equal(i.snapshot().draft,null);i.pointer('up',at(-1));assert.equal(commits,0)
 i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1)
 const after=structuredClone(doc);assert.ok(Math.abs(doc.solids[0].parameters.radius/scene.solids[0].parameters.radius-1.25)<1e-8);assert.deepEqual(doc.points,scene.points);assert.deepEqual(doc.solids[0].frame,scene.solids[0].frame);assert.deepEqual(doc.print_camera,scene.print_camera)
 assert.ok(history.provider.undo());assert.deepEqual(doc,scene);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());assert.deepEqual(doc,after);fixtures.push(after);gestures++
 const curve=r.sphereRenderGeometry3D(after.solids[0],camera).curves.find(c=>c.role==='equator');assert.equal(!!curve,equator==='visible');if(curve)for(const v of curve.vertices)assert.ok(Math.abs(Math.hypot(...p.sub(v,solid.frame.origin))-after.solids[0].parameters.radius)<1e-8)
 assert.equal(p.geometrySceneSVG3D(after).includes('data-render-curve="equator"'),equator==='visible');assert.ok(p.geometrySceneSVG3D(after).includes('>Ö₁ α</text>'));assert.deepEqual(s.deleteSolid3D(after,'Sphere').scene.points,after.points)
 for(const value of [0,-1,NaN,Infinity,1e13])assert.equal(s.resizeSphereRadius3D(scene,'Sphere',value),null)
 assert.equal(s.resizeSphereRadius3D(scene,'Sphere',scene.solids[0].parameters.radius),scene)
 assert.equal(scene.points.find(p=>p.id===id).label,'Ö₁ α')
}
const legacy=s.createSphereAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','Legacy').scene;delete legacy.solids[0].parameters.equator;assert.ok(s.resizeSphereRadius3D(legacy,'Legacy',2));assert.equal(s.resizeSphereRadius3D(legacy,'bad',2),null)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} sphere radius fixtures and ${gestures} gestures; planes/projections, fixed center/frame/labels, visible/hidden equator, isolation, invalid previews, cancel/no-op/one-step history, legacy/reload and SVG`)
