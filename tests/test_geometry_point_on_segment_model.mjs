import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const model=await loadGeometryModule('geometryConstructionModel')
const author=await loadGeometryModule('geometryAuthoringModel')
const {normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {geometryShapes}=await loadGeometryModule('geometryTopologyModel')
const {transformGeometryShape,deleteGeometryShape}=await loadGeometryModule('geometryShapeModel')
const {createGeometryHistory}=await loadGeometryModule('geometryHistoryModel')
const {projectPointParameter}=await loadGeometryModule('geometryPointConstraintModel')
const f=JSON.parse(execFileSync(fileURLToPath(new URL('../.venv/Scripts/python.exe',import.meta.url)),['-m','tests.test_geometry_point_on_segment_contract','--fixture'],{encoding:'utf8'}))
const g=normalize(f.input),before=structuredClone(g),recipe=g.constructions[0],d=()=>g.points.find(p=>p.id==='d')
assert.deepEqual(g,f.canonical)
assert.deepEqual(normalize(JSON.parse(JSON.stringify(g))),g)
for(const [x,t] of [[-10,0],[5,.25],[30,1]])assert.equal(projectPointParameter(g.points[0],g.points[1],{x,y:15}),t)
assert.equal(projectPointParameter(g.points[0],g.points[0],{x:1,y:1}),null)
assert.equal(projectPointParameter(g.points[0],g.points[1],{x:NaN,y:1}),null)
const free={...g,points:g.points.slice(0,3),segments:g.segments.slice(0,1),constructions:[]}
const created=model.commitPointOnSegment(free,recipe.parent,8,5)
assert.equal(created.points.at(-1).x,8);assert.equal(created.points.at(-1).y,0);assert.ok(normalize(created))
const moved=author.moveGeometryPoint(g,'d',15,100)
assert.equal(moved.constructions[0].t,.75);assert.deepEqual(moved.points.find(p=>p.id==='d'),{...d(),x:15});assert.equal(moved.segments[1].end_point_id,'d')
assert.strictEqual(author.moveGeometryPoint(g,'d',5,0),g)
assert.strictEqual(author.moveGeometryPoint(g,'d',Infinity,0),g)
const withLine={...g,lines:[{id:'ad',kind:'line',start_point_id:'a',end_point_id:'d'}]}
assert.strictEqual(author.moveGeometryPoint(withLine,'d',-10,0),withLine)
const withPolyline={...g,polylines:[{id:'ad',point_ids:['a','d']}]}
assert.strictEqual(author.moveGeometryPoint(withPolyline,'d',-10,0),withPolyline)
const sourceMoved=author.moveGeometryPoint(g,'b',40,0)
assert.equal(sourceMoved.points.find(p=>p.id==='d').x,10)
assert.strictEqual(author.moveGeometryPoint(g,'b',0,0),g)
const edge={kind:'polygon_edge',polygon_id:'triangle',start_point_id:'a',end_point_id:'b'}
const polygon=model.retargetPointConstraint(g,'d',edge)
assert.ok(normalize(polygon));assert.equal(polygon.points.find(p=>p.id==='d').x,5)
const reversed=model.retargetPointConstraint(polygon,'d',{...edge,start_point_id:'b',end_point_id:'a'})
assert.equal(reversed.constructions[0].t,.75);assert.equal(reversed.points.find(p=>p.id==='d').x,5)
assert.ok(normalize({...polygon,polygons:[{...polygon.polygons[0],point_ids:['c','b','a']}]}))
assert.equal(author.moveGeometryPoint(polygon,'c',15,25).points.find(p=>p.id==='d').x,5)
for(const operation of [{kind:'translate',dx:3,dy:4},{kind:'rotate',radians:.5},{kind:'scale',factor:2}]){
 const next=transformGeometryShape(polygon,geometryShapes(polygon)[0],operation)
 assert.notStrictEqual(next,polygon);assert.ok(normalize(next));const a=next.points[0],b=next.points[1],p=next.points[3]
 assert.ok(Math.abs(p.x-((1-.25)*a.x+.25*b.x))<1e-8);assert.ok(Math.abs(p.y-((1-.25)*a.y+.25*b.y))<1e-8)
}
const chain={...g,points:[...g.points,{id:'m',x:7.5,y:10,label:null}],constructions:[{id:'consumer',kind:'midpoint',source_point_ids:['c','d'],output_point_id:'m'},recipe]}
assert.ok(normalize(chain));const chained=author.moveGeometryPoint(chain,'d',10,0);assert.equal(chained.points.at(-1).x,10)
const cycle={...g,constructions:[{...recipe,parent:{kind:'segment',segment_id:'cd'}}]}
const indirect={...chain,segments:[...chain.segments,{id:'am',start_point_id:'a',end_point_id:'m'}]}
assert.equal(normalize({...indirect,constructions:indirect.constructions.map(c=>c.kind==='point_on_segment'?{...c,parent:{kind:'segment',segment_id:'am'}}:c)}),null)
assert.strictEqual(model.retargetPointConstraint(indirect,'d',{kind:'segment',segment_id:'am'}),indirect)
assert.equal(normalize(cycle),null);assert.strictEqual(model.retargetPointConstraint(g,'d',cycle.constructions[0].parent),g)
for(const patch of [{t:-1},{t:NaN},{t:Infinity},{t:true},{t:'0.25'},{parent:{kind:'segment',segment_id:'missing'}},{parent:{...edge,end_point_id:'missing'}}])assert.equal(normalize({...g,constructions:[{...recipe,...patch}]}),null)
for(const [doc,selection] of [[chain,{kind:'segment',id:'ab'}],[chain,{kind:'point',id:'a'}],[polygon,{kind:'polygon',id:'triangle'}]]){
 const next=author.deleteGeometrySelection(doc,selection)
 assert.ok(next.points.some(p=>p.id==='d'));assert.ok(next.segments.some(s=>s.id==='cd'));assert.equal(model.pointConstraint(next,'d'),undefined);assert.ok(normalize(next))
 if(doc===chain)assert.ok(next.points.some(p=>p.id==='m'))
 let state;const history=createGeometryHistory(doc,n=>state=n);assert.ok(history.commit(next));history.provider.undo();assert.deepEqual(state,doc);history.provider.redo();assert.deepEqual(state,next)
}
const deletedD=author.deleteGeometrySelection(chain,{kind:'point',id:'d'})
assert.ok(!deletedD.points.some(p=>p.id==='d'||p.id==='m'));assert.ok(!deletedD.segments.some(s=>s.id==='cd'));assert.ok(normalize(deletedD))
const detached=model.detachPointConstraint(g,'d');assert.deepEqual(detached.points,g.points);assert.equal(model.pointConstraint(detached,'d'),undefined)
assert.strictEqual(model.detachPointConstraint(detached,'d'),detached)
const multiple=model.commitPointOnSegment(g,recipe.parent,5,0)
assert.equal(multiple.points.length,g.points.length+1);assert.notEqual(multiple.points.at(-1).id,'d')
assert.equal(author.deleteGeometrySelection(multiple,{kind:'segment',id:'ab'}).constructions.length,0)
const endpoint=model.commitPointOnSegment(g,recipe.parent,-10,0)
assert.equal(endpoint.points.at(-1).x,0);assert.notEqual(endpoint.points.at(-1).id,'a');assert.ok(normalize(endpoint))
assert.equal(author.moveGeometryPoint(detached,'d',8,9).points[3].y,9)
const removedShape=deleteGeometryShape(polygon,geometryShapes(polygon)[0]);assert.ok(removedShape.points.some(p=>p.id==='d'));assert.ok(normalize(removedShape))
const invalidTopology={...polygon,polygons:[]};assert.equal(normalize(invalidTopology),null);const recovered=model.recomputeConstructions(invalidTopology);assert.ok(normalize(recovered));assert.deepEqual(recovered.points,polygon.points)
const changedTopology={...polygon,points:[...polygon.points,{id:'e',x:0,y:20,label:null}],polygons:[{id:'triangle',point_ids:['a','c','b','e']}]}
assert.equal(normalize(changedTopology),null);const separated=model.recomputeConstructions(changedTopology);assert.ok(normalize(separated));assert.equal(model.pointConstraint(separated,'d'),undefined);assert.deepEqual(separated.points.find(p=>p.id==='d'),d())
const full={...free,points:Array.from({length:500},(_,i)=>({id:`p${i}`,x:i,y:0,label:null}))};assert.strictEqual(model.commitPointOnSegment(full,recipe.parent,2,0),full)
for(const next of [created,moved,detached,reversed]){let state;const h=createGeometryHistory(g,n=>state=n);assert.ok(h.commit(next));assert.equal(h.commit(next),false);h.provider.undo();assert.deepEqual(state,g);h.provider.redo();assert.deepEqual(state,next)}
assert.deepEqual(g,before)
console.log('PASS: constrained point contract parity, projection, creation, sliding, transforms, reversed topology, chains/cycles, atomic rejection, deletion preservation, detach, history, roundtrip and immutability')
