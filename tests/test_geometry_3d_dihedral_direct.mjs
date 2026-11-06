import assert from 'node:assert/strict'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dDihedralAuthoring'),math=await load('geometry3dDihedral'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring')
let cases=0
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective'])for(const orbit of [0,.4]){
 let source=a.createDihedral3D(m.emptyGeometryScene3D(),[.2,.3,.4],plane,'D').scene
 source=a.transformDihedral3D(source,'D',[1,-.2,.3],[1,2,3],orbit)
 const d=source.dihedrals[0],geo=math.dihedralGeometry3D(d),o=d.frame.origin
 const camera={...source.print_camera,projection,position:p.add(o,p.add(p.scale(geo.e,7),p.add(p.scale(geo.a,5),p.scale(geo.c,6)))),target:o,up:geo.c},view=p.createProjection3D(camera,800,600)
 const pointer=world=>{const q=view.screen(view.view(world));return {pointerId:1,button:0,altKey:false,x:q[0],y:q[1],width:800,height:600}}
 const legacy=structuredClone(source);delete legacy.dihedrals[0].display
 assert.deepEqual(n.normalizeGeometryScene3D(legacy),source);assert.equal(legacy.dihedrals[0].display,undefined)
 for(const size of [0,-1,NaN,Infinity,1e7])assert.equal(a.editDihedral3D(source,'D',{display:{edge_length:size,widths:[2,3]}}),null)
 const run=(start,end,verify)=>{
  let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{commits++;return history.commit(s)},notify:()=>{}});i.select('D')
  assert.equal(i.pointer('down',start),true);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);i.cancel();assert.deepEqual(doc,source);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);verify(doc)
  assert.deepEqual(doc.dihedrals[0].features,d.features);assert.deepEqual(doc.print_camera,source.print_camera)
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(doc))),doc)
  assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.ok(history.provider.redo());verify(doc)
  i.setTool('camera');assert.equal(i.pointer('down',start),false)
  cases++
 }
 // Grab the interior away from the old invisible handle and away from the common edge.
 const center=p.add(o,p.scale(geo.e,.6)),start=pointer(p.add(center,p.scale(geo.b,1.2)))
 assert.equal(g.dihedralEditTarget3D(source,camera,start,'D')?.kind,'angle')
 for(const theta of [0,Math.PI/4,3*Math.PI/4,Math.PI])run(start,pointer(p.add(center,p.add(p.scale(geo.a,1.2*Math.cos(theta)),p.scale(geo.c,1.2*Math.sin(theta))))),doc=>{
  assert.ok(Math.abs(doc.dihedrals[0].angle_radians-theta)<1e-8);assert.deepEqual(doc.dihedrals[0].display,d.display)
  for(const slot of ['v_0','v_1','v_2'])assert.deepEqual(doc.points.find(p=>p.id==='D_'+slot),source.points.find(p=>p.id==='D_'+slot))
 })
 for(const h of math.dihedralDisplay3D(d).handles.slice(0,3)){
  const start=pointer(h.position),end=pointer(p.add(h.position,p.scale(h.direction,.6)))
  assert.equal(g.dihedralEditTarget3D(source,camera,start,'D')?.kind,h.kind)
  run(start,end,doc=>{
   const display=doc.dihedrals[0].display;assert.equal(doc.dihedrals[0].angle_radians,d.angle_radians);assert.deepEqual(doc.points,source.points)
   if(h.kind==='edge'){assert.ok(Math.abs(display.edge_length-5.2)<1e-8);assert.deepEqual(display.widths,d.display.widths)}
   else{const index=h.kind==='width0'?0:1;assert.ok(Math.abs(display.widths[index]-3.1)<1e-8);assert.equal(display.widths[1-index],2.5);assert.equal(display.edge_length,4)}
   const svg=p.geometrySceneSVG3D({...doc,print_camera:camera},800,600);assert.ok(!svg.includes('data-dihedral-resize'))
   const primitive=p.scenePrimitives3D(doc).primitives.find(v=>v.id==='D_edge');assert.ok(Math.abs(Math.hypot(...p.sub(primitive.b,primitive.a))-display.edge_length)<1e-8)
  })
 }
}
console.log(`PASS: ${cases} direct dihedral gestures; XY/XZ/YZ, both projections, transformed cameras, 0–180 rotation, independent widths/edge length, cancel/no-op/history, legacy/persistence and SVG`)
