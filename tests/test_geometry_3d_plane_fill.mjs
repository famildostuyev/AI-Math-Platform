import assert from 'node:assert/strict'
import fs from 'node:fs'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),n=load('geometry3d'),fill=load('geometry3dPlaneFill')
let base=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
base=m.transactGeometryScene3D(base,s=>s.points.push({id:'P',position:[0,0,4],label:null},{id:'Q',position:[1,0,4],label:null}))
base=a.createPerpendicularPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
base=a.createParallelPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},'parallel').scene
base=a.createGuidedPerpendicularPlane3D(base,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
base=m.transactGeometryScene3D(base,s=>s.planes.push({id:'half',kind:'half_plane',point_ids:[...s.planes.find(p=>p.id==='alpha').point_ids]}))
const before=structuredClone(base),freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
freeze(base)
for(const p of base.planes){assert.deepEqual(fill.resolvePlaneFill3D(p,'webgl'),{color:'#CBD5E1',opacity:.15});assert.deepEqual(fill.resolvePlaneFill3D(p,'svg'),{color:'#E2E8F0',opacity:.35})}
assert.deepEqual(n.normalizeGeometryScene3D(base),base);assert.ok(!n.serializeGeometryScene3D(base).includes('"fill"'))
const scenes=[]
for(let mask=0;mask<32;mask++)for(const mode of [undefined,'cross','first','opposite']){
 const input=structuredClone(base),opacity=[0,.42,1][scenes.length%3]
 for(const [i,p]of input.planes.entries())p.display={width:4,height:3,fill:{color:i%2?'#aB12eF':'#123ABC',opacity},...(mask&1?{stroke:{color:'#456789',width:2,style:'dotted'}}:{}),...(mask&2?{shape:'parallelogram',skew:.2}:{}),...(mask&4?{show_hidden_edges:false}:{}),...(mask&8?{intersection_visibility:'hidden'}:{}),...(mask&16?{lower_portion:'upper'}:{}),...(mode?{intersection_mode:mode}:{})}
 const snapshot=structuredClone(input),result=n.normalizeGeometryScene3D(input);assert.ok(result)
 for(const p of result.planes){assert.equal(p.display.fill.opacity,opacity);assert.match(p.display.fill.color,/^#[0-9A-F]{6}$/);assert.deepEqual(fill.resolvePlaneFill3D(p,'webgl'),fill.resolvePlaneFill3D(p,'svg'));assert.ok(Object.isFrozen(fill.resolvePlaneFill3D(p,'webgl')))}
 assert.deepEqual(input,snapshot);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(result))),result);scenes.push(result)
}
const invalid=[null,[],{},'red',{color:'#123456'},{opacity:.5},{color:'#123456',opacity:.5,extra:true}]
for(const opacity of [-.0001,1.0001,NaN,Infinity,-Infinity,true,false,null,'0.5',[],{}])invalid.push({color:'#123456',opacity})
for(const color of ['red','#123','#1234567','#12GG56','#123456\n',true,null])invalid.push({color,opacity:.5})
for(const value of invalid)for(const id of ['alpha','beta','guided','half']){const scene=structuredClone(scenes[0]);scene.planes.find(p=>p.id===id).display.fill=value;assert.equal(n.normalizeGeometryScene3D(scene),null)}
assert.deepEqual(base,before)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({base,scenes}))
console.log('PASS: 128 plane fill contract combinations, all plane types, strict opacity/color validation, legacy absence, canonical round trips, resolver parity/determinism and immutable inputs')
