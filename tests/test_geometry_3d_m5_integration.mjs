import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),b=await loadGeometryModule('geometry3dSolidBounds'),n=await loadGeometryModule('geometry3d')
const fixtures=[]
for(const kind of ['pyramid','cube','cuboid','prism']){
  let source=m.emptyGeometryScene3D()
  if(kind==='pyramid'){
    source=g.createPlanarPath3D(source,[[-3,-1,0],[-1,-1,0],[-1,1,0],[-3,1,0]].map((position,i)=>({id:`p${i}`,position})),true,'base').scene
    const created=a.createPyramidFromPolygon3D(source,'base','A');assert.equal(created.sourceConsumed,true);source=created.scene
  }else{const d=a.defaultSolid3D(kind,'A');d.frame.origin=[-2,0,0];source=a.createSolid3D(source,d).scene}
  const other=a.defaultSolid3D(kind,'B');other.frame.origin=[4,0,0];source=a.createSolid3D(source,other).scene
  let doc=source,commits=0;const camera=structuredClone(source.print_camera),h=m.createGeometryHistory3D(source,s=>doc=s),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{commits++;return h.commit(s)},notify:()=>{}})
  i.select('A');const states=[structuredClone(doc)],ids=structuredClone(source.solids[0].features),parameters=structuredClone(source.solids[0].parameters)
  const check=()=>{
    assert.equal(m.evaluateGeometryScene3D(doc).status,'ok');assert.deepEqual(doc.points.filter(p=>p.id.startsWith('B_')),source.points.filter(p=>p.id.startsWith('B_')));assert.deepEqual(doc.solids.find(s=>s.id==='B'),source.solids.find(s=>s.id==='B'));assert.deepEqual(camera,source.print_camera);assert.deepEqual(doc.solids.find(s=>s.id==='A').features,ids);assert.deepEqual(doc.edges,source.edges);assert.deepEqual(doc.faces,source.faces)
    const q=a.solidBounds3D(doc,'A');assert.ok(q);assert.equal(q.corners.length,8);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(doc))),doc)
  }
  function gesture(mode,cancel=false,noOp=false){
    i.setTool(mode==='scale'?'select':mode==='rotate'?'rotate_solid':'translate_solid')
    let start={x:300,y:250,width:900,height:700,pointerId:1,button:0,altKey:false},end={...start,x:340,y:265}
    if(mode==='scale'){
      const q=b.projectedSolidBounds3D(doc,camera,900,700,'A'),project=p.createProjection3D(camera,900,700),center=project.screen(project.view(q.pivot)),handle=[...q.handles].sort((a,b)=>Math.hypot(b.screen[0]-center[0],b.screen[1]-center[1])-Math.hypot(a.screen[0]-center[0],a.screen[1]-center[1]))[0],target=project.screen(project.view(p.add(q.pivot,p.scale(p.sub(handle.world,q.pivot),1.2))))
      start={...start,x:handle.x,y:handle.y};end={...start,x:target[0]+handle.x-handle.screen[0],y:target[1]+handle.y-handle.screen[1]}
    }
    const previous=structuredClone(doc),count=commits;i.pointer('down',start);assert.ok(i.snapshot().dragging)
    if(!noOp){for(let k=1;k<=5;k++)i.pointer('move',{...start,x:start.x+(end.x-start.x)*k/5,y:start.y+(end.y-start.y)*k/5});assert.ok(i.snapshot().draft);assert.equal(commits,count);assert.deepEqual(doc,previous)}
    if(cancel)i.cancel();i.pointer('up',noOp?start:end)
    if(cancel||noOp){assert.deepEqual(doc,previous);assert.equal(commits,count)}else{assert.equal(commits,count+1);check()}
  }
  for(const mode of ['rotate','translate','scale','rotate','translate']){gesture(mode,true);gesture(mode,false,true);gesture(mode);states.push(structuredClone(doc))}
  assert.equal(commits,5)
  for(let k=4;k>=0;k--){assert.ok(h.provider.undo());assert.deepEqual(doc,states[k])}assert.equal(h.provider.undo(),false)
  for(let k=1;k<=5;k++){assert.ok(h.provider.redo());assert.deepEqual(doc,states[k])}assert.equal(h.provider.redo(),false)
  h.provider.undo();h.provider.undo();const branch=structuredClone(doc);gesture('translate');assert.equal(h.provider.redo(),false);h.provider.undo();assert.deepEqual(doc,branch)
  assert.deepEqual(states[2].solids[0].parameters,parameters,'rotation and translation preserve local parameters')
  fixtures.push({kind,states})
}
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log('PASS: 4 solid kinds x rotate/translate/scale/rotate/translate, isolation/camera/IDs/topology/bounds, live previews, each cancellation/no-op, exact 5-step Undo/Redo, branch invalidation and canonical reload')
