import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server')
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),math=load('geometry3dConstructedPlane'),p=load('geometry3dProjection'),display=load('geometry3dPlaneDisplay'),author=load('geometry3dAuthoring'),Viewport=load('GeometrySceneViewport').default
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
 const before=structuredClone(scene),expected=math.perpendicularPlaneSurface3D(scene,'P',{kind:'plane',id:'alpha'},angle,undefined,scene.planes.find(q=>q.id==='beta').display.intersection_mode)
 for(const mode of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection:mode,position:p.add(f.o,p.add(p.scale(f.x,10),p.add(p.scale(f.y,-14),p.scale(f.normal,12)))),target:f.o,vertical_span:70,fov_degrees:100}
  const i=author.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:()=>assert.fail('preview must not persist'),notify:()=>{}})
  assert.ok(i.editPlaneOrientation('beta'));const state=i.snapshot()
  assert.deepEqual(state.previewSurfacePolygons,expected.polygons);assert.deepEqual(state.preview,[])
  const confirmed=p.displayPrimitives3D(p.scenePrimitives3D(scene).primitives).primitives.filter(q=>q.kind==='plane'&&q.id==='beta')
  assert.deepEqual(state.previewSurfacePolygons,confirmed.map(q=>q.displayPatch))
  const html=renderToStaticMarkup(React.createElement(Viewport,{scene,camera,interactive:true,constructionPreviewPolygons:state.previewSurfacePolygons}))
  const actual=[...html.matchAll(/<polygon data-perpendicular-plane-surface-preview="" points="([^"]*)"/g)].map(q=>q[1])
  const projection=p.createProjection3D(camera,520,300)
  const projected=expected.polygons.map(q=>projection.polygon(q).map(projection.screen)).filter(q=>q.length>=3)
  assert.deepEqual(actual,projected.map(q=>q.map(p=>`${p[0]},${p[1]}`).join(' ')))
  assert.deepEqual(p.projectScene3D(scene,camera,520,300,true).faces.filter(q=>q.id==='beta').map(q=>q.vertices),projected)
  i.cancel();assert.deepEqual(i.snapshot().previewSurfacePolygons,[]);assert.deepEqual(scene,before)
 }
 return expected
}
for(const intersectionMode of ['cross','first','opposite'])for(const offset of [-30,0,30])for(const transformed of [false,true])for(const shape of ['rectangle','parallelogram','cloud'])check(fixture({offset,transformed,shape,intersectionMode}))
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
 // Orientation edits retain mode, IDs, and history; cancellation is already
 // checked above without changing the committed scene.
 let value=fixture({offset:8,intersectionMode}).scene
 const initial=structuredClone(value),f=display.planeDisplay3D(value.planes[0],value),P=value.points.find(q=>q.id==='P').position
 const camera={...value.print_camera,position:p.add(P,p.add(p.scale(f.x,5),p.add(p.scale(f.y,-7),p.scale(f.normal,8)))),target:P},view=p.createProjection3D(camera,800,600)
 const history=m.createGeometryHistory3D(value,s=>{value=s}),i=author.createAuthoringInteraction3D({getScene:()=>value,getCamera:()=>camera,commit:s=>history.commit(s),notify:()=>{}})
 const pointer=world=>{const q=view.screen(view.view(world));return {x:q[0],y:q[1],width:800,height:600,pointerId:1,button:0,altKey:false}}
 assert.ok(i.editPlaneOrientation('beta'))
 i.pointer('down',pointer(i.snapshot().orientationHandlePreview[1]));i.pointer('move',pointer(p.add(P,p.scale(p.add(p.scale(f.x,Math.cos(.8)),p.scale(f.y,Math.sin(.8))),2))));i.pointer('up',pointer(P))
 const preview=i.snapshot().previewSurfacePolygons
 assert.deepEqual(value,initial);assert.ok(i.finish())
 assert.equal(value.planes.find(q=>q.id==='beta').display.intersection_mode,intersectionMode)
 assert.deepEqual(p.displayPrimitives3D(p.scenePrimitives3D(value).primitives).primitives.filter(q=>q.kind==='plane'&&q.id==='beta').map(q=>q.displayPatch),preview)
 assert.deepEqual(value.constructions[0].output_point_ids,initial.constructions[0].output_point_ids)
 const edited=structuredClone(value);assert.ok(history.provider.undo());assert.deepEqual(value,initial);assert.ok(history.provider.redo());assert.deepEqual(value,edited)
}
console.log('PASS: preview/confirmed polygon and projection parity, signed offsets, transformed/skewed/cloud references, disconnected/empty/tangent intersections, cancellation and temporary state')
