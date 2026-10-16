import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8,`${a} ~= ${b}`),fixtures=[]
for(const kind of ['cube','cuboid','prism','pyramid'])for(const plane of ['XY','XZ','YZ']){
  const d=a.defaultSolid3D(kind,'A');d.frame=a.solidFrame3D([.1,.2,.3],[25,30,10])
  if(kind==='pyramid')d.parameters={sides:4,height:2,base:{kind:'polygon',vertices:[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]]},apex_offset:[.2,.3]}
  let source=a.createSolid3D(m.emptyGeometryScene3D(),d).scene
  const b=a.defaultSolid3D('pyramid','B');b.frame.origin=[8,0,0];source=a.createSolid3D(source,b).scene
  source=g.createPoint3D(source,[-8,0,0],'free').scene
  const delta=plane==='XY'?[.4,.3,0]:plane==='XZ'?[.4,0,.3]:[0,.4,.3],next=a.translateSolid3D(source,'A',delta)
  assert.ok(next);assert.deepEqual(next.solids[0].parameters,source.solids[0].parameters);assert.deepEqual(next.solids[0].features,source.solids[0].features)
  assert.deepEqual(next.solids[0].frame.x_axis,source.solids[0].frame.x_axis);assert.deepEqual(next.solids[0].frame.y_axis,source.solids[0].frame.y_axis)
  for(const point of source.points)close(next.points.find(v=>v.id===point.id).position,point.id.startsWith('A_')?p.add(point.position,delta):point.position)
  assert.deepEqual(next.edges,source.edges);assert.deepEqual(next.faces,source.faces);assert.deepEqual(next.print_camera,source.print_camera)
  const rotated=a.rotateSolid3D(next,'A',[1,2,3],.4);assert.ok(rotated);assert.deepEqual(rotated.points.filter(v=>!v.id.startsWith('A_')),next.points.filter(v=>!v.id.startsWith('A_')))
  const movedB=a.translateSolid3D(next,'B',[0,1,0]);assert.deepEqual(movedB.points.filter(v=>v.id.startsWith('A_')),next.points.filter(v=>v.id.startsWith('A_')))
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(next))),next)
  for(const projection of ['orthographic','perspective']){
    const camera={...source.print_camera,projection},saved=structuredClone(camera),project=p.createProjection3D(camera,800,600),pivot=a.solidPivot3D(source,'A')
    const pointer=world=>{const v=project.screen(project.view(world));return {x:v[0]+3,y:v[1]+2,width:800,height:600,pointerId:1,button:0,altKey:false}}
    let doc=source,commits=0;const h=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return h.commit(v)},notify:()=>{}})
    i.select('A');i.setPlane(plane);i.setTool('translate_solid');const start=pointer(pivot),end=pointer(p.add(pivot,delta))
    // Grab offset is preserved, with exact ray/plane mapping in either projection.
    const from=g.workingPlanePoint3D(camera,start,plane,pivot),to=g.workingPlanePoint3D(camera,end,plane,pivot),expected=p.sub(to,from)
    i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,0);assert.deepEqual(doc,source)
    for(const point of source.points.filter(v=>v.id.startsWith('A_')))close(i.snapshot().draft.points.find(v=>v.id===point.id).position,p.add(point.position,expected))
    i.cancel();assert.deepEqual(doc,source);assert.equal(i.snapshot().draft,null)
    i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);const final=structuredClone(doc)
    assert.ok(h.provider.undo());assert.deepEqual(doc,source);assert.equal(h.provider.undo(),false);assert.ok(h.provider.redo());assert.deepEqual(doc,final);assert.deepEqual(camera,saved)
    assert.match(p.geometrySceneSVG3D(final,800,600),/<svg/)
  }
  if(kind==='pyramid'){
    const info=a.pyramidApexDrag3D(next,'A_v_4');assert.ok(a.movePyramidApexParallel3D(next,'A_v_4',p.add(info.position,p.scale(p.unit(p.cross(info.normal,[1,.3,.2])),.1))));assert.ok(a.changePyramidHeight3D(next,'A_v_4',.3))
    const base=a.pyramidBaseDrag3D(next,'A_v_0');assert.ok(a.movePyramidBaseVertex3D(next,'A_v_0',p.add(base.position,p.scale(p.unit(p.sub(base.base[1],base.base[0])),.1))))
  }
  assert.equal(a.translateSolid3D(source,'A',[NaN,0,0]),null);assert.equal(a.translateSolid3D(source,'A',[1e13,0,0]),null)
  const shared=structuredClone(source);shared.linear_objects.push({id:'shared',kind:'segment',a:'A_v_0',b:'free'});assert.equal(a.translateSolid3D(shared,'A',delta),null)
  fixtures.push(next)
}
let face=m.emptyGeometryScene3D();face.points=[[0,0,0],[3,0,0],[3,3,0],[0,3,0]].map((position,i)=>({id:`p${i}`,position,label:null}));face.faces=[{id:'base',boundary:face.points.map(p=>p.id)}]
const source=a.createPyramidOnFace3D(face,'base','A').scene,next=a.translateSolid3D(source,'A',[1,2,3]);assert.ok(next);assert.deepEqual(next.points.filter(v=>v.id.startsWith('p')),face.points)
let doc=source,commits=0;const camera=p.standardView3D(source.print_camera,'front'),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:()=>{commits++;return true},notify:()=>{}})
i.select('A');i.setTool('translate_solid');const start={pointerId:1,button:0,x:200,y:150,width:800,height:600,altKey:false};i.pointer('down',start);i.pointer('move',{...start,x:250});i.pointer('up',{...start,x:250});assert.equal(commits,0,'parallel ray rejects gesture');assert.deepEqual(doc,source)
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log('PASS: four solid kinds, XY/XZ/YZ, both projections, rigid translation, two-solid/standalone/camera isolation, IDs, shared-source safety, cancellation/no-op, atomic history, serialization, rotation and M5 apex/base regressions')
