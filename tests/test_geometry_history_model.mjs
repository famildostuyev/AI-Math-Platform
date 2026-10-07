import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { createGeometryHistory, GEOMETRY_HISTORY_LIMIT } = await loadGeometryModule('geometryHistoryModel')
const { emptyGeometryV1, normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const { addGeometryPoint, moveGeometryPoint, deleteGeometrySelection, renameGeometryPoint, addGeometryText, updateGeometryTextContent } = await loadGeometryModule('geometryAuthoringModel')
const { commitGeometryLine } = await loadGeometryModule('geometryLineModel')
const { commitGeometryTemplate } = await loadGeometryModule('geometryTemplateModel')
const { commitGeometryCircle } = await loadGeometryModule('geometryCircleModel')
const { commitGeometryArc } = await loadGeometryModule('geometryArcModel')
const { commitMidpoint, commitTriangleMedian, commitAltitude, commitAngleBisector, commitLinearConstruction, commitIntersection } = await loadGeometryModule('geometryConstructionModel')
const base = {...emptyGeometryV1(),description:'History'}
let restored
const history = createGeometryHistory(base,g=>{ assert.ok(normalize(g)); restored=g })
const p = history.provider
assert.equal(p.getSnapshot(),0);assert.equal(p.undo(),false);assert.equal(p.redo(),false)
let notices=0;const unsubscribe=p.subscribe(()=>notices++)
const point=addGeometryPoint(base,10,10)
assert.equal(point.points[0].label,null)
assert.ok(history.commit(point));assert.equal(p.getSnapshot(),1)
point.points[0].x=999 // caller mutation must not affect stored snapshots
assert.ok(p.undo());assert.deepEqual(restored,base);assert.equal(p.getSnapshot(),2)
assert.ok(p.redo());assert.equal(restored.points[0].x,10)
assert.equal(history.commit(restored),false)
assert.equal(history.commit({...restored,description:''}),false)
assert.equal(p.getSnapshot(),1)
const renamed=renameGeometryPoint(restored,restored.points[0].id,'Explicit')
history.commit(renamed);p.undo();assert.equal(restored.points[0].label,null);p.redo();assert.equal(restored.points[0].label,'Explicit')
const moved=moveGeometryPoint(restored,restored.points[0].id,20,20)
history.commit(moved);p.undo();assert.equal(restored.points[0].x,10);p.redo();assert.equal(restored.points[0].x,20)
history.commit(deleteGeometrySelection(restored,{kind:'point',id:restored.points[0].id}));p.undo();assert.equal(restored.points.length,1);p.redo();assert.equal(restored.points.length,0)
p.undo();history.commit(addGeometryText(restored,5,5));assert.equal(p.redo(),false)
let current=base
const edits=createGeometryHistory(current,g=>{current=g})
const commit=g=>{assert.ok(edits.commit(g));current=g}
commit(addGeometryText(current,5,5))
const id=current.texts[0].id
commit(updateGeometryTextContent(current,id,'First'))
// Text typing groups replace only the last operation in the same edit gesture.
const beforeTyping=structuredClone(current)
for(const content of ['Second','Second!']) {const next=updateGeometryTextContent(current,id,content);assert.ok(edits.commit(next,'text'));current=next}
edits.provider.undo();assert.deepEqual(current,beforeTyping)
edits.provider.redo();assert.equal(current.texts[0].content,'Second!')
edits.endGroup();const next=updateGeometryTextContent(current,id,'Third');edits.commit(next,'text');edits.provider.undo();assert.equal(current.texts[0].content,'Second!')
for(const operation of [
 g=>commitGeometryLine(g,'line',[{x:10,y:10},{x:20,y:20}]),
 g=>commitGeometryTemplate(g,'triangle',{x:10,y:10},{x:30,y:10}),
 g=>commitGeometryCircle(g,'disk',{x:10,y:10},{x:30,y:10}),
 g=>commitGeometryArc(g,'sector',{x:10,y:10},{x:30,y:10},{x:10,y:30}),
]) {
 let result;const h=createGeometryHistory(base,g=>result=g),created=operation(base)
 assert.ok(h.commit(created));assert.ok(created.points.every(p=>p.label===null))
 h.provider.undo();assert.deepEqual(result,base);assert.equal(h.provider.undo(),false)
 h.provider.redo();assert.deepEqual(result,created)
}
const sources={...base,points:[{id:'a',x:0,y:0,label:'Legacy'},{id:'b',x:10,y:10,label:null}]}
const constructed=commitMidpoint(sources,'a','b')
const h=createGeometryHistory(sources,g=>restored=g)
assert.ok(h.commit(constructed));h.provider.undo();assert.deepEqual(restored,sources);h.provider.redo();assert.deepEqual(restored,constructed)
assert.equal(normalize(constructed).points[0].label,'Legacy')
const triangle={...base,points:[{id:'a',x:0,y:0,label:'Legacy'},{id:'v',x:10,y:20,label:null},{id:'c',x:30,y:0,label:null}],polygons:[{id:'triangle',point_ids:['a','v','c']}],segments:[{id:'ac',start_point_id:'a',end_point_id:'c'},{id:'av',start_point_id:'a',end_point_id:'v'},{id:'vc',start_point_id:'v',end_point_id:'c'}]}
for(const operation of [
 g=>commitTriangleMedian(g,'a','v','c').geometry,
 g=>commitAltitude(g,'a','v','c'),
 g=>commitAngleBisector(g,'a','v','c'),
 g=>commitLinearConstruction(g,'parallel',{kind:'segment',id:'ac'},'v'),
 g=>commitLinearConstruction(g,'perpendicular',{kind:'segment',id:'ac'},'v'),
 g=>commitIntersection(g,{kind:'segment',id:'av'},{kind:'segment',id:'vc'}),
]) {
 let result;const session=createGeometryHistory(triangle,g=>result=g),created=operation(triangle)
 assert.notEqual(created,triangle);assert.ok(session.commit(created))
 assert.ok(created.points.slice(triangle.points.length).every(p=>p.label===null))
 session.provider.undo();assert.deepEqual(result,triangle);assert.equal(session.provider.undo(),false)
 session.provider.redo();assert.deepEqual(result,created)
}
const bounded=createGeometryHistory(base,()=>{})
for(let i=0;i<GEOMETRY_HISTORY_LIMIT+8;i++)assert.ok(bounded.commit({...base,description:`Edit ${i}`}))
let undos=0;while(bounded.provider.undo())undos++
assert.equal(undos,GEOMETRY_HISTORY_LIMIT)
bounded.setEnabled(false);assert.equal(bounded.provider.getSnapshot(),0);assert.equal(bounded.provider.redo(),false)
bounded.setEnabled(true);assert.ok(bounded.provider.redo())
assert.ok(notices>0);unsubscribe()
console.log('PASS: geometry history snapshots, atomic compound/construction edits, deletion/movement, no-op/invalid rejection, typing groups, redo branching, bounds and labels')
