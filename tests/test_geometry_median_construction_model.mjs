import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {commitMedian,findMedian,commitMidpoint,commitLinearConstruction,commitIntersection,ownedConstructionIds,isDerivedPoint,CONSTRUCTION_LIMITS}=await loadGeometryModule('geometryConstructionModel')
const {moveGeometryPoint,deleteGeometrySelection}=await loadGeometryModule('geometryAuthoringModel')
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
export const base={...emptyGeometryV1(),description:'Median',points:[{id:'a',x:10,y:20,label:'A'},{id:'v',x:35,y:50,label:'V'},{id:'c',x:70,y:20,label:'C'},{id:'m',x:40,y:20,label:'Existing M'},{id:'free',x:80,y:80,label:null}],polygons:[{id:'triangle',point_ids:['c','a','v']}],lines:[{id:'ordinary',kind:'line',start_point_id:'a',end_point_id:'c'}]}
const original=structuredClone(base)
export const g=commitMedian(base,'v','m')
const recipe=findMedian(g,'v','m'),m=g.points.find(p=>p.id==='m')
assert.deepEqual(base,original)
assert.deepEqual(g.points,base.points,'Median creates or changes no points')
assert.deepEqual(recipe,{id:recipe.id,kind:'median',vertex_point_id:'v',midpoint_point_id:'m',output_segment_id:recipe.output_segment_id})
assert.deepEqual(ownedConstructionIds(recipe),[recipe.output_segment_id])
assert.deepEqual(g.segments[0],{id:recipe.output_segment_id,start_point_id:'v',end_point_id:'m'})
assert.ok(normalize(g));assert.equal(commitMedian(g,'v','m'),g)
assert.notEqual(commitMedian(g,'m','v'),g,'The input pair is ordered')
assert.ok(commitMedian({...base,polygons:[]},'v','m').constructions)
for(const [v,m] of [['v','v'],['missing','m'],['v','missing']])assert.equal(commitMedian(base,v,m),base)
assert.equal(isDerivedPoint(g,'m'),false,'Median does not lock borrowed free points')
for(const [id,x,y] of [['a',5,10],['c',80,30],['v',40,55],['m',42,22]]){
 const edited=moveGeometryPoint(g,id,x,y);assert.notEqual(edited,g);assert.ok(normalize(edited))
 assert.equal(edited.constructions[0].midpoint_point_id,'m')
 if(id!=='m')assert.deepEqual(edited.points.find(p=>p.id==='m'),m)
}
for(const [id,x,y] of [['v',40,20],['m',35,50],['v',Infinity,50],['m',NaN,20]])assert.equal(moveGeometryPoint(g,id,x,y),g)
const near={...base,points:base.points.map(p=>p.id==='m'?{...p,x:35+CONSTRUCTION_LIMITS.minimumSourceDistance/2,y:50}:p)}
assert.equal(commitMedian(near,'v','m'),near)
const atLimit={...base,points:base.points.map(p=>p.id==='v'?{...p,x:0,y:0}:p.id==='m'?{...p,x:CONSTRUCTION_LIMITS.minimumSourceDistance,y:0}:p)}
assert.ok(normalize(commitMedian(atLimit,'v','m')))
const beforeMedian=commitMidpoint(base,'a','c'),midpointRecipe=beforeMedian.constructions[0],derivedId=midpointRecipe.output_point_id
export const independent=commitMedian(beforeMedian,'v',derivedId)
assert.equal(independent.points.length,beforeMedian.points.length)
assert.deepEqual(independent.points,beforeMedian.points)
assert.equal(isDerivedPoint(independent,derivedId),true)
assert.equal(moveGeometryPoint(independent,derivedId,99,99),independent)
let chain=commitMidpoint(independent,derivedId,'free')
chain=commitLinearConstruction(chain,'perpendicular',{kind:'segment',id:independent.constructions[1].output_segment_id},'free')
chain=commitIntersection(chain,{kind:'segment',id:independent.constructions[1].output_segment_id},{kind:'line',id:'ordinary'})
assert.equal(chain.constructions.length,5)
const reordered={...chain,constructions:[...chain.constructions].reverse()}
assert.ok(normalize(reordered))
const moved=moveGeometryPoint(reordered,'a',5,10);assert.notEqual(moved,reordered);assert.ok(normalize(moved))
assert.deepEqual(moved.points.find(p=>p.id===derivedId),{id:derivedId,x:37.5,y:15,label:null})
assert.equal(moveGeometryPoint(independent,'v',40,20),independent)
assert.equal(moveGeometryPoint(independent,'a',0,80),independent,'Upstream M collapsing onto V rejects the whole edit')
assert.deepEqual(independent.points,beforeMedian.points)
const seg=independent.constructions[1].output_segment_id
const deleted=deleteGeometrySelection(chain,{kind:'segment',id:seg})
assert.deepEqual(deleted.constructions.map(c=>c.kind),['midpoint','midpoint'])
assert.ok(deleted.points.some(p=>p.id===derivedId));assert.ok(normalize(deleted))
for(const id of ['a','c',derivedId]){
 const removed=deleteGeometrySelection(chain,{kind:'point',id})
 assert.equal(removed.constructions.length,0);assert.ok(!removed.segments.some(s=>s.id===seg));assert.ok(normalize(removed))
}
const removedVertex=deleteGeometrySelection(chain,{kind:'point',id:'v'})
assert.deepEqual(removedVertex.constructions.map(c=>c.kind),['midpoint','midpoint']);assert.ok(normalize(removedVertex))
for(const selection of [{kind:'segment',id:recipe.output_segment_id},{kind:'point',id:'v'}]){
 const removed=deleteGeometrySelection(g,selection);assert.equal(removed.constructions.length,0);assert.ok(removed.points.some(p=>p.id==='m'));assert.ok(normalize(removed))
}
const shared=commitMedian(independent,'free',derivedId);assert.equal(shared.constructions.length,3);assert.ok(normalize(shared))
const noPolygon=deleteGeometrySelection(g,{kind:'polygon',id:'triangle'});assert.ok(normalize(noPolygon));assert.equal(noPolygon.constructions.length,1)
for(const patch of [{midpoint_point_id:'missing'},{midpoint_point_id:'v'},{vertex_point_id:'missing'},{output_segment_id:'missing'},{source_point_ids:['a','v','c']},{extra:1},{id:'bad id'}]){
 const bad=structuredClone(g);Object.assign(bad.constructions[0],patch);assert.equal(normalize(bad),null)
}
for(const mutate of [bad=>bad.points.find(p=>p.id==='m').x=Infinity,bad=>bad.segments[0].start_point_id='a',bad=>bad.segments[0].end_point_id='c',bad=>Object.assign(bad.points.find(p=>p.id==='m'),{x:35,y:50}),
 bad=>bad.constructions.push({...recipe,id:'owner',vertex_point_id:'a'}),
 bad=>bad.constructions.push({id:'cycle',kind:'perpendicular',source:{kind:'segment',id:recipe.output_segment_id},through_point_id:'free',output_line_id:'ordinary',support_point_id:'m'})]){
 const bad=structuredClone(g);mutate(bad);assert.equal(normalize(bad),null)
}
const duplicate=structuredClone(g);duplicate.segments.push({id:'s2',start_point_id:'v',end_point_id:'m'});duplicate.constructions.push({...recipe,id:'duplicate',output_segment_id:'s2'});assert.equal(normalize(duplicate),null)
const arbitrary=structuredClone(g);Object.assign(arbitrary.points.find(p=>p.id==='m'),{x:41,y:23,label:'Preserved'});assert.deepEqual(normalize(arbitrary),arbitrary)
assert.deepEqual(normalize(base),base)
console.log('PASS: median two inputs, segment-only ownership, borrowed free/derived points, locking, atomic distance validation, ordered duplicates, dependency chains/order, deletion and legacy normalization')

const {commitTriangleMedian,findMidpoint}=await loadGeometryModule('geometryConstructionModel')
const triangleOriginal=structuredClone(base)
const created=commitTriangleMedian(base,'a','v','c')
assert.equal(created.status,'created');assert.ok(normalize(created.geometry));assert.deepEqual(base,triangleOriginal)
const triangle=created.geometry,owner=findMidpoint(triangle,'a','c'),median=findMedian(triangle,'v',owner.output_point_id)
assert.equal(findMidpoint(triangle,'c','a'),owner)
assert.equal(triangle.points.length,base.points.length+1)
assert.equal(triangle.constructions.length,2);assert.equal(triangle.segments.length,1)
assert.deepEqual(triangle.constructions.map(c=>c.kind),['midpoint','median'])
assert.deepEqual(ownedConstructionIds(owner),[owner.output_point_id]);assert.deepEqual(ownedConstructionIds(median),[median.output_segment_id])
assert.notEqual(owner.output_point_id,'m','A coordinate-coincident free point is not reused')
assert.deepEqual(triangle.points.at(-1),{id:owner.output_point_id,x:40,y:20,label:null})
assert.equal(created.outputSegmentId,median.output_segment_id)
for(const [a,c] of [['a','c'],['c','a']]){
 const repeated=commitTriangleMedian(triangle,a,'v',c)
 assert.equal(repeated.status,'existing');assert.equal(repeated.geometry,triangle);assert.equal(repeated.outputSegmentId,median.output_segment_id)
}
const reused=commitTriangleMedian(beforeMedian,'a','v','c')
assert.equal(reused.status,'created');assert.deepEqual(reused.geometry.points,beforeMedian.points)
assert.equal(reused.geometry.constructions.length,2);assert.equal(reused.geometry.constructions[1].midpoint_point_id,derivedId)
const rejection=(input,a='a',v='v',c='c')=>{
 const snapshot=structuredClone(input),result=commitTriangleMedian(input,a,v,c)
 assert.equal(result.status,'rejected');assert.equal(result.geometry,input);assert.deepEqual(input,snapshot)
}
for(const ids of [['a','a','c'],['a','v','a'],['v','v','c'],['missing','v','c']])rejection(base,...ids)
for(const bad of [
 {...base,polygons:[]},
 {...base,polygons:[{id:'quad',point_ids:['a','v','c','free']}]},
 {...base,polygons:[{id:'other',point_ids:['a','v','free']}]},
 ...[Infinity,NaN].map(x=>({...base,points:base.points.map(p=>p.id==='a'?{...p,x}:p)})),
 {...base,points:base.points.map(p=>p.id==='v'?{...p,y:20}:p)},
 {...base,points:base.points.map(p=>p.id==='c'?{...p,x:10}:p)},
 {...base,points:[...base.points,...Array.from({length:495},(_,i)=>({id:`extra-${i}`,x:i,y:80,label:null}))]},
])rejection(bad)
// Midpoint can commit locally, but the second recipe or segment limit blocks Median.
const segmentFull={...base,segments:Array.from({length:1000},(_,i)=>({id:`edge-${i}`,start_point_id:'a',end_point_id:'c'}))}
assert.ok(findMidpoint(commitMidpoint(segmentFull,'a','c'),'a','c'))
rejection(segmentFull)
const full={...base,points:[...base.points,...Array.from({length:200},(_,i)=>({id:`limit-point-${i}`,x:35,y:50,label:null}))],constructions:Array.from({length:199},(_,i)=>({id:`limit-${i}`,kind:'midpoint',source_point_ids:['v',`limit-point-${i}`],output_point_id:`limit-point-${i+1}`}))}
// Each source point is at V, so all outputs are exactly valid midpoint coordinates.
assert.ok(normalize(full));assert.equal(commitMidpoint(full,'a','c').constructions.length,200)
rejection(full)
const reusedFull={...beforeMedian,points:[...beforeMedian.points,...full.points.slice(base.points.length)],constructions:[...beforeMedian.constructions,...full.constructions]}
assert.ok(normalize(reusedFull));rejection(reusedFull)
for(const id of ['a','c']){
 const edited=moveGeometryPoint(triangle,id,id==='a'?5:80,id==='a'?10:30)
 assert.notEqual(edited,triangle);assert.ok(normalize(edited))
 const p=id=>edited.points.find(p=>p.id===id),movedM=p(owner.output_point_id)
 assert.deepEqual([movedM.x,movedM.y],[p('a').x/2+p('c').x/2,p('a').y/2+p('c').y/2])
 assert.equal(edited.segments[0].end_point_id,owner.output_point_id)
}
const vertexMoved=moveGeometryPoint(triangle,'v',45,60)
assert.deepEqual(vertexMoved.points.find(p=>p.id===owner.output_point_id),triangle.points.at(-1))
assert.equal(moveGeometryPoint(triangle,owner.output_point_id,99,99),triangle)
assert.equal(moveGeometryPoint(triangle,'a',0,80),triangle)
assert.equal(moveGeometryPoint(triangle,'v',40,20),triangle)
let upstream=commitMidpoint(base,'a','free'),sourceA=upstream.constructions[0].output_point_id
upstream={...upstream,polygons:[{id:'derived-triangle',point_ids:[sourceA,'v','c']}]}
const derivedTriangle=commitTriangleMedian(upstream,sourceA,'v','c')
assert.equal(derivedTriangle.status,'created')
const reverse={...derivedTriangle.geometry,constructions:[...derivedTriangle.geometry.constructions].reverse()}
assert.ok(normalize(reverse));assert.ok(normalize(moveGeometryPoint(reverse,'free',85,85)))
const deletedMedian=deleteGeometrySelection(triangle,{kind:'segment',id:median.output_segment_id})
assert.deepEqual(deletedMedian.constructions,[owner]);assert.ok(deletedMedian.points.some(p=>p.id===owner.output_point_id))
for(const id of ['a','c',owner.output_point_id]){
 const deleted=deleteGeometrySelection(triangle,{kind:'point',id})
 assert.equal(deleted.constructions.length,0);assert.equal(deleted.segments.length,0);assert.ok(!deleted.points.some(p=>p.id===owner.output_point_id));assert.ok(normalize(deleted))
}
assert.deepEqual(deleteGeometrySelection(triangle,{kind:'point',id:'v'}).constructions,[owner])
assert.deepEqual(deleteGeometrySelection(triangle,{kind:'polygon',id:'triangle'}).constructions,triangle.constructions)
console.log('PASS: triangle Median orchestration reuse/create, reversed A/C, context/finite/degenerate rejection, capacity rollback, derived sources, ordered evaluation, edits and deletion')
