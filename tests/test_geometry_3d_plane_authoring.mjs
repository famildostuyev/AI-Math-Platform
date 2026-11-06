import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dPlaneAuthoring'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring')
const scenes=[];let gestures=0
for(const working of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 const source=m.emptyGeometryScene3D(),camera={...source.print_camera,projection},view=p.createProjection3D(camera,800,600),start={x:400,y:300,width:800,height:600,pointerId:1,button:0,altKey:false}
 let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),interaction=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}})
 interaction.setPlane(working);interaction.setTool('plane');interaction.pointer('down',start);interaction.pointer('up',start)
 assert.equal(commits,1);assert.equal(doc.planes.length,1);assert.equal(doc.points.length,3);const id=doc.planes[0].id,created=structuredClone(doc)
 assert.deepEqual(doc.planes[0].display,{width:4,height:3,shape:'rectangle',skew:.35});assert.equal(interaction.snapshot().selected,id);assert.equal(interaction.snapshot().tool,'select')
 assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.ok(history.provider.redo());assert.deepEqual(doc,created)
 const coords=doc.planes[0].point_ids.map(id=>doc.points.find(p=>p.id===id).position),normal=p.unit(p.cross(p.sub(coords[1],coords[0]),p.sub(coords[2],coords[0])))
 assert.ok(Math.abs(Math.abs(p.dot(normal,g.planeNormal3D(working)))-1)<1e-9)
 let sized=a.resizePlaneDisplay3D(doc,id,6,2);assert.ok(sized);assert.deepEqual(sized.points,doc.points)
 for(const size of [0,-1,NaN,Infinity])assert.equal(a.resizePlaneDisplay3D(doc,id,size,2),null)
 const primitive=p.scenePrimitives3D(sized).primitives.find(p=>p.id===id);assert.equal(primitive.displayPatch.length,4);assert.ok(Math.abs(Math.hypot(...p.sub(primitive.displayPatch[1],primitive.displayPatch[0]))-6)<1e-9)
 const projected=p.projectScene3D(sized,camera,800,600),face=projected.faces.find(f=>f.id===id);assert.ok(face)
 const q=view.screen(view.view(p.add(coords[0],p.add(p.scale(p.sub(coords[1],coords[0]),1.7),p.scale(p.sub(coords[2],coords[0]),.6)))))
 assert.equal(g.pickGeometry3D(sized,camera,{...start,x:q[0],y:q[1]})?.id,id)
 sized=a.transformPlane3D(sized,id,[1,2,3],[1,2,3],.4);assert.ok(sized);assert.deepEqual(sized.planes, a.resizePlaneDisplay3D(doc,id,6,2).planes)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(sized))),sized)
 const svg=p.geometrySceneSVG3D({...sized,print_camera:camera},800,600);assert.ok(svg.includes(`data-id="${id}"`));assert.ok(!svg.includes('data-resize-handle'))
 const legacy=g.createPrimitive3D(created,'plane',created.planes[0].point_ids).scene;assert.ok(legacy)
 // Existing translation/rotation tools provide atomic previews, cancel/no-op and one commit.
 for(const tool of ['translate_solid','rotate_solid']){
  let scene=created,count=0;const h=m.createGeometryHistory3D(created,v=>scene=v),i=g.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:v=>{count++;return h.commit(v)},notify:()=>{}});i.select(id);i.setPlane(working);i.setTool(tool)
  const end={...start,x:440,y:330};i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);i.cancel();assert.deepEqual(scene,created);assert.equal(count,0)
  i.pointer('down',start);i.pointer('up',start);assert.equal(count,0);i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(count,1);assert.deepEqual(scene.planes,created.planes);assert.ok(h.provider.undo());assert.deepEqual(scene,created);assert.ok(h.provider.redo());gestures++
 }
 scenes.push(sized)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(scenes))
console.log(`PASS: ${scenes.length} plane creation/SVG/parity scenes; ${gestures} transform gestures; XY/XZ/YZ, both projections, display sizing, picking, history/cancel/no-op and reload`)
