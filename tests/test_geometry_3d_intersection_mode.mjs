import assert from 'node:assert/strict'
import fs from 'node:fs'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),n=load('geometry3d'),math=load('geometry3dConstructedPlane')
let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[1,2,3],'XY','alpha').scene
scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[1,2,8],label:'P'}))
const source=structuredClone(scene)
scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},.6,'beta').scene
const output=s=>s.planes.find(p=>p.id==='beta'),legacy=structuredClone(scene)
delete output(legacy).display.intersection_mode
const legacyBefore=structuredClone(legacy),canonical=n.normalizeGeometryScene3D(legacy)
assert.equal(output(canonical).display.intersection_mode,'cross');assert.deepEqual(canonical,scene);assert.deepEqual(legacy,legacyBefore)
assert.deepEqual(n.normalizeGeometryScene3D(canonical),canonical)
assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(legacy))),canonical)
assert.equal(scene.planes.find(p=>p.id==='alpha').display.intersection_mode,undefined)
const parallel=a.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},'parallel').scene
assert.equal(parallel.planes.find(p=>p.id==='parallel').display.intersection_mode,undefined)
const scenes=[]
for(const mode of ['cross','first','opposite'])for(const shaped of [false,true])for(const visibility of [false,true])for(const lower of [false,true]){
 const input=structuredClone(legacy)
 output(input).display={width:6,height:7,...(shaped?{shape:'parallelogram',skew:.7}:{}),...(visibility?{intersection_visibility:'hidden'}:{}),...(lower?{lower_portion:'upper'}:{}),intersection_mode:mode}
 const before=structuredClone(input),normalized=n.normalizeGeometryScene3D(input)
 assert.deepEqual(normalized,input);assert.deepEqual(input,before)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(input))),input)
 assert.deepEqual(normalized.constructions,scene.constructions);assert.deepEqual(normalized.points,scene.points)
 // This slice persists the mode but does not implement its surface behavior.
 assert.deepEqual(math.perpendicularPlaneSurface3D(normalized,'P',{kind:'plane',id:'alpha'},.6),math.perpendicularPlaneSurface3D(scene,'P',{kind:'plane',id:'alpha'},.6))
 scenes.push(input)
}
for(const invalid of ['','upper','CROSS',null,true,false,0,1,[],{},NaN]){
 const input=structuredClone(scene);output(input).display.intersection_mode=invalid
 assert.equal(n.normalizeGeometryScene3D(input),null);assert.equal(n.serializeGeometryScene3D(input),null)
}
for(const mutate of [s=>output(s).display.extra=true,s=>s.constructions[0].intersection_mode='first']){
 const input=structuredClone(scene);mutate(input);assert.equal(n.normalizeGeometryScene3D(input),null)
}
// Detached outputs keep their display metadata without changing the recipe contract.
const detached=structuredClone(scenes.find(s=>output(s).display.intersection_mode==='opposite'));detached.constructions=[]
assert.deepEqual(n.normalizeGeometryScene3D(detached),detached)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({scenes,legacy,canonical,source,parallel,detached}))
console.log('PASS: 24 display-mode variants, legacy cross default, strict rejection, immutable normalization, round trips, unchanged semantics/rendering and detached metadata')
