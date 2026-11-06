import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dPlanePerpendicularAuthoring'),math=await load('geometry3dPlanePerpendicular'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),solid=await load('geometry3dSolidAuthoring'),plane=await load('geometry3dPlaneAuthoring'),display=await load('geometry3dPerpendicularAuthoring'),g=await load('geometry3dAuthoring')
const records=[]
const close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8,JSON.stringify({a,b}))
function check(scene,id){
 const c=scene.constructions.find(c=>c.id===id),point=id=>scene.points.find(p=>p.id===id).position,r=math.planeReference3D(scene,c.reference)
 close(point(c.output_point_id),math.planePerpendicularFoot3D(point(c.source_point_id),r.positions).position)
 assert.equal(c.label_visibility,'hidden');assert.equal(c.marker_visibility,'visible')
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 for(const projection of ['orthographic','perspective']){
  const target=point(c.output_point_id),camera={...scene.print_camera,projection,position:p.add(target,[8,-9,7]),target,vertical_span:20},view=p.projectScene3D(scene,camera,800,600,true)
  assert.equal(view.lines.filter(l=>l.id===id&&l.role==='right_angle').length,2)
  assert.equal(view.lines.filter(l=>l.role==='construction_extension').length,0)
  const H=view.points.find(p=>p.id===c.output_point_id);if(H)assert.equal(H.label,null)
  assert.match(p.geometrySceneSVG3D({...scene,print_camera:camera},800,600),/data-render-curve="right_angle"/)
 }
 const shown=display.editPerpendicularDisplay3D(scene,id,{label_visibility:'visible',label:'H α',marker_visibility:'hidden'})
 assert.ok(shown);assert.equal(shown.points.find(p=>p.id===c.output_point_id).label,'H α');assert.equal(shown.constructions.find(c=>c.id===id).marker_visibility,'hidden')
 const history=m.createGeometryHistory3D(scene,()=>{});assert.equal(history.commit(scene),false);assert.ok(history.commit(shown));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),shown)
 records.push(scene)
}
for(const working of ['XY','XZ','YZ'])for(const outside of [false,true]){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[1,2,3],working,'plane').scene
 const ref={kind:'plane',id:'plane'},r=math.planeReference3D(scene,ref),P=p.add(p.add(r.frame.origin,p.scale(r.frame.x,outside?8:.3)),p.scale(r.frame.normal,2))
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:P,label:'P'}));const source=scene
 const result=a.createPlanePerpendicular3D(scene,'P',ref,'C');assert.ok(result.scene,result.error);scene=result.scene;check(scene,'C')
 const movedSource=m.moveGeometryPoint3D(scene,'P',p.add(P,p.scale(r.frame.x,.4)));assert.ok(movedSource)
 close(movedSource.points.find(p=>p.id==='C_H').position,p.add(scene.points.find(p=>p.id==='C_H').position,p.scale(r.frame.x,.4)))
 close(scene.points.find(p=>p.id==='C_H').position,p.add(r.frame.origin,p.scale(r.frame.x,outside?8:.3)))
 const moved=plane.transformPlane3D(scene,'plane',p.scale(r.frame.normal,.5));assert.ok(moved);check(moved,'C')
 const dependent=m.transactGeometryScene3D(moved,s=>{s.points.push({id:'D',position:[0,0,0],label:null});s.constructions.push({id:'mid',kind:'midpoint',a:'P',b:'C_H',output_point_id:'D'})})
 const deleted=m.deleteGeometryTarget3D(dependent,'plane');assert.ok(deleted);assert.deepEqual(deleted.scene.points,dependent.points.filter(p=>!['plane_origin','plane_x','plane_y'].includes(p.id))); assert.equal(deleted.scene.constructions.length,1)
 const history=m.createGeometryHistory3D(dependent,()=>{});assert.ok(history.commit(deleted.scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),dependent);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),deleted.scene)
 const segmentDeleted=m.deleteGeometryTarget3D(scene,'C_PH');assert.ok(segmentDeleted);assert.equal(segmentDeleted.scene.constructions.length,0)
 const on=m.transactGeometryScene3D(source,s=>s.points.find(p=>p.id==='P').position=[...r.frame.origin]);assert.equal(a.createPlanePerpendicular3D(on,'P',ref).scene,null)
 const before=structuredClone(on);assert.equal(a.createPlanePerpendicular3D(on,'P',ref).scene,null);assert.deepEqual(on,before)
 assert.equal(m.transactGeometryScene3D(scene,s=>s.planes[0].point_ids[0]='C_H'),null)
 assert.equal(a.createPlanePerpendicular3D(source,'P',{kind:'plane',id:'missing'}).scene,null)
}
for(const outside of [false,true]){
 let scene=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','cube')).scene
 const ref={kind:'face',id:'cube_f_0'},r=math.planeReference3D(scene,ref),position=p.add(p.add(r.frame.origin,p.scale(r.frame.x,outside?7:.3)),p.scale(r.frame.normal,3))
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position,label:null}));scene=a.createPlanePerpendicular3D(scene,'P',ref,'C').scene;assert.ok(scene);check(scene,'C')
 const moved=solid.translateSolid3D(scene,'cube',[1,2,.2]);assert.ok(moved);check(moved,'C');const removed=solid.deleteSolid3D(moved,'cube');assert.ok(removed);assert.deepEqual(removed.scene.points,moved.points);assert.equal(removed.scene.constructions.length,0)
}
for(const regular of [false,true]){
 const spec=regular?solid.defaultRegularPyramid3D('pyramid'):solid.defaultSolid3D('pyramid','pyramid');if(!regular)spec.parameters.apex_offset=[5,2]
 let source=solid.createSolid3D(m.emptyGeometryScene3D(),spec).scene
 const owner=source.solids[0],apex=owner.features.find(f=>f.slot===`v_${source.faces.find(f=>f.id==='pyramid_f_0').boundary.length}`).entity_id
 const result=a.createPyramidAltitude3D(source,apex,'pyramid_f_0','C');assert.ok(result.scene,result.error);let scene=result.scene;check(scene,'C');assert.equal(scene.constructions[0].pyramid_id,'pyramid')
 const ordinary=a.createPlanePerpendicular3D(source,apex,{kind:'face',id:'pyramid_f_0'},'ordinary');assert.equal(ordinary.scene.constructions[0].kind,'perpendicular_foot')
 assert.equal(a.createPyramidAltitude3D(source,source.faces[0].boundary[0],'pyramid_f_0').scene,null);assert.equal(a.createPyramidAltitude3D(source,apex,'pyramid_f_1').scene,null)
 for(const fn of [x=>solid.translateSolid3D(x,'pyramid',[1,2,3]),x=>solid.rotateSolid3D(x,'pyramid',[1,2,3],.3),x=>solid.scaleSolid3D(x,'pyramid',1.3),x=>solid.editSolid3D(x,{...x.solids[0],parameters:{...x.solids[0].parameters,height:4}})]){const changed=fn(scene);assert.ok(changed);check(changed,'C')}
 const dependent=m.transactGeometryScene3D(scene,s=>{s.points.push({id:'D',position:[0,0,0],label:null});s.constructions.push({id:'mid',kind:'midpoint',a:apex,b:'C_H',output_point_id:'D'})})
 const removed=solid.deleteSolid3D(dependent,'pyramid');assert.ok(removed);assert.deepEqual(removed.scene.points,dependent.points);assert.equal(removed.scene.constructions.length,1)
}
// Guided selection uses actual projected plane/face hits; cancellation is atomic.
for(const tool of ['perpendicular','altitude','face'])for(const projection of ['orthographic','perspective']){
 let source,sourceId,target
 if(tool==='perpendicular'){
  source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','plane').scene
  source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,2],label:null}));sourceId='P';target=[.6,.4,0]
 }else if(tool==='altitude'){
  source=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultRegularPyramid3D('pyramid')).scene;sourceId=source.solids[0].features.find(f=>f.slot==='v_3').entity_id;target=[.2,.2,0]
 }else{
  source=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','cube')).scene
  source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,-3],label:null}));sourceId='P';target=[.2,.2,0]
 }
 if(tool==='altitude')target=source.points.find(p=>p.id===sourceId).position
 const camera={...source.print_camera,projection,position:tool==='altitude'?[4,3,5]:[2,-3,-8],target:[0,0,0]},view=p.createProjection3D(camera,800,600),screen=view.screen(view.view(target)),pointer={pointerId:1,button:0,x:screen[0],y:screen[1],width:800,height:600,altKey:false}
 let doc=source,count=0;const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{doc=s;count++;return true},notify:()=>{}})
 i.select(sourceId);i.setTool(tool==='face'?'perpendicular':tool);i.cancel();assert.equal(count,0);assert.deepEqual(doc,source);i.setTool(tool==='face'?'perpendicular':tool);i.pointer('down',pointer);i.pointer('up',pointer)
 assert.equal(count,1,JSON.stringify(i.snapshot()));assert.equal(doc.constructions[0].kind,tool==='altitude'?'pyramid_altitude':'perpendicular_foot')
}
for(const [point,vertices] of [[[0,0,0],[[0,0,0],[1,0,0],[0,1,0]]],[[0,0,1],[[0,0,0],[0,0,0],[0,1,0]]],[[NaN,0,1],[[0,0,0],[1,0,0],[0,1,0]]]])assert.throws(()=>math.planePerpendicularFoot3D(point,vertices))
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} plane/face/altitude parity scenes; projections, exterior feet, dependencies, transforms, labels/markers, history, deletion, guided creation and cancellation`)
