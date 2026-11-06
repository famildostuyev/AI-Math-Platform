import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dPlaneAuthoring'),d=await load('geometry3dPlaneDisplay'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring')
const scenes=[];let gestures=0
for(const working of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective'])for(const orbit of [0,.4])for(const shape of ['rectangle','parallelogram','cloud']){
 let source=a.createPlaneAt3D(m.emptyGeometryScene3D(),[.2,.3,.4],working,'P').scene
 source=a.transformPlane3D(source,'P',[.2,-.1,.5],[1,2,3],orbit);source=a.setPlaneShape3D(source,'P',shape,.4)
 source=m.transactGeometryScene3D(source,s=>{s.points.forEach(p=>p.label='internal');s.points.push({id:'independent',position:[0,0,3],label:'Free'},{id:'dependent',position:[0,0,0],label:null});s.constructions.push({id:'mid',kind:'midpoint',a:'P_x',b:'P_y',output_point_id:'dependent'})})
 assert.ok(source);const plane=source.planes[0],display=d.planeDisplay3D(plane,source),{o,x,y,normal}=display
 assert.equal(display.contour.length,shape==='cloud'?120:4);assert.deepEqual(d.planeDisplay3D(plane,source).contour,display.contour)
 const camera={...source.print_camera,projection,position:p.add(o,p.add(p.scale(x,6),p.add(p.scale(y,5),p.scale(normal,7)))),target:o,up:normal},view=p.createProjection3D(camera,800,600)
 const pointer=world=>{const q=view.screen(view.view(world));return {x:q[0],y:q[1],width:800,height:600,pointerId:1,button:0,altKey:false}}
 assert.deepEqual(p.scenePrimitives3D(source).primitives.filter(p=>p.kind==='point').map(p=>p.id),['dependent','independent'])
 const svg=p.geometrySceneSVG3D({...source,print_camera:camera},800,600);assert.ok(!svg.includes('internal'));assert.ok(svg.includes('Free'));assert.ok(!svg.includes('data-plane-resize'))
 const legacy=structuredClone(source);delete legacy.planes[0].display;assert.ok(p.scenePrimitives3D(legacy).primitives.some(p=>p.id==='P_x'))
 const sizeOnly=structuredClone(source);sizeOnly.planes[0].display={width:4,height:3};assert.ok(n.normalizeGeometryScene3D(sizeOnly));assert.equal(d.planeDisplay3D(sizeOnly.planes[0],sizeOnly).contour.length,4)
 for(const invalid of [-2,2,NaN,Infinity])assert.equal(a.setPlaneShape3D(source,'P','parallelogram',invalid),null)
 assert.equal(a.setPlaneShape3D(source,'P','invalid',0),null)
 const targets=[{u:1,v:0},{u:0,v:1},...(shape==='cloud'?[]:[{u:1,v:1}]),{u:1,v:0,startWorld:shape==='cloud'?display.contour[5]:display.world(1,.45)}]
 for(const target of targets){
  const startWorld=target.startWorld??display.world(target.u,target.v),start=pointer(startWorld),nextWidth=4+(target.u ? .7:0),nextHeight=3+(target.v ? .5:0),end=pointer(p.add(startWorld,p.add(p.scale(x,(nextWidth-4)*(target.u+display.skew*target.v)/2),p.scale(y,(nextHeight-3)*target.v/2))))
  assert.deepEqual(g.planeResizeTarget3D(source,camera,start,'P'),{u:target.u,v:target.v})
  let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});i.select('P')
  i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);i.pointer('cancel',end);assert.deepEqual(doc,source);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);assert.ok(Math.abs(doc.planes[0].display.width-nextWidth)<1e-8);assert.ok(Math.abs(doc.planes[0].display.height-nextHeight)<1e-8)
  assert.deepEqual(doc.points,source.points);assert.deepEqual(doc.constructions,source.constructions);assert.equal(doc.planes[0].display.shape,shape);assert.equal(doc.planes[0].display.skew,.4);assert.deepEqual(doc.print_camera,source.print_camera)
  assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.ok(history.provider.redo());assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(doc))),doc)
  i.setTool('camera');assert.equal(i.pointer('down',start),false);gestures++
 }
 scenes.push(source)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(scenes))
console.log(`PASS: ${scenes.length} plane contour/parity scenes, ${gestures} resize gestures; shapes, planes/projections/orbits, helpers/independent points, skew, dependencies, cancel/no-op/history, legacy/reload and SVG`)
