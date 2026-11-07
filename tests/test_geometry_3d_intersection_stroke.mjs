import assert from 'node:assert/strict'
import fs from 'node:fs'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),n=load('geometry3d'),r=load('geometry3dPlaneStroke')
let base=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
base=m.transactGeometryScene3D(base,s=>s.points.push({id:'P',position:[0,0,4],label:null},{id:'Q',position:[1,0,4],label:null}))
base=a.createPerpendicularPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
base=a.createGuidedPerpendicularPlane3D(base,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
const snapshot=structuredClone(base),scenes=[]
assert.ok(!n.serializeGeometryScene3D(base).includes('intersection_stroke'))
for(const id of ['beta','guided']){const p=base.planes.find(q=>q.id===id),style=r.resolvePlaneIntersectionStroke3D(p);assert.equal(style.color,'#334155');assert.equal(style.width,1);assert.equal(style.style,'solid');assert.equal(style.source,'legacy')}
for(let mask=0;mask<64;mask++)for(const style of ['solid','dashed','dotted']){
 const scene=structuredClone(base),width=style==='solid'?.25:style==='dashed'?2:8
 for(const q of scene.planes)q.display={width:4,height:3,...(mask&1?{fill:{color:'#ABCDEF',opacity:.42}}:{}),...(mask&2?{stroke:{color:'#123456',width:3,style:'dashed'}}:{}),...(mask&4?{show_hidden_edges:false}:{}),...(mask&8?{intersection_mode:'first'}:{}),...(mask&16?{shape:'cloud',skew:.2}:{}),...(mask&32?{intersection_visibility:'hidden'}:{})}
 for(const id of ['beta','guided'])scene.planes.find(q=>q.id===id).display.intersection_stroke={color:id==='beta'?'#aB12eF':'#123ABC',width,style}
 const result=n.normalizeGeometryScene3D(scene);assert.ok(result)
 for(const id of ['beta','guided']){const p=result.planes.find(q=>q.id===id),resolved=r.resolvePlaneIntersectionStroke3D(p);assert.equal(resolved.source,'stored');assert.equal(resolved.width,width);assert.equal(resolved.style,style);assert.match(resolved.color,/^#[0-9A-F]{6}$/)}
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(result))),result);scenes.push(result)
}
const invalid=[null,[],{},'red',{color:'#123456',width:1},{width:1,style:'solid'},{color:'#123456',style:'solid'},{color:'#123456',width:1,style:'solid',extra:true}]
for(const color of ['red','#123','#1234567','#12GG56','#123456\n',true,null])invalid.push({color,width:1,style:'solid'})
for(const width of [0,-1,.249,8.001,NaN,Infinity,-Infinity,true,null,'1'])invalid.push({color:'#123456',width,style:'solid'})
for(const style of ['dash','SOLID','',true,null])invalid.push({color:'#123456',width:1,style})
for(const value of invalid)for(const id of ['beta','guided']){const scene=structuredClone(base);scene.planes.find(q=>q.id===id).display.intersection_stroke=value;assert.equal(n.normalizeGeometryScene3D(scene),null)}
assert.deepEqual(base,snapshot)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({base,scenes}))
console.log('PASS: 192 strict intersection stroke variants, guided/perpendicular owners, independent display fields, canonical colors, finite widths, styles, legacy absence and immutable round trips')
