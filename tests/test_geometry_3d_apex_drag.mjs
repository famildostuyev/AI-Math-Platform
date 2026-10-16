import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const close=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-8,`${a} ~= ${b}`)
for(const legacy of [false,true])for(const height of legacy?[2]:[2,-2])for(const angles of [[0,0,0],[25,30,10]]){
  const def=a.defaultSolid3D('pyramid','pyramid');def.frame=a.solidFrame3D([.1,.2,.3],angles)
  if(legacy)def.parameters={sides:4,radius:2,height};else def.parameters.height=height
  const source=a.createSolid3D(m.emptyGeometryScene3D(),def).scene,id='pyramid_v_4',info=a.pyramidApexDrag3D(source,id)
  assert.ok(info);assert.equal(a.pyramidApexDrag3D(source,'pyramid_v_0'),null)
  const delta=p.scale(p.unit(p.cross(info.normal,[1,.3,.2])),.5),end=p.add(info.position,delta)
  const edited=a.movePyramidApexParallel3D(source,id,end);assert.ok(edited)
  close(edited.points.find(p=>p.id===id).position,end)
  assert.equal(edited.solids[0].parameters.height,height)
  assert.deepEqual(edited.points.filter(p=>p.id!==id),source.points.filter(p=>p.id!==id))
  for(const key of ['edges','faces'])assert.deepEqual(edited[key],source[key])
  assert.deepEqual(edited.solids[0].features,source.solids[0].features)
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(edited))),edited)
  assert.equal(a.movePyramidApexParallel3D(source,id,[NaN,0,0]),null)
  for(const projection of ['orthographic','perspective']){
    const camera={...source.print_camera,projection},project=p.createProjection3D(camera,800,600)
    const pointer=pos=>{const [x,y]=project.screen(project.view(pos));return {x,y,width:800,height:600,pointerId:1,button:0,altKey:false}}
    close(g.planePoint3D(camera,pointer(end),info.normal,info.position),end)
    let document=source,commits=0;const history=m.createGeometryHistory3D(source,next=>document=next)
    const interaction=g.createAuthoringInteraction3D({getScene:()=>document,getCamera:()=>camera,commit:next=>{commits++;return history.commit(next)},notify:()=>{}})
    interaction.setPlane('YZ') // The solid's actual base plane overrides the toolbar working plane.
    const start=pointer(info.position),finish=pointer(end)
    assert.ok(interaction.pointer('down',start));assert.equal(interaction.snapshot().selected,id)
    assert.ok(interaction.snapshot().dragging)
    for(let i=1;i<=8;i++)interaction.pointer('move',pointer(p.add(info.position,p.scale(delta,i/8))))
    assert.equal(commits,0);assert.deepEqual(document,source);assert.ok(interaction.snapshot().draft)
    close(interaction.snapshot().draft.points.find(p=>p.id===id).position,end)
    interaction.pointer('cancel',finish);assert.equal(interaction.snapshot().draft,null);assert.equal(commits,0)
    interaction.pointer('down',start);interaction.pointer('move',finish);interaction.cancel();assert.equal(commits,0);assert.deepEqual(document,source)
    interaction.pointer('down',start);interaction.pointer('move',finish);interaction.pointer('up',finish)
    assert.equal(commits,1);close(document.points.find(p=>p.id===id).position,end)
    const completed=structuredClone(document);assert.ok(history.provider.undo());assert.deepEqual(document,source);assert.equal(history.provider.undo(),false)
    assert.ok(history.provider.redo());assert.deepEqual(document,completed)
    interaction.pointer('down',finish);interaction.pointer('up',finish);assert.equal(commits,1,'selection click is not an edit')
    interaction.setTool('camera');assert.equal(interaction.pointer('down',finish),false)
  }
}
// An arbitrary tilted source polygon uses its actual normal, not frame Z or global XY.
let base=m.emptyGeometryScene3D();base.points=[[0,0,0],[3,0,1],[3,3,2],[0,3,1]].map((position,i)=>({id:`b${i}`,position,label:null}));base.faces=[{id:'base',boundary:base.points.map(p=>p.id)}]
const definition=a.defaultSolid3D('pyramid','tilted');definition.parameters={sides:4,height:-3,base:{kind:'face',face_id:'base',point_ids:base.faces[0].boundary},apex_offset:[0,0]}
const source=a.createSolid3D(base,definition).scene,info=a.pyramidApexDrag3D(source,'tilted_v_4')
const end=p.add(info.position,p.scale(p.unit(p.sub(base.points[1].position,base.points[0].position)),.4)),edited=a.movePyramidApexParallel3D(source,'tilted_v_4',end)
close(edited.points.find(p=>p.id==='tilted_v_4').position,end);assert.equal(edited.solids[0].parameters.height,-3)
assert.deepEqual(edited.points.filter(p=>p.id!=='tilted_v_4'),source.points.filter(p=>p.id!=='tilted_v_4'))
// Reject a final move outside the kernel of a concave base rather than committing a partial drag.
base=m.emptyGeometryScene3D();base.points=[[0,0,0],[3,0,0],[3,3,0],[1.5,1.5,0],[0,3,0]].map((position,i)=>({id:`b${i}`,position,label:null}));base.faces=[{id:'base',boundary:base.points.map(p=>p.id)}]
definition.parameters={sides:5,height:2,base:{kind:'face',face_id:'base',point_ids:base.faces[0].boundary},apex_offset:[0,0]}
const concave=a.createSolid3D(base,definition).scene
assert.equal(a.movePyramidApexParallel3D(concave,'tilted_v_5',[20,20,2]),null)
// Owned feature references continue to evaluate against the edited semantic solid.
let attached=structuredClone(source)
attached.points.push({id:'edge_point',position:[0,0,0],label:null})
attached.constructions.push({id:'on_edge',kind:'point_on_edge',edge_id:'tilted_e_4',t:.5,output_point_id:'edge_point'})
attached=m.evaluateGeometryScene3D(attached).scene
const moved=a.movePyramidApexParallel3D(attached,'tilted_v_4',end),edge=moved.edges.find(e=>e.id==='tilted_e_4')
close(moved.points.find(v=>v.id==='edge_point').position,p.scale(p.add(...[edge.start,edge.end].map(id=>moved.points.find(v=>v.id===id).position)),.5))
assert.notDeepEqual(moved.points.find(v=>v.id==='edge_point').position,attached.points.find(v=>v.id==='edge_point').position)
// A press within picking tolerance retains the grab offset instead of snapping the apex to the ray.
const project=p.createProjection3D(source.print_camera,800,600),point=position=>{const [x,y]=project.screen(project.view(position));return {x:x+4,y:y+2,width:800,height:600,pointerId:1,button:0,altKey:false}}
let document=source
const interaction=g.createAuthoringInteraction3D({getScene:()=>document,getCamera:()=>source.print_camera,commit:next=>{document=next;return true},notify:()=>{}})
interaction.pointer('down',point(info.position));interaction.pointer('move',point(end));interaction.pointer('up',point(end))
close(document.points.find(p=>p.id==='tilted_v_4').position,end)
const camera=p.standardView3D(source.print_camera,'front')
assert.equal(g.planePoint3D(camera,{x:400,y:300,width:800,height:600},[0,0,1],[0,0,2]),null,'parallel ray is safely rejected')
console.log('PASS: semantic apex identity, tilted/template/source/legacy bases, both signed heights, perspective/orthographic planes, base/topology invariance, live drafts, cancellation, atomic Undo/Redo, serialization and concave/parallel safety')
