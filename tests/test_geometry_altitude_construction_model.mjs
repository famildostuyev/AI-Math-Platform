import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {commitAltitude,findAltitude,altitudeFootCoordinates,altitudePresentation,commitMidpoint,commitLinearConstruction}=await loadGeometryModule('geometryConstructionModel')
const {moveGeometryPoint,deleteGeometrySelection}=await loadGeometryModule('geometryAuthoringModel')
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
export const base={...emptyGeometryV1(),description:'Altitude',points:[{id:'a',x:10,y:20,label:'A'},{id:'v',x:35,y:50,label:'V'},{id:'c',x:70,y:20,label:'C'},{id:'free',x:80,y:80,label:null}],polygons:[{id:'triangle',point_ids:['c','a','v']}],lines:[{id:'ordinary',kind:'line',start_point_id:'a',end_point_id:'c'}]}
export const g=commitAltitude(base,'a','v','c')
const original=structuredClone(base)
const recipe=findAltitude(g,'a','v','c'),h=g.points.find(p=>p.id===recipe.foot_point_id)
assert.deepEqual(base,original)
assert.deepEqual([h.x,h.y,h.label],[35,20,null])
assert.notEqual(h.id,'a');assert.notEqual(h.id,'c')
assert.ok(normalize(g));assert.equal(commitAltitude(g,'c','v','a'),g)
assert.equal(commitAltitude({...base,polygons:[]},'a','v','c').constructions,undefined)
assert.equal(moveGeometryPoint(g,h.id,99,99),g)
export const right=moveGeometryPoint(g,'v',10,50)
export const obtuse=moveGeometryPoint(right,'v',-10,50)
export const rightC=moveGeometryPoint(g,'v',70,50)
export const obtuseC=moveGeometryPoint(g,'v',90,50)
for(const current of [g,right,obtuse,moveGeometryPoint(g,'a',5,10),moveGeometryPoint(g,'c',80,30)]){
 assert.ok(normalize(current));assert.equal(current.constructions[0].foot_point_id,h.id)
 const [a,v,c]=recipe.source_point_ids.map(id=>current.points.find(p=>p.id===id)),foot=current.points.find(p=>p.id===h.id)
 const expected=altitudeFootCoordinates(a,v,c)
 assert.deepEqual([foot.x,foot.y],[expected.x,expected.y])
 assert.ok(Math.abs((foot.x-v.x)*(c.x-a.x)+(foot.y-v.y)*(c.y-a.y))<1e-8)
}
assert.ok(altitudePresentation(right).hiddenFootIds.has(h.id))
assert.equal(altitudePresentation(right).extensions.length,0)
assert.equal(altitudePresentation(obtuse).extensions[0].start.id,'a')
assert.ok(altitudePresentation(rightC).hiddenFootIds.has(h.id))
assert.equal(altitudePresentation(obtuseC).extensions[0].start.id,'c')
assert.ok(normalize(rightC));assert.ok(normalize(obtuseC))
assert.ok(!altitudePresentation(obtuse).hiddenFootIds.has(h.id))
assert.equal(moveGeometryPoint(g,'v',35,20),g)
assert.equal(moveGeometryPoint(g,'c',10,20),g)
const chain=commitMidpoint(g,h.id,'free')
const linearChain=commitLinearConstruction(chain,'perpendicular',{kind:'segment',id:recipe.output_segment_id},'free')
assert.ok(normalize(linearChain))
assert.ok(normalize(moveGeometryPoint(linearChain,'v',40,55)))
const reordered={...linearChain,constructions:[...linearChain.constructions].reverse()}
assert.ok(normalize(reordered))
for(const selection of [{kind:'segment',id:recipe.output_segment_id},{kind:'point',id:'a'},{kind:'point',id:h.id}]){
 const deleted=deleteGeometrySelection(linearChain,selection)
 assert.equal(deleted.constructions.length,0);assert.ok(!deleted.points.some(p=>p.id===h.id));assert.ok(!deleted.segments.some(s=>s.id===recipe.output_segment_id));assert.ok(deleted.points.some(p=>p.id==='free'));assert.ok(normalize(deleted))
}
for(const patch of [{foot_point_id:'missing'},{foot_point_id:'a'},{output_segment_id:'missing'},{source_point_ids:['a','a','c']},{extra:1},{source_point_ids:['missing','v','c']}]){
 const bad=structuredClone(g);Object.assign(bad.constructions[0],patch);assert.equal(normalize(bad),null)
}
for(const mutate of [bad=>bad.points.find(p=>p.id===h.id).x++,bad=>bad.points.find(p=>p.id===h.id).x=Infinity,bad=>bad.segments[0].start_point_id='a',bad=>bad.points.find(p=>p.id==='v').y=20,bad=>bad.constructions.push({...recipe,id:'duplicate',source_point_ids:['c','v','a']})]){
 const bad=structuredClone(g);mutate(bad);assert.equal(normalize(bad),null)
}
assert.ok(normalize(base),'Legacy geometry unchanged')
assert.deepEqual(altitudeFootCoordinates({x:0,y:0},{x:5e-7,y:1e-8},{x:1e-6,y:0}),{x:5e-7,y:0},'Small valid triangle uses height, not raw area')
assert.equal(altitudeFootCoordinates({x:0,y:0},{x:5e-7,y:1e-10},{x:1e-6,y:0}),null)
assert.equal(altitudeFootCoordinates({x:0,y:0},{x:Infinity,y:10},{x:10,y:0}),null)
const otherFoot={...g,points:[...g.points,{id:'other-foot',x:35,y:20,label:null}],segments:[...g.segments,{id:'other-segment',start_point_id:'v',end_point_id:'other-foot'}],constructions:[...g.constructions,{...recipe,id:'other-altitude',foot_point_id:'other-foot',output_segment_id:'other-segment',source_point_ids:['c','v','a']}]}
assert.equal(normalize(otherFoot),null,'Symmetric duplicate rejected even with separate valid outputs')
assert.equal(deleteGeometrySelection(g,{kind:'polygon',id:'triangle'}).constructions.length,1,'Deleting presentation polygon preserves source-defined construction')
console.log('PASS: altitude projection, creation, symmetry, source edits/transitions, lock, chains, deletion, strict normalization and legacy')
