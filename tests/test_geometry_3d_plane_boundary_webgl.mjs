import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const THREE=requireFrontend('three'),{populateGeometrySceneViewport3D:populate}=load('GeometrySceneViewport'),{planeBoundaryVisibilityWebGL3D:plan,planeStrokeWebGL3D:paint}=load('geometry3dPlaneStrokeWebGL')
const p=load('geometry3dProjection'),m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),math=load('geometry3dConstructedPlane'),resolver=load('geometry3dPlaneStroke')
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const near=(a,b)=>assert.ok(Math.abs(a-b)<.003,`${a} != ${b}`)
const number=v=>String(Math.abs(v)<.0000005?0:Number(v.toFixed(6))),xy=v=>v.slice(0,2).map(number).join(',')
const tags=svg=>[...svg.matchAll(/<path\b[^>]*>/g)].map(q=>Object.fromEntries([...q[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])))
function fixture(mode='cross',projection='orthographic',sign=1,style='solid',offset=4){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=plane.resizePlaneDisplay3D(scene,'alpha',2,2)
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,offset],label:null,visibility:'hidden'}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
 return m.transactGeometryScene3D(scene,s=>{for(const q of s.planes){if(style==='legacy')delete q.display.stroke;else q.display.stroke={color:q.id==='alpha'?'#123ABC':'#ABC123',width:2,style}}s.planes.find(q=>q.id==='beta').display.intersection_mode=mode;s.print_camera={...s.print_camera,projection,position:[8,-10,sign*12],target:[0,0,0],vertical_span:24}})
}
function draw(scene,camera=scene.print_camera,width=800,height=600,selected=[]){const group=new THREE.Group();populate(group,scene,camera,width,height,new Set(selected));return group}
const wide=group=>group.children.filter(q=>q.isLineSegments2),classified=group=>wide(group).filter(q=>q.userData.planeBoundaryVisibility)
const fills=group=>group.children.filter(q=>q.isMesh&&!q.isLineSegments2).map(q=>({id:q.userData.semanticId,positions:Array.from(q.geometry.attributes.position.array),opacity:q.material.opacity}))
let checks=0
for(const mode of ['cross','first','opposite'])for(const projection of ['orthographic','perspective'])for(const sign of [-1,1])for(const style of ['legacy','solid','dashed','dotted'])for(const offset of [-4,4]){
 const scene=fixture(mode,projection,sign,style,offset),snapshot=structuredClone(scene),q=p.projectScene3D(scene,scene.print_camera,800,600,true),aliases=p.displayPrimitives3D(p.scenePrimitives3D(scene).primitives).aliases,before=structuredClone(q.lines)
 const expected=plan(q,aliases),group=draw(freeze(scene)),svg=p.geometrySceneSVG3D(scene,800,600),paths=tags(svg).filter(t=>t['data-plane-boundary'])
 assert.ok(expected.replaced.size);assert.ok(classified(group).some(o=>o.userData.planeBoundaryVisibility==='hidden'))
 for(const batch of expected.batches){
  const object=classified(group).find(o=>o.userData.semanticId===batch.lines[0].id&&o.userData.planeBoundaryVisibility===(batch.lines[0].hidden?'hidden':'visible')&&JSON.stringify(o.userData.planeBoundaries)===JSON.stringify(batch.lines[0].planeBoundaries))
  assert.ok(object,'classified intervals have exactly one material batch')
  assert.equal(classified(group).filter(o=>o.userData.semanticId===object.userData.semanticId&&o.userData.planeBoundaryVisibility===object.userData.planeBoundaryVisibility&&JSON.stringify(o.userData.planeBoundaries)===JSON.stringify(object.userData.planeBoundaries)).length,1)
  const hidden=batch.lines[0].hidden,pattern=hidden?(style==='legacy'||style==='solid'?[4,3]:[12,6,2,6]):batch.style.pattern.dashArray
  assert.deepEqual(object.userData.strokePattern,pattern);assert.equal(object.material.opacity,hidden?.45:1);assert.equal(object.material.linewidth,batch.style.width);assert.equal(object.material.color.getHexString(),batch.style.color.slice(1).toLowerCase());assert.equal(object.material.dashed,hidden||batch.style.style!=='dotted')
  assert.equal(object.material.depthTest,batch.outline&&!hidden);assert.equal(object.material.depthWrite,batch.outline&&!hidden)
  assert.equal(object.renderOrder,hidden?2:batch.outline?0:3)
  assert.deepEqual(object.userData.selectionAliases,batch.aliases)
  const start=object.geometry.attributes.instanceStart,end=object.geometry.attributes.instanceEnd
  let vertex=0
  const drawable=batch.lines.filter(l=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1])>1e-6)
  for(let k=0;k<drawable.length;k++){
   const line=drawable[k],run=object.userData.strokeRuns[k]
   assert.equal(run.phase,line.dashOffset)
   const tag=paths.find(t=>t['data-id']===line.id&&t.d===`M${xy(line.a)} L${xy(line.b)}`&&t['data-plane-boundary']===(hidden?'hidden':'visible'));assert.ok(tag,'SVG/WebGL consume identical visibility intervals')
   if(pattern.length){assert.equal(tag['stroke-dasharray'],pattern.join(' '));assert.equal(tag['stroke-dashoffset'],number(-run.phase))}
   for(const [lo,hi] of run.intervals){
    for(const [attribute,distance] of [[start,lo],[end,hi]]){
     const world=[attribute.getX(vertex),attribute.getY(vertex),attribute.getZ(vertex)],screen=q.projection.screen(q.projection.view(world)),t=distance/run.length
     near(screen[0],line.a[0]+t*(line.b[0]-line.a[0]));near(screen[1],line.a[1]+t*(line.b[1]-line.a[1]))
    }
    // Independent arclength oracle checks both painted and gap parts of every
    // pattern cycle, including the short dash in the four-entry hidden pattern.
    for(const t of [.1,.5,.9])if(pattern.length){const period=pattern.reduce((s,v)=>s+v,0),at=((lo+(hi-lo)*t+run.phase)%period+period)%period;let cursor=0,painted=false;for(let j=0;j<pattern.length;j++){if(at>=cursor-1e-7&&at<cursor+pattern[j]-1e-7&&j%2===0)painted=true;cursor+=pattern[j]}assert.ok(painted)}
    vertex++;checks++
   }
   if(pattern.length)for(let t=.137;t<run.length;t+=.71){const at=((t+run.phase)%pattern.reduce((s,v)=>s+v,0)+pattern.reduce((s,v)=>s+v,0))%pattern.reduce((s,v)=>s+v,0);let cursor=0,painted=false;for(let j=0;j<pattern.length;j++){if(at>=cursor&&at<cursor+pattern[j]&&j%2===0)painted=true;cursor+=pattern[j]}assert.equal(run.intervals.some(([a,b])=>t>=a&&t<b),painted)}
  }
  assert.equal(vertex,start.count)
 }
 assert.equal(classified(group).length,expected.batches.length)
 for(const id of expected.replaced)assert.ok(!group.children.some(o=>o.type==='LineLoop'&&o.userData.semanticId===id),'no legacy duplicate outline')
 assert.deepEqual(fills(group),fills(draw(scene)));assert.ok(fills(group).every(o=>o.opacity===.15))
 const selected=classified(draw(scene,scene.print_camera,800,600,['alpha','beta']))
 for(const object of selected)assert.equal(object.material.color.getHexString(),object.userData.semanticId==='alpha'?(style==='legacy'?'94a3b8':'123abc'):'f97316')
 assert.deepEqual(plan(q,aliases),expected);assert.deepEqual(q.lines,before);assert.deepEqual(scene,snapshot);assert.equal(p.geometrySceneSVG3D(scene,800,600),svg)
}
// Exact screen-arclength phase survives arbitrary clipping/splitting. Both long
// and short painted runs are physically present, rather than a two-entry fallback.
for(const projection of ['orthographic','perspective']){
 const camera={...m.emptyGeometryScene3D().print_camera,projection,position:[0,0,0],target:[0,0,1],up:[0,1,0]},q=p.createProjection3D(camera,800,600),viewA=[-2,0,5],viewB=[2,0,20]
 const line={id:'x',kind:'segment',a:q.screen(viewA),b:q.screen(viewB),viewA,viewB,hidden:true,dashOffset:21},style=resolver.resolvePlaneBoundaryStroke3D({display:{stroke:{color:'#123ABC',width:2,style:'dotted'}}},'segment')
 const object=paint(line,style,q,800,600,{planeVisibility:true}),run=object.userData.strokeRuns[0]
 assert.deepEqual(run.intervals[0],[5,17]);assert.deepEqual(run.intervals[1],[23,25])
}
// Camera orbit reversal, pan and zoom regenerate intervals and resolution through
// the existing populate path, without changing stored cameras or scene geometry.
const scene=fixture(),snapshot=structuredClone(scene),group=draw(scene),old=classified(group)[0];let disposed=0
old.geometry.addEventListener('dispose',()=>disposed++);old.material.addEventListener('dispose',()=>disposed++)
const original=JSON.stringify(classified(group).map(o=>o.userData.strokeRuns))
for(const camera of [{...scene.print_camera,position:[8,-10,-12]},{...scene.print_camera,position:[10,-9,12],target:[2,1,0]},{...scene.print_camera,vertical_span:12}]){
 populate(group,scene,camera,1000,700,new Set())
 assert.notEqual(JSON.stringify(classified(group).map(o=>o.userData.strokeRuns)),original)
 assert.ok(classified(group).every(o=>JSON.stringify(o.material.resolution.toArray())==='[1000,700]'))
}
assert.equal(disposed,2);assert.deepEqual(scene,snapshot)
// Coincident constructed owners: semantic aliases survive, explicit then lexical
// precedence wins. Selecting a secondary owner highlights only temporary color.
let coincident=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},.4,'beta2').scene
coincident=m.transactGeometryScene3D(coincident,s=>s.planes.find(q=>q.id==='beta2').display.stroke={color:'#FF0000',width:8,style:'dotted'})
for(const object of classified(draw(coincident,coincident.print_camera,800,600,['beta2'])).filter(o=>o.userData.semanticId==='beta')){assert.equal(object.material.linewidth,2);assert.equal(object.material.color.getHexString(),'f97316');assert.ok(object.userData.selectionAliases.includes('beta2'));assert.equal(object.userData.planeBoundaries.length,2)}
// Coincident ordinary outlines under a third finite plane keep a single batch
// per visibility state, all owners and aliases, and the lexical explicit style.
let ordinary=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','A').scene
ordinary=plane.createPlaneAt3D(ordinary,[0,0,0],'XY','B').scene
ordinary=plane.createPlaneAt3D(ordinary,[0,0,1],'XY','front').scene
ordinary=plane.resizePlaneDisplay3D(ordinary,'front',2.5,2.5)
ordinary=m.transactGeometryScene3D(ordinary,s=>{s.planes.find(q=>q.id==='A').display.stroke={color:'#123ABC',width:2,style:'dashed'};s.planes.find(q=>q.id==='B').display.stroke={color:'#FF0000',width:8,style:'dotted'};s.print_camera={...s.print_camera,position:[8,-10,12],target:[0,0,0],vertical_span:16}})
const outlines=classified(draw(ordinary)).filter(o=>['A','B'].includes(o.userData.semanticId));assert.equal(outlines.length,2)
for(const o of outlines){assert.equal(o.userData.semanticId,'B');assert.equal(o.material.color.getHexString(),'123abc');assert.deepEqual(o.userData.selectionAliases,['A','B']);assert.equal(o.userData.planeBoundaries.length,2)}
// Cloud-contour disconnected and empty surfaces never fabricate strokes across
// the missing reference intervals. Every run still comes from the classifier.
let disconnected
// The cloud's narrow lobes use a horizontal cut for a deterministic disconnected case.
if(!disconnected){let s=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene;s=plane.resizePlaneDisplay3D(s,'alpha',2,2);s=plane.setPlaneShape3D(s,'alpha','cloud',0);for(let v=.7;v<1;v+=.005){let q=m.transactGeometryScene3D(s,d=>d.points.push({id:'P',position:[0,v,4],label:null,visibility:'hidden'}));q=a.createPerpendicularPlaneThroughPoint3D(q,'P',{kind:'plane',id:'alpha'},0,'beta').scene;if(math.perpendicularPlaneSurface3D(q,'P',{kind:'plane',id:'alpha'},0).segments.length>1){disconnected=q;break}}}
assert.ok(disconnected)
for(const mode of ['cross','first','opposite']){
 const s=m.transactGeometryScene3D(disconnected,d=>d.planes.find(q=>q.id==='beta').display.intersection_mode=mode),q=p.projectScene3D(s,s.print_camera,800,600,true),expected=plan(q,p.displayPrimitives3D(p.scenePrimitives3D(s).primitives).aliases)
 assert.deepEqual(classified(draw(s)).flatMap(o=>o.userData.strokeRuns).map(r=>[r.length,r.phase]),expected.batches.flatMap(b=>b.lines.filter(l=>Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1])>1e-6).map(l=>[Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1]),l.dashOffset])))
}
const empty=m.transactGeometryScene3D(scene,d=>d.points.find(q=>q.id==='P').position=[0,20,4]);assert.ok(!wide(draw(empty)).some(o=>o.userData.semanticId==='beta'))
const isolated=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','only').scene
assert.equal(wide(draw(isolated)).length,0);assert.ok(draw(isolated).children.some(o=>o.type==='LineLoop'))
console.log(`PASS: ${checks} exact WebGL painted runs, four-entry dash-dot/phase, SVG interval parity, legacy/explicit modes, camera recomputation, owners/aliases, disconnected/empty contours and immutable fills`)
