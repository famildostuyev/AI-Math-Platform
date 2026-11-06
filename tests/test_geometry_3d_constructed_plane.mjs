import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dConstructedPlaneAuthoring'),math=await load('geometry3dConstructedPlane'),plane=await load('geometry3dPlaneAuthoring'),pm=await load('geometry3dPlanePerpendicular'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring'),solid=await load('geometry3dSolidAuthoring'),perp=await load('geometry3dPlanePerpendicularAuthoring')
const records=[],near=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8,JSON.stringify({a,b}))
function check(scene){
 const c=scene.constructions.find(c=>c.kind==='constructed_plane'),P=scene.points.find(p=>p.id===c.through.id),ref=pm.planeReference3D(scene,c.reference).frame,beta=pm.planeReference3D(scene,{kind:'plane',id:c.output_plane_id}).frame
 near(beta.origin,P.position);assert.ok(Math.hypot(...p.cross(ref.normal,beta.normal))<1e-8);assert.equal(c.output_point_ids.length,3)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 for(const projection of ['orthographic','perspective']){const camera={...scene.print_camera,projection,position:[7,-8,9]},view=p.projectScene3D(scene,camera,800,600,true);assert.ok(view.faces.some(f=>f.id===c.output_plane_id));assert.ok(!view.points.some(p=>c.output_point_ids.includes(p.id)));assert.ok(p.geometrySceneSVG3D({...scene,print_camera:camera},800,600).includes(`data-id="${c.output_plane_id}"`))}
 records.push(scene)
}
for(const working of ['XY','XZ','YZ'])for(const contained of [false,true]){
 let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],working,'alpha').scene
 const f=pm.planeReference3D(source,{kind:'plane',id:'alpha'}).frame,P=p.add(p.scale(f.x,.4),p.scale(f.normal,contained?0:2))
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:P,label:'P'}))
 const result=a.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},'beta');assert.ok(result.scene,result.error);assert.equal(result.coincident,contained);let scene=result.scene;check(scene)
 const outputs=scene.constructions[0].output_point_ids
 assert.equal(plane.transformPlane3D(scene,'beta',[1,0,0]),null);assert.equal(m.moveGeometryPoint3D(scene,outputs[0],[9,9,9]),null)
 assert.equal(g.editReferences3D(scene,'beta',['P','alpha_x','alpha_y']),null)
 const changed=plane.transformPlane3D(scene,'alpha',[.3,-.2,.1],[1,2,3],.7);assert.ok(changed);check(changed);assert.deepEqual(changed.points.find(p=>p.id==='P').position,P);assert.deepEqual(changed.constructions[0].output_point_ids,outputs)
 const beforeInvalid=structuredClone(scene);assert.equal(m.transactGeometryScene3D(scene,s=>s.points.find(p=>p.id==='alpha_x').position=[...s.points.find(p=>p.id==='alpha_origin').position]),null);assert.deepEqual(scene,beforeInvalid)
 const moved=m.moveGeometryPoint3D(changed,'P',p.add(P,[1,2,3]));assert.ok(moved);check(moved)
 const derivedSource=m.transactGeometryScene3D(scene,s=>{s.points.push({id:'source_A',position:p.add(P,[1,0,0]),label:null},{id:'source_B',position:p.add(P,[-1,0,0]),label:null});s.constructions.push({id:'source_midpoint',kind:'midpoint',a:'source_A',b:'source_B',output_point_id:'P'})});assert.ok(derivedSource)
 const movedAncestor=m.moveGeometryPoint3D(derivedSource,'source_A',p.add(P,[3,2,1]));assert.ok(movedAncestor);near(pm.planeReference3D(movedAncestor,{kind:'plane',id:'beta'}).frame.origin,movedAncestor.points.find(p=>p.id==='P').position)
 for(const shape of ['rectangle','parallelogram','cloud']){const resized=plane.setPlaneShape3D(moved,'beta',shape,.4);assert.ok(resized);const next=plane.resizePlaneDisplay3D(resized,'beta',6,5);assert.ok(next);near(pm.planeReference3D(next,{kind:'plane',id:'beta'}).frame.origin,moved.points.find(p=>p.id==='P').position)}
 // Derived cache edits cannot change authoritative geometry.
 const stale=structuredClone(scene);outputs.forEach((id,i)=>stale.points.find(p=>p.id===id).position=[10+i,11+(i===2?1:0),12]);assert.equal(m.evaluateGeometryScene3D(stale).status,'ok');assert.deepEqual(m.evaluateGeometryScene3D(stale).scene,scene)
 // A downstream plane recipe and a perpendicular consume the complete frame.
 let downstream=m.transactGeometryScene3D(scene,s=>s.points.push({id:'Q',position:p.add(P,p.scale(f.normal,3)),label:'Q'}))
 downstream=a.createParallelPlaneThroughPoint3D(downstream,'Q',{kind:'plane',id:'beta'},'gamma').scene;assert.ok(downstream)
 downstream=perp.createPlanePerpendicular3D(downstream,'Q',{kind:'plane',id:'beta'},'foot').scene;assert.ok(downstream)
 const reordered=structuredClone(downstream);reordered.constructions.reverse();const evaluated=m.evaluateGeometryScene3D(reordered);assert.equal(evaluated.status,'ok');assert.deepEqual(evaluated.scene,downstream)
 const edit=plane.transformPlane3D(downstream,'alpha',[.1,.2,.3],[1,1,0],.2);assert.ok(edit);check(edit)
 const deleted=m.deleteGeometryTarget3D(downstream,'alpha');assert.ok(deleted);assert.deepEqual(deleted.scene.points,downstream.points.filter(p=>!['alpha_origin','alpha_x','alpha_y'].includes(p.id))); assert.ok(!deleted.scene.constructions.some(c=>c.output_plane_id==='beta'));assert.ok(deleted.scene.constructions.some(c=>c.output_plane_id==='gamma'))
 assert.ok(plane.transformPlane3D(deleted.scene,'beta',[.1,0,0]))
 const parentDeleted=g.deletePrimitive3D(scene,'P');assert.ok(parentDeleted);assert.ok(parentDeleted.scene.planes.some(p=>p.id==='beta'));assert.ok(!parentDeleted.scene.constructions.length);outputs.forEach(id=>near(parentDeleted.scene.points.find(p=>p.id===id).position,scene.points.find(p=>p.id===id).position))
 const outputDeleted=m.deleteGeometryTarget3D(downstream,'beta');assert.ok(outputDeleted);assert.ok(!outputDeleted.scene.constructions.length);assert.ok(!outputDeleted.scene.points.some(p=>outputs.includes(p.id)));assert.ok(outputDeleted.scene.planes.some(p=>p.id==='gamma'))
 const history=m.createGeometryHistory3D(source,()=>{});assert.ok(history.commit(scene));assert.ok(history.commit(parentDeleted.scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),source);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),scene)
 for(const mutate of [s=>s.constructions[0].output_point_ids[1]=outputs[0],s=>s.constructions[0].output_plane_id='missing',s=>s.constructions[0].reference.id='beta',s=>s.constructions[0].through.id=outputs[1],s=>s.constructions.push({...s.constructions[0],id:'duplicate'}),s=>s.planes.find(p=>p.id==='beta').point_ids.reverse()]){const bad=structuredClone(scene);mutate(bad);assert.equal(n.normalizeGeometryScene3D(bad),null)}
 assert.equal(a.createParallelPlaneThroughPoint3D(source,'missing',{kind:'plane',id:'alpha'}).scene,null);assert.equal(a.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'missing'}).scene,null)
}
{
 let source=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','cube')).scene
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,3],label:'P'}));const scene=a.createParallelPlaneThroughPoint3D(source,'P',{kind:'face',id:'cube_f_0'},'beta').scene;assert.ok(scene);check(scene)
 const rotated=solid.rotateSolid3D(scene,'cube',[1,2,3],.6);assert.ok(rotated);check(rotated);const removed=solid.deleteSolid3D(rotated,'cube');assert.ok(removed);assert.ok(!removed.scene.constructions.length);assert.deepEqual(removed.scene.points,rotated.points)
}
for(const projection of ['orthographic','perspective']){
 let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,2],label:'P'}))
 const camera={...source.print_camera,projection,position:[5,-7,8]},view=p.createProjection3D(camera,800,600),screen=view.screen(view.view([.7,.4,0])),pointer={pointerId:1,button:0,x:screen[0],y:screen[1],width:800,height:600,altKey:false}
 let doc=source,count=0;const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{doc=s;count++;return true},notify:()=>{}})
 i.select('P');i.setTool('parallel');assert.equal(i.snapshot().parallelOutput,'line');i.setParallelOutput('plane');i.pointer('down',pointer);i.pointer('up',pointer);assert.equal(i.snapshot().planeConstructionPreview,true);assert.equal(i.snapshot().preview.length,5);assert.equal(count,0);assert.deepEqual(doc,source);i.cancel();assert.deepEqual(doc,source)
 i.select('P');i.setTool('parallel');i.pointer('down',pointer);i.pointer('up',pointer);assert.equal(count,0);assert.ok(i.finish());assert.equal(count,1);assert.equal(doc.constructions[0].kind,'constructed_plane');assert.equal(i.snapshot().selected,doc.planes.find(p=>p.id!=='alpha').id)
}
{
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=plane.transformPlane3D(scene,'alpha',[0,0,0],[0,0,1],.37)
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[1e12-10,1e12-10,1e12-10],label:null}));assert.ok(scene)
 const before=structuredClone(scene),result=a.createParallelPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},'beta');assert.equal(result.scene,null);assert.match(result.error,/represented reliably/);assert.deepEqual(scene,before)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} constructed-plane parity scenes; atomic multi-output dependencies, invalid ownership/cycles, transforms, freeze/delete, preview/confirm/cancel, history, contours and SVG/reload`)
