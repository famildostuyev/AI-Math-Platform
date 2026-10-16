import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),normalize=await loadGeometryModule('geometry3d')
const close=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8,`${a} ~= ${b}`)
for(const projection of ['orthographic','perspective'])for(const height of [2,-2])for(const tilted of [false,true]){
  const definition=a.defaultSolid3D('pyramid','py');definition.parameters.height=height;definition.parameters.apex_offset=[.4,-.2]
  definition.frame=a.solidFrame3D([0,0,0],tilted?[25,30,10]:[0,0,0])
  const source=a.createSolid3D(m.emptyGeometryScene3D(),definition).scene,id='py_v_4',info=a.pyramidApexDrag3D(source,id),camera={...source.print_camera,projection}
  const project=p.createProjection3D(camera,800,600),pointer=position=>{const [x,y]=project.screen(project.view(position));return {x:x+3,y:y+2,width:800,height:600,pointerId:1,button:0,altKey:false,shiftKey:true}}
  const start=pointer(info.position),end=pointer(p.add(info.position,p.scale(info.normal,.7))),mapping=g.apexHeightMapping3D(camera,start,info.position,info.normal,height)
  assert.ok(mapping);assert.ok(Math.abs(mapping(start))===0);assert.ok(Math.abs(mapping(end)-.7)<1e-8)
  let document=source,commits=0;const history=m.createGeometryHistory3D(source,next=>document=next)
  const interaction=g.createAuthoringInteraction3D({getScene:()=>document,getCamera:()=>camera,commit:next=>{commits++;return history.commit(next)},notify:()=>{}})
  interaction.setPlane('YZ');interaction.pointer('down',start)
  for(let i=1;i<=8;i++)interaction.pointer('move',{...pointer(p.add(info.position,p.scale(info.normal,.7*i/8))),shiftKey:false})
  const draft=interaction.snapshot().draft;assert.ok(draft);assert.equal(commits,0);assert.deepEqual(document,source)
  close(draft.points.find(p=>p.id===id).position,p.add(info.position,p.scale(info.normal,.7)))
  assert.deepEqual(draft.solids[0].parameters.apex_offset,definition.parameters.apex_offset)
  assert.deepEqual(draft.points.filter(p=>p.id!==id),source.points.filter(p=>p.id!==id))
  for(const key of ['edges','faces'])assert.deepEqual(draft[key],source[key])
  assert.deepEqual(draft.solids[0].features,source.solids[0].features)
  interaction.pointer('cancel',end);assert.equal(commits,0);assert.equal(interaction.snapshot().draft,null)
  interaction.pointer('down',start);interaction.pointer('move',end);interaction.cancel();assert.deepEqual(document,source)
  interaction.pointer('down',start);interaction.pointer('move',end);interaction.pointer('up',end);assert.equal(commits,1)
  const complete=structuredClone(document);assert.ok(history.provider.undo());assert.deepEqual(document,source);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());assert.deepEqual(document,complete)
  assert.deepEqual(normalize.normalizeGeometryScene3D(JSON.parse(normalize.serializeGeometryScene3D(complete))),complete)
  for(const delta of [-height,-2*height,NaN,Infinity,1e13])assert.equal(a.changePyramidHeight3D(source,id,delta),null,'degenerate/flip/nonfinite/overflow rejected')
  // A normal drag remains horizontal even when Shift is pressed after pointerdown.
  document=source;interaction.cancel();interaction.pointer('down',{...start,shiftKey:false})
  interaction.pointer('move',{...end,shiftKey:true});interaction.pointer('up',end)
  assert.equal(document.solids[0].parameters.height,height)
}
let base=m.emptyGeometryScene3D();base.points=[[0,0,0],[3,0,1],[3,3,2],[0,3,1]].map((position,i)=>({id:`b${i}`,position,label:null}));base.faces=[{id:'base',boundary:base.points.map(p=>p.id)}]
const def=a.defaultSolid3D('pyramid','source');def.parameters={sides:4,height:2,base:{kind:'face',face_id:'base',point_ids:base.faces[0].boundary},apex_offset:[.3,.2]}
const scene=a.createSolid3D(base,def).scene,info=a.pyramidApexDrag3D(scene,'source_v_4'),edited=a.changePyramidHeight3D(scene,'source_v_4',1)
close(edited.points.find(p=>p.id==='source_v_4').position,p.add(info.position,info.normal));assert.deepEqual(edited.solids[0].parameters.apex_offset,[.3,.2])
const legacy=a.defaultSolid3D('pyramid','legacy');legacy.parameters={sides:4,radius:2,height:2}
const legacyScene=a.createSolid3D(m.emptyGeometryScene3D(),legacy).scene
assert.deepEqual(a.changePyramidHeight3D(legacyScene,'legacy_v_4',1).solids[0].parameters,{sides:4,radius:2,height:3})
const top=p.standardView3D(scene.print_camera,'top')
assert.equal(g.apexHeightMapping3D(top,{x:400,y:300,width:800,height:600},[0,0,2],[0,0,1],2),null,'edge-on height direction rejected')
console.log('PASS: fixed Shift mode, exact perspective/orthographic normal mapping, tilted/source/legacy bases, signed height/offset invariants, stable topology, live preview, cancellations, single Undo/Redo, serialization and zero-projection/degenerate/flip safety')
