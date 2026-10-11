import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { createProjection3D, standardView3D, scenePrimitives3D, projectScene3D, geometrySceneSVG3D, hiddenIntervals3D } = await loadGeometryModule('geometry3dProjection')
const { createGeometryHistory3D } = await loadGeometryModule('geometry3dModel')
const source=JSON.parse(await fs.readFile(new URL('./geometry_3d_canonical.json',import.meta.url),'utf8')), before=structuredClone(source)
const camera={...source.print_camera,position:[0,-10,0],up:[0,0,1],vertical_span:10,near:1,far:20}
const view=createProjection3D(camera,600,300)
assert.deepEqual(view.screen(view.view([0,0,0])),[300,150,10])
assert.deepEqual(view.screen(view.view([1,0,0])),[330,150,10])
assert.deepEqual(createProjection3D(camera,300,300).screen(view.view([1,0,0])),[180,150,10])
assert.deepEqual(view.line([0,0,0],[1,0,0],'line'),[[-10,0,10],[10,0,10]])
assert.deepEqual(view.line([0,0,0],[1,0,0],'ray'),[[0,0,10],[10,0,10]])
assert.deepEqual(view.line([0,0,0],[1,0,0],'segment'),[[0,0,10],[1,0,10]])
assert.equal(view.line([0,-11,0],[1,-11,0],'line'),null)
assert.equal(view.line([0,11,0],[1,11,0],'segment'),null)
assert.equal(view.visible([0,-10,0]),false)
assert.ok(view.polygon([[-100,0,-100],[100,0,-100],[0,0,100]]).length>=3)
assert.ok(view.planePatch([[0,0,0],[1,0,0],[0,0,1]]).length>=4)
const perspective=createProjection3D({...camera,projection:'perspective'},600,300)
assert.ok(perspective.line([0,-11,0],[0,5,0],'ray'))
assert.ok(perspective.polygon([[-1,-11,0],[1,0,0],[0,0,1]]).length>=3)
for(const standard of ['front','back','left','right','top','bottom','isometric']) {
  const next=standardView3D(camera,standard), projected=createProjection3D(next,600,300)
  assert.deepEqual(projected.screen(projected.view(next.target)).slice(0,2),[300,150])
}
const adapter=scenePrimitives3D(source)
assert.equal(adapter.status,'ok');assert.equal(adapter.primitives.length,8)
assert.deepEqual(adapter.primitives.find(p=>p.id==='d').position,[2,0,0])
assert.deepEqual(source,before)
const allKinds=structuredClone(source)
allKinds.linear_objects.push({id:'ray',kind:'ray',a:'a',b:'c'},{id:'vector',kind:'vector',a:'b',b:'c'},{id:'segment',kind:'segment',a:'c',b:'d'})
assert.ok(['ray','vector','segment'].every(kind=>scenePrimitives3D(allKinds).primitives.some(p=>p.kind===kind)))
assert.equal(scenePrimitives3D({...source,schema_version:99}).status,'invalid')
const svg=geometrySceneSVG3D(source)
assert.equal(svg,geometrySceneSVG3D(structuredClone(source)))
assert.ok(svg.includes('data-id="line_ab"'));assert.ok(svg.includes('data-id="plane_abc"'))
const face={id:'face',kind:'face',vertices:[[100,100,5],[200,100,5],[200,200,5],[100,200,5]]}
const line={id:'behind',kind:'segment',a:[50,150,10],b:[250,150,10]}
assert.deepEqual(hiddenIntervals3D(line,face),[[.25,.75]])
assert.deepEqual(hiddenIntervals3D({...line,a:[50,150,3],b:[250,150,3]},face),[])
assert.deepEqual(hiddenIntervals3D({...line,a:[50,50,10],b:[250,50,10]},face),[])
const crossing=hiddenIntervals3D({...line,a:[50,150,0],b:[250,150,10]},face)
assert.ok(crossing[0][0]>.5&&crossing[0][1]===.75)
const occlusion={...source,print_camera:camera,constructions:[],planes:[],edges:[],annotations:[],markings:[],faces:[{id:'opaque',boundary:['a','b','c','e']}],linear_objects:[{id:'rear',kind:'segment',a:'f',b:'g'}],points:[
  {id:'a',position:[-2,0,-2],label:null},{id:'b',position:[2,0,-2],label:null},{id:'c',position:[2,0,2],label:null},{id:'e',position:[-2,0,2],label:null},{id:'f',position:[-4,1,0],label:null},{id:'g',position:[4,1,0],label:null},
]}
assert.ok(geometrySceneSVG3D(occlusion).includes('stroke-dasharray="4 3"'),'SVG uses actual hidden intervals')
assert.ok(!geometrySceneSVG3D({...occlusion,print_camera:{...camera,projection:'perspective'}}).includes('stroke-dasharray'),'M2 does not claim perspective hidden-edge resolution')
assert.throws(()=>createProjection3D({...camera,position:camera.target},600,300))
assert.throws(()=>createProjection3D(camera,NaN,300))
const scene={...source,print_camera:camera,planes:[],faces:[{id:'face_abc',boundary:['a','b','c']}],points:[...source.points.filter(p=>p.id!=='d'),{id:'d',position:[2,0,0],label:'<&'}]}
assert.ok(geometrySceneSVG3D(scene).includes('&lt;&amp;'))
assert.ok(projectScene3D(source,camera,600,300).points.length===4)
let applied=source;const history=createGeometryHistory3D(source,next=>applied=next)
assert.ok(history.navigate(standardView3D(source.print_camera,'top')));assert.equal(history.provider.getSnapshot(),0)
const saved={...source,print_camera:history.getEditingCamera()};assert.ok(history.commit(saved))
history.navigate(standardView3D(saved.print_camera,'front'));assert.deepEqual(history.getScene().print_camera,saved.print_camera)
assert.ok(history.provider.undo());assert.deepEqual(applied,source)
assert.ok(history.provider.redo());assert.deepEqual(applied,saved)
assert.deepEqual(JSON.parse(JSON.stringify(applied)),saved)
console.log('PASS: M2 semantic adapters, orthographic/perspective projection, seven views, viewport resize, line/ray/near/far/polygon/plane clipping, SVG determinism/escaping, convex occlusion intervals, camera isolation and saved-view Undo/Redo')
