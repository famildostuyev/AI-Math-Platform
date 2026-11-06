import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const React=requireFrontend('react'),{renderToStaticMarkup}=requireFrontend('react-dom/server'),THREE=requireFrontend('three')
const Viewport=load('GeometrySceneViewport'),m=load('geometry3dModel'),p=load('geometry3dProjection'),a=load('geometry3dAuthoring'),plane=load('geometry3dPlaneAuthoring'),foot=load('geometry3dPlanePerpendicularAuthoring'),edit=load('geometry3dPerpendicularAuthoring'),solid=load('geometry3dSolidAuthoring')
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const markers=group=>group.children.filter(o=>o.isPoints)
function draw(scene,camera=scene.print_camera,selected=[],group=new THREE.Group()) {Viewport.populateGeometrySceneViewport3D(group,scene,camera,800,600,new Set(selected));return group}
function label(scene,camera=scene.print_camera){
 const html=renderToStaticMarkup(React.createElement(Viewport.default,{scene,camera,interactive:true})),span=html.match(/<span[^>]*data-label-id="P"[^>]*>[^<]*<\/span>/)?.[0]
 return {html,span}
}
function fixture(projection='orthographic'){
 return m.transactGeometryScene3D(m.emptyGeometryScene3D(),s=>{s.points.push({id:'P',position:[0,0,2],label:'P & α'});s.print_camera={...s.print_camera,projection,position:[8,-10,12],target:[0,0,0],vertical_span:16}})
}
const sig=group=>markers(group).map(o=>({id:o.userData.semanticId,positions:Array.from(o.geometry.attributes.position.array),color:o.material.color.getHexString(),size:o.material.size,attenuation:o.material.sizeAttenuation,opacity:o.material.opacity,depthTest:o.material.depthTest,depthWrite:o.material.depthWrite,order:o.renderOrder}))
let cases=0
for(const projection of ['orthographic','perspective'])for(const marker of [undefined,'visible','hidden'])for(const text of [null,'','P & α'])for(const intrinsic of [undefined,'visible','hidden'])for(const whole of [undefined,'visible','hidden']){
 const s=m.transactGeometryScene3D(fixture(projection),d=>{const q=d.points[0];q.label=text;for(const [key,value] of [['marker_visibility',marker],['label_visibility',intrinsic],['visibility',whole]])if(value!==undefined)q[key]=value})
 const before=structuredClone(s),primitives=p.scenePrimitives3D(s).primitives,point=primitives.find(q=>q.id==='P'),group=draw(freeze(s)),dom=label(s),svg=p.geometrySceneSVG3D(s,800,600)
 const markerVisible=point?.markerVisible??false,labelVisible=point?.labelVisible??false
 assert.equal(markers(group).some(q=>q.userData.semanticId==='P'),markerVisible)
 assert.equal(!!dom.span,labelVisible);assert.equal(svg.includes('<circle data-id="P"'),markerVisible);assert.equal(svg.includes('>P &amp; α</text>'),labelVisible)
 assert.match(dom.html,/data-display-pipeline="webgl"/)
 if(labelVisible){
  const q=p.createProjection3D(s.print_camera,520,300),xy=q.screen(q.view(s.points[0].position))
  assert.ok(dom.span.includes(`left:${xy[0]+6}px;top:${xy[1]-18}px`));assert.ok(dom.span.includes('P &amp; α'))
 }
 const baseline=m.transactGeometryScene3D(s,d=>{delete d.points[0].marker_visibility;delete d.points[0].label_visibility})
 assert.deepEqual(sig(group),markerVisible?sig(draw(baseline)):[])
 if(markerVisible){const selected=markers(draw(s,s.print_camera,['P']))[0];assert.equal(selected.userData.semanticId,'P');assert.equal(selected.material.color.getHexString(),'f97316');assert.equal(selected.material.size,10);assert.equal(selected.material.sizeAttenuation,false)}
 else assert.equal(markers(draw(s,s.print_camera,['P'])).length,0,'selection must not reveal a hidden marker')
 if(labelVisible)assert.equal(dom.span,label(baseline).span,'label positioning/style is unchanged')
 const q=p.createProjection3D(s.print_camera,800,600),xy=q.screen(q.view(s.points[0].position))
 assert.equal(a.pickGeometry3D(s,s.print_camera,{x:xy[0],y:xy[1],width:800,height:600},true)?.id,markerVisible?'P':undefined)
 assert.deepEqual(s,before);assert.deepEqual(sig(draw(s)),sig(group));assert.equal(label(s).span,dom.span);cases++
}
// Camera changes reuse the current native placement/clipping behavior, without
// moving the stored point or changing semantic selection/hit-test policy.
const scene=fixture(),snapshot=structuredClone(scene),group=draw(scene),first=markers(group)[0];let disposed=0
first.geometry.addEventListener('dispose',()=>disposed++);first.material.addEventListener('dispose',()=>disposed++)
for(const camera of [{...scene.print_camera,position:[-8,10,12]},{...scene.print_camera,position:[10,-9,12],target:[2,1,0]},{...scene.print_camera,vertical_span:8},{...scene.print_camera,projection:'perspective'}]){
 draw(scene,camera,[],group);const result=label(scene,camera),q=p.createProjection3D(camera,520,300),xy=q.screen(q.view(scene.points[0].position))
 assert.ok(result.span.includes(`left:${xy[0]+6}px;top:${xy[1]-18}px`));assert.deepEqual(markers(group)[0].geometry.attributes.position.array,first.geometry.attributes.position.array)
}
assert.equal(disposed,2);assert.deepEqual(scene,snapshot)
const hidden=m.transactGeometryScene3D(scene,s=>Object.assign(s.points[0],{marker_visibility:'hidden',label_visibility:'hidden'}))
draw(hidden,hidden.print_camera,['P'],group);assert.equal(markers(group).length,0);assert.equal(label(hidden).span,undefined)
const behindCamera={...scene.print_camera,projection:'perspective',position:[0,0,0],target:[0,0,-1],up:[0,1,0]}
assert.equal(label(scene,behindCamera).span,undefined)
// Internal plane points remain suppressed despite explicitly visible components.
let helpers=plane.createPlaneAt3D(fixture(),[0,0,0],'XY','alpha').scene
helpers=m.transactGeometryScene3D(helpers,s=>{for(const q of s.points.filter(p=>p.id.startsWith('alpha_')))Object.assign(q,{label:'INTERNAL',marker_visibility:'visible',label_visibility:'visible',visibility:'visible'})})
assert.ok(!markers(draw(helpers)).some(q=>q.userData.semanticId.startsWith('alpha_')))
assert.ok(!label(helpers).html.includes('data-label-id="alpha_'))
// Existing construction gates arrive already resolved. The native emitter must
// honor them independently; the actual interactive scene uses shared SVG here.
let construction=foot.createPlanePerpendicular3D(helpers,'P',{kind:'plane',id:'alpha'},'foot').scene
construction=m.transactGeometryScene3D(construction,s=>Object.assign(s.points.find(q=>q.id==='foot_H'),{marker_visibility:'hidden',label_visibility:'visible'}))
assert.ok(!markers(draw(construction)).some(q=>q.userData.semanticId==='foot_H'))
let projected=p.projectScene3D(construction,construction.print_camera,800,600,true)
assert.equal(projected.points.find(q=>q.id==='foot_H').labelVisible,false);assert.equal(projected.lines.filter(q=>q.role==='right_angle').length,2)
construction=edit.editPerpendicularDisplay3D(construction,'foot',{label_visibility:'visible'})
projected=p.projectScene3D(construction,construction.print_camera,800,600,true);assert.equal(projected.points.find(q=>q.id==='foot_H').labelVisible,true)
assert.match(label(construction).html,/data-display-pipeline="shared-vector"/)
const cone=solid.createConeAt3D(scene,[0,0,0],'XY','S').scene
assert.match(label(cone).html,/data-display-pipeline="shared-vector"/)
// The same history/provider restores native markers and DOM labels immediately.
let current=scene;const history=m.createGeometryHistory3D(scene,next=>current=next)
assert.ok(history.commit(hidden));current=history.getScene();assert.equal(markers(draw(current)).length,0);assert.equal(label(current).span,undefined)
assert.ok(history.provider.undo());assert.equal(markers(draw(current)).length,1);assert.ok(label(current).span)
assert.ok(history.provider.redo());assert.equal(markers(draw(current)).length,0);assert.equal(label(current).span,undefined)
console.log(`PASS: ${cases} native marker/DOM label cases, SVG/picking parity, exact legacy styles/placement, camera refresh/clipping, selection, disposal, helper/construction gates, history and immutable geometry`)
