import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dParallelAuthoring'),math=await load('geometry3dParallel'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),plane=await load('geometry3dPlaneAuthoring'),pm=await load('geometry3dPlanePerpendicular'),solid=await load('geometry3dSolidAuthoring'),g=await load('geometry3dAuthoring')
const records=[]
function check(scene){
 const c=scene.constructions.find(c=>c.kind==='parallel'),P=scene.points.find(p=>p.id===c.source_point_id).position,H=scene.points.find(p=>p.id===c.output_point_id).position,f=pm.planeReference3D(scene,c.reference).frame,d=p.sub(H,P)
 assert.ok(Math.abs(p.dot(d,f.normal))<1e-8);assert.ok(Math.hypot(...d)>0);assert.equal(scene.points.find(p=>p.id===c.output_point_id).label,null)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 for(const projection of ['orthographic','perspective']){const camera={...scene.print_camera,projection,position:[7,-8,9]};const out=p.projectScene3D(scene,camera,800,600,true);assert.ok(!out.points.some(p=>p.id===c.output_point_id));assert.ok(p.geometrySceneSVG3D({...scene,print_camera:camera}).includes(`data-id="${c.linear_id}"`))}
 records.push(scene)
}
for(const working of ['XY','XZ','YZ'])for(const contained of [false,true]){
 let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],working,'plane').scene
 const f=pm.planeReference3D(source,{kind:'plane',id:'plane'}).frame,P=p.add(p.scale(f.x,.3),p.scale(f.normal,contained?0:2))
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:P,label:'P'}))
 const result=a.createPlaneParallel3D(source,'P',{kind:'plane',id:'plane',angle_radians:.7},'C');assert.ok(result.scene,result.error);assert.equal(result.coincident,contained);let scene=result.scene;check(scene)
 for(const output_kind of ['line','ray','segment'])for(const direction of ['forward','reverse']){const next=a.editParallel3D(scene,'C',{output_kind,direction,length:3.2});assert.ok(next);check(next);if(output_kind==='segment')assert.ok(Math.abs(Math.hypot(...p.sub(next.points.find(p=>p.id==='C_end').position,P))-3.2)<1e-8)}
 const rotated=plane.transformPlane3D(scene,'plane',[.2,.3,.4],[1,2,3],.8);assert.ok(rotated);check(rotated);assert.deepEqual(rotated.points.find(p=>p.id==='P').position,P)
 const moved=m.moveGeometryPoint3D(rotated,'P',p.add(P,[1,2,3]));assert.ok(moved);check(moved)
 for(const length of [0,-1,NaN,Infinity])assert.equal(a.editParallel3D(scene,'C',{length}),null)
 const detached=m.deleteGeometryTarget3D(scene,'plane');assert.ok(detached);assert.deepEqual(detached.scene.points,scene.points.filter(p=>!['plane_origin','plane_x','plane_y'].includes(p.id)));assert.equal(detached.scene.constructions.length,0)
 const removed=m.deleteGeometryTarget3D(scene,'C_object');assert.ok(removed);assert.equal(removed.scene.constructions.length,0)
 const h=m.createGeometryHistory3D(source,()=>{});assert.ok(h.commit(scene));assert.ok(h.provider.undo());assert.deepEqual(h.getScene(),source);assert.ok(h.provider.redo());assert.deepEqual(h.getScene(),scene)
 assert.equal(a.createPlaneParallel3D(source,'P',{kind:'plane',id:'plane',angle_radians:NaN}).scene,null)
}
{
 let scene=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','cube')).scene
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,3],label:null}));scene=a.createPlaneParallel3D(scene,'P',{kind:'face',id:'cube_f_0',angle_radians:1.2},'C').scene;assert.ok(scene);check(scene)
 const rotated=solid.rotateSolid3D(scene,'cube',[1,2,3],.6);assert.ok(rotated);check(rotated);const deleted=solid.deleteSolid3D(rotated,'cube');assert.ok(deleted);assert.deepEqual(deleted.scene.points,rotated.points)
 const owned=a.createPlaneParallel3D(solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','cube')).scene,'cube_v_4',{kind:'face',id:'cube_f_0',angle_radians:.4},'owned');assert.ok(owned.scene);assert.ok(solid.rotateSolid3D(owned.scene,'cube',[1,2,3],.7))
}
// Actual guided pointer workflow, including pointermove.button=-1 and normal capture loss.
for(const projection of ['orthographic','perspective']){
 let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','plane').scene
 source=m.transactGeometryScene3D(source,s=>{s.points.push({id:'P',position:[0,0,2],label:'P'},{id:'A',position:[-2,-1,1],label:null},{id:'B',position:[2,-1,1],label:null},{id:'D',position:[-2,1,0],label:null},{id:'E',position:[-2,1,3],label:null});s.linear_objects.push({id:'valid',kind:'segment',a:'A',b:'B'},{id:'invalid',kind:'segment',a:'D',b:'E'})})
 const camera={...source.print_camera,projection,position:[5,-7,8]},view=p.createProjection3D(camera,800,600),pointer=world=>{const xy=view.screen(view.view(world));return {pointerId:1,button:0,x:xy[0],y:xy[1],width:800,height:600,altKey:false}}
 let doc=source,count=0;const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{doc=s;count++;return true},notify:()=>{}})
 const click=world=>{const q=pointer(world);i.pointer('down',q);i.pointer('up',q)}
 i.select('P');i.setTool('parallel');click([.7,.3,0]);assert.equal(i.snapshot().directionSelection,true);assert.equal(i.finish(),false);assert.equal(count,0)
 click([-2,1,1.5]);assert.equal(i.snapshot().directionChosen,false);assert.match(i.snapshot().message,/parallel/)
 const start=pointer([1,0,2]),end={...pointer([0,1,2]),button:-1};i.pointer('down',start);i.pointer('move',end);i.pointer('up',{...end,button:0});i.pointer('cancel',end);assert.equal(i.snapshot().directionChosen,true);assert.equal(count,0);assert.equal(i.snapshot().preview.length,2)
 assert.equal(i.pointer('wheel',start),false);i.cancel();assert.deepEqual(doc,source);assert.equal(count,0)
 i.select('P');i.setTool('parallel');click([.7,.3,0]);click([0,-1,1]);assert.equal(i.snapshot().directionChosen,true);assert.ok(i.finish());assert.equal(count,1);check(doc)
 const c=doc.constructions[0],d=p.sub(doc.points.find(p=>p.id===c.output_point_id).position,[0,0,2]);assert.ok(Math.abs(d[1])<1e-9&&Math.abs(d[2])<1e-9)
 // Drag direction and explicit confirmation commit exactly once.
 doc=source;count=0;i.select('P');i.setTool('parallel');click([.7,.3,0]);i.pointer('down',start);i.pointer('move',end);i.pointer('up',{...end,button:0});i.pointer('cancel',end);assert.ok(i.finish());assert.equal(count,1);check(doc)
}
for(const projection of ['orthographic','perspective']){
 let doc=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','cube')).scene
 doc=m.transactGeometryScene3D(doc,s=>s.points.push({id:'P',position:[0,0,4],label:'P'}))
 const face=doc.faces.find(f=>f.id==='cube_f_1'),positions=face.boundary.map(id=>doc.points.find(p=>p.id===id).position),center=p.scale(positions.reduce(p.add,[0,0,0]),1/positions.length),camera={...doc.print_camera,projection,position:[5,-7,8]},view=p.createProjection3D(camera,800,600),xy=view.screen(view.view(center)),pointer={pointerId:1,button:0,x:xy[0],y:xy[1],width:800,height:600,altKey:false},before=structuredClone(doc)
 const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:q=>{doc=q;return true},notify:()=>{}});i.select('P');i.setTool('parallel');i.pointer('down',pointer);i.pointer('up',pointer);assert.equal(i.snapshot().directionSelection,true,JSON.stringify(i.snapshot()));i.cancel();assert.deepEqual(doc,before)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} plane-parallel scenes; local frames, contained/distinct, transforms, all outputs, pointer direction/alignment, cancellation, history, deletion and SVG/reload`)
