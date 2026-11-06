import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const THREE=requireFrontend('three'),{populateGeometrySceneViewport3D:populate}=load('GeometrySceneViewport'),{planeBoundaryVisibilityWebGL3D:plan}=load('geometry3dPlaneStrokeWebGL')
const p=load('geometry3dProjection'),m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),print=load('printableDocumentModel'),solid=load('geometry3dSolidAuthoring'),g=load('geometry3dAuthoring')
const tags=svg=>[...svg.matchAll(/<path\b[^>]*>/g)].map(q=>({raw:q[0],...Object.fromEntries([...q[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))}))
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
function fixture(mode='cross',projection='orthographic',sign=1,style='dotted'){
 let s=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 s=plane.resizePlaneDisplay3D(s,'alpha',2,2)
 s=m.transactGeometryScene3D(s,d=>d.points.push({id:'P',position:[0,0,sign*4],label:null,visibility:'hidden'}))
 s=a.createPerpendicularPlaneThroughPoint3D(s,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
 return m.transactGeometryScene3D(s,d=>{d.planes.find(q=>q.id==='beta').display.intersection_mode=mode;for(const q of d.planes)if(style!=='legacy')q.display.stroke={color:q.id==='alpha'?'#123ABC':'#ABC123',width:2,style};d.print_camera={...d.print_camera,projection,position:[8,-10,sign*12],target:[0,0,0],vertical_span:24}})
}
const settings=(s,values)=>m.transactGeometryScene3D(s,d=>{for(const [id,value] of Object.entries(values)){const q=d.planes.find(p=>p.id===id);q.display={...q.display,show_hidden_edges:value}}})
function draw(s,camera=s.print_camera){const group=new THREE.Group();populate(group,s,camera,800,600,new Set());return group}
const signature=o=>({type:o.type,id:o.userData.semanticId,color:o.material.color.getHexString(),opacity:o.material.opacity,width:o.material.linewidth,depthTest:o.material.depthTest,order:o.renderOrder,aliases:o.userData.selectionAliases,owners:o.userData.planeBoundaries,runs:o.userData.strokeRuns,visibility:o.userData.planeBoundaryVisibility,positions:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,v])=>[k,Array.from(v.array)]))})
const hidden=o=>o.userData.planeBoundaryVisibility==='hidden'||o.material.opacity===.45
const removeSVG=(svg,reject)=>tags(svg).filter(reject).reduce((s,t)=>s.replace(t.raw,''),svg)
const classified=s=>{const q=p.projectScene3D(s,s.print_camera,800,600,true);return p.projectedPlaneBoundaryStrokes3D(q,s.print_camera.projection,p.displayPrimitives3D(p.scenePrimitives3D(s).primitives).aliases)}
let cases=0
for(const mode of ['cross','first','opposite'])for(const projection of ['orthographic','perspective'])for(const sign of [-1,1])for(const style of ['legacy','dotted']){
 const base=fixture(mode,projection,sign,style),snapshot=structuredClone(base),svg=p.geometrySceneSVG3D(base,800,600),baseline=draw(base),intervals=classified(base)
 const explicitTrue=settings(base,{alpha:true,beta:true})
 assert.equal(p.geometrySceneSVG3D(explicitTrue,800,600),svg,'explicit true is byte-compatible with absence')
 assert.deepEqual(draw(explicitTrue).children.map(signature),baseline.children.map(signature))
 for(const values of [{alpha:false},{beta:false},{alpha:false,beta:false}]){
  const s=settings(base,values),before=structuredClone(s),result=p.geometrySceneSVG3D(freeze(s),800,600),group=draw(s)
  const omit=id=>values[id]===false
  assert.equal(result,removeSVG(svg,t=>t['data-plane-boundary']==='hidden'&&omit(t['data-id'])),'only disabled hidden tags disappear; all remaining tags/phase stay exact')
  assert.deepEqual(group.children.map(signature),baseline.children.filter(o=>!(hidden(o)&&omit(o.userData.semanticId))).map(signature),'remaining WebGL attributes, materials, IDs and phase stay exact')
  assert.deepEqual(classified(s),intervals);assert.deepEqual(s,before)
  const q=p.projectScene3D(s,s.print_camera,800,600,true),aliases=p.displayPrimitives3D(p.scenePrimitives3D(s).primitives).aliases,batches=plan(q,aliases,new Map(s.planes.map(p=>[p.id,p]))).batches
  assert.ok(batches.every(b=>!b.lines[0].hidden||!omit(p.effectivePlaneBoundaryOwner3D(b.lines[0].planeBoundaries).ownerId)))
  assert.deepEqual(tags(result).filter(t=>t['data-plane-boundary']==='visible'),tags(svg).filter(t=>t['data-plane-boundary']==='visible'))
  const pointer={x:400,y:300,width:800,height:600};assert.deepEqual(g.pickGeometry3D(s,s.print_camera,pointer),g.pickGeometry3D(base,base.print_camera,pointer))
  if(mode==='cross'&&sign===1&&style==='dotted'){
   const saved=freeze({version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:s}}]}]})
   const prepared=print.preparePrintableDocument(saved,'hidden-edge-toggle');assert.equal(prepared.issues.length,0)
   const block=prepared.revisions[0].blocks[0];assert.equal(block.svg,print.namespacePrintableSVG(p.geometrySceneSVG3D(s,block.size.width,block.size.height),block.scope))
   assert.ok(tags(block.svg).filter(t=>t['data-plane-boundary']==='hidden').every(t=>!omit(t['data-id'])))
  }
  cases++
 }
 assert.deepEqual(base,snapshot)
}
// The effective style owner governs filtering, not the representative ID or
// another selection alias. Exercise explicit-first and lexical fallback rules.
for(const firstStyled of [false,true])for(const secondStyled of [false,true]){
 let base=a.createPerpendicularPlaneThroughPoint3D(fixture('cross','perspective'),'P',{kind:'plane',id:'alpha'},.4,'beta2').scene
 base=m.transactGeometryScene3D(base,s=>{for(const [id,on,color] of [['beta',firstStyled,'#123ABC'],['beta2',secondStyled,'#FF0000']]){const q=s.planes.find(p=>p.id===id);if(on)q.display.stroke={color,width:2,style:'dotted'};else delete q.display.stroke}})
 const winner=firstStyled||!secondStyled?'beta':'beta2',loser=winner==='beta'?'beta2':'beta'
 const svg=p.geometrySceneSVG3D(base,800,600),baseline=draw(base)
 assert.ok(tags(svg).some(t=>t['data-id']==='beta'&&t['data-plane-boundary']==='hidden'))
 const wrongAlias=settings(base,{[loser]:false,[winner]:true})
 assert.equal(p.geometrySceneSVG3D(wrongAlias,800,600),svg);assert.deepEqual(draw(wrongAlias).children.map(signature),baseline.children.map(signature))
 const disabled=settings(base,{[winner]:false,[loser]:true})
 assert.equal(p.geometrySceneSVG3D(disabled,800,600),removeSVG(svg,t=>t['data-id']==='beta'&&t['data-plane-boundary']==='hidden'))
 assert.deepEqual(draw(disabled).children.map(signature),baseline.children.filter(o=>!(o.userData.semanticId==='beta'&&hidden(o))).map(signature))
 for(const object of draw(disabled).children.filter(o=>o.isLineSegments2&&o.userData.semanticId==='beta')){assert.ok(object.userData.selectionAliases.includes('beta2'));assert.equal(object.userData.planeBoundaries.length,2)}
}
// Coincident ordinary outlines use representative B but lexical explicit owner A.
let outlines=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','A').scene
outlines=plane.createPlaneAt3D(outlines,[0,0,0],'XY','B').scene
outlines=plane.createPlaneAt3D(outlines,[0,0,1],'XY','front').scene
outlines=plane.resizePlaneDisplay3D(outlines,'front',2.5,2.5)
outlines=m.transactGeometryScene3D(outlines,s=>{for(const q of s.planes)q.display.stroke={color:q.id==='A'?'#123ABC':'#FF0000',width:2,style:'dashed'};s.print_camera={...s.print_camera,position:[8,-10,12],target:[0,0,0],vertical_span:16}})
const outlineSVG=p.geometrySceneSVG3D(outlines,800,600),outlineObjects=draw(outlines).children
assert.ok(tags(outlineSVG).some(t=>t['data-id']==='B'&&t['data-plane-boundary']==='hidden'))
assert.equal(p.geometrySceneSVG3D(settings(outlines,{B:false,A:true}),800,600),outlineSVG)
const outlineOff=settings(outlines,{A:false,B:true})
assert.equal(p.geometrySceneSVG3D(outlineOff,800,600),removeSVG(outlineSVG,t=>t['data-id']==='B'&&t['data-plane-boundary']==='hidden'))
assert.deepEqual(draw(outlineOff).children.map(signature),outlineObjects.filter(o=>!(o.userData.semanticId==='B'&&hidden(o))).map(signature))
// Existing solid-hidden paths also honor the setting, even when no new plane
// occlusion replaces their legacy boundary path.
const cube=solid.defaultSolid3D('cube','cube');cube.parameters.side=6
const withSolid=solid.createSolid3D(fixture(),cube).scene
const solidSVG=p.geometrySceneSVG3D(withSolid,800,600)
assert.ok(tags(solidSVG).some(t=>t['data-id']==='beta'&&t.opacity==='0.45'&&!t['data-render-curve']))
const solidOff=settings(withSolid,{beta:false})
assert.equal(p.geometrySceneSVG3D(solidOff,800,600),removeSVG(solidSVG,t=>t['data-id']==='beta'&&t.opacity==='0.45'&&!t['data-render-curve']))
assert.deepEqual(draw(solidOff).children.map(signature),draw(withSolid).children.filter(o=>!(o.userData.semanticId==='beta'&&hidden(o)&&o.userData.planeBoundaries)).map(signature))
// A single ordinary plane can bypass split rendering by default. Disabling its
// hidden edges must use classifier-visible pieces without leaving an inline loop.
let single=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','single').scene
single=solid.createSolid3D(single,cube).scene
single=m.transactGeometryScene3D(single,s=>s.print_camera={...s.print_camera,position:[8,-10,12],target:[0,0,0],vertical_span:16})
assert.ok(classified(single).some(l=>l.id==='single'&&l.hidden))
const singleOff=settings(single,{single:false}),singleSVG=p.geometrySceneSVG3D(singleOff,800,600),singleGroup=draw(singleOff)
assert.ok(!tags(singleSVG).some(t=>t['data-id']==='single'&&t['data-plane-boundary']==='hidden'))
assert.ok(!singleGroup.children.some(o=>o.userData.semanticId==='single'&&(o.type==='LineLoop'||hidden(o))))
assert.deepEqual(classified(singleOff),classified(single))
const isolated=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','isolated').scene,isolatedOff=settings(isolated,{isolated:false})
assert.equal(p.geometrySceneSVG3D(isolatedOff),p.geometrySceneSVG3D(isolated))
assert.deepEqual(draw(isolatedOff).children.map(signature),draw(isolated).children.map(signature))
// Navigation recomputes visibility while retaining settings and geometry.
const disabled=settings(fixture(),{alpha:false,beta:false}),group=draw(disabled)
for(const camera of [{...disabled.print_camera,position:[8,-10,-12]},{...disabled.print_camera,vertical_span:12},{...disabled.print_camera,position:[10,-9,12],target:[2,1,0]}]){
 populate(group,disabled,camera,900,700,new Set(['beta']))
 assert.ok(!group.children.some(o=>o.userData.planeBoundaryVisibility==='hidden'))
 const saved=m.transactGeometryScene3D(disabled,s=>s.print_camera=camera);assert.ok(!p.geometrySceneSVG3D(saved).includes('data-plane-boundary="hidden"'))
}
console.log(`PASS: ${cases} filtering combinations, absent/true byte compatibility, exact visible intervals/styles/phase, effective-owner precedence, aliases, SVG/print/WebGL parity, solid fallback, camera navigation and immutable classification/picking`)
