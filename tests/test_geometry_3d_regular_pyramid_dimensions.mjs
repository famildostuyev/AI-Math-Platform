import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),p=await loadGeometryModule('geometry3dProjection'),b=await loadGeometryModule('geometry3dSolidBounds'),g=await loadGeometryModule('geometry3dAuthoring')
let scenes=0,gestures=0
for(const sides of [3,6])for(const rotated of [false,true])for(const projection of ['orthographic','perspective']){
 let source=a.createSolid3D(m.emptyGeometryScene3D(),{...a.defaultRegularPyramid3D('P'),parameters:{sides,radius:2,height:2,constraint:'regular'}}).scene
 if(rotated)source=a.rotateSolid3D(source,'P',[1,2,3],.4)
 source=a.translateSolid3D(source,'P',[.2,-.3,.4]);source.points[0].label='M'
 const solid=source.solids[0],camera={...source.print_camera,projection,position:[8,-9,7],target:[0,0,1]},project=p.createProjection3D(camera,900,700)
 for(const dimension of ['radius','height']){
  const other=dimension==='radius'?'height':'radius'
  for(const value of [1,3]){const next=a.resizeRegularSolid3D(source,'P',dimension,value);assert.ok(next);assert.equal(next.solids[0].parameters[other],solid.parameters[other]);assert.equal(next.solids[0].parameters[dimension],value);assert.equal(next.solids[0].parameters.constraint,'regular');assert.deepEqual(next.solids[0].frame,solid.frame);assert.deepEqual(next.solids[0].features,solid.features);assert.equal(next.points[0].label,'M');if(dimension==='height')assert.deepEqual(next.points.filter(pt=>next.solids[0].features.some(f=>f.entity_id===pt.id&&/^v_\d+$/.test(f.slot)&&Number(f.slot.slice(2))<sides)),source.points.filter(pt=>solid.features.some(f=>f.entity_id===pt.id&&/^v_\d+$/.test(f.slot)&&Number(f.slot.slice(2))<sides)));scenes++}
  const handle=b.projectedSolidBounds3D(source,camera,900,700,'P').handles.find(h=>h.kind===dimension&&g.apexHeightMapping3D(camera,{x:h.x,y:h.y,width:900,height:700},h.world,h.direction,h.length));assert.ok(handle)
  const start={pointerId:1,button:0,x:handle.x,y:handle.y,width:900,height:700,altKey:false},target=p.add(handle.world,p.scale(handle.direction,handle.length*.25)),screen=project.screen(project.view(target)),end={...start,x:screen[0]+handle.x-handle.screen[0],y:screen[1]+handle.y-handle.screen[1]}
  let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});i.select('P')
  i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);i.cancel();assert.equal(commits,0);assert.deepEqual(doc,source)
  i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);assert.ok(Math.abs(doc.solids[0].parameters[dimension]-solid.parameters[dimension]*1.25)<1e-8);assert.equal(doc.solids[0].parameters[other],solid.parameters[other]);assert.equal(doc.solids[0].parameters.constraint,'regular');const final=doc;assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.ok(history.provider.redo());assert.deepEqual(doc,final);gestures++
 }
 for(const invalid of [0,-1,NaN,Infinity,1e13])assert.equal(a.resizeRegularSolid3D(source,'P','radius',invalid),null)
}
console.log(`PASS: ${scenes} independent dimension scenes and ${gestures} R/H gestures; fixed frame/base, IDs/labels/constraint, both cameras, rotation/translation, cancel/no-op/single Undo/Redo`)
