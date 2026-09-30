import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { emptyGeometryV1, normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const { commitMidpoint, CONSTRUCTION_LIMITS, midpointCoordinates } = await loadGeometryModule('geometryConstructionModel')
const { moveGeometryPoint, deleteGeometrySelection, addGeometryPoint } = await loadGeometryModule('geometryAuthoringModel')
const base={...emptyGeometryV1(),description:'Midpoint',points:[{id:'a',x:0,y:0,label:null},{id:'b',x:20,y:10,label:null},{id:'c',x:40,y:30,label:null},{id:'free',x:10,y:5,label:null}],segments:[{id:'s',start_point_id:'a',end_point_id:'b'}]}
assert.ok(!Object.hasOwn(normalize(base),'constructions'))
const one=commitMidpoint(base,'a','b'),m=one.constructions[0].output_point_id
assert.notEqual(m,'free');assert.deepEqual(one.points.at(-1),{id:m,x:10,y:5,label:null})
assert.equal(commitMidpoint(one,'b','a'),one);assert.equal(commitMidpoint(base,'a','a'),base)
assert.equal(commitMidpoint({...base,points:[...base.points,{id:'same',x:0,y:0,label:null}]},'a','same').constructions,undefined)
const chain=commitMidpoint(one,m,'c'),n=chain.constructions[1].output_point_id
chain.constructions.reverse()
assert.deepEqual(normalize(chain),chain)
const moved=moveGeometryPoint(chain,'a',8,4)
assert.deepEqual(moved.points.find(p=>p.id===m),{id:m,x:14,y:7,label:null})
assert.deepEqual(moved.points.find(p=>p.id===n),{id:n,x:27,y:18.5,label:null})
assert.equal(moveGeometryPoint(chain,m,2,3),chain);assert.equal(moveGeometryPoint(chain,'a',Infinity,0),chain)
assert.ok(normalize(moveGeometryPoint(chain,'a',20,10)),'Coincidence after a valid source edit remains mathematically valid')
const withoutSegment=deleteGeometrySelection(chain,{kind:'segment',id:'s'});assert.deepEqual(withoutSegment.constructions,chain.constructions)
for(const id of ['a',m]){
 const deleted=deleteGeometrySelection(chain,{kind:'point',id})
 assert.equal(deleted.constructions.length,0);assert.ok(!deleted.points.some(p=>p.id===m||p.id===n));assert.ok(deleted.points.some(p=>p.id==='b'));assert.ok(deleted.points.some(p=>p.id==='free'));assert.ok(normalize(deleted))
}
const invalid = patch => {const bad=structuredClone(one);patch(bad);assert.equal(normalize(bad),null)}
for(const patch of [{kind:'parallel'},{id:'a'},{id:'1bad'},{source_point_ids:['a']},{source_point_ids:['a','a']},{source_point_ids:['missing','b']},{output_point_id:'missing'},{output_point_id:'a'},{extra:true}])invalid(g=>Object.assign(g.constructions[0],patch))
invalid(g=>{g.constructions.push({...g.constructions[0],id:'duplicate',source_point_ids:['b','a']})})
invalid(g=>{g.points.find(p=>p.id===m).x+=CONSTRUCTION_LIMITS.coordinateTolerance*2})
invalid(g=>{g.constructions.push({id:'cycle',kind:'midpoint',source_point_ids:[m,'c'],output_point_id:'a'})})
invalid(g=>{g.constructions.push({id:'owner',kind:'midpoint',source_point_ids:['a','c'],output_point_id:m})})
const collision=structuredClone(one);collision.constructions[0].id='point-2';assert.equal(addGeometryPoint(collision,30,30).points.at(-1).id,'point-3')
assert.deepEqual(midpointCoordinates({x:1e308,y:-1e308},{x:1e308,y:1e308}),{x:1e308,y:0})
assert.equal(base.points.length,4)
const nearSources={...base,points:[...base.points,{id:'near',x:CONSTRUCTION_LIMITS.minimumSourceDistance/2,y:0,label:null}]}
assert.equal(commitMidpoint(nearSources,'a','near'),nearSources)
const ordinaryDependents={...chain,segments:[...chain.segments,{id:'derived-segment',start_point_id:m,end_point_id:'c'}],lines:[{id:'derived-line',kind:'line',start_point_id:m,end_point_id:'c'}]}
const cascade=deleteGeometrySelection(ordinaryDependents,{kind:'point',id:m})
assert.deepEqual(cascade.segments,base.segments);assert.deepEqual(cascade.lines,[]);assert.ok(normalize(cascade))
assert.equal(moveGeometryPoint(ordinaryDependents,'a',60,50),ordinaryDependents,'Reject source edit atomically when a dependent line would collapse')
console.log('PASS: midpoint identity/ownership, strict schema, unordered duplicates, reverse-order chain evaluation, source edits, locked derived points, finite edit boundary, transitive deletion, segment independence, legacy and overflow-safe evaluation')
