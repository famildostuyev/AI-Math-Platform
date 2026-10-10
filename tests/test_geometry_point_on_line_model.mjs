import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const model=await loadGeometryModule('geometryConstructionModel')
const author=await loadGeometryModule('geometryAuthoringModel')
const {normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {createGeometryHistory}=await loadGeometryModule('geometryHistoryModel')
const {projectPointParameter,parameterCoordinates}=await loadGeometryModule('geometryPointConstraintModel')
const {attachAnnotation,annotationPose}=await loadGeometryModule('geometryAnnotationModel')
const f=JSON.parse(execFileSync(fileURLToPath(new URL('../.venv/Scripts/python.exe',import.meta.url)),['-m','tests.test_geometry_point_on_line_contract','--fixture'],{encoding:'utf8'}))
const g=normalize(f.input),before=structuredClone(g),parent=g.constructions[0].parent
assert.deepEqual(g,f.canonical)
for(const t of [-.5,0,.5,1,1.5]){
 const q=parameterCoordinates(g.points[0],g.points[1],t,true)
 assert.equal(q.x,10+20*t);assert.equal(q.y,20)
 assert.equal(projectPointParameter(g.points[0],g.points[1],{x:q.x,y:99},true),t)
 assert.ok(normalize({...g,points:g.points.map(p=>p.id==='d'?{...p,...q}:p),constructions:[{...g.constructions[0],t}]}))
}
assert.equal(projectPointParameter(g.points[0],g.points[1],{x:0,y:99}),0)
assert.equal(projectPointParameter(g.points[0],g.points[1],{x:99,y:99}),1)
assert.equal(parameterCoordinates(g.points[0],g.points[1],1.5),null)
const free={...g,points:g.points.slice(0,3),segments:[],constructions:[]}
const created=model.commitPointOnLine(free,parent,40,80)
assert.equal(created.points.at(-1).x,40);assert.ok(normalize(created))
assert.strictEqual(model.commitPointOnLine(created,parent,40,90),created)
assert.strictEqual(model.commitPointOnLine(free,parent,10,90),free)
assert.strictEqual(model.commitPointOnLine(free,parent,30.5,90,1),free)
assert.strictEqual(model.commitPointOnLine({...free,lines:[{...free.lines[0],kind:'vector'}]},parent,40,80).points,free.points)
const moved=author.moveGeometryPoint(g,'d',0,90)
assert.equal(moved.constructions[0].t,-.5);assert.equal(moved.points[3].x,0);assert.equal(moved.points[3].y,20)
assert.equal(moved.segments[0].end_point_id,'d')
const rotated=author.moveGeometryPoint(g,'b',10,40)
assert.deepEqual([rotated.points[3].x,rotated.points[3].y],[10,50]);assert.equal(rotated.constructions[0].t,1.5)
assert.strictEqual(author.moveGeometryPoint(g,'b',10,20),g)
assert.strictEqual(author.moveGeometryPoint(g,'d',Infinity,1),g)
const alternate={...g,lines:[...g.lines,{id:'ac',kind:'directed_line',start_point_id:'a',end_point_id:'c'}]}
const retargeted=model.retargetPointConstraint(alternate,'d',{kind:'line',line_id:'ac'})
assert.ok(normalize(retargeted));assert.equal(retargeted.points[3].id,'d')
const reversed=model.retargetPointConstraint({...g,lines:[{...g.lines[0],start_point_id:'b',end_point_id:'a'}]},'d',parent)
assert.equal(reversed.constructions[0].t,-.5);assert.deepEqual(reversed.points,g.points)
const chain={...g,points:[...g.points,{id:'m',x:30,y:40,label:null}],constructions:[{id:'consumer',kind:'midpoint',source_point_ids:['c','d'],output_point_id:'m'},...g.constructions]}
assert.ok(normalize(chain));assert.equal(author.moveGeometryPoint(chain,'d',0,80).points.at(-1).x,10)
const cyclic={...chain,lines:[...chain.lines,{id:'am',kind:'line',start_point_id:'a',end_point_id:'m'}]}
assert.strictEqual(model.retargetPointConstraint(cyclic,'d',{kind:'line',line_id:'am'}),cyclic)
const constructed=model.commitLinearConstruction(g,'parallel',{kind:'line',id:'ab'},'c')
const outputLine=constructed.constructions.find(c=>c.kind==='parallel').output_line_id
const onConstructed=model.commitPointOnLine(constructed,{kind:'line',line_id:outputLine},22,99)
assert.ok(normalize(onConstructed));assert.equal(onConstructed.constructions.at(-1).t,2)
const reordered={...onConstructed,constructions:[...onConstructed.constructions].reverse()}
assert.ok(normalize(reordered))
const constructedRotated=author.moveGeometryPoint(reordered,'b',10,40)
assert.ok(normalize(constructedRotated));assert.deepEqual([constructedRotated.points.at(-1).x,constructedRotated.points.at(-1).y],[20,62])
const withoutConstructed=author.deleteGeometrySelection(reordered,{kind:'line',id:outputLine})
assert.ok(normalize(withoutConstructed));assert.ok(withoutConstructed.points.some(p=>p.id===onConstructed.points.at(-1).id))
const invalidParent={...g,lines:[{...g.lines[0],kind:'vector'}]}
assert.equal(model.recomputeConstructions(invalidParent),null,'Existing invalid parent must not detach')
const degenerate={...g,points:g.points.map(p=>p.id==='b'?{...p,x:10}:p)}
assert.equal(model.recomputeConstructions(degenerate),null,'Degenerate parent must not detach')
for(const t of [NaN,Infinity,'1.5',true,null])assert.equal(normalize({...g,constructions:[{...g.constructions[0],t}]}),null)
assert.equal(normalize({...g,constructions:[{...g.constructions[0],t:1e308}]}),null)
let annotated={...chain,texts:[{id:'note',x:40,y:20,content:'D'}]}
annotated=attachAnnotation(annotated,'note',{target_kind:'point',target_id:'d'})
const pose=annotationPose(annotated,annotated.texts[0])
for(const selection of [{kind:'line',id:'ab'},{kind:'point',id:'a'}]){
 const next=author.deleteGeometrySelection(annotated,selection)
 assert.ok(normalize(next));assert.equal(model.pointConstraint(next,'d'),undefined)
 assert.deepEqual(next.points.find(p=>p.id==='d'),g.points[3]);assert.ok(next.points.some(p=>p.id==='m'))
 assert.deepEqual(next.segments,annotated.segments);assert.equal(next.texts[0].attachment.target_id,'d')
 assert.deepEqual(annotationPose(next,next.texts[0]),pose)
 let state;const history=createGeometryHistory(annotated,n=>state=n)
 assert.ok(history.commit(next));assert.equal(history.commit(next),false);history.provider.undo();assert.deepEqual(state,annotated);history.provider.redo();assert.deepEqual(state,next)
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(next))),next)
}
const deleted=author.deleteGeometrySelection(chain,{kind:'point',id:'d'})
assert.ok(!deleted.points.some(p=>p.id==='d'||p.id==='m'));assert.equal(deleted.segments.length,0)
const detached=model.detachPointConstraint(g,'d');assert.deepEqual(detached.points,g.points)
assert.equal(author.moveGeometryPoint(detached,'d',0,90).points[3].y,90)
const deletedAnnotated=author.deleteGeometrySelection(annotated,{kind:'point',id:'d'})
assert.ok(normalize(deletedAnnotated));assert.ok(!deletedAnnotated.points.some(p=>p.id==='d'||p.id==='m'))
assert.equal(deletedAnnotated.texts[0].attachment,undefined);assert.deepEqual(annotationPose(deletedAnnotated,deletedAnnotated.texts[0]),pose)
const boundedParent={...g,segments:[...g.segments,{id:'ab-segment',start_point_id:'a',end_point_id:'b'}]}
const bounded=model.retargetPointConstraint(boundedParent,'d',{kind:'segment',segment_id:'ab-segment'})
assert.equal(bounded.constructions[0].kind,'point_on_segment');assert.equal(bounded.constructions[0].t,1)
assert.equal(author.moveGeometryPoint(bounded,'d',0,99).constructions[0].t,0)
const unboundedAgain=model.retargetPointConstraint(bounded,'d',parent)
assert.equal(unboundedAgain.constructions[0].kind,'point_on_line');assert.equal(unboundedAgain.points[3].id,'d');assert.ok(normalize(unboundedAgain))
assert.deepEqual(g,before)
console.log('PASS: point-on-line parity, unbounded math, duplicate guard, drag/rotation, retarget/reversal, cycles, deletion/annotations/history and roundtrip')
