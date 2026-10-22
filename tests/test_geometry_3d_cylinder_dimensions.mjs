import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),b=await loadGeometryModule('geometry3dSolidBounds'),analytic=await loadGeometryModule('geometry3dAnalytic'),n=await loadGeometryModule('geometry3d')
const close=(x,y)=>assert.ok(Math.hypot(...p.sub(x,y))<1e-8,`${x} ~= ${y}`),fixtures=[]
let gestures=0
for(const plane of ['XY','XZ','YZ'])for(const projection of ['perspective','orthographic'])for(const rotated of [false,true]){
 let source=a.createCylinderAt3D(m.emptyGeometryScene3D(),[.3,-.2,.1],plane,'A').scene
 if(rotated)source=a.rotateSolid3D(source,'A',[1,2,3],.7)
 source=a.translateSolid3D(source,'A',[.2,.3,-.1])
 source=a.createCylinderAt3D(source,[7,3,1],plane,'B').scene
 source=g.createPoint3D(source,[-7,0,0],'free').scene
 const original=structuredClone(source),pivot=a.solidPivot3D(source,'A'),axes=structuredClone(source.solids[0].frame),ids=structuredClone(source.solids[0].features)
 for(const [dimension,value] of [['radius',1.8],['height',.9],['radius',.4],['height',3.7]]){
  const before=source,next=a.resizeCylinder3D(before,'A',dimension,value);assert.ok(next)
  const old=before.solids[0],solid=next.solids[0],other=dimension==='radius'?'height':'radius'
  assert.equal(solid.parameters[dimension],value);assert.equal(solid.parameters[other],old.parameters[other]);assert.deepEqual(solid.features,ids)
  assert.deepEqual(solid.frame.x_axis,axes.x_axis);assert.deepEqual(solid.frame.y_axis,axes.y_axis);close(a.solidPivot3D(next,'A'),pivot)
  assert.deepEqual(next.solids[1],original.solids[1]);assert.deepEqual(next.points.filter(p=>!ids.some(f=>f.entity_id===p.id)),original.points.filter(p=>!ids.some(f=>f.entity_id===p.id)));assert.deepEqual(next.print_camera,original.print_camera)
  const f=analytic.analyticFrame3D(solid.frame),bottom=f.toWorld([0,0,0]),top=f.toWorld([0,0,solid.parameters.height])
  close(p.scale(p.add(bottom,top),.5),pivot)
  for(const v of [0,.5,1])for(const u of [0,.125,.25,.5,.75]){
   const local=f.toLocal(analytic.evaluateAnalyticSurface3D(solid,[u,v]))
   assert.ok(Math.abs(Math.hypot(local[0],local[1])-solid.parameters.radius)<1e-8);assert.ok(Math.abs(local[2]-v*solid.parameters.height)<1e-8)
  }
  const bounds=a.solidBounds3D(next,'A');assert.deepEqual(bounds.corners,analytic.analyticBounds3D(solid).corners)
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(next))),next)
  assert.notEqual(p.geometrySceneSVG3D(next,900,700),p.geometrySceneSVG3D(before,900,700))
  assert.doesNotMatch(p.geometrySceneSVG3D(next,900,700),/data-resize-kind|data-resize-handle/)
  fixtures.push(next);source=next
 }
 const rotatedAgain=a.rotateSolid3D(source,'A',[2,-1,3],.3)
 assert.ok(rotatedAgain);assert.deepEqual(rotatedAgain.solids[0].parameters,source.solids[0].parameters);close(a.solidPivot3D(rotatedAgain,'A'),pivot)
 const movedAgain=a.translateSolid3D(rotatedAgain,'A',[.2,-.1,.3]);assert.ok(movedAgain)
 assert.deepEqual(movedAgain.solids[0].parameters,source.solids[0].parameters);close(a.solidPivot3D(movedAgain,'A'),p.add(pivot,[.2,-.1,.3]));assert.deepEqual(movedAgain.solids[1],source.solids[1])
 for(const dimension of ['radius','height']){
  for(const value of [0,-1,NaN,Infinity,1e13,1e-30])assert.equal(a.resizeCylinder3D(source,'A',dimension,value),null)
  assert.deepEqual(a.resizeCylinder3D(source,'A',dimension,source.solids[0].parameters[dimension]),source)
  const camera={...source.print_camera,projection},project=p.createProjection3D(camera,900,700),bounds=b.projectedSolidBounds3D(source,camera,900,700,'A')
  const handle=bounds.handles.find(h=>h.kind===dimension&&g.apexHeightMapping3D(camera,{x:h.x,y:h.y,width:900,height:700},h.world,h.direction,h.length))
  assert.ok(handle,`${dimension} handle available in ${plane}/${projection}/${rotated}`)
  const start={pointerId:1,button:0,x:handle.x,y:handle.y,width:900,height:700,altKey:false}
  const target=p.add(handle.world,p.scale(handle.direction,handle.length*.25)),screen=project.screen(project.view(target)),end={...start,x:screen[0]+handle.x-handle.screen[0],y:screen[1]+handle.y-handle.screen[1]}
  let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});i.select('A')
  i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,0);assert.deepEqual(doc,source)
  close(a.solidPivot3D(i.snapshot().draft,'A'),pivot);i.cancel();assert.equal(i.snapshot().draft,null);assert.deepEqual(doc,source)
  i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1)
  const final=structuredClone(doc),solid=doc.solids[0],other=dimension==='radius'?'height':'radius'
  assert.ok(Math.abs(solid.parameters[dimension]/source.solids[0].parameters[dimension]-1.25)<1e-8);assert.equal(solid.parameters[other],source.solids[0].parameters[other])
  assert.deepEqual(doc.solids[1],source.solids[1]);assert.deepEqual(camera,{...source.print_camera,projection})
  assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());assert.deepEqual(doc,final)
  assert.ok(history.provider.undo());assert.ok(history.commit(a.resizeCylinder3D(doc,'A',other,doc.solids[0].parameters[other]*.9)));assert.equal(history.provider.redo(),false)
  gestures++
 }
}
// Sparse centers follow native dimensions; directly shared center geometry is protected.
{
 const definition=a.defaultCylinder3D('sparse');definition.features=[{slot:'v_0',entity_id:'bottom'},{slot:'v_1',entity_id:'top'}]
 const source=a.createSolid3D(m.emptyGeometryScene3D(),definition).scene
 for(const dimension of ['radius','height']){
  const next=a.resizeCylinder3D(source,'sparse',dimension,3);assert.ok(next);close(a.solidPivot3D(next,'sparse'),a.solidPivot3D(source,'sparse'))
 }
 const shared=structuredClone(source);shared.points.push({id:'external',position:[5,0,0],label:null});shared.linear_objects.push({id:'shared',kind:'segment',a:'top',b:'external'})
 assert.equal(a.resizeCylinder3D(shared,'sparse','height',3),null)
 // An end-on axis has no safe screen displacement: reject the gesture mapping.
 const camera={...source.print_camera,projection:'orthographic',position:[0,0,8],target:[0,0,1],up:[0,1,0]}
 assert.equal(g.apexHeightMapping3D(camera,{x:450,y:350,width:900,height:700},[0,0,2],[0,0,1],1),null)
}
assert.equal(a.resizeCylinder3D(m.emptyGeometryScene3D(),'absent','radius',2),null)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} independent dimension canonical scenes, ${gestures} local-axis gestures; circular caps, center, IDs, isolation, increase/decrease, rotated XY/XZ/YZ, both cameras, bounds/print, cancellation/no-op and Undo/Redo`)
