import assert from 'node:assert/strict'
import {printableComponent as load} from './printable_test_modules.mjs'
const p=load('geometry3dProjection'),m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),stroke=load('geometry3dPlaneStroke')
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const owner=(id,representation='segment')=>({ownerId:id,representation,stroke:stroke.resolvePlaneBoundaryStroke3D({id,display:{stroke:{color:'#123ABC',width:2,style:'dotted'}}},representation)})
function synthetic(mode,faces,line){
 const projection=p.createProjection3D({...m.emptyGeometryScene3D().print_camera,projection:mode},800,600)
 return {projection,faces,lines:line?[line]:[],analyticSolids:[],annotations:[],points:[],status:'ok'}
}
const target={id:'back',kind:'segment',a:[-3,0,10],b:[3,0,10],planeBoundaries:[owner('back')],dashOffset:5}
const rect=(id,x0,x1,z=5)=>({id,kind:'plane',vertices:[[x0,-1,z],[x1,-1,z],[x1,1,z],[x0,1,z]],outline:false})
for(const mode of ['orthographic','perspective']){
 const view=synthetic(mode,[rect('front',-1,1)],target),before=structuredClone(view.lines)
 const classify=q=>p.projectedPlaneBoundaryStrokes3D(q,mode,new Map([['back',['other-alias']]]))
 let pieces=classify(view)
 assert.deepEqual(pieces.map(s=>s.hidden),[true,false,false])
 const hidden=pieces.find(s=>s.hidden);assert.ok(Math.abs(hidden.a[0]+1)<1e-8&&Math.abs(hidden.b[0]-1)<1e-8)
 for(const s of pieces){assert.equal(s.id,'back');assert.equal(s.planeBoundaries,target.planeBoundaries);assert.deepEqual(s.selectionAliases,['back','other-alias']);assert.ok(s.dashOffset>=5)}
 assert.deepEqual(view.lines,before);assert.deepEqual(classify(view),pieces)
 assert.ok(p.projectedEdgeStrokes3D(view,mode).every(s=>!s.hidden),'legacy rendering stays opt-out')
 // Finite separated contours preserve the gap. Overlapping occluders merge.
 pieces=classify({...view,faces:[rect('a',-2,-1),rect('b',1,2)]})
 assert.equal(pieces.filter(s=>s.hidden).length,2)
 assert.ok(pieces.some(s=>!s.hidden&&s.a[0]<=-1&&s.b[0]>=1))
 pieces=classify({...view,faces:[rect('a',-2,1),rect('b',-1,2)]})
 assert.equal(pieces.filter(s=>s.hidden).length,1)
 assert.equal(pieces.find(s=>s.hidden).a[0],-2);assert.equal(pieces.find(s=>s.hidden).b[0],2)
 for(const faces of [[],[rect('same-depth',-2,2,10)],[rect('behind',-2,2,15)],[rect('back',-2,2)],[{...rect('alias',-2,2),planeBoundaries:[owner('back')]}],[{id:'tangent',kind:'plane',vertices:[[0,0,5],[0,1,5],[0,2,5]]}]])assert.ok(classify({...view,faces}).every(s=>!s.hidden))
 // Ordinary outlines are expanded independently of generated segments.
 const ordinary={...rect('ordinary',-3,3,10),outline:true,planeBoundaries:[owner('ordinary','outline')]}
 const outlines=classify({...view,lines:[],faces:[ordinary,rect('front',-1,1)]})
 assert.ok(outlines.some(s=>s.hidden));assert.ok(outlines.every(s=>s.id==='ordinary'&&s.planeBoundaries===ordinary.planeBoundaries))
 assert.equal(classify({...view,lines:[],faces:[ordinary]}).length,4)
}
// Intersecting finite world-space planes, camera reversal, perspective depth,
// and view endpoint interpolation. The rear half switches under camera reversal.
for(const mode of ['orthographic','perspective'])for(const sign of [-1,1]){
 const camera={...m.emptyGeometryScene3D().print_camera,projection:mode,position:[0,0,sign*10],target:[0,0,0],up:[0,1,0],vertical_span:12}
 const projection=p.createProjection3D(camera,800,600)
 const worldFace=[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]],worldLine=[[-1,0,-1],[1,0,1]]
 const viewFace=worldFace.map(projection.view),viewLine=worldLine.map(projection.view)
 const line={id:'slanted',kind:'segment',a:projection.screen(viewLine[0]),b:projection.screen(viewLine[1]),viewA:viewLine[0],viewB:viewLine[1],planeBoundaries:[owner('slanted')]}
 const face={id:'reference',kind:'plane',outline:false,vertices:viewFace.map(projection.screen),viewVertices:viewFace}
 const q={...synthetic(mode,[face],line),projection},parts=p.projectedPlaneBoundaryStrokes3D(q,mode)
 assert.equal(parts.filter(s=>s.hidden).length,1)
 const h=parts.find(s=>s.hidden),world=p.scale(p.add(projection.world(h.viewA),projection.world(h.viewB)),.5)
 assert.ok(sign*world[2]<0)
 for(const s of parts)for(const key of ['a','b']){
  const screen=projection.screen(key==='a'?s.viewA:s.viewB)
  assert.ok(Math.hypot(...p.sub(screen,s[key]))<1e-7)
 }
}
function fixture(mode,cloud=false,outside=false){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=plane.resizePlaneDisplay3D(scene,'alpha',2,2)
 if(cloud)scene=plane.setPlaneShape3D(scene,'alpha','cloud',0)
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,outside?20:0,4],label:null,visibility:'hidden'}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},0,'beta').scene
 return m.transactGeometryScene3D(scene,s=>s.planes.find(q=>q.id==='beta').display.intersection_mode=mode)
}
for(const mode of ['cross','first','opposite'])for(const projection of ['orthographic','perspective'])for(const cloud of [false,true])for(const outside of [false,true]){
 const scene=fixture(mode,cloud,outside),snapshot=structuredClone(scene)
 const camera={...scene.print_camera,projection,position:[8,-10,12],target:[0,0,2],vertical_span:24}
 const draw=p.displayPrimitives3D(p.scenePrimitives3D(scene).primitives),q=p.projectScene3D(scene,camera,800,600,true)
 const legacy=p.projectedEdgeStrokes3D(q,projection),svg=p.geometrySceneSVG3D(scene)
 const result=p.projectedPlaneBoundaryStrokes3D(q,projection,draw.aliases)
 assert.ok(result.some(s=>s.id==='alpha'))
 assert.equal(result.some(s=>s.planeBoundaries.some(o=>o.ownerId==='beta')),!outside)
 if(!outside&&!cloud){
  const hiddenBeta=result.filter(s=>s.hidden&&s.planeBoundaries.some(o=>o.ownerId==='beta'))
  assert.equal(hiddenBeta.length>0,mode!=='first','only the retained rear half is obscured by the reference patch')
 }
 for(const s of result){
  assert.ok(s.planeBoundaries.length);assert.ok(s.selectionAliases.includes(s.id))
  for(const o of s.planeBoundaries)assert.ok(s.selectionAliases.includes(o.ownerId))
  if(s.viewA&&s.viewB)assert.ok(s.viewA.every(Number.isFinite)&&s.viewB.every(Number.isFinite))
 }
 assert.deepEqual(p.projectedPlaneBoundaryStrokes3D(q,projection,draw.aliases),result)
 assert.deepEqual(p.projectedEdgeStrokes3D(q,projection),legacy)
 assert.equal(p.geometrySceneSVG3D(scene),svg);assert.deepEqual(scene,snapshot)
 freeze(q.faces);freeze(q.lines)
 assert.deepEqual(p.projectedPlaneBoundaryStrokes3D(q,projection,draw.aliases),result)
}
console.log('PASS: finite plane occlusion, partial/merged/disconnected intervals, ordinary and constructed owners, modes, depth/camera reversal, perspective endpoints, self/coplanar rejection, immutable metadata and unchanged drawing paths')
