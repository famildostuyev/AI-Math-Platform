import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {commitMidpoint,commitLinearConstruction:commit,linearSupportCoordinates} = await loadGeometryModule('geometryConstructionModel')
const {moveGeometryPoint,deleteGeometrySelection} = await loadGeometryModule('geometryAuthoringModel')
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize} = await loadGeometryModule('geometryV1')
const {geometryFrameMetrics} = await loadGeometryModule('geometryFrameModel')
const base={...emptyGeometryV1(),description:'F2',points:[['a',0,0],['b',20,10],['c',10,30],['d',40,50]].map(([id,x,y])=>({id,x,y,label:null}))}
for(const sourceKind of ['segment','line','directed_line','vector'])for(const kind of ['parallel','perpendicular']){
 const source={kind:sourceKind,id:'source'}
 const object={id:'source',start_point_id:'a',end_point_id:'b'}
 let g={...base,...(sourceKind==='segment'?{segments:[object]}:{lines:[{...object,kind:sourceKind}]})}
 g=commitMidpoint(g,'a','b');const m=g.constructions[0].output_point_id
 g=commit(g,kind,source,m);const first=g.constructions[1]
 g=commit(g,'perpendicular',{kind:'line',id:first.output_line_id},'c');const second=g.constructions[2]
 assert.ok(normalize(g));assert.equal(commit(g,kind,source,m),g)
 const reversed={...g,constructions:[...g.constructions].reverse()}
 const moved=moveGeometryPoint(reversed,'a',4,8);assert.ok(normalize(moved));assert.notDeepEqual(moved.points,g.points)
 const rotated=moveGeometryPoint(moved,'b',30,2);assert.ok(normalize(rotated))
 assert.equal(moveGeometryPoint(g,first.support_point_id,99,99),g)
 assert.equal(moveGeometryPoint(g,'a',20,10),g,'Degenerate source edit rejected atomically')
 const direction=(state,recipe)=>{const p=state.points.find(p=>p.id===recipe.through_point_id),q=state.points.find(p=>p.id===recipe.support_point_id);return [q.x-p.x,q.y-p.y]}
 const [x,y]=direction(g,first),[u,v]=direction(g,second)
 assert.ok(Math.abs(x*u+y*v)<1e-9)
 assert.ok(Math.abs(kind==='parallel'?x*10-y*20:x*20+y*10)<1e-9)
 const deleted=deleteGeometrySelection(g,{kind:'line',id:first.output_line_id})
 assert.equal(deleted.constructions.length,1);assert.ok(deleted.points.some(p=>p.id===m));assert.ok(!deleted.points.some(p=>p.id===first.support_point_id||p.id===second.support_point_id));assert.ok(normalize(deleted))
 const sourceDeleted=deleteGeometrySelection(g,{kind:sourceKind==='segment'?'segment':'line',id:'source'})
 assert.equal(sourceDeleted.constructions.length,1);assert.ok(sourceDeleted.points.some(p=>p.id==='a'));assert.ok(normalize(sourceDeleted))
 const throughDeleted=deleteGeometrySelection(g,{kind:'point',id:m});assert.equal(throughDeleted.constructions.length,0);assert.ok(normalize(throughDeleted))
 assert.ok(geometryFrameMetrics(g).minimum.width<1000)
 for(const patch of [{source:{kind:'polygon',id:'source'}},{source:{kind:sourceKind,id:'missing'}},{through_point_id:'missing'},{output_line_id:'missing'},{source:{kind:'line',id:first.output_line_id}},{extra:1}]){
  const bad=structuredClone(g);Object.assign(bad.constructions[1],patch);assert.equal(normalize(bad),null)
 }
 const cycle=structuredClone(g);cycle.constructions[1].source={kind:'line',id:second.output_line_id};assert.equal(normalize(cycle),null)
 const bad=structuredClone(g);bad.points.find(p=>p.id===first.support_point_id).x+=1;assert.equal(normalize(bad),null)
}
for(const kind of ['parallel','perpendicular'])assert.deepEqual(linearSupportCoordinates({x:0,y:0},{x:0,y:10},{x:4,y:5},kind),linearSupportCoordinates({x:0,y:10},{x:0,y:0},{x:4,y:5},kind))
console.log('PASS: F2 four typed sources, both relations, canonical direction, midpoint/line chains, reversed recipe order, atomic source edits, ownership, duplicates/cycles, transitive deletion and finite bounds')
