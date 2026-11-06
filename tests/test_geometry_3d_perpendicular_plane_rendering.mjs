import assert from 'node:assert/strict'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),math=load('geometry3dConstructedPlane'),p=load('geometry3dProjection'),display=load('geometry3dPlaneDisplay')
function fixture({offset=0,v=0,u=0,angle=.4,shape='rectangle',transformed=false,intersectionMode='cross'}={}){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=plane.resizePlaneDisplay3D(scene,'alpha',2,2);scene=plane.setPlaneShape3D(scene,'alpha',shape,.6)
 if(transformed)scene=plane.transformPlane3D(scene,'alpha',[2,-3,1],[1,2,3],.6)
 const f=display.planeDisplay3D(scene.planes[0],scene),P=p.add(f.o,p.add(p.scale(f.normal,offset),p.add(p.scale(f.x,u),p.scale(f.y,v))))
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:P,label:null}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},angle,'beta').scene
 scene=m.transactGeometryScene3D(scene,s=>s.planes.find(p=>p.id==='beta').display.intersection_mode=intersectionMode)
 return {scene,f,angle}
}
function check({scene,f,angle}){
 const before=structuredClone(scene),expected=math.perpendicularPlaneSurface3D(scene,'P',{kind:'plane',id:'alpha'},angle,undefined,scene.planes.find(q=>q.id==='beta').display.intersection_mode),adapter=p.scenePrimitives3D(scene)
 const drawn=p.displayPrimitives3D(adapter.primitives).primitives,patches=drawn.filter(q=>q.kind==='plane'&&q.id==='beta')
 assert.deepEqual(patches.map(q=>q.displayPatch),expected.polygons)
 assert.deepEqual(adapter.primitives.filter(q=>q.role==='plane_intersection').map(q=>[q.a,q.b]),expected.segments)
 assert.deepEqual(drawn.filter(q=>q.kind==='plane'&&q.id==='alpha').map(q=>q.displayPatch),[f.contour])
 const intersectionMode=scene.planes.find(q=>q.id==='beta').display.intersection_mode
 for(let i=0;i<expected.segments.length;i++){
  if(intersectionMode==='cross'){
   assert.deepEqual(patches[i*2].displayPatch.slice(0,2),expected.segments[i])
   assert.deepEqual(patches[i*2+1].displayPatch.slice(0,2),[...expected.segments[i]].reverse())
  }else assert.deepEqual(patches[i].displayPatch.slice(0,2),intersectionMode==='first'?expected.segments[i]:[...expected.segments[i]].reverse())
 }
 const hidden=m.transactGeometryScene3D(scene,s=>s.planes.find(q=>q.id==='beta').display.intersection_visibility='hidden')
 const hiddenDraw=p.displayPrimitives3D(p.scenePrimitives3D(hidden).primitives).primitives
 assert.deepEqual(hiddenDraw.filter(q=>q.kind==='plane'&&q.id==='beta').map(q=>q.displayPatch),expected.polygons)
 assert.equal(hiddenDraw.filter(q=>q.role==='plane_intersection').length,0)
 for(const mode of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection:mode,position:p.add(f.o,p.add(p.scale(f.x,10),p.add(p.scale(f.y,-14),p.scale(f.normal,12)))),target:f.o,vertical_span:70,fov_degrees:100},projection=p.createProjection3D(camera,800,600)
  const view=p.projectScene3D(scene,camera,800,600,true),faces=view.faces.filter(q=>q.id==='beta')
  assert.deepEqual(faces.map(q=>q.vertices),expected.polygons.map(q=>projection.polygon(q).map(projection.screen)).filter(q=>q.length>=3))
  assert.ok(faces.every(q=>q.kind==='plane'))
  const svg=p.geometrySceneSVG3D({...scene,print_camera:camera},800,600)
  assert.equal((svg.match(/<polygon data-id="beta"/g)??[]).length,faces.length)
  assert.equal(svg.includes('data-render-curve="plane_intersection"'),expected.segments.length>0)
  assert.ok(!svg.includes('beta_origin'))
  // Picking and rendering use the same derived surface polygons.
  const pick=p.projectScene3D(scene,camera,800,600).faces.filter(q=>q.id==='beta')
  assert.deepEqual(pick.map(q=>q.vertices),faces.map(q=>q.vertices))
 }
 assert.deepEqual(scene,before)
 return expected
}
for(const intersectionMode of ['cross','first','opposite'])for(const offset of [-20,0,20])for(const transformed of [false,true])for(const shape of ['rectangle','parallelogram','cloud'])check(fixture({offset,transformed,shape,intersectionMode}))
assert.equal(check(fixture({v:3,offset:10,angle:0})).polygons.length,0)
assert.equal(check(fixture({u:1,v:1,angle:-Math.PI/4})).polygons.length,0)
let disjoint
for(let v=.7;v<1;v+=.005){const value=fixture({shape:'cloud',v,offset:-10,angle:0,transformed:true});if(math.perpendicularPlaneSurface3D(value.scene,'P',{kind:'plane',id:'alpha'},0).segments.length>1){disjoint=value;break}}
assert.ok(disjoint);assert.ok(check(disjoint).segments.length>1)
for(const intersectionMode of ['cross','first','opposite']){
 const scene=m.transactGeometryScene3D(disjoint.scene,s=>s.planes.find(q=>q.id==='beta').display.intersection_mode=intersectionMode)
 assert.ok(check({...disjoint,scene}).segments.length>1)
 assert.equal(check(fixture({v:3,offset:10,angle:0,intersectionMode})).polygons.length,0)
 assert.equal(check(fixture({u:1,v:1,angle:-Math.PI/4,intersectionMode})).polygons.length,0)
}
// Parallel constructed planes keep their existing independent patch.
const base=fixture().scene,parallel=a.createParallelPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},'gamma').scene
const gamma=p.displayPrimitives3D(p.scenePrimitives3D(parallel).primitives).primitives.filter(q=>q.kind==='plane'&&q.id==='gamma')
assert.equal(gamma.length,1);assert.deepEqual(gamma[0].displayPatch,display.planeDisplay3D(parallel.planes.find(q=>q.id==='gamma'),parallel).contour)
console.log('PASS: confirmed surfaces, shared guide edges, signed offsets, disconnected/empty/tangent patches, stable IDs, saved-camera SVG, aligned picking and unrelated planes')
