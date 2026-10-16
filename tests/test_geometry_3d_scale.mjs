import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d'),b=await loadGeometryModule('geometry3dSolidBounds')
const close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8,`${a} ~= ${b}`),fixtures=[]
for(const kind of ['cube','cuboid','prism','pyramid'])for(const angles of [[0,0,0],[90,0,0],[0,90,0]]){
  const d=a.defaultSolid3D(kind,'A');d.frame=a.solidFrame3D([1,.2,.3],angles)
  if(kind==='pyramid')d.parameters={sides:4,height:-2,base:{kind:'polygon',vertices:[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]]},apex_offset:[.2,.3]}
  let source=a.createSolid3D(m.emptyGeometryScene3D(),d).scene
  source=a.rotateSolid3D(source,'A',[1,2,3],.3);source=a.translateSolid3D(source,'A',[.2,.3,.1])
  const other=a.defaultSolid3D('pyramid','B');other.frame.origin=[8,0,0];source=a.createSolid3D(source,other).scene
  source=g.createPoint3D(source,[-8,0,0],'free').scene
  const pivot=a.solidPivot3D(source,'A'),factor=1.4,next=a.scaleSolid3D(source,'A',factor);assert.ok(next)
  close(a.solidPivot3D(next,'A'),pivot)
  for(const point of source.points)close(next.points.find(v=>v.id===point.id).position,point.id.startsWith('A_')?p.add(pivot,p.scale(p.sub(point.position,pivot),factor)):point.position)
  assert.deepEqual(next.solids[0].features,source.solids[0].features);assert.deepEqual(next.solids[0].frame.x_axis,source.solids[0].frame.x_axis);assert.deepEqual(next.solids[0].frame.y_axis,source.solids[0].frame.y_axis)
  assert.deepEqual(next.edges,source.edges);assert.deepEqual(next.faces,source.faces);assert.deepEqual(next.print_camera,source.print_camera)
  for(const edge of source.edges.filter(e=>e.id.startsWith('A_'))){const length=s=>Math.hypot(...p.sub(...[edge.start,edge.end].map(id=>s.points.find(v=>v.id===id).position)));assert.ok(Math.abs(length(next)/length(source)-factor)<1e-8)}
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(next))),next)
  const bounds=a.solidBounds3D(next,'A');assert.equal(bounds.corners.length,8);assert.equal(bounds.edges.length,12)
  for(const axis of [next.solids[0].frame.x_axis,next.solids[0].frame.y_axis,p.cross(next.solids[0].frame.x_axis,next.solids[0].frame.y_axis)]){
    const coords=next.points.filter(v=>v.id.startsWith('A_')).map(v=>p.dot(v.position,axis)),box=bounds.corners.map(v=>p.dot(v,axis));assert.ok(Math.abs(Math.min(...coords)-Math.min(...box))<1e-8);assert.ok(Math.abs(Math.max(...coords)-Math.max(...box))<1e-8)
  }
  for(const projection of ['orthographic','perspective']){
    const camera={...source.print_camera,projection},saved=structuredClone(camera),project=p.createProjection3D(camera,900,700),bounds=b.projectedSolidBounds3D(source,camera,900,700,'A');assert.ok(bounds.handles.length)
    const handle=bounds.handles[0],start={pointerId:1,button:0,x:handle.x,y:handle.y,width:900,height:700,altKey:false},target=p.add(pivot,p.scale(p.sub(handle.world,pivot),1.2)),screen=project.screen(project.view(target)),end={...start,x:screen[0]+handle.x-handle.screen[0],y:screen[1]+handle.y-handle.screen[1]}
    assert.ok(bounds.handles.every(h=>source.points.every(v=>{const q=project.screen(project.view(v.position));return Math.hypot(q[0]-h.x,q[1]-h.y)>=13})))
    let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});i.select('A')
    i.pointer('down',start);assert.ok(i.snapshot().dragging);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,0);assert.deepEqual(doc,source)
    for(const v of source.points.filter(v=>v.id.startsWith('A_')))close(i.snapshot().draft.points.find(p=>p.id===v.id).position,p.add(pivot,p.scale(p.sub(v.position,pivot),1.2)))
    i.cancel();assert.equal(i.snapshot().draft,null);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,0)
    i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);const final=structuredClone(doc)
    assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());assert.deepEqual(doc,final);assert.deepEqual(camera,saved)
    assert.match(p.geometrySceneSVG3D(final,900,700),/<svg/);assert.doesNotMatch(p.geometrySceneSVG3D(final,900,700),/resize-handle|solid-bounds/)
  }
  if(kind==='pyramid'){
    const info=a.pyramidApexDrag3D(next,'A_v_4');assert.ok(a.movePyramidApexParallel3D(next,'A_v_4',p.add(info.position,p.scale(p.unit(p.cross(info.normal,[1,.3,.2])),.1))));assert.ok(a.changePyramidHeight3D(next,'A_v_4',.3))
    const base=a.pyramidBaseDrag3D(next,'A_v_0');assert.ok(a.movePyramidBaseVertex3D(next,'A_v_0',p.add(base.position,p.scale(p.unit(p.sub(base.base[1],base.base[0])),.1))))
  }
  for(const bad of [0,-1,NaN,Infinity,1e-10,1e10])assert.equal(a.scaleSolid3D(source,'A',bad),null)
  const shared=structuredClone(source);shared.linear_objects.push({id:'shared',kind:'segment',a:'A_v_0',b:'free'});assert.equal(a.scaleSolid3D(shared,'A',1.3),null)
  const annotated=structuredClone(source);annotated.annotations.push({id:'note',content:'A',format:'text',anchor:{kind:'point',point_id:'A_v_0'},offset_mm:[0,0]});assert.equal(a.scaleSolid3D(annotated,'A',1.3),null)
  const marked=structuredClone(source);marked.markings.push({id:'mark',kind:'length',point_ids:['A_v_0','A_v_1'],label:null});assert.equal(a.scaleSolid3D(marked,'A',1.3),null)
  fixtures.push(next)
}
let face=m.emptyGeometryScene3D();face.points=[[0,0,0],[3,0,0],[3,3,0],[0,3,0]].map((position,i)=>({id:`p${i}`,position,label:null}));face.faces=[{id:'base',boundary:face.points.map(p=>p.id)}]
assert.equal(a.scaleSolid3D(a.createPyramidOnFace3D(face,'base','A').scene,'A',1.2),null,'shared face sources are never scaled')
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log('PASS: native uniform scaling, 4 solid kinds, 3 orientations, rotated/translated inputs, tight OBB, both projections, handle picking, invariant pivot/IDs, all edge ratios, isolation, invalid/shared rejection, cancellation/no-op, history and M5 edits')
