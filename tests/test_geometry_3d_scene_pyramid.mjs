import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dAuthoring'),s=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel')
const {createProjection3D,sub,dot}=await loadGeometryModule('geometry3dProjection')
const {normalizeGeometryScene3D}=await loadGeometryModule('geometry3d')
let count=0
for(const plane of ['XY','XZ','YZ','tilted'])for(const reverse of [false,true])for(const projection of ['orthographic','perspective']){
  const world=([x,y])=>plane==='XY'?[x,y,0]:plane==='XZ'?[x,0,y]:plane==='YZ'?[0,x,y]:[x,y*.8,y*.6+1]
  let vertices=[[-2,-2],[2,-2],[2,2],[-2,2]].map((p,i)=>({id:`base_${i}`,position:world(p)}));if(reverse)vertices.reverse()
  let scene=a.createPlanarPath3D(m.emptyGeometryScene3D(),vertices,true,'source').scene
  // External attachment intentionally exercises the safe face-based fallback path.
  scene.annotations.push({id:'source_note',content:'Base',format:'text',anchor:{kind:'face',face_id:'source',uv:[0,0]},offset_mm:[0,0]})
  const before=structuredClone(scene),camera={...scene.print_camera,projection},proj=createProjection3D(camera,800,600),[x,y]=proj.screen(proj.view(world([0,0])))
  const p={x,y,width:800,height:600,button:0,pointerId:1,altKey:false}
  assert.equal(a.pickGeometry3D(scene,camera,p,false,undefined,true).id,'source')
  let commits=0;const history=m.createGeometryHistory3D(scene,next=>scene=next)
  const interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:next=>{commits++;return history.commit(next)},notify:()=>{}})
  interaction.setTool('pyramid');interaction.pointer('down',p);assert.equal(scene.solids.length,0)
  interaction.pointer('up',p);assert.equal(commits,1);assert.equal(scene.solids.length,1);assert.equal(interaction.snapshot().tool,'select')
  const solid=scene.solids[0],base=solid.parameters.base,ids=vertices.map(v=>v.id)
  assert.deepEqual(base,{kind:'face',face_id:'source',point_ids:ids});assert.equal(solid.parameters.height,2)
  for(const point of before.points)assert.deepEqual(scene.points.find(p=>p.id===point.id),point)
  assert.deepEqual(scene.faces.find(f=>f.id==='source'),before.faces[0])
  const apex=solid.features.find(f=>f.slot==='v_4').entity_id,drag=s.pyramidApexDrag3D(scene,apex)
  const center=vertices.reduce((out,v)=>out.map((x,i)=>x+v.position[i]/4),[0,0,0])
  assert.ok(Math.abs(dot(sub(drag.position,center),drag.normal)-2)<1e-9)
  assert.deepEqual(normalizeGeometryScene3D(JSON.parse(JSON.stringify(scene))),scene)
  const saved=structuredClone(scene);assert.ok(history.provider.undo());assert.deepEqual(scene,before);assert.ok(history.provider.redo());assert.deepEqual(scene,saved)
  const horizontal=s.movePyramidApexParallel3D(scene,apex,drag.position.map((v,i)=>v+sub(vertices[1].position,vertices[0].position)[i]*.05));assert.ok(horizontal)
  const height=s.changePyramidHeight3D(horizontal,apex,.5);assert.ok(height);assert.equal(height.solids[0].parameters.height,2.5)
  const baseId=solid.features.find(f=>f.slot==='v_1').entity_id,d=s.pyramidBaseDrag3D(height,baseId),position=d.position.map((v,i)=>v+(d.base[0][i]-v)*.1)
  const edited=s.movePyramidBaseVertex3D(height,baseId,position);assert.ok(edited);assert.equal(edited.solids[0].parameters.base.kind,'polygon');assert.deepEqual(edited.solids[0].features,solid.features)
  for(const point of before.points)assert.deepEqual(edited.points.find(p=>p.id===point.id),point)
  assert.deepEqual(edited.faces.find(f=>f.id==='source'),before.faces[0])
  interaction.setTool('pyramid');const miss={...p,x:-1000,y:-1000};interaction.pointer('down',miss);interaction.pointer('up',miss);assert.deepEqual(scene,saved);assert.equal(commits,1)
  interaction.pointer('down',p);interaction.pointer('cancel',p);assert.deepEqual(scene,saved)
  assert.equal(s.createPyramidOnFace3D(scene,'missing'),null)
  const invalid=structuredClone(before);invalid.faces[0].boundary=[ids[0],ids[2],ids[1],ids[3]];assert.equal(s.createPyramidOnFace3D(invalid,'source'),null)
  count++
}
assert.ok(s.createSolid3D(m.emptyGeometryScene3D(),s.defaultSolid3D('pyramid','legacy_template')),'legacy template API stays reusable')
console.log(`PASS: ${count} scene-pyramid cases: face picking, winding/tilted planes/both projections, ordered references, source invariance, default signed height, atomic history/serialization, M5 apex/height/base detachment, miss/cancel/invalid and template compatibility`)
