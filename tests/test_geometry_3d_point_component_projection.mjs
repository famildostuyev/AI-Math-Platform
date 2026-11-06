import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),THREE=requireFrontend('three')
const m=load('geometry3dModel'),p=load('geometry3dProjection'),a=load('geometry3dAuthoring'),plane=load('geometry3dPlaneAuthoring'),foot=load('geometry3dPlanePerpendicularAuthoring'),edit=load('geometry3dPerpendicularAuthoring'),solid=load('geometry3dSolidAuthoring'),parallel=load('geometry3dParallelAuthoring'),dihedral=load('geometry3dDihedralAuthoring'),print=load('printableDocumentModel'),Editor=load('GeometrySceneEditor').default,Viewport=load('GeometrySceneViewport'),{resolvePointVisibility3D:resolve}=load('geometry3dPointVisibility')
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
function fixture(kind='plain',projection='orthographic'){
 let s=kind==='cone'?solid.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','S').scene:kind==='plain'?m.emptyGeometryScene3D():plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 if(kind!=='cone')s=m.transactGeometryScene3D(s,d=>d.points.push({id:'P',position:[0,0,2],label:'P & α'}))
 if(kind.startsWith('foot'))s=foot.createPlanePerpendicular3D(s,'P',{kind:'plane',id:'alpha'},'foot').scene
 if(kind==='footShown')s=edit.editPerpendicularDisplay3D(s,'foot',{label_visibility:'visible'})
 return m.transactGeometryScene3D(s,d=>d.print_camera={...d.print_camera,projection,position:[8,-10,12],target:[0,0,0],vertical_span:16})
}
// Captured before V3.3, including construction-label gates and cone label layout.
// The shell capture used ASCII "P & ?"; Unicode is covered separately below.
const goldens={
 'plain/orthographic':'54e70b24b60024df14176508f0f573d7eecd8462b50eca233e2eabcb08c233ce',
 'plain/perspective':'a294224742d39533005e9ecb7acabcc985d40079e9961db4b15fdc58c3b2f393',
 'footHidden/orthographic':'00eeb0843beea475e7b6e7cd45c3df56fdf9a68e13610fecd82a53c401bf06a8',
 'footHidden/perspective':'9cbddcde0622aaeefa7d07de77d39c52670961e74c51780382d0b8bd2a5432b7',
 'footShown/orthographic':'9e91b1314cd9c9bfac1f8637ed089a5c92e2dec1c8665ed6f889cd23c9047ca5',
 'footShown/perspective':'2e9cf1137f25fdd0cdbc71f27a86a230051a50c8898051fcd8474f9c87a8deb9',
 'cone/orthographic':'4a986e38500e5f3a681c94dde9278e9545de2df3fde83837ba4a73411175ea84',
 'cone/perspective':'4e8f619f41188b403899d021da8e79ef88b12203e870f85ac26977078ded9aa7',
}
for(const [key,hash] of Object.entries(goldens)){const [kind,projection]=key.split('/');let s=fixture(kind,projection);if(kind!=='cone')s=m.transactGeometryScene3D(s,d=>d.points.find(q=>q.id==='P').label='P & ?');assert.equal(crypto.createHash('sha256').update(p.geometrySceneSVG3D(s,800,600)).digest('hex'),hash,key)}
const components=svg=>({circle:svg.match(/<circle data-id="P"[^>]*\/>/)?.[0],text:svg.match(/<text\b[^>]*>P &amp; α<\/text>/)?.[0]})
let cases=0
for(const projection of ['orthographic','perspective'])for(const marker of [undefined,'visible','hidden'])for(const label of [undefined,'visible','hidden'])for(const whole of [undefined,'visible','hidden'])for(const text of [null,'','P & α']){
 const s=m.transactGeometryScene3D(fixture('plain',projection),d=>{const q=d.points[0];q.label=text;for(const [key,value] of [['marker_visibility',marker],['label_visibility',label],['visibility',whole]])if(value!==undefined)q[key]=value})
 const before=structuredClone(s),expected=resolve(s.points[0]),q=p.projectScene3D(freeze(s),s.print_camera,800,600,true),point=q.points.find(q=>q.id==='P'),svg=p.geometrySceneSVG3D(s,800,600),drawn=components(svg)
 if(whole==='hidden'){assert.equal(point,undefined);assert.ok(!p.scenePrimitives3D(s).primitives.some(q=>q.id==='P'))}
 else {assert.ok(point,'retain label-only and fully component-hidden eligible records');assert.equal(point.markerVisible,expected.markerVisible);assert.equal(point.labelVisible,expected.labelVisible);assert.equal(point.label,text);assert.deepEqual(point.position,q.projection.screen(q.projection.view(s.points[0].position)))}
 assert.equal(!!drawn.circle,expected.markerVisible);assert.equal(!!drawn.text,expected.labelVisible)
 const xy=q.projection.screen(q.projection.view(s.points[0].position)),pointer={x:xy[0],y:xy[1],width:800,height:600}
 for(const pointsOnly of [false,true])assert.equal(a.pickGeometry3D(s,s.print_camera,pointer,pointsOnly)?.id,expected.markerVisible?'P':undefined)
 if(!expected.markerVisible)assert.equal(a.pickGeometry3D(s,s.print_camera,{...pointer,x:pointer.x+6,y:pointer.y-6},true),null,'label is not an independent hit target')
 const baseline=m.transactGeometryScene3D(s,d=>{delete d.points[0].marker_visibility;delete d.points[0].label_visibility}),old=p.geometrySceneSVG3D(baseline,800,600),original=components(old)
 let filtered=old;if(!expected.markerVisible&&original.circle)filtered=filtered.replace(original.circle,'');if(!expected.labelVisible&&original.text)filtered=filtered.replace(original.text,'')
 assert.equal(svg,filtered,'existing positions, text attributes, camera and styles remain exact')
 assert.equal(p.geometrySceneSVG3D(s,800,600),svg);assert.deepEqual(s,before)
 const interaction=a.createAuthoringInteraction3D({getScene:()=>s,getCamera:()=>s.print_camera,commit:()=>assert.fail('selection must not commit'),notify:()=>{}});interaction.select('P');assert.equal(interaction.snapshot().selected,'P')
 if(whole===undefined&&text==='P & α'&&marker!==undefined&&label!==undefined){
  const snapshot={version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:s}}]}]}
  const plan=print.preparePrintableDocument(snapshot,'point-components');assert.equal(plan.issues.length,0)
  const block=plan.revisions[0].blocks[0],expectedSVG=p.geometrySceneSVG3D(s,block.size.width,block.size.height)
  assert.equal(block.svg,print.namespacePrintableSVG(expectedSVG,block.scope));assert.equal(!!components(block.svg).circle,expected.markerVisible);assert.equal(!!components(block.svg).text,expected.labelVisible)
 }
 cases++
}
for(const projection of ['orthographic','perspective'])for(const gate of ['hidden','visible'])for(const marker of ['visible','hidden'])for(const label of ['visible','hidden']){
 let s=fixture(gate==='hidden'?'footHidden':'footShown',projection)
 s=m.transactGeometryScene3D(s,d=>Object.assign(d.points.find(q=>q.id==='foot_H'),{marker_visibility:marker,label_visibility:label}))
 const before=structuredClone(s),q=p.projectScene3D(s,s.print_camera,800,600,true),h=q.points.find(q=>q.id==='foot_H'),svg=p.geometrySceneSVG3D(s,800,600)
 assert.equal(h.markerVisible,marker==='visible');assert.equal(h.labelVisible,label==='visible'&&gate==='visible')
 assert.equal(s.points.find(q=>q.id==='foot_H').label,'H');assert.equal(h.label,gate==='hidden'?null:'H','legacy projected construction-label suppression remains compatible')
 assert.equal(svg.includes('<circle data-id="foot_H"'),marker==='visible');assert.equal(/<text[^>]*>H<\/text>/.test(svg),label==='visible'&&gate==='visible')
 assert.equal(q.lines.filter(l=>l.role==='right_angle').length,2);assert.deepEqual(s,before)
 s=edit.editPerpendicularDisplay3D(s,'foot',{marker_visibility:'hidden'})
 assert.equal(p.projectScene3D(s,s.print_camera,800,600,true).lines.filter(l=>l.role==='right_angle').length,0)
 assert.equal(p.projectScene3D(s,s.print_camera,800,600,true).points.find(q=>q.id==='foot_H').markerVisible,marker==='visible')
}
// Every pre-existing helper gate stays authoritative over explicit visible flags.
let helpers=fixture('footShown')
helpers=parallel.createPlaneParallel3D(helpers,'P',{kind:'plane',id:'alpha',angle_radians:.3},'parallel').scene
helpers=dihedral.createDihedral3D(helpers,[4,0,0],'XY','d').scene
const internal=['alpha_origin','alpha_x','alpha_y','parallel_end',...helpers.dihedrals[0].features.filter(f=>/^v_[0-3]$/.test(f.slot)).map(f=>f.entity_id)]
helpers=m.transactGeometryScene3D(helpers,s=>{for(const id of internal)Object.assign(s.points.find(q=>q.id===id),{label:'INTERNAL_HELPER',visibility:'visible',marker_visibility:'visible',label_visibility:'visible'})})
assert.ok(p.scenePrimitives3D(helpers).primitives.every(q=>!internal.includes(q.id)))
assert.ok(p.projectScene3D(helpers,helpers.print_camera,800,600,true).points.every(q=>!internal.includes(q.id)))
assert.ok(!p.geometrySceneSVG3D(helpers).includes('INTERNAL_HELPER'))
// Separate dihedral labels and anchored annotations are not intrinsic point labels.
let annotated=fixture('cone')
annotated=dihedral.createDihedral3D(annotated,[4,0,0],'XY','d').scene
annotated=m.transactGeometryScene3D(annotated,s=>{s.points.push({id:'P',position:[3,0,2],label:'Intrinsic',marker_visibility:'hidden',label_visibility:'hidden'});s.annotations.push({id:'note',content:'Independent note',format:'text',anchor:{kind:'point',point_id:'P'},offset_mm:[0,0]});s.dihedrals[0].label_visibility='visible'})
const aq=p.projectScene3D(annotated,annotated.print_camera,800,600,true),av=p.geometrySceneSVG3D(annotated)
assert.ok(aq.annotations.some(q=>q.id==='note'));assert.ok(aq.annotations.some(q=>q.id==='d'));assert.ok(av.includes('Independent note'));assert.ok(!av.includes('>Intrinsic</text>'))
// Frustum and analytic occlusion policy is preserved even for label-only points.
const clipped=m.transactGeometryScene3D(fixture(),s=>{s.points[0].position=[1e8,0,0];s.points[0].marker_visibility='hidden'})
assert.equal(p.projectScene3D(clipped,clipped.print_camera,800,600,true).points.length,0)
for(const marker of ['visible','hidden'])for(const label of ['visible','hidden']){
 const inside=m.transactGeometryScene3D(fixture('cone'),s=>s.points.push({id:'P',position:[0,0,s.solids[0].parameters.height/2],label:'Inside',marker_visibility:marker,label_visibility:label}))
 assert.ok(!p.projectScene3D(inside,inside.print_camera,800,600,true).points.some(q=>q.id==='P'));assert.ok(!p.geometrySceneSVG3D(inside).includes('>Inside</text>'))
}
// Label-only points remain present in the actual Properties object list.
const recover=m.transactGeometryScene3D(fixture(),s=>s.points[0].marker_visibility='hidden'),dom=requireFrontend('react-dom'),portal=dom.createPortal,oldDocument=globalThis.document
try{dom.createPortal=children=>children;globalThis.document={body:{}};const html=renderToStaticMarkup(React.createElement(Editor,{value:recover,onChange:()=>{},targetId:'frame',disabled:false}));assert.match(html,/<option value="P">/);assert.ok(html.includes('P &amp; α'))}
finally{dom.createPortal=portal;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument}
// Native consumers now use the same independent shared flags.
const nativeHidden=m.transactGeometryScene3D(recover,s=>s.points[0].label_visibility='hidden')
const group=new THREE.Group();Viewport.populateGeometrySceneViewport3D(group,nativeHidden,nativeHidden.print_camera,800,600,new Set())
assert.ok(!group.children.some(q=>q.isPoints&&q.userData.semanticId==='P'))
const viewport=renderToStaticMarkup(React.createElement(Viewport.default,{scene:nativeHidden,camera:nativeHidden.print_camera,interactive:true}))
assert.ok(!viewport.includes('data-label-id="P"'))
console.log(`PASS: ${cases} point component projections, 8 exact legacy SVG hashes, marker-only picking, semantic recovery, gates/symbols/annotations, clipping/occlusion, saved print, immutability and native component parity`)
