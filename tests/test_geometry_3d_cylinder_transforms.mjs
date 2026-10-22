import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),b=await loadGeometryModule('geometry3dSolidBounds'),analytic=await loadGeometryModule('geometry3dAnalytic'),n=await loadGeometryModule('geometry3d')
const close=(x,y)=>assert.ok(Math.hypot(...p.sub(x,y))<1e-8)
let cases=0;const fixtures=[]
for(const plane of ['XY','XZ','YZ'])for(const projection of ['perspective','orthographic'])for(const otherKind of ['cylinder','cube','cuboid','prism','pyramid']){
 let source=a.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],plane,'A').scene
 const other=otherKind==='cylinder'?a.defaultCylinder3D('B'):a.defaultSolid3D(otherKind,'B');other.frame.origin=[8,3,0];source=a.createSolid3D(source,other).scene
 source=g.createPoint3D(source,[-8,0,0],'free').scene
 const camera={...source.print_camera,projection},original=structuredClone(source),ids=structuredClone(source.solids[0].features)
 for(const operation of [s=>a.rotateSolid3D(s,'A',[1,2,3],.4),s=>a.translateSolid3D(s,'A',plane==='XY'?[.3,.4,0]:plane==='XZ'?[.3,0,.4]:[0,.3,.4]),s=>a.scaleSolid3D(s,'A',1.4),s=>a.rotateSolid3D(s,'A',[0,1,0],.2)]){
  const before=source,pivot=a.solidPivot3D(before,'A');source=operation(source);assert.ok(source);assert.deepEqual(source.solids[1],original.solids[1]);assert.deepEqual(source.points.filter(p=>!ids.some(f=>f.entity_id===p.id)),original.points.filter(p=>!ids.some(f=>f.entity_id===p.id)));assert.deepEqual(source.print_camera,original.print_camera);assert.deepEqual(source.solids[0].features,ids)
  const bounds=a.solidBounds3D(source,'A'),exact=analytic.analyticBounds3D(source.solids[0]);assert.deepEqual(bounds.corners,exact.corners);close(bounds.pivot,exact.pivot);assert.equal(bounds.edges.length,12)
  assert.equal(source.solids[0].parameters.height/source.solids[0].parameters.radius,2)
 }
 const pivot=a.solidPivot3D(source,'A'),project=p.createProjection3D(camera,900,700),handles=b.projectedSolidBounds3D(source,camera,900,700,'A');assert.ok(handles.handles.length)
 const handle=handles.handles.find(h=>h.kind==='uniform'),start={pointerId:1,button:0,x:handle.x,y:handle.y,width:900,height:700,altKey:false},target=p.add(pivot,p.scale(p.sub(handle.world,pivot),1.2)),screen=project.screen(project.view(target)),end={...start,x:screen[0]+handle.x-handle.screen[0],y:screen[1]+handle.y-handle.screen[1]}
 let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});i.select('A')
 i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,0);i.cancel();assert.deepEqual(doc,source)
 i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.equal(commits,0)
 i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
 i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);close(a.solidPivot3D(doc,'A'),pivot);assert.ok(Math.abs(doc.solids[0].parameters.radius/source.solids[0].parameters.radius-1.2)<1e-8)
 const final=structuredClone(doc);assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());assert.deepEqual(doc,final)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(final))),final)
 assert.doesNotMatch(p.geometrySceneSVG3D(final,900,700),/resize-handle|solid-bounds/)
 for(const bad of [0,-1,NaN,Infinity,1e-10,1e10])assert.equal(a.scaleSolid3D(source,'A',bad),null)
 assert.equal(a.translateSolid3D(source,'A',[NaN,0,0]),null);assert.equal(a.rotateSolid3D(source,'A',[0,0,0],1),null)
 fixtures.push(final);cases++
}
console.log(`PASS: ${cases} cylinder plane/camera/isolation cases, sequential transforms, analytic bounds, scaling gestures, cancellation/no-op, single history, IDs, canonical reload and print`)

if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))

// Sparse optional centers may move; directly shared geometry is protected.
{
 const d=a.defaultCylinder3D('sparse');d.features=[{slot:'v_0',entity_id:'bottom'},{slot:'v_1',entity_id:'top'},{slot:'surface',entity_id:'lateral'}]
 const source=a.createSolid3D(m.emptyGeometryScene3D(),d).scene
 const pivot=a.solidPivot3D(source,'sparse'),next=a.scaleSolid3D(source,'sparse',2);assert.ok(next)
 for(const v of source.points)close(next.points.find(p=>p.id===v.id).position,p.add(pivot,p.scale(p.sub(v.position,pivot),2)))
 const shared=structuredClone(source);shared.points.push({id:'outside',position:[5,0,0],label:null});shared.linear_objects.push({id:'shared',kind:'segment',a:'top',b:'outside'})
 for(const edit of [s=>a.rotateSolid3D(s,'sparse',[1,0,0],.4),s=>a.translateSolid3D(s,'sparse',[1,0,0]),s=>a.scaleSolid3D(s,'sparse',2)])assert.equal(edit(shared),null)
}
