import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const author=await loadGeometryModule('geometry3dAuthoring')
const {emptyGeometryScene3D,createGeometryHistory3D}=await loadGeometryModule('geometry3dModel')
const {createProjection3D,standardView3D}=await loadGeometryModule('geometry3dProjection')
const {normalizeGeometryScene3D,serializeGeometryScene3D}=await loadGeometryModule('geometry3d')
const canonical=JSON.parse(await fs.readFile(new URL('./geometry_3d_m3_canonical.json',import.meta.url),'utf8'))
assert.deepEqual(normalizeGeometryScene3D(canonical),canonical,'shared M3 backend/frontend canonical fixture')
assert.deepEqual(JSON.parse(serializeGeometryScene3D(canonical)),canonical)
let scene=emptyGeometryScene3D()
for(const [id,position] of [['a',[0,0,0]],['b',[3,0,0]],['c',[0,3,0]]])scene=author.createPoint3D(scene,position,id).scene
const before=structuredClone(scene)
assert.equal(author.createPoint3D(scene,[0,0,0],'duplicate').id,'a')
assert.equal(author.createPoint3D(scene,[1e13,0,0]),null)
assert.equal(author.createPoint3D(scene,[1,2,3],'a'),null)
assert.equal(author.createPoint3D(scene,[NaN,0,0]),null)
assert.equal(author.parseCoordinates3D(['1.25','-3','4'])[0],1.25)
for(const values of [['','0','0'],['NaN','0','0'],['Infinity','0','0'],['1e13','0','0']])assert.equal(author.parseCoordinates3D(values),null)
for(const kind of ['line','ray','segment','vector']){
  const result=author.createPrimitive3D(scene,kind,['a','b'],`${kind}_ab`)
  assert.ok(result);assert.equal(result.scene.linear_objects.find(l=>l.id===result.id).kind,kind)
  assert.equal(author.createPrimitive3D(result.scene,kind,['a','b']).reused,true)
  assert.equal(author.createPrimitive3D(result.scene,kind,['b','a']).reused,kind==='line'||kind==='segment')
  assert.equal(author.createPrimitive3D(scene,kind,['a','a']),null)
  assert.equal(author.createPrimitive3D(scene,kind,['a','missing']),null)
}
assert.ok(author.createPrimitive3D(scene,'plane',['a','b','c'],'plane_abc'))
assert.equal(author.createPrimitive3D(scene,'plane',['a','b','b']),null)
const collinear=author.createPoint3D(scene,[4,0,0],'q').scene
assert.equal(author.createPrimitive3D(collinear,'plane',['a','b','q']),null)
assert.deepEqual(scene,before,'authoring does not mutate input')
const unavailable={...scene,solids:[{id:'cube',kind:'cube',mode:'parametric',frame:{origin:[0,0,0],x_axis:[1,0,0],y_axis:[0,1,0]},parameters:{side:1},features:[]}]}
assert.equal(author.createPrimitive3D(unavailable,'segment',['a','b']),null)
assert.equal(author.createPrimitive3D({...scene,schema_version:99},'line',['a','b']),null)
const camera=scene.print_camera,projection=createProjection3D(camera,600,400)
const pointer=position=>{const [x,y]=projection.screen(projection.view(position));return {x,y,width:600,height:400,pointerId:1,button:0,altKey:false}}
for(const [plane,position] of [['XY',[1,2,0]],['XZ',[1,0,2]],['YZ',[0,1,2]]]){
  const result=author.workingPlanePoint3D(camera,pointer(position),plane)
  assert.ok(result);assert.ok(Math.hypot(...result.map((v,i)=>v-position[i]))<1e-9)
}
assert.equal(author.workingPlanePoint3D(standardView3D(camera,'front'),pointer([0,0,0]),'XY'),null)
assert.equal(author.workingPlanePoint3D({...camera,position:[4,3,1e-9]},pointer([0,0,0]),'XY'),null)
const perspective={...camera,projection:'perspective'},pp=createProjection3D(perspective,600,400),pos=[1,2,0],screen=pp.screen(pp.view(pos))
assert.ok(Math.hypot(...author.workingPlanePoint3D(perspective,{...pointer(pos),x:screen[0],y:screen[1]},'XY').map((v,i)=>v-pos[i]))<1e-9)
const overlaps={...scene,points:[...scene.points,{id:'aa',position:[0,0,0],label:null}]}
assert.equal(author.pickGeometry3D(overlaps,camera,pointer([0,0,0])).id,'a')
assert.equal(author.pickGeometry3D({...overlaps,points:[...overlaps.points].reverse()},camera,pointer([0,0,0])).id,'a')
assert.equal(author.pickGeometry3D(scene,camera,{...pointer([0,0,0]),x:-10000}),null)
scene=author.createPrimitive3D(scene,'line',['a','b'],'line_ab').scene
assert.equal(author.pickGeometry3D(scene,camera,pointer([-2,0,0])).id,'line_ab')
assert.equal(author.deletePrimitive3D(scene,'a'),null,'referenced point deletion blocked')
assert.equal(author.editReferences3D(scene,'line_ab',['b','b']),null)
assert.ok(author.editReferences3D(scene,'line_ab',['b','c']))
scene={...scene,points:[...scene.points,{id:'d',position:[1.5,0,0],label:null}],constructions:[{id:'mid',kind:'midpoint',a:'a',b:'b',output_point_id:'d'}]}
assert.equal(author.editPoint3D(scene,'d',[1,2,3],null),null)
assert.equal(author.isFreePoint3D(scene,'d'),false)
assert.equal(author.createPoint3D({...scene,points:scene.points.map(p=>p.id==='d'?{...p,position:[1,0,0]}:p)},[1.5,0,0]).id,'d','reuse evaluated constrained position, not stale cache')
let document=scene,commits=0
const history=createGeometryHistory3D(scene,next=>document=next)
const interaction=author.createAuthoringInteraction3D({getScene:()=>document,getCamera:()=>camera,commit:next=>{const done=history.commit(next);if(done)commits++;return done},notify:()=>{}})
interaction.setTool('segment');interaction.choose('a');assert.equal(commits,0);interaction.cancel();assert.deepEqual(document,scene)
interaction.choose('a');interaction.choose('a');assert.equal(interaction.snapshot().pending.length,1);assert.equal(commits,0)
interaction.choose('b');assert.equal(commits,1);const segmentId=interaction.snapshot().selected
assert.ok(history.provider.undo());assert.ok(!document.linear_objects.some(l=>l.id===segmentId))
assert.ok(history.provider.redo());assert.ok(document.linear_objects.some(l=>l.id===segmentId))
interaction.setTool('select');const start=pointer([0,0,0]),end=pointer([1,0,0])
assert.ok(interaction.pointer('down',start));interaction.pointer('move',end);assert.deepEqual(document.points.find(p=>p.id==='a').position,[0,0,0]);assert.ok(interaction.snapshot().draft)
interaction.pointer('cancel',end);assert.equal(commits,1);assert.deepEqual(document.points.find(p=>p.id==='a').position,[0,0,0])
interaction.pointer('down',start);interaction.pointer('move',end);interaction.pointer('up',end)
assert.equal(commits,2);assert.ok(Math.abs(document.points.find(p=>p.id==='a').position[0]-1)<1e-9)
assert.ok(Math.abs(document.points.find(p=>p.id==='d').position[0]-2)<1e-9,'dependent midpoint updated')
const completed=structuredClone(document)
interaction.pointer('down',pointer([1,0,0]));interaction.pointer('up',pointer([1,0,0]));assert.equal(commits,2,'click/no-op has no history')
interaction.pointer('down',pointer([1,0,0]));interaction.pointer('move',pointer([3,0,0]));interaction.pointer('up',pointer([3,0,0]));assert.deepEqual(document,completed,'degenerate final drag rejected')
interaction.setTool('camera');assert.equal(interaction.pointer('down',start),false)
interaction.setTool('point');interaction.pointer('down',pointer([0,3,0]));interaction.pointer('up',pointer([0,3,0]));assert.equal(commits,2,'existing point reused by pointer')
const constrained={...scene,constructions:[{id:'on_line',kind:'point_on_linear',linear_id:'line_ab',t:2,output_point_id:'d'}],points:scene.points.map(p=>p.id==='d'?{...p,position:[6,0,0]}:p)}
const removed=author.deletePrimitive3D(constrained,'line_ab')
assert.ok(removed);assert.equal(removed.losses[0].subject_id,'d');assert.deepEqual(removed.scene.points.find(p=>p.id==='d').position,[6,0,0]);assert.equal(removed.scene.constructions.length,0)
assert.deepEqual(JSON.parse(JSON.stringify(document)),document,'stable authored scene save/reload')
console.log('PASS: M3 creation/stable IDs/reuse, finite coordinates, three working planes/perspective/parallel rejection, deterministic picking, reference editing, semantic gesture cancellation/atomic dragging/dependencies, safe deletion and history/reload')
