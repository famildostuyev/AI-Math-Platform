import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dPerpendicularAuthoring'),math=await load('geometry3dPerpendicular'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring'),solids=await load('geometry3dSolidAuthoring')
const records=[]
for(const kind of ['line','segment','edge'])for(const t of [-.5,.4,1.5]){
 let source=m.emptyGeometryScene3D(),reference
 if(kind==='edge'){
  source=solids.createSolid3D(source,solids.defaultSolid3D('cube','Cube')).scene
  reference={kind:'edge',id:source.edges[0].id}
 }else{
  source=m.transactGeometryScene3D(source,s=>{s.points.push({id:'A',position:[0,0,0],label:'A'},{id:'B',position:[2,0,0],label:'B'});s.linear_objects.push({id:'ref',kind,a:'A',b:'B'})});reference={kind:'linear',id:'ref'}
 }
 const r=math.perpendicularReference3D(source,reference),pa=source.points.find(p=>p.id===r.a).position,pb=source.points.find(p=>p.id===r.b).position,axis=p.unit(p.sub(pb,pa)),normal=p.unit(p.cross(axis,Math.abs(axis[2])<.8?[0,0,1]:[0,1,0])),P=p.add(p.add(pa,p.scale(p.sub(pb,pa),t)),p.scale(normal,2))
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:P,label:'P'}))
 const created=a.createPerpendicular3D(source,'P',reference,'C');assert.ok(created.scene,created.error);let scene=created.scene
 const h=scene.points.find(p=>p.id==='C_H'),foot=math.perpendicularFoot3D(P,pa,pb);assert.deepEqual(h.position,foot.position);assert.ok(Math.abs(foot.t-t)<1e-9);assert.equal(h.label,'H')
 assert.equal(scene.constructions[0].label_visibility,'hidden');assert.equal(scene.constructions[0].marker_visibility,'visible')
 assert.ok(Math.abs(p.dot(p.sub(P,h.position),axis))<1e-9)
 for(const projection of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection,position:[7,6,8],target:[0,0,0]},projected=p.projectScene3D(scene,camera,800,600,true),extensions=projected.lines.filter(l=>l.role==='construction_extension')
  assert.equal(extensions.length,kind==='line'||t>=0&&t<=1?0:1)
  if(extensions.length){const endpoints=[extensions[0].viewA,extensions[0].viewB].map(projected.projection.world);assert.ok(Math.hypot(...p.sub(endpoints[1],h.position))<1e-8);assert.ok(Math.hypot(...p.sub(endpoints[0],t<0?pa:pb))<1e-8)}
  assert.equal(projected.lines.filter(l=>l.role==='right_angle').length,2)
  const outputPoint=projected.points.find(p=>p.id==='C_H');if(outputPoint)assert.equal(outputPoint.label,null)
  const shown=a.editPerpendicularDisplay3D(scene,'C',{label_visibility:'visible',label:'Foot \u03b1'})
  assert.equal(shown.points.find(p=>p.id==='C_H').id,h.id);assert.deepEqual(shown.constructions[0].reference,scene.constructions[0].reference)
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(shown))),shown)
  const shownPoint=p.projectScene3D(shown,camera,800,600,true).points.find(p=>p.id==='C_H');if(shownPoint)assert.equal(shownPoint.label,'Foot \u03b1')
  const svg=p.geometrySceneSVG3D({...scene,print_camera:camera},800,600);assert.ok(svg.includes('data-render-curve="right_angle"'));if(extensions.length)assert.ok(svg.includes('data-construction-extension="true"'))
  const hidden=a.editPerpendicularDisplay3D(scene,'C',{marker_visibility:'hidden',label_visibility:'hidden',label:'H \u03b1'}),output=p.projectScene3D(hidden,camera,800,600,true)
  assert.equal(output.lines.filter(l=>l.role==='right_angle').length,0);assert.ok(!p.geometrySceneSVG3D({...hidden,print_camera:camera}).includes('H \u03b1'));assert.equal(hidden.points.find(p=>p.id==='C_H').label,'H \u03b1')
 }
 const history=m.createGeometryHistory3D(source,()=>{});assert.ok(history.commit(scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),source);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),scene)
 scene=m.transactGeometryScene3D(scene,s=>s.points.find(p=>p.id==='P').position=p.add(P,p.scale(axis,.3)));assert.ok(scene);assert.notDeepEqual(scene.points.find(p=>p.id==='C_H').position,h.position);assert.equal(scene.constructions[0].output_point_id,'C_H')
 if(kind!=='edge'){
  scene=m.transactGeometryScene3D(scene,s=>s.points.find(p=>p.id===r.b).position=p.add(pb,p.scale(normal,.3)));assert.ok(scene)
  const expected=math.perpendicularFoot3D(scene.points.find(p=>p.id==='P').position,scene.points.find(p=>p.id===r.a).position,scene.points.find(p=>p.id===r.b).position)
  assert.deepEqual(scene.points.find(p=>p.id==='C_H').position,expected.position)
  const dependent=m.transactGeometryScene3D(scene,s=>{s.points.push({id:'D',position:[0,0,0],label:null});s.constructions.push({id:'D_mid',kind:'midpoint',a:'P',b:'C_H',output_point_id:'D'})}),detached=m.deleteGeometryTarget3D(dependent,reference.id)
  assert.ok(detached);assert.deepEqual(detached.scene.points,dependent.points);assert.ok(detached.scene.constructions.some(c=>c.id==='D_mid'))
 }
 if(kind==='edge'){const moved=solids.translateSolid3D(scene,'Cube',[.2,.3,.4]);assert.ok(moved);scene=moved;const removed=solids.deleteSolid3D(scene,'Cube');assert.ok(removed);assert.equal(removed.scene.constructions.length,0);assert.deepEqual(removed.scene.points,scene.points)}
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 const deleted=m.deleteGeometryTarget3D(scene,reference.id)
 if(kind!=='edge'){assert.ok(deleted);assert.deepEqual(deleted.scene.points,scene.points);assert.equal(deleted.scene.constructions.length,0);assert.ok(deleted.scene.linear_objects.some(l=>l.id==='C_PH'))}
 const removed=m.deleteGeometryTarget3D(scene,'C_PH');assert.ok(removed);assert.equal(removed.scene.constructions.length,0);assert.deepEqual(removed.scene.points,scene.points)
 const onLine=m.transactGeometryScene3D(source,s=>s.points.find(p=>p.id==='P').position=[...pa]);assert.equal(a.createPerpendicular3D(onLine,'P',reference).scene,null)
 records.push(scene)
}
assert.throws(()=>math.perpendicularFoot3D([0,1,0],[0,0,0],[0,0,0]))
assert.equal(math.perpendicularFoot3D([1e9,1,0],[0,0,0],[1e12,0,0]).position[1],0)
{
 let source=m.transactGeometryScene3D(m.emptyGeometryScene3D(),s=>{s.points.push({id:'A',position:[-2,0,0],label:null},{id:'B',position:[2,0,0],label:null},{id:'P',position:[.7,-2,0],label:'P'});s.linear_objects.push({id:'L',kind:'segment',a:'A',b:'B'})})
 for(const projection of ['orthographic','perspective']){
  const camera={...source.print_camera,projection,position:[0,-7,7]},view=p.createProjection3D(camera,800,600),v=view.screen(view.view([0,0,0])),pointer={pointerId:1,button:0,x:v[0],y:v[1],width:800,height:600,altKey:false};let doc=source,count=0
  const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{count++;doc=s;return true},notify:()=>{}});i.select('P');i.setTool('perpendicular');assert.deepEqual(i.snapshot().pending,['P']);i.cancel();assert.equal(count,0);assert.deepEqual(doc,source)
  i.setTool('perpendicular');i.pointer('down',pointer);i.pointer('up',pointer);assert.equal(count,1);assert.equal(doc.constructions[0].kind,'perpendicular_foot');assert.equal(i.snapshot().tool,'select')
 }
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} perpendicular scenes; interior/exterior line/segment/edge feet, updates, markers/labels/extensions, both projections/SVG, history, deletion, on-line rejection and reload`)
