import assert from 'node:assert/strict'
import fs from 'node:fs'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),n=load('geometry3d'),plane=load('geometry3dPlaneAuthoring'),perp=load('geometry3dPlanePerpendicularAuthoring'),a=load('geometry3dAuthoring'),p=load('geometry3dProjection'),solid=load('geometry3dSolidAuthoring'),surface=load('geometry3dSurfacePoints'),{resolvePointVisibility3D:resolve}=load('geometry3dPointVisibility')
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
let base=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
base=m.transactGeometryScene3D(base,s=>{s.points.push({id:'P',position:[0,0,4],label:'P α'});s.annotations.push({id:'note',content:'Separate annotation',format:'text',anchor:{kind:'point',point_id:'P'},offset_mm:[0,0]})})
base=perp.createPlanePerpendicular3D(base,'P',{kind:'plane',id:'alpha'},'foot').scene
const legacy=n.serializeGeometryScene3D(base),baseBefore=structuredClone(base),scenes=[]
for(const point of base.points){assert.ok(!Object.hasOwn(point,'marker_visibility'));assert.ok(!Object.hasOwn(point,'label_visibility'))}
assert.deepEqual(n.normalizeGeometryScene3D(base),base);assert.equal(n.serializeGeometryScene3D(base),legacy)
let combinations=0
for(const visibility of [undefined,'visible','hidden'])for(const marker of [undefined,'visible','hidden'])for(const label of [undefined,'visible','hidden'])for(const text of [null,'','P α']){
 const input=structuredClone(base),point=input.points.find(q=>q.id==='P');point.label=text
 for(const [key,value] of [['visibility',visibility],['marker_visibility',marker],['label_visibility',label]])if(value!==undefined)point[key]=value
 const before=structuredClone(input),result=n.normalizeGeometryScene3D(freeze(input));assert.ok(result);assert.deepEqual(result,input)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(result))),result);assert.deepEqual(structuredClone(result),result)
 assert.deepEqual(result.constructions,base.constructions);assert.deepEqual(result.annotations,base.annotations)
 for(const helperSuppressed of [false,true])for(const constructionLabelVisibility of ['visible','hidden']){
  const context=freeze({helperSuppressed,constructionLabelVisibility}),expected={markerVisible:visibility!=='hidden'&&!helperSuppressed&&marker!=='hidden',labelVisible:visibility!=='hidden'&&!helperSuppressed&&label!=='hidden'&&constructionLabelVisibility!=='hidden'&&!!text}
  const resolved=resolve(point,context);assert.deepEqual(resolved,expected);assert.ok(Object.isFrozen(resolved));assert.deepEqual(resolve(point,context),resolved);combinations++
 }
 assert.deepEqual(resolve(point),resolve(point,{}));assert.equal(point.label,text);assert.deepEqual(input,before)
 scenes.push(result)
}
assert.deepEqual(base,baseBefore)
const invalid=[null,true,false,0,1,'','VISIBLE','hide',[],{},NaN,Infinity]
for(const key of ['marker_visibility','label_visibility','visibility'])for(const value of invalid){const bad=structuredClone(base);bad.points.find(q=>q.id==='P')[key]=value;assert.equal(n.normalizeGeometryScene3D(bad),null);assert.equal(n.serializeGeometryScene3D(bad),null)}
for(const key of ['markerVisible','labelVisible','display','extra']){const bad=structuredClone(base);bad.points.find(q=>q.id==='P')[key]={};assert.equal(n.normalizeGeometryScene3D(bad),null)}
const flags={visibility:'visible',marker_visibility:'hidden',label_visibility:'visible'}
const changed=m.transactGeometryScene3D(base,s=>{Object.assign(s.points.find(q=>q.id==='P'),flags);Object.assign(s.points.find(q=>q.id==='foot_H'),flags)})
assert.ok(changed);const history=m.createGeometryHistory3D(base,()=>{});assert.ok(history.commit(changed));assert.equal(history.commit(structuredClone(changed)),false)
const clone=history.getScene();clone.points.find(q=>q.id==='P').marker_visibility='visible';assert.equal(history.getScene().points.find(q=>q.id==='P').marker_visibility,'hidden')
assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),base);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),changed)
const stored=changed.points.find(q=>q.id==='P'),recipe=changed.constructions.find(q=>q.id==='foot'),foot=changed.points.find(q=>q.id==='foot_H')
assert.equal(recipe.marker_visibility,'visible');assert.equal(recipe.label_visibility,'hidden')
assert.deepEqual(resolve(foot,{constructionLabelVisibility:recipe.label_visibility}),{markerVisible:false,labelVisible:false});assert.equal(foot.label,'H')
assert.deepEqual(resolve({...foot,marker_visibility:'visible'},{constructionLabelVisibility:'visible'}),{markerVisible:true,labelVisible:true})
assert.deepEqual(resolve({...stored,marker_visibility:'visible',label_visibility:'visible'},{helperSuppressed:true}),{markerVisible:false,labelVisible:false})
const moved=m.moveGeometryPoint3D(changed,'P',[1,2,7]),edited=a.editPoint3D(changed,'P',[2,1,5],'New label')
for(const scene of [moved,edited,m.evaluateGeometryScene3D(changed).scene]){assert.ok(scene);for(const id of ['P','foot_H'])for(const [key,value] of Object.entries(flags))assert.equal(scene.points.find(q=>q.id===id)[key],value)}
assert.deepEqual(a.createPoint3D(changed,stored.position).scene,changed)
// Rendering consumes the flags without changing the semantic contract.
assert.ok(!p.geometrySceneSVG3D(changed).includes('<circle data-id="P"'))
assert.ok(p.geometrySceneSVG3D(changed).includes('P α'))
const bothHidden=m.transactGeometryScene3D(changed,s=>{s.points.find(q=>q.id==='P').label_visibility='hidden'})
assert.ok(!p.geometrySceneSVG3D(bothHidden).includes('P α'))
const projection=p.createProjection3D(base.print_camera,800,600),screen=projection.screen(projection.view(stored.position)),pointer={x:screen[0],y:screen[1],width:800,height:600}
assert.equal(a.pickGeometry3D(changed,base.print_camera,pointer,true),null)
assert.equal(a.pickGeometry3D(base,base.print_camera,pointer,true)?.id,'P')
// Existing-ID preparation, rigid transforms and detachment preserve all flags.
const retained=[]
for(const kind of ['cube','cylinder','cone','sphere']){
 let scene=kind==='cube'?solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D(kind,'S')).scene:({cylinder:solid.createCylinderAt3D,cone:solid.createConeAt3D,sphere:solid.createSphereAt3D}[kind])(m.emptyGeometryScene3D(),[0,0,0],'XY','S').scene
 scene=m.transactGeometryScene3D(scene,s=>{for(const q of s.points)Object.assign(q,flags,{label:'Owned α'})})
 const original=structuredClone(scene),prepared=m.prepareAnalyticCenters3D(scene),translated=solid.translateSolid3D(scene,'S',[1,2,3]),rotated=solid.rotateSolid3D(scene,'S',[0,0,1],.2),detached=solid.deleteSolid3D(scene,'S')?.scene
 for(const next of [prepared,translated,rotated,detached]){assert.ok(next);for(const point of original.points){const current=next.points.find(q=>q.id===point.id);assert.ok(current,'retained semantic point');for(const key of ['visibility','marker_visibility','label_visibility'])assert.equal(current[key],point[key]);assert.equal(current.label,point.label)}retained.push(next)}
 assert.deepEqual(scene,original)
 if(kind==='sphere'){
  let attached=surface.createPointOnSurface3D(scene,scene.surfaces[0].id,[.2,.4],'surfaceP','Surface')
  attached=m.transactGeometryScene3D(attached,s=>Object.assign(s.points.find(q=>q.id==='surfaceP'),flags))
  for(const next of [surface.editPointOnSurface3D(attached,'surfaceP',[.4,.6]),surface.editSurfacePointLabel3D(attached,'surfaceP','Renamed'),solid.deleteSolid3D(attached,'S').scene]){assert.ok(next);for(const [key,value] of Object.entries(flags))assert.equal(next.points.find(q=>q.id==='surfaceP')[key],value);retained.push(next)}
 }
}
// Solid-authoring consumption creates NEW point IDs, not replacement of the
// original semantic record. Keep its established label-transfer policy intact.
let polygon=a.createPlanarPath3D(m.emptyGeometryScene3D(),[[0,0,0],[3,0,0],[0,3,0]].map((position,i)=>({id:'p'+i,position})),true,'base').scene
polygon=m.transactGeometryScene3D(polygon,s=>{for(const q of s.points)Object.assign(q,flags,{label:'Source '+q.id})})
const consumed=solid.createPyramidFromPolygon3D(polygon,'base','pyramid');assert.ok(consumed.sourceConsumed)
for(const point of polygon.points)assert.ok(!consumed.scene.points.some(q=>q.id===point.id))
for(const point of consumed.scene.points){assert.ok(!Object.hasOwn(point,'marker_visibility'));assert.ok(!Object.hasOwn(point,'label_visibility'))}
const shared=m.transactGeometryScene3D(polygon,s=>s.annotations.push({id:'anchor',format:'text',content:'Keep source',anchor:{kind:'point',point_id:'p0'},offset_mm:[0,0]}))
const preserved=solid.createPyramidFromPolygon3D(shared,'base','linked');assert.equal(preserved.sourceConsumed,false)
for(const point of shared.points)assert.deepEqual(preserved.scene.points.find(q=>q.id===point.id),point)
assert.deepEqual(preserved.scene.annotations,shared.annotations)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({base,scenes,changed,retained}))
console.log(`PASS: ${scenes.length} point contracts, ${combinations} pure gate combinations, strict enums, absent defaults, immutable history, same-ID metadata retention, new-ID consumption policy and component display/picking`)
