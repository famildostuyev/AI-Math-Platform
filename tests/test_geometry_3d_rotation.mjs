import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8,`${a} ~= ${b}`)
const fixtures=[]
for(const kind of ['cube','cuboid','prism','pyramid'])for(const angles of [[0,0,0],[35,20,12]]){
  let d=a.defaultSolid3D(kind,'A');d.frame=a.solidFrame3D([1,2,3],angles)
  if(kind==='pyramid')d.parameters={sides:4,height:2,base:{kind:'polygon',vertices:[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]]},apex_offset:[.2,.3]}
  let source=a.createSolid3D(m.emptyGeometryScene3D(),d).scene
  const b=a.defaultSolid3D('cuboid','B');b.frame.origin=[8,0,0];source=a.createSolid3D(source,b).scene
  const next=a.rotateSolid3D(source,'A',[1,2,3],.7);assert.ok(next)
  assert.deepEqual(next.solids[0].parameters,source.solids[0].parameters);assert.deepEqual(next.solids[0].features,source.solids[0].features)
  assert.deepEqual(next.points.filter(v=>v.id.startsWith('B_')),source.points.filter(v=>v.id.startsWith('B_')))
  assert.deepEqual(next.print_camera,source.print_camera);assert.deepEqual(next.edges,source.edges);assert.deepEqual(next.faces,source.faces)
  const before=source.points.filter(v=>v.id.startsWith('A_')).map(v=>v.position),after=next.points.filter(v=>v.id.startsWith('A_')).map(v=>v.position)
  close(before.reduce((s,v)=>p.add(s,p.scale(v,1/before.length)),[0,0,0]),after.reduce((s,v)=>p.add(s,p.scale(v,1/after.length)),[0,0,0]))
  before.forEach((v,i)=>before.forEach((w,j)=>assert.ok(Math.abs(Math.hypot(...p.sub(v,w))-Math.hypot(...p.sub(after[i],after[j])))<1e-8)))
  const rotatedB=a.rotateSolid3D(next,'B',[0,1,0],.3);assert.deepEqual(rotatedB.points.filter(v=>v.id.startsWith('A_')),next.points.filter(v=>v.id.startsWith('A_')))
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(next))),next)
  if(kind==='pyramid'){
    const info=a.pyramidApexDrag3D(next,'A_v_4');assert.ok(a.movePyramidApexParallel3D(next,'A_v_4',p.add(info.position,p.scale(p.unit(p.cross(info.normal,[1,.3,.2])),.1))));assert.ok(a.changePyramidHeight3D(next,'A_v_4',.3))
    const base=a.pyramidBaseDrag3D(next,'A_v_0'),delta=p.scale(p.unit(p.sub(base.base[1],base.base[0])),.1)
    assert.ok(a.movePyramidBaseVertex3D(next,'A_v_0',p.add(base.position,delta)))
  }
  for(const projection of ['orthographic','perspective']){
    const camera={...source.print_camera,projection},saved=structuredClone(camera)
    let doc=source,commits=0;const h=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return h.commit(v)},notify:()=>{}})
    i.select('A');i.setTool('rotate_solid');const start={pointerId:1,button:0,x:200,y:150,width:800,height:600,altKey:false},end={...start,x:280,y:180}
    i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,0);assert.deepEqual(doc,source)
    i.cancel();assert.equal(i.snapshot().draft,null);assert.deepEqual(doc,source)
    i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);const final=structuredClone(doc)
    assert.ok(h.provider.undo());assert.deepEqual(doc,source);assert.equal(h.provider.undo(),false);assert.ok(h.provider.redo());assert.deepEqual(doc,final);assert.deepEqual(camera,saved)
    assert.match(p.geometrySceneSVG3D(final,800,600),/<svg/)
  }
  assert.equal(a.rotateSolid3D(source,'A',[NaN,0,0],1),null);assert.equal(a.rotateSolid3D(source,'A',[0,0,0],1),null);assert.equal(a.rotateSolid3D(source,'A',[1,0,0],Infinity),null)
  fixtures.push(next)
}
// Face references apply a placement to the owned feature copy, never the source face.
let face=m.emptyGeometryScene3D();face.points=[[0,0,0],[3,0,0],[3,3,0],[0,3,0]].map((position,i)=>({id:`p${i}`,position,label:null}));face.faces=[{id:'base',boundary:face.points.map(p=>p.id)}]
let scene=a.createPyramidOnFace3D(face,'base','A').scene,rotated=a.rotateSolid3D(scene,'A',[1,1,0],.5)
assert.ok(rotated);assert.deepEqual(rotated.points.filter(v=>v.id.startsWith('p')),face.points)
const dependent=a.defaultSolid3D('pyramid','B');dependent.parameters={sides:4,height:2,base:{kind:'face',face_id:'A_f_0',point_ids:scene.faces.find(f=>f.id==='A_f_0').boundary},apex_offset:[0,0]};scene=a.createSolid3D(scene,dependent).scene
assert.equal(a.rotateSolid3D(scene,'A',[1,0,0],.4),null,'never deform another dependent solid')
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log('PASS: four solid kinds, tilted/owned/face bases, stable IDs, rigid pivot, two-solid isolation, dependent-solid safety, both cameras, cancellation/no-op, atomic history, serialization and apex/base editing')
