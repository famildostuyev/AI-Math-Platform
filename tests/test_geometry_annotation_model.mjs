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

const {attachAnnotation,setAnnotationOrientation,annotationTargetLabel,preserveAnnotationsOnDeletion,uprightRotation}=await loadGeometryModule('geometryAnnotationModel')
const {commitPointOnSegment}=await loadGeometryModule('geometryConstructionModel')
const variants=JSON.parse(execFileSync(fileURLToPath(new URL('../.venv/Scripts/python.exe',import.meta.url)),['-m','tests.test_geometry_annotation_contract','--attachments'],{encoding:'utf8'}))
for(const f of variants){const original=structuredClone(f.input);assert.deepEqual(normalize(f.input),f.canonical);assert.deepEqual(f.input,original)}
for(const patch of [{start_point_id:'a',end_point_id:'a'},{start_point_id:'a',end_point_id:'c'},{parameter:-.1},{auto_upright:'true'},{auto_upright:null},{start_point_id:null}]){const doc=structuredClone(variants[0].input);Object.assign(doc.texts[0].attachment,patch);assert.equal(normalize(doc),null)}
const world={...graph,texts:[{...t,attachment:undefined}]};delete world.texts[0].attachment
const poseEqual=(a,b)=>{for(const key of ['x','y','rotation'])assert.ok(Math.abs(a[key]-b[key])<1e-9,`${key}: ${a[key]} vs ${b[key]}`)}
const edgeTarget={target_kind:'polygon_edge',target_id:'poly',start_point_id:'a',end_point_id:'b'}
const document={...world,polygons:[{id:'poly',point_ids:['a','b','c']}],circles:[{id:'circle',kind:'circle',center_point_id:'a',radius:5}],arcs:[{id:'arc',kind:'arc',center_point_id:'b',radius:5,start_angle:.3,sweep_angle:1}]}
const original=structuredClone(document)
for(const target of [{target_kind:'point',target_id:'a'},{target_kind:'segment',target_id:'ab'},edgeTarget,{target_kind:'shape',target_id:'polygon:poly'},{target_kind:'circle',target_id:'circle'},{target_kind:'arc',target_id:'arc'}]){
 const attached=attachAnnotation(document,t.id,target);assert.notStrictEqual(attached,document);assert.ok(normalize(attached));poseEqual(annotationPose(attached,attached.texts[0]),annotationPose(document,document.texts[0]));assert.equal(attached.texts[0].attachment.orientation,'keep_page')
 assert.strictEqual(attachAnnotation(attached,t.id,target),attached)
 const follow=setAnnotationOrientation(attached,t.id,'follow_target');assert.equal(follow.texts[0].attachment.auto_upright,true);poseEqual(annotationPose(follow,follow.texts[0]),annotationPose(attached,attached.texts[0]))
 const back=setAnnotationOrientation(follow,t.id,'keep_page');poseEqual(annotationPose(back,back.texts[0]),annotationPose(follow,follow.texts[0]))
 const retargeted=attachAnnotation(follow,t.id,{target_kind:'point',target_id:'c'});poseEqual(annotationPose(retargeted,retargeted.texts[0]),annotationPose(follow,follow.texts[0]))
 let restored;const h=createGeometryHistory(document,n=>restored=n);for(const state of [attached,follow,retargeted,detachAnnotation(retargeted,t.id)]){const previous=restored??document;assert.ok(h.commit(state));h.provider.undo();assert.deepEqual(restored,previous);h.provider.redo();assert.deepEqual(restored,state)}
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(attached))),normalize(attached))
}
let edgeDoc=attachAnnotation(document,t.id,edgeTarget)
assert.equal(edgeDoc.texts[0].attachment.parameter,1,'Projection clamps to endpoint')
assert.deepEqual(annotationPose(moveGeometryPoint(edgeDoc,'c',15,25),edgeDoc.texts[0]),annotationPose(edgeDoc,edgeDoc.texts[0]))
const wound={...edgeDoc,polygons:[{id:'poly',point_ids:['c','b','a']}]};assert.ok(normalize(wound));poseEqual(annotationPose(wound,wound.texts[0]),annotationPose(edgeDoc,edgeDoc.texts[0]))
for(const operation of [{kind:'translate',dx:4,dy:8},{kind:'rotate',radians:Math.PI/3},{kind:'scale',factor:1.5}]){const transformed=transformGeometryShape(edgeDoc,geometryShapes(edgeDoc).find(s=>s.id==='polygon:poly'),operation);assert.notStrictEqual(transformed,edgeDoc);assert.ok(normalize(transformed));assert.equal(transformed.texts[0].attachment.parameter,edgeDoc.texts[0].attachment.parameter);assert.equal(transformed.texts[0].attachment.start_point_id,'a')}
const reversedEdge=attachAnnotation(edgeDoc,t.id,{...edgeTarget,start_point_id:'b',end_point_id:'a'});poseEqual(annotationPose(reversedEdge,reversedEdge.texts[0]),annotationPose(edgeDoc,edgeDoc.texts[0]));assert.equal(reversedEdge.texts[0].attachment.parameter,0)
assert.equal(annotationTargetLabel(document,edgeTarget),'Çoxbucaqlının tərəfi');const named={...document,points:document.points.map(p=>({...p,label:p.id.toUpperCase()}))};assert.equal(annotationTargetLabel(named,edgeTarget),'AB tərəfi');assert.equal(annotationTargetLabel({...named,points:named.points.map(p=>p.id==='a'?{...p,label:'D'}:p)},edgeTarget),'DB tərəfi')
const collapsed={...document,points:document.points.map(p=>p.id==='b'?{...p,x:0,y:0}:p)};assert.strictEqual(attachAnnotation(collapsed,t.id,edgeTarget),collapsed)
assert.strictEqual(attachAnnotation(document,t.id,{...edgeTarget,end_point_id:'missing'}),document)
assert.strictEqual(attachAnnotation(document,t.id,{target_kind:'point',target_id:'missing'}),document)
assert.strictEqual(attachAnnotation(document,t.id,{target_kind:'line',target_id:'arc'}),document)
const constrained=commitPointOnSegment(document,{kind:'segment',segment_id:'ab'},5,0),d=constrained.points.at(-1).id
const pointDoc=attachAnnotation(constrained,t.id,{target_kind:'point',target_id:d}),slide=moveGeometryPoint(pointDoc,d,10,8)
assert.equal(slide.texts[0].x-pointDoc.texts[0].x,5);assert.equal(slide.texts[0].attachment.target_id,d)
const parentGone=deleteGeometrySelection(slide,{kind:'segment',id:'ab'});assert.equal(parentGone.texts[0].attachment.target_id,d);assert.ok(normalize(parentGone))
const pointGone=deleteGeometrySelection(parentGone,{kind:'point',id:d});assert.equal(pointGone.texts[0].attachment,undefined);poseEqual(annotationPose(pointGone,pointGone.texts[0]),annotationPose(parentGone,parentGone.texts[0]))
const edgeGone=deleteGeometrySelection(edgeDoc,{kind:'polygon',id:'poly'});assert.equal(edgeGone.texts[0].attachment,undefined);poseEqual(annotationPose(edgeGone,edgeGone.texts[0]),annotationPose(edgeDoc,edgeDoc.texts[0]))
const invalidEdge=preserveAnnotationsOnDeletion(edgeDoc,{...edgeDoc,polygons:[{id:'poly',point_ids:['a','c','b','extra']}]});assert.equal(invalidEdge.texts[0].attachment,undefined)
const legacy={...attached,rotation:Math.PI,attachment:{...attached.attachment,orientation:'follow_target'}};assert.equal(annotationPose(segmentDoc,legacy).rotation,Math.PI)
assert.equal(annotationPose(segmentDoc,{...legacy,attachment:{...legacy.attachment,auto_upright:true}}).rotation,0)
for(const r of [-20,-Math.PI/2,0,Math.PI/2,20])assert.ok(uprightRotation(r)>=-Math.PI/2&&uprightRotation(r)<Math.PI/2)
assert.deepEqual(document,original)
console.log('PASS: attachment authoring all targets, edge parity/reversal, opt-in upright, world-pose preservation, orientation/retarget history, constrained point tracking/removal, labels and immutability')
