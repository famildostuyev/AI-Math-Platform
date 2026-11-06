import assert from 'node:assert/strict'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),p=load('geometry3dProjection'),stroke=load('geometry3dPlaneStroke'),math=load('geometry3dConstructedPlane'),dihedral=load('geometry3dDihedralAuthoring'),solid=load('geometry3dSolidAuthoring')
const ref={kind:'plane',id:'alpha'}
const svgGeometry=svg=>[...svg.matchAll(/<(?:polygon|path)\b[^>]*>/g)].map(([tag])=>[...tag.matchAll(/\b(data-id|points|d|fill|fill-opacity|mask)="([^"]*)"/g)].map(q=>[q[1],q[2]]))
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='planeBoundaries').map(([k,q])=>[k,strip(q)])):v
function fixture(mode='cross',cloud=false,v=0){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=plane.resizePlaneDisplay3D(scene,'alpha',2,2)
 if(cloud)scene=plane.setPlaneShape3D(scene,'alpha','cloud',0)
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,v,4],label:null,visibility:'hidden'},{id:'Q',position:[1,v,4],label:null,visibility:'hidden'}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',ref,0,'beta').scene
 return m.transactGeometryScene3D(scene,s=>s.planes.find(q=>q.id==='beta').display.intersection_mode=mode)
}
function validate(scene){
 const before=structuredClone(scene),adapter=p.scenePrimitives3D(freeze(scene)),rawBefore=structuredClone(adapter.primitives),draw=p.displayPrimitives3D(freeze(adapter.primitives))
 assert.deepEqual(adapter.primitives,rawBefore)
 for(const q of draw.primitives)if(q.planeBoundaries){
  for(const owner of q.planeBoundaries){
   const record=scene.planes.find(r=>r.id===owner.ownerId);assert.ok(record)
   assert.deepEqual(owner.stroke,stroke.resolvePlaneBoundaryStroke3D(record,owner.representation));assert.ok(Object.isFrozen(owner))
  }
 }
 for(const projection of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection,position:[8,-10,12],target:[0,0,2],vertical_span:16},view=p.projectScene3D(scene,camera,800,600,true)
  for(const face of view.faces.filter(q=>q.kind==='plane')){
   assert.ok(face.planeBoundaries?.length)
   assert.equal(Object.getOwnPropertyDescriptor(face,'planeBoundaries').enumerable,false)
  }
  assert.ok(!JSON.stringify(view.faces).includes('planeBoundaries'),'runtime tags must not change SVG face hashing')
  for(const line of view.lines.filter(q=>q.planeBoundaries)){
   assert.ok(draw.primitives.some(q=>q.kind==='segment'&&q.id===line.id&&JSON.stringify(q.planeBoundaries)===JSON.stringify(line.planeBoundaries)))
  }
  for(const line of p.projectedEdgeStrokes3D(view,projection).filter(q=>q.planeBoundaries))assert.ok(view.lines.some(q=>q.id===line.id&&JSON.stringify(q.planeBoundaries)===JSON.stringify(line.planeBoundaries)))
 }
 assert.deepEqual(scene,before);assert.deepEqual(p.scenePrimitives3D(scene),adapter);assert.deepEqual(p.displayPrimitives3D(adapter.primitives),draw)
 return {adapter,draw}
}
let all=fixture()
all=a.createParallelPlaneThroughPoint3D(all,'P',ref,'parallel').scene
all=a.createGuidedPerpendicularPlane3D(all,ref,{kind:'points',a:'P',b:'Q'},'guided').scene
all=dihedral.createDihedral3D(all,[3,0,0],'XY','d').scene
all=m.transactGeometryScene3D(all,s=>s.planes.push({id:'half',kind:'half_plane',point_ids:[...s.planes.find(q=>q.id==='alpha').point_ids]}))
const {adapter:legacy}=validate(all)
for(const id of ['alpha','parallel','guided','half'])assert.deepEqual(legacy.primitives.find(q=>q.kind==='plane'&&q.id===id).planeBoundaries,[{ownerId:id,representation:'outline',stroke:stroke.resolvePlaneBoundaryStroke3D(all.planes.find(q=>q.id===id),'outline')}])
for(const id of ['beta','d_half_0','d_half_1'])assert.equal(legacy.primitives.find(q=>q.kind==='plane'&&q.id===id).planeBoundaries[0].stroke.color,'#334155')
assert.deepEqual(legacy.primitives.find(q=>q.id==='d_edge').planeBoundaries.map(q=>q.ownerId),['d_half_0','d_half_1'])
const styled=m.transactGeometryScene3D(all,s=>{for(const [i,q] of s.planes.entries())if(q.id!=='half')q.display={...(q.display??{width:4,height:3}),stroke:{color:i%2?'#123ABC':'#C0FFEE',width:2,style:i%2?'dotted':'dashed'}}})
validate(styled)
// Adding styles does not change coordinates, representative IDs, aliases, or SVG geometry.
assert.deepEqual(strip(p.scenePrimitives3D(styled)),strip(p.scenePrimitives3D(all)))
assert.deepEqual(strip(p.displayPrimitives3D(p.scenePrimitives3D(styled).primitives)),strip(p.displayPrimitives3D(p.scenePrimitives3D(all).primitives)))
assert.deepEqual(p.displayPrimitives3D(p.scenePrimitives3D(styled).primitives).aliases,p.displayPrimitives3D(p.scenePrimitives3D(all).primitives).aliases)
assert.deepEqual(svgGeometry(p.geometrySceneSVG3D(styled)),svgGeometry(p.geometrySceneSVG3D(all)))
const closed=dihedral.editDihedral3D(styled,'d',{angle_radians:0})
const closedAdapter=validate(closed).adapter
for(const q of closedAdapter.primitives.filter(q=>q.kind==='segment'&&q.id==='d_half_0'))assert.deepEqual(q.planeBoundaries.map(o=>o.ownerId),['d_half_0','d_half_1'])
// A standalone half-plane has no display dimensions by default. Do not add
// dimensions just to set a stroke: that would test a geometry change instead.
for(const mode of ['cross','first','opposite']){
 const plain=fixture(mode),configured=m.transactGeometryScene3D(plain,s=>{for(const q of s.planes)q.display.stroke={color:'#123ABC',width:3,style:'dotted'}})
 const result=validate(configured),expected=math.perpendicularPlaneSurface3D(configured,'P',ref,0,undefined,mode)
 assert.deepEqual(result.draw.primitives.filter(q=>q.kind==='plane'&&q.id==='beta').map(q=>q.displayPatch),expected.polygons)
 for(const analytic of [false,true]){
  const left=analytic?solid.createSphereAt3D(plain,[4,0,0],'XY','sphere').scene:plain,right=analytic?solid.createSphereAt3D(configured,[4,0,0],'XY','sphere').scene:configured
  for(const projection of ['orthographic','perspective']){
   const camera={...left.print_camera,projection,position:[8,-10,12],target:[0,0,2]}
   assert.deepEqual(svgGeometry(p.geometrySceneSVG3D({...left,print_camera:camera},800,600)),svgGeometry(p.geometrySceneSVG3D({...right,print_camera:camera},800,600)))
   assert.deepEqual(svgGeometry(p.geometrySceneSVG3D({...left,print_camera:camera},800,600,new Set(['beta']))),svgGeometry(p.geometrySceneSVG3D({...right,print_camera:camera},800,600,new Set(['beta']))))
  }
 }
}
// Coincident differently styled boundaries retain one drawing representative,
// the existing aliases, and both ordered ownership/style contributions.
let coincident=a.createPerpendicularPlaneThroughPoint3D(fixture(),'P',ref,0,'beta2').scene
coincident=m.transactGeometryScene3D(coincident,s=>{s.planes.find(q=>q.id==='beta').display.stroke={color:'#123ABC',width:1,style:'solid'};s.planes.find(q=>q.id==='beta2').display.stroke={color:'#ABC123',width:4,style:'dotted'}})
const {draw:merged}=validate(coincident)
const boundaries=merged.primitives.filter(q=>q.kind==='segment'&&q.id==='beta'&&q.planeBoundaries)
assert.ok(boundaries.length);assert.ok(!merged.primitives.some(q=>q.kind==='segment'&&q.id==='beta2'))
for(const q of boundaries){assert.deepEqual(q.planeBoundaries.map(o=>o.ownerId),['beta','beta2']);assert.deepEqual(q.planeBoundaries.map(o=>o.stroke.color),['#123ABC','#ABC123'])}
assert.ok(merged.aliases.get('beta').includes('beta2'))
const input=freeze([{id:'edge',kind:'segment',a:[0,0,0],b:[1,0,0]},{id:'beta',kind:'segment',a:[1,0,0],b:[0,0,0],planeBoundaries:boundaries[0].planeBoundaries}]),copy=structuredClone(input),dedup=p.displayPrimitives3D(input)
assert.equal(dedup.primitives.length,1);assert.equal(dedup.primitives[0].id,'edge');assert.deepEqual(dedup.aliases.get('edge'),['edge','beta']);assert.deepEqual(dedup.primitives[0].planeBoundaries,boundaries[0].planeBoundaries);assert.deepEqual(input,copy)
// Hidden/visible interval splits preserve all owner/style contributions.
const line={id:'beta',kind:'segment',a:[0,0,10],b:[10,0,10],planeBoundaries:boundaries[0].planeBoundaries},face={id:'occluder',kind:'face',vertices:[[2,-1,5],[8,-1,5],[8,1,5],[2,1,5]]}
const split=p.projectedEdgeStrokes3D({lines:[line],faces:[face],analyticSolids:[]},'orthographic')
assert.equal(split.length,3);assert.ok(split.some(q=>q.hidden));assert.ok(split.some(q=>!q.hidden))
for(const q of split){assert.equal(q.id,'beta');assert.deepEqual(q.planeBoundaries,boundaries[0].planeBoundaries)}
let disjoint
for(let v=.7;v<1;v+=.005){const s=fixture('cross',true,v);if(math.perpendicularPlaneSurface3D(s,'P',ref,0).segments.length>1){disjoint=s;break}}
assert.ok(disjoint)
for(const mode of ['cross','first','opposite']){
 const s=m.transactGeometryScene3D(disjoint,d=>{d.planes.find(q=>q.id==='beta').display.intersection_mode=mode}),result=validate(s)
 assert.ok(result.draw.primitives.filter(q=>q.kind==='segment'&&q.planeBoundaries?.some(o=>o.ownerId==='beta')).length>3)
}
console.log('PASS: boundary owner/style propagation, outline/segment defaults, coincident styles/aliases, split and disconnected boundaries, all modes, immutable metadata, unchanged geometry and SVG hash inputs')
