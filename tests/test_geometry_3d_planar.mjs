import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dAuthoring')
const m=await loadGeometryModule('geometry3dModel')
const {createProjection3D}=await loadGeometryModule('geometry3dProjection')
const {normalizeGeometryScene3D}=await loadGeometryModule('geometry3d')
const canonical=[]
if(!process.argv.includes('--write-fixtures'))for(const fixture of JSON.parse(await fs.readFile(new URL('./geometry_3d_planar_canonical.json',import.meta.url),'utf8'))){assert.deepEqual(normalizeGeometryScene3D(fixture.scene),fixture.scene);assert.deepEqual(m.evaluateGeometryScene3D(fixture.scene).scene,fixture.scene)}
let cases=0
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
  let scene=m.emptyGeometryScene3D(),commits=0
  const camera={...scene.print_camera,projection}
  const history=m.createGeometryHistory3D(scene,next=>scene=next)
  const interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:next=>{commits++;return history.commit(next)},notify:()=>{}})
  const point=([x,y])=>plane==='XY'?[x,y,0]:plane==='XZ'?[x,0,y]:[0,x,y]
  const pointer=xy=>{const position=point(xy),p=createProjection3D(camera,800,600),[x,y]=p.screen(p.view(position));return {x,y,width:800,height:600,button:0,pointerId:1,altKey:false}}
  const click=xy=>{const p=pointer(xy);interaction.pointer('down',p);interaction.pointer('up',p)}
  interaction.setPlane(plane);interaction.setTool('polygon')
  for(const xy of [[-2,-2],[2,-2],[2,2],[-2,2]])click(xy)
  assert.equal(commits,0);assert.equal(scene.points.length,0)
  interaction.pointer('move',pointer([-2,-2]));assert.equal(interaction.snapshot().preview.length,5)
  const start=pointer([-2,-2]);start.x+=4;interaction.pointer('down',start);interaction.pointer('up',start)
  assert.equal(commits,1);assert.equal(scene.faces.length,1);assert.equal(scene.points.length,4);assert.equal(scene.linear_objects.length,4)
  assert.equal(m.evaluateGeometryScene3D(scene).status,'ok')
  const saved=structuredClone(scene),ids=scene.points.map(p=>p.id)
  for(let i=0;i<4;i++)assert.ok(Math.hypot(...scene.points.find(p=>p.id===scene.faces[0].boundary[i]).position.map((v,j)=>v-point([[-2,-2],[2,-2],[2,2],[-2,2]][i])[j]))<1e-9)
  assert.deepEqual(normalizeGeometryScene3D(JSON.parse(JSON.stringify(scene))),scene)
  assert.ok(history.provider.undo());assert.equal(scene.points.length,0);assert.ok(history.provider.redo());assert.deepEqual(scene,saved)
  interaction.sync();interaction.setTool('polygon')
  for(const xy of [[-2,-2],[2,-2],[2,2],[-2,2],[-2,-2]])click(xy)
  assert.deepEqual(scene,saved,'repeated polygon reuses vertices, segments and face')
  assert.deepEqual(scene.points.map(p=>p.id),ids)
  interaction.setTool('triangle');for(const xy of [[-1,-1],[1,-1],[0,1]])click(xy)
  assert.equal(scene.faces.length,2)
  interaction.setTool('polyline');const count=commits
  for(const xy of [[-3,0],[0,0],[3,0]])click(xy)
  assert.equal(commits,count);assert.ok(interaction.finish());assert.equal(commits,count+1);assert.equal(scene.faces.length,2)
  const before=structuredClone(scene)
  interaction.setTool('polygon');for(const xy of [[-1,-1],[1,1],[-1,1],[1,-1],[-1,-1]])click(xy)
  assert.deepEqual(scene,before,'self-intersection rejected atomically');interaction.cancel();assert.equal(interaction.snapshot().preview.length,0)
  interaction.setTool('polygon');click([0,0]);interaction.cancel();assert.deepEqual(scene,before)
  interaction.setTool('segment');click([-3,-3]);click([3,3]);assert.equal(scene.faces.length,2)
  assert.equal(a.createPlanarPath3D(scene,[{id:'x',position:[0,0,0]},{id:'y',position:[1,0,0]},{id:'z',position:[2,0,0]}],true),null)
  canonical.push({name:`${plane}-${projection}`,scene:saved});cases++
}
// Off-plane vertices must not pull a planar construction away from the working plane.
let scene=m.emptyGeometryScene3D()
scene=a.createPoint3D(scene,[0,0,2],'off_plane').scene
let interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>scene.print_camera,commit:next=>(scene=next,true),notify:()=>{}})
interaction.setTool('triangle')
const proj=createProjection3D(scene.print_camera,800,600),[x,y]=proj.screen(proj.view([0,0,2])),p={x,y,width:800,height:600,button:0,pointerId:1,altKey:false}
interaction.pointer('down',p);interaction.pointer('up',p)
assert.notEqual(interaction.snapshot().pending[0],'off_plane');assert.equal(interaction.snapshot().preview[0][2],0)
interaction.pointer('down',p);interaction.pointer('cancel',p);assert.deepEqual(interaction.snapshot().pending,[])
// Existing face picking and safe dependencies use real semantic IDs.
const fixture=canonical[0].scene
const pr=createProjection3D(fixture.print_camera,800,600),[cx,cy]=pr.screen(pr.view([0,0,0]))
assert.equal(a.pickGeometry3D(fixture,fixture.print_camera,{x:cx,y:cy,width:800,height:600}).id,fixture.faces[0].id)
assert.equal(a.createPlanarPath3D(scene,[{id:'q',position:[0,0,0]},{id:'r',position:[NaN,1,0]}],false),null)
// Canvas and existing Properties point selection share one segment construction.
scene=m.emptyGeometryScene3D()
scene=a.createPoint3D(scene,[-2,-2,0],'a').scene;scene=a.createPoint3D(scene,[2,2,0],'b').scene
interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>scene.print_camera,commit:next=>(scene=next,true),notify:()=>{}})
interaction.setTool('segment');interaction.choose('a')
const mixProjection=createProjection3D(scene.print_camera,800,600),mixScreen=mixProjection.screen(mixProjection.view([2,2,0])),mixPointer={...p,x:mixScreen[0],y:mixScreen[1]}
interaction.pointer('down',mixPointer);interaction.pointer('up',mixPointer)
assert.equal(scene.linear_objects.length,1);assert.equal(interaction.snapshot().preview.length,0);assert.deepEqual(interaction.snapshot().pending,[])
if(process.argv.includes('--write-fixtures'))await fs.writeFile(new URL('./geometry_3d_planar_canonical.json',import.meta.url),JSON.stringify(canonical,null,2)+'\n')
console.log(`PASS: ${cases} plane/projection combinations; direct polygon/triangle/polyline/segment, preview, snap, invalid rejection, cancellation, atomic history, semantic persistence and face picking`)
