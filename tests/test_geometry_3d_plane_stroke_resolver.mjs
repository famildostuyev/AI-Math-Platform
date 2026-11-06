import assert from 'node:assert/strict'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const {resolvePlaneBoundaryStroke3D:resolve}=await load('geometry3dPlaneStroke')
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const plane=(id,kind)=>({id,...(kind?{kind}:{}),point_ids:['o','x','y'],display:{width:4,height:3,shape:'cloud',skew:.2,intersection_mode:'opposite',intersection_visibility:'hidden'}})
// Recipe kind is not encoded on a plane record. Boundary representation is
// supplied by the caller, matching the actual legacy rendering paths.
const records=[['ordinary',plane('alpha'),'outline'],['parallel',plane('parallel'),'outline'],['perpendicular',plane('perpendicular'),'segment'],['guided',plane('guided'),'outline'],['standalone half',plane('half','half_plane'),'outline'],['owned half',plane('owned_half','half_plane'),'segment']]
const patterns={solid:{dashArray:[],lineCap:'butt'},dashed:{dashArray:[4,3],lineCap:'butt'},dotted:{dashArray:[1,3],lineCap:'round'}}
let checks=0
for(const [name,input,representation] of records){
 const before=structuredClone(input),fallback=resolve(freeze(input),representation)
 assert.equal(fallback.color,representation==='outline'?'#94A3B8':'#334155',name)
 assert.equal(fallback.width,1);assert.equal(fallback.style,'solid');assert.equal(fallback.source,'legacy');assert.deepEqual(fallback.pattern,patterns.solid)
 assert.deepEqual(fallback.legacyHidden,representation==='segment'?{dashArray:[4,3],opacity:.45}:null)
 assert.deepEqual(input,before);assert.deepEqual(resolve(input,representation),fallback)
 for(const style of ['solid','dashed','dotted'])for(const width of [.25,1,2.5,8]){
  const stored={...structuredClone(input),display:{...input.display,stroke:{color:'#12ABEF',width,style}}},copy=structuredClone(stored)
  const actual=resolve(freeze(stored),representation)
  assert.deepEqual(actual,{color:'#12ABEF',width,style,source:'stored',pattern:{dashArray:patterns[style].dashArray.map(v=>v*width),lineCap:patterns[style].lineCap},legacyHidden:fallback.legacyHidden})
  assert.notEqual(actual,stored.display.stroke);assert.deepEqual(stored,copy)
  assert.deepEqual(resolve(stored,representation),actual)
  assert.ok(Object.isFrozen(actual));assert.ok(Object.isFrozen(actual.pattern));assert.ok(Object.isFrozen(actual.pattern.dashArray))
  assert.throws(()=>{actual.pattern.dashArray.push(9)},TypeError)
  if(actual.legacyHidden)assert.ok(Object.isFrozen(actual.legacyHidden))
  // Transient UI state cannot replace persistent styling, including an orange
  // explicitly chosen by a teacher; no highlight state is returned or persisted.
  const transient={...stored,selected:true,highlighted:true,previewColor:'#F97316'}
  assert.deepEqual(resolve(transient,representation),actual)
  checks++
 }
}
const plain=plane('renamed'),noDisplay={id:'no_display',point_ids:['o','x','y']}
assert.deepEqual(resolve(noDisplay),resolve(plain));assert.equal(resolve(plain).color,'#94A3B8')
assert.equal(resolve({...plain,id:'constructed_plane_not_a_classifier'}).color,'#94A3B8')
assert.equal(resolve(plain,'segment').color,'#334155')
const invalid=[null,[],{},'red',
 {color:'#ABCDEF',width:1},{color:'#ABCDEF',style:'solid'},{width:1,style:'solid'},
 ...['red','#abcDEF','#123','#12345678','#123456\n'].map(color=>({color,width:1,style:'solid'})),
 ...[0,-1,.249999,8.000001,NaN,Infinity,true,'1'].map(width=>({color:'#ABCDEF',width,style:'solid'})),
 ...['SOLID','dots',null,1].map(style=>({color:'#ABCDEF',width:1,style})),
 {color:'#ABCDEF',width:1,style:'solid',highlighted:true}]
for(const stroke of invalid)for(const representation of ['outline','segment']){
 const input={...plane('invalid'),display:{width:4,height:3,stroke}},copy=structuredClone(input)
 assert.deepEqual(resolve(freeze(input),representation),resolve(noDisplay,representation));assert.deepEqual(input,copy)
}
const orange={...plain,display:{...plain.display,stroke:{color:'#F97316',width:2,style:'dashed'}}}
assert.equal(resolve(orange).color,'#F97316');assert.equal(resolve(orange).source,'stored')
console.log(`PASS: ${checks} explicit styles across plane types; representation-aware defaults, legacy hidden dashes, deterministic patterns, defensive fallback, frozen descriptors and immutable inputs`)
