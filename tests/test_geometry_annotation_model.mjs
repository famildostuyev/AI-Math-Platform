import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {annotationPose,moveAnnotation,detachAnnotation}=await loadGeometryModule('geometryAnnotationModel')
const {deleteGeometrySelection}=await loadGeometryModule('geometryAuthoringModel')
const {createGeometryHistory}=await loadGeometryModule('geometryHistoryModel')
const fixture=JSON.parse(execFileSync(fileURLToPath(new URL('../.venv/Scripts/python.exe',import.meta.url)),['-m','tests.test_geometry_annotation_contract','--fixture'],{encoding:'utf8'}))
const g=fixture.input,before=structuredClone(g),normalized=normalize(g)
assert.deepEqual(normalized,fixture.canonical);assert.deepEqual(g,before)
assert.deepEqual(normalize(JSON.parse(JSON.stringify(normalized))),normalized)
const t=normalized.texts[0]
assert.deepEqual(annotationPose(normalized,t),{x:20,y:30,rotation:.2})
const moved=moveAnnotation(normalized,t.id,40,50)
assert.ok(moved.texts[0].attachment);assert.deepEqual(moved.texts[0].attachment.offset,{x:30,y:30})
const deleted=deleteGeometrySelection(moved,{kind:'point',id:'a'})
assert.equal(deleted.texts.length,1);assert.equal(deleted.texts[0].attachment,undefined)
assert.equal(deleted.texts[0].x,40);assert.equal(deleted.texts[0].content,t.content);assert.ok(normalize(deleted))
let restored;const history=createGeometryHistory(normalized,next=>restored=next)
assert.ok(history.commit(moved));assert.equal(history.commit(moved),false);history.provider.undo();assert.deepEqual(restored,normalized);history.provider.redo();assert.deepEqual(restored,moved)
assert.ok(history.commit(deleted));history.provider.undo();assert.deepEqual(restored,moved)
assert.equal(detachAnnotation(moved,t.id).texts[0].attachment,undefined)
for(const patch of [{scale:0},{rotation:Infinity},{runs:[]},{runs:null},{attachment:null},{layout_width:0},{content:'Different'}])assert.equal(normalize({...g,texts:[{...g.texts[0],...patch}]}),null)
const missing={...t,attachment:{...t.attachment,target_id:'missing'}}
assert.deepEqual(annotationPose(normalized,missing),{x:t.x,y:t.y,rotation:.2})
assert.deepEqual(normalized,fixture.canonical)
console.log('PASS: annotation backend/frontend canonical parity, legacy defaults, structured roundtrip, attachment offset/deletion, atomic history and immutability')
const {moveGeometryPoint}=await loadGeometryModule('geometryAuthoringModel')
const {geometryShapes}=await loadGeometryModule('geometryTopologyModel')
const {deleteGeometryShape,transformGeometryShape}=await loadGeometryModule('geometryShapeModel')
const graph={...normalized,points:[{id:'a',x:0,y:0,label:null},{id:'b',x:20,y:0,label:null},{id:'c',x:10,y:20,label:null}],segments:[{id:'ab',start_point_id:'a',end_point_id:'b'},{id:'bc',start_point_id:'b',end_point_id:'c'},{id:'ca',start_point_id:'c',end_point_id:'a'}],texts:[]}
const attached={...t,x:15,y:2,rotation:.1,attachment:{target_kind:'segment',target_id:'ab',anchor:'parameter',parameter:.5,offset:{x:5,y:2},orientation:'follow_target'}}
const segmentDoc={...graph,texts:[attached]}
const rotated=moveGeometryPoint(segmentDoc,'b',0,20)
const pose=annotationPose(rotated,rotated.texts[0])
assert.ok(Math.abs(pose.x+2)<1e-9&&Math.abs(pose.y-15)<1e-9)
assert.ok(Math.abs(pose.rotation-(Math.PI/2+.1))<1e-9)
assert.equal(rotated.texts[0].x,pose.x)
const dragged=moveAnnotation(rotated,t.id,5,25)
assert.ok(dragged.texts[0].attachment);assert.ok(Math.abs(dragged.texts[0].attachment.offset.x-15)<1e-9)
const kept=deleteGeometrySelection(rotated,{kind:'segment',id:'ab'})
assert.equal(kept.texts[0].attachment,undefined);assert.deepEqual(annotationPose(kept,kept.texts[0]),pose)
const pointAttached={...graph,texts:[{...t,x:5,y:2,attachment:{target_kind:'point',target_id:'a',anchor:'point',offset:{x:5,y:2},orientation:'keep_page'}}]}
const translated=transformGeometryShape(pointAttached,geometryShapes(pointAttached)[0],{kind:'translate',dx:10,dy:8})
const removedShape=deleteGeometryShape(translated,geometryShapes(translated)[0])
assert.equal(removedShape.points.length,0);assert.equal(removedShape.texts[0].attachment,undefined);assert.equal(removedShape.texts[0].x,15);assert.equal(removedShape.texts[0].y,10)
assert.ok(normalize(removedShape))
console.log('PASS: follow-target orientation, attached dragging, cached world positions, segment deletion and shape orphan-point deletion preserve annotations')
