import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dParallelAuthoring'),math=await load('geometry3dParallel'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring'),solids=await load('geometry3dSolidAuthoring')
const records=[]
for(const referenceKind of ['line','ray','segment','edge'])for(const output_kind of ['line','ray','segment'])for(const direction of ['forward','reverse']){
 let source=m.emptyGeometryScene3D(),reference
 if(referenceKind==='edge'){source=solids.createSolid3D(source,solids.defaultSolid3D('cube','Cube')).scene;reference={kind:'edge',id:source.edges[0].id}}
 else{source=m.transactGeometryScene3D(source,s=>{s.points.push({id:'A',position:[-1,0,0],label:'A'},{id:'B',position:[2,1,.3],label:'B'});s.linear_objects.push({id:'Ref',kind:referenceKind,a:'A',b:'B'})});reference={kind:'linear',id:'Ref'}}
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[.3,-2,3],label:'P'}))
 const created=a.createParallel3D(source,'P',reference,'C');assert.ok(created.scene,created.error);assert.equal(created.scene.linear_objects.find(l=>l.id==='C_object').kind,'line')
 let scene=a.editParallel3D(created.scene,'C',{output_kind,direction,length:3.7});assert.ok(scene)
 const ids=structuredClone(scene.constructions[0]),r=math.parallelReference3D(scene,reference),point=(s,id)=>s.points.find(p=>p.id===id).position,verify=s=>{
  const expected=math.parallelGeometry3D(point(s,'P'),point(s,r.a),point(s,r.b),output_kind,direction,3.7)
  assert.deepEqual(point(s,'C_end'),expected.position);const delta=p.sub(point(s,'C_end'),point(s,'P')),axis=p.sub(point(s,r.b),point(s,r.a));assert.ok(Math.hypot(...p.cross(delta,axis))<1e-8)
  assert.ok(Math.abs(Math.hypot(...delta)-(output_kind==='segment'?3.7:1))<1e-8);assert.equal(Math.sign(p.dot(delta,axis)),direction==='forward'?1:-1)
 };verify(scene)
 assert.ok(!p.scenePrimitives3D(scene).primitives.some(p=>p.id==='C_end'))
 for(const projection of ['orthographic','perspective']){const rendered={...scene,print_camera:{...scene.print_camera,projection,position:[8,7,9]}},svg=p.geometrySceneSVG3D(rendered,800,600);assert.ok(svg.includes('data-id="C_object"'));assert.ok(!svg.includes('data-id="C_end"'))}
 scene=m.transactGeometryScene3D(scene,s=>s.points.find(p=>p.id==='P').position=[2,-1,2]);assert.ok(scene);verify(scene)
 if(referenceKind==='edge'){scene=solids.rotateSolid3D(scene,'Cube',[1,2,3],.3);assert.ok(scene);verify(scene)}
 else{scene=m.transactGeometryScene3D(scene,s=>s.points.find(p=>p.id==='B').position=[2,-1,1]);assert.ok(scene);verify(scene)}
 assert.deepEqual(scene.constructions[0],ids)
 for(const length of [0,-1,NaN,Infinity,1e13])assert.equal(a.editParallel3D(scene,'C',{length}),null)
 const history=m.createGeometryHistory3D(source,()=>{});assert.ok(history.commit(scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),source);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),scene)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 if(referenceKind!=='edge'){
  const before=JSON.stringify(scene),degenerate=m.transactGeometryScene3D(scene,s=>s.points.find(p=>p.id==='B').position=[...point(scene,'A')]);assert.equal(degenerate,null);assert.equal(JSON.stringify(scene),before)
 }
 const dependent=m.transactGeometryScene3D(scene,s=>{s.points.push({id:'Q',position:[0,0,0],label:null});s.constructions.push({id:'Q_mid',kind:'midpoint',a:'P',b:'C_end',output_point_id:'Q'})})
 const detached=referenceKind==='edge'?solids.deleteSolid3D(dependent,'Cube'):m.deleteGeometryTarget3D(dependent,reference.id)
 assert.ok(detached);assert.deepEqual(detached.scene.points,dependent.points);assert.ok(detached.scene.linear_objects.some(l=>l.id==='C_object'));assert.equal(detached.scene.constructions.filter(c=>c.kind==='parallel').length,0);assert.ok(detached.scene.constructions.some(c=>c.id==='Q_mid'))
 const removed=m.deleteGeometryTarget3D(scene,'C_object');assert.ok(removed);assert.deepEqual(removed.scene.points,scene.points);assert.equal(removed.scene.constructions.length,0)
 const coincidentSource=m.transactGeometryScene3D(source,s=>s.points.find(p=>p.id==='P').position=[...point(source,r.a)]),coincident=a.createParallel3D(coincidentSource,'P',reference,'Coincident');assert.ok(coincident.scene);assert.equal(coincident.coincident,true)
 records.push(scene)
}
for(const referenceKind of ['line','ray','segment'])for(const projection of ['orthographic','perspective']){
 const source=m.transactGeometryScene3D(m.emptyGeometryScene3D(),s=>{s.points.push({id:'A',position:[-2,0,0],label:null},{id:'B',position:[2,0,0],label:null},{id:'P',position:[1,-2,0],label:'P'});s.linear_objects.push({id:'Ref',kind:referenceKind,a:'A',b:'B'})}),camera={...source.print_camera,projection,position:[0,-7,7]},view=p.createProjection3D(camera,800,600),pointer=world=>{const q=view.screen(view.view(world));return{x:q[0],y:q[1],width:800,height:600,pointerId:1,button:0,altKey:false}}
 let doc=source,count=0;const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{doc=s;count++;return true},notify:()=>{}})
 i.setTool('parallel');i.pointer('down',pointer([1,-2,0]));i.pointer('up',pointer([1,-2,0]));assert.deepEqual(i.snapshot().pending,['P']);i.cancel();assert.equal(count,0);assert.deepEqual(doc,source)
 i.select('P');i.setTool('parallel');i.pointer('down',pointer([0,0,0]));i.pointer('up',pointer([0,0,0]));assert.equal(count,1);assert.equal(doc.constructions[0].kind,'parallel');assert.equal(i.snapshot().tool,'select')
}
assert.throws(()=>math.parallelGeometry3D([0,1,0],[0,0,0],[0,0,0],'line','forward',2))
{
 let source=m.transactGeometryScene3D(m.emptyGeometryScene3D(),s=>{s.points.push({id:'A',position:[-1,0,0],label:null},{id:'B',position:[1,0,0],label:null},{id:'P',position:[0,2,0],label:null});s.linear_objects.push({id:'L',kind:'line',a:'A',b:'B'})})
 source=a.createParallel3D(source,'P',{kind:'linear',id:'L'},'C').scene
 source=m.transactGeometryScene3D(source,s=>{s.points.push({id:'Q',position:[0,0,0],label:null});s.constructions.push({id:'Q_on',kind:'point_on_linear',linear_id:'C_object',t:2,output_point_id:'Q'})})
 assert.ok(source);const before=JSON.stringify(source);assert.equal(a.editParallel3D(source,'C',{output_kind:'segment'}),null);assert.equal(JSON.stringify(source),before)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} parallel scenes; line/ray/segment and all references, reversal/length, parents/coincidence, hidden helpers, history/cancel/deletion/reload/SVG; six interaction cases`)
