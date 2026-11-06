import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),math=load('geometry3dConstructedPlane'),p=load('geometry3dProjection'),d=load('geometry3dPlaneDisplay'),g=load('geometry3dAuthoring')
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),Controls=load('GeometryPlaneControls').default,Viewport=load('GeometrySceneViewport').default
const ref={kind:'plane',id:'alpha'},mean=points=>points[0].map((_,i)=>points.reduce((sum,q)=>sum+q[i],0)/points.length)
function fixture({offset=0,v=0,u=0,angle=0,shape='rectangle',transformed=false,intersectionMode='cross'}={}){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=plane.resizePlaneDisplay3D(scene,'alpha',2,2);scene=plane.setPlaneShape3D(scene,'alpha',shape,.6)
 if(transformed)scene=plane.transformPlane3D(scene,'alpha',[2,-3,1],[1,2,3],.6)
 const f=d.planeDisplay3D(scene.planes[0],scene),P=p.add(f.o,p.add(p.scale(f.normal,offset),p.add(p.scale(f.x,u),p.scale(f.y,v))))
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:P,label:null,visibility:'hidden'}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',ref,angle,'beta').scene
 scene=m.transactGeometryScene3D(scene,s=>s.planes.find(p=>p.id==='beta').display.intersection_mode=intersectionMode)
 return {scene,f,P,angle}
}
function check(value){
 const {scene,f,P,angle}=value,before=structuredClone(scene),surface=math.perpendicularPlaneSurface3D(scene,'P',ref,angle,undefined,scene.planes.find(q=>q.id==='beta').display.intersection_mode)
 const t=p.add(p.scale(f.x,Math.cos(angle)),p.scale(f.y,Math.sin(angle))),normal=p.cross(t,f.normal)
 for(const mode of ['orthographic','perspective']){
  const target=p.add(f.o,p.scale(f.normal,.6)),camera={...scene.print_camera,projection:mode,position:p.add(target,p.scale(normal,12)),target,up:f.normal,vertical_span:70,fov_degrees:100}
  const view=p.createProjection3D(camera,1000,800),pointer=world=>{const q=view.screen(view.view(world));return {x:q[0],y:q[1],width:1000,height:800,pointerId:1,button:0,altKey:false}}
  assert.deepEqual(p.projectScene3D(scene,camera,1000,800).faces.filter(q=>q.id==='beta').map(q=>q.vertices),p.projectScene3D(scene,camera,1000,800,true).faces.filter(q=>q.id==='beta').map(q=>q.vertices))
  const intersectionMode=scene.planes.find(q=>q.id==='beta').display.intersection_mode
  if(intersectionMode!=='cross'){
   const cross=math.perpendicularPlaneSurface3D(scene,'P',ref,angle)
   for(let j=0;j<cross.polygons.length;j++)if(j%2===(intersectionMode==='first'?1:0))assert.notEqual(g.pickGeometry3D(scene,camera,pointer(mean(cross.polygons[j])))?.id,'beta')
  }
  for(const polygon of surface.polygons){
   const q=pointer(mean(polygon));assert.equal(g.pickGeometry3D(scene,camera,q)?.id,'beta')
   const i=g.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:()=>assert.fail('selection must not commit'),notify:()=>{}})
   i.pointer('down',q);i.pointer('up',q);assert.equal(i.snapshot().selected,'beta')
   const selected=scene.planes.find(q=>q.id===i.snapshot().selected)
   assert.match(renderToStaticMarkup(React.createElement(Controls,{scene,selected,disabled:false,onCommit:()=>{},onEditOrientation:()=>{}})),/button/)
   assert.ok(i.editPlaneOrientation('beta'));i.cancel();assert.deepEqual(scene,before)
  }
  // The old patch reaches past P; no portion outside the new polygons may hit.
  const outside=Math.abs(surface.signedOffset)>1e-9?p.add(P,p.scale(f.normal,Math.sign(surface.signedOffset)*.7)):p.add(P,p.scale(t,1.7))
  assert.notEqual(g.pickGeometry3D(scene,camera,pointer(outside))?.id,'beta')
  for(const grip of d.planeDisplay3D(scene.planes.find(q=>q.id==='beta'),scene).grips)assert.equal(g.planeResizeTarget3D(scene,camera,pointer(grip.position),'beta'),null)
  for(let j=1;j<surface.segments.length;j++){
   const gap=p.add(mean([surface.segments[j-1][1],surface.segments[j][0]]),p.scale(f.normal,intersectionMode==='opposite'?-.7:.7))
   assert.notEqual(g.pickGeometry3D(scene,camera,pointer(gap))?.id,'beta')
  }
  if(!surface.polygons.length)assert.notEqual(g.pickGeometry3D(scene,camera,pointer(p.add(P,p.scale(f.normal,.5))))?.id,'beta')
  assert.notEqual(g.pickGeometry3D(scene,{...camera,far:2},pointer(p.add(f.o,p.scale(f.normal,.7))))?.id,'beta')
  const html=renderToStaticMarkup(React.createElement(Viewport,{scene,camera,interactive:true,selectedSolidId:'beta',interactionTool:'select'}))
  assert.ok(!html.includes('data-plane-resize'))
 }
 assert.deepEqual(scene,before)
 return surface
}
for(const intersectionMode of ['cross','first','opposite'])for(const offset of [-20,0,20])for(const transformed of [false,true])for(const shape of ['rectangle','parallelogram','cloud'])check(fixture({offset,transformed,shape,angle:.4,intersectionMode}))
check(fixture({v:3,offset:10}));check(fixture({u:1,v:1,angle:-Math.PI/4}))
let disconnected
for(let v=.7;v<1;v+=.005){const value=fixture({v,shape:'cloud',transformed:true});if(math.perpendicularPlaneSurface3D(value.scene,'P',ref,0).segments.length>1){disconnected=value;break}}
assert.ok(disconnected);assert.ok(check(disconnected).segments.length>1)
for(const intersectionMode of ['cross','first','opposite']){
 const scene=m.transactGeometryScene3D(disconnected.scene,s=>s.planes.find(q=>q.id==='beta').display.intersection_mode=intersectionMode)
 assert.ok(check({...disconnected,scene}).segments.length>1)
 check(fixture({v:3,offset:10,intersectionMode}));check(fixture({u:1,v:1,angle:-Math.PI/4,intersectionMode}))
}
// Two parallel constructed surfaces: camera reversal selects the nearer plane.
let {scene,f}=fixture({offset:4})
scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'Q',position:p.add(f.o,p.add(p.scale(f.y,.3),p.scale(f.normal,4))),label:null,visibility:'hidden'}))
scene=a.createPerpendicularPlaneThroughPoint3D(scene,'Q',ref,0,'gamma').scene
for(const mode of ['orthographic','perspective'])for(const sign of [-1,1]){
 const target=p.add(f.o,p.scale(f.normal,.7)),camera={...scene.print_camera,projection:mode,position:p.add(target,p.scale(f.y,sign*10)),target,up:f.normal},view=p.createProjection3D(camera,800,600),q=view.screen(view.view(target))
 assert.equal(g.pickGeometry3D(scene,camera,{x:q[0],y:q[1],width:800,height:600})?.id,sign<0?'beta':'gamma')
 const blocked=plane.createPlaneAt3D(scene,p.add(f.o,p.add(p.scale(f.y,-.5),p.scale(f.normal,.7))),'XZ','blocker').scene
 assert.equal(g.pickGeometry3D(blocked,camera,{x:q[0],y:q[1],width:800,height:600})?.id,sign<0?'blocker':'gamma')
}
console.log('PASS: polygon interiors, disconnected gaps, empty/tangent and legacy-patch rejection, semantic/Properties selection, ordered depth, camera transforms and disabled legacy resize hits')
