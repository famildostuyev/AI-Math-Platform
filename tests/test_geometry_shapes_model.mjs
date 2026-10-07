import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {geometryShapes,triangleContext}=await loadGeometryModule('geometryTopologyModel')
const {transformGeometryShape,deleteGeometryShape}=await loadGeometryModule('geometryShapeModel')
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {commitGeometryLine}=await loadGeometryModule('geometryLineModel')
const {deleteGeometrySelection}=await loadGeometryModule('geometryAuthoringModel')
const {commitMidpoint,commitMedian,commitAltitude,commitTriangleMedian,commitAngleBisector}=await loadGeometryModule('geometryConstructionModel')
const {createGeometryHistory}=await loadGeometryModule('geometryHistoryModel')
const point=(id,x,y)=>({id,x,y,label:null})
const edge=(id,a,b)=>({id,start_point_id:a,end_point_id:b})
const g={...emptyGeometryV1(),description:'Shapes',points:[point('a',10,10),point('b',30,10),point('c',20,30)],segments:[edge('ab','a','b'),edge('bc','b','c'),edge('ca','c','a')]}
const before=structuredClone(g),shape=geometryShapes(g)[0]
assert.equal(geometryShapes(g).length,1);assert.equal(shape.kind,'triangle');assert.deepEqual(g,before);assert.equal(g.polygons.length,0)
assert.equal(geometryShapes({...g,segments:[...g.segments].reverse()})[0].id,shape.id)
assert.equal(geometryShapes({...g,segments:g.segments.map(e=>({...e,start_point_id:e.end_point_id,end_point_id:e.start_point_id}))})[0].id,shape.id)
assert.equal(geometryShapes({...g,segments:g.segments.slice(0,2)}).length,0)
assert.equal(geometryShapes({...g,points:g.points.map(p=>({...p,y:10}))}).length,0)
const quad={...g,points:[point('a',0,0),point('b',20,0),point('c',20,20),point('d',0,20)],segments:[edge('ab','a','b'),edge('bc','b','c'),edge('cd','c','d'),edge('da','d','a')]}
assert.equal(geometryShapes(quad)[0].kind,'quadrilateral')
assert.equal(geometryShapes({...quad,segments:[...quad.segments,edge('ac','a','c')]}).length,0)
assert.equal(geometryShapes({...quad,points:[quad.points[0],quad.points[2],quad.points[1],quad.points[3]] .map((p,i)=>({...p,id:quad.points[i].id}))}).length,0)
assert.equal(geometryShapes({...g,points:[...g.points,point('d',10,10)],segments:[edge('ab','a','b'),edge('bc','b','c'),edge('cd','c','d')]}).length,0)
const explicit={...g,segments:[],polygons:[{id:'poly',point_ids:['a','b','c']}]}
assert.equal(geometryShapes(explicit)[0].id,'polygon:poly')
assert.ok(triangleContext(g,['c','b','a']))
for(const construct of [x=>commitAltitude(x,'a','b','c'),x=>commitAngleBisector(x,'a','b','c'),x=>commitTriangleMedian(x,'a','b','c').geometry]){const next=construct(g);assert.notEqual(next,g);assert.ok(normalize(next));assert.equal(next.polygons.length,0)}
const shared={...g,points:[...g.points,point('d',50,50)],segments:[...g.segments,edge('bd','b','d')]}
assert.equal(geometryShapes(shared).length,1)
const dependent=commitMidpoint(shared,'a','b'),mid=dependent.constructions[0].output_point_id
for(const operation of [{kind:'translate',dx:4,dy:8},{kind:'rotate',radians:Math.PI/2},{kind:'scale',factor:2}]){
 const transformed=transformGeometryShape(dependent,shape,operation)
 assert.notEqual(transformed,dependent);assert.ok(normalize(transformed));assert.deepEqual(transformed.points.find(p=>p.id==='d'),dependent.points.find(p=>p.id==='d'))
 const a=transformed.points.find(p=>p.id==='a'),b=transformed.points.find(p=>p.id==='b'),m=transformed.points.find(p=>p.id===mid)
 assert.equal(m.x,a.x/2+b.x/2);assert.equal(m.y,a.y/2+b.y/2)
 const expectedA=operation.kind==='translate'?[14,18]:operation.kind==='rotate'?[80/3,20/3]:[0,10/3]
 assert.ok(Math.abs(a.x-expectedA[0])<1e-8&&Math.abs(a.y-expectedA[1])<1e-8,'Transform uses the documented vertex-mean pivot')
 assert.deepEqual(transformed.points.map(p=>p.id),dependent.points.map(p=>p.id))
 assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-(operation.kind==='scale'?40:20))<1e-8)
 let restored;const h=createGeometryHistory(dependent,x=>restored=x);assert.ok(h.commit(transformed));h.provider.undo();assert.deepEqual(restored,dependent);assert.equal(h.provider.undo(),false);h.provider.redo();assert.deepEqual(restored,transformed)
}
assert.equal(transformGeometryShape(g,shape,{kind:'scale',factor:0}),g)
assert.equal(transformGeometryShape(g,shape,{kind:'translate',dx:Infinity,dy:0}),g)
const containingDerived={...dependent,polygons:[{id:'derived',point_ids:['a',mid,'c']}]}
assert.equal(transformGeometryShape(containingDerived,geometryShapes(containingDerived).find(s=>s.id==='polygon:derived'),{kind:'translate',dx:2,dy:3}),containingDerived)
const removed=deleteGeometryShape(g,shape);assert.equal(removed.points.length,0);assert.equal(removed.segments.length,0)
let restoredDelete;const deletionHistory=createGeometryHistory(g,next=>restoredDelete=next)
assert.ok(deletionHistory.commit(removed));deletionHistory.provider.undo();assert.deepEqual(restoredDelete,g);assert.equal(deletionHistory.provider.undo(),false)
const external={...g,points:[...g.points,point('external',50,50)]}
const midpointDependency=commitMidpoint(external,'a','external')
const invalidDependency=commitMedian(midpointDependency,'a',midpointDependency.constructions[0].output_point_id)
const invalid=transformGeometryShape(invalidDependency,shape,{kind:'translate',dx:40,dy:40})
assert.equal(invalid,invalidDependency)
const failedHistory=createGeometryHistory(invalidDependency,()=>{throw Error('Rejected transform has no history')})
assert.equal(failedHistory.commit(invalid),false);assert.equal(failedHistory.provider.getSnapshot(),0)
const surviving=deleteGeometryShape(dependent,shape);assert.ok(surviving.points.some(p=>p.id==='a'));assert.ok(surviving.points.some(p=>p.id==='b'));assert.ok(surviving.segments.some(s=>s.id==='bd'));assert.ok(normalize(surviving))
for(const kind of ['line','directed_line','vector']){
 const created=commitGeometryLine({...g,points:[],segments:[]},kind,[{x:1,y:1},{x:10,y:10}]);assert.ok(created.points.every(p=>p.role==='implicit'));assert.ok(normalize(created))
 const deleted=deleteGeometrySelection(created,{kind:'line',id:created.lines[0].id});assert.equal(deleted.points.length,0)
 const consumer=commitMidpoint(created,...created.points.map(p=>p.id));const kept=deleteGeometrySelection(consumer,{kind:'line',id:created.lines[0].id});assert.equal(kept.points.length,3)
}
const reused=commitGeometryLine(g,'line',g.points.slice(0,2).map(p=>({...p,pointId:p.id})));assert.deepEqual(reused.points,g.points)
assert.deepEqual(g,before)
console.log('PASS: conservative topology, identity, shared triangle context, transforms/dependencies/history, safe deletion and implicit anchor references')

const {commitGeometryTemplate,templateVertices}=await loadGeometryModule('geometryTemplateModel')
const {commitGeometryCircle}=await loadGeometryModule('geometryCircleModel')
const {commitGeometryArc}=await loadGeometryModule('geometryArcModel')
const {GEOMETRY_COLLECTION_LIMITS}=await loadGeometryModule('geometryCapacityModel')
const anchors=commitGeometryLine({...emptyGeometryV1(),description:'Promotion'},'line',[{x:10,y:10},{x:30,y:10}])
const anchor=anchors.points[0],snapshot=structuredClone(anchors)
const visibleOperations=[
 ['polyline',x=>commitGeometryLine(x,'polyline',[{...anchor,pointId:anchor.id},{x:20,y:30}]),x=>x.polylines[0].point_ids[0]],
 ['polygon',x=>commitGeometryLine(x,'polyline',[{...anchor,pointId:anchor.id},{x:20,y:30},{x:40,y:30}],true),x=>x.polygons[0].point_ids[0]],
 ['template',x=>commitGeometryTemplate(x,'triangle',anchor,anchors.points[1]),x=>x.polygons[0].point_ids[0]],
 ['circle',x=>commitGeometryCircle(x,'circle',anchor,{x:20,y:10}),x=>x.circles[0].center_point_id],
 ['arc',x=>commitGeometryArc(x,'arc',anchor,{x:20,y:10},{x:10,y:20}),x=>x.arcs[0].center_point_id],
]
for(const [name,create,reference] of visibleOperations){
 const next=create(anchors),promoted=next.points.find(p=>p.id===anchor.id)
 assert.equal(reference(next),anchor.id,name)
 assert.deepEqual(promoted,{...anchor,role:'explicit'},name)
 assert.equal(next.points.filter(p=>p.x===anchor.x&&p.y===anchor.y).length,1,name)
 assert.ok(normalize(next),name)
 const deleted=deleteGeometrySelection(next,{kind:'line',id:anchors.lines[0].id})
 assert.ok(deleted.points.some(p=>p.id===anchor.id&&p.role==='explicit'),name)
 assert.ok(normalize(deleted),name)
 const legacy={...anchors,points:anchors.points.map(({role,...p})=>p)}
 assert.deepEqual(create(legacy).points.find(p=>p.id===anchor.id),legacy.points[0],name)
 const labelled={...anchors,points:anchors.points.map(p=>p.id===anchor.id?{...p,label:'P'}:p)}
 assert.equal(create(labelled).points.find(p=>p.id===anchor.id).label,'P',name)
}
for(const kind of ['line','directed_line','vector']){
 const next=commitGeometryLine(anchors,kind,anchors.points.map(p=>({...p,pointId:p.id})))
 assert.deepEqual(next.points,anchors.points)
}
// Full point capacity still allows metadata-only promotion of reused points.
const full={...anchors,points:[...anchors.points,...Array.from({length:498},(_,i)=>point(`extra-${i}`,100+i,100))]}
for(const create of [x=>commitGeometryLine(x,'polyline',x.points.slice(0,2).map(p=>({...p,pointId:p.id}))),visibleOperations[3][1],visibleOperations[4][1]]){
 const next=create(full);assert.notEqual(next,full);assert.equal(next.points.length,500);assert.equal(next.points[0].role,'explicit')
}
const third=templateVertices('triangle',anchor,anchors.points[1])[2]
const fullTemplate={...full,points:[...full.points.slice(0,-1),point('third',third.x,third.y)]}
const createdTemplate=visibleOperations[2][1](fullTemplate)
assert.notEqual(createdTemplate,fullTemplate);assert.equal(createdTemplate.points.length,500)
assert.equal(createdTemplate.points[0].role,'explicit')
for(const [name,create] of visibleOperations){
 const collection=name==='polyline'?'polylines':name==='circle'?'circles':name==='arc'?'arcs':'polygons'
 const max=GEOMETRY_COLLECTION_LIMITS[collection]
 const blocked={...anchors,[collection]:Array.from({length:max},()=>({id:'full'}))}
 assert.equal(create(blocked),blocked,name+' capacity rejection must not promote')
 assert.equal(blocked.points[0].role,'implicit')
}
assert.equal(commitGeometryLine(anchors,'polyline',[anchor,{x:20,y:30},anchor]),anchors,'Late duplicate rejection rolls back')
assert.equal(commitGeometryCircle(anchors,'circle',anchor,anchor),anchors)
assert.equal(commitGeometryArc(anchors,'arc',anchor,{x:20,y:10},anchor),anchors)
assert.deepEqual(anchors,snapshot)
const {addGeometryPolygon}=await loadGeometryModule('geometryAuthoringModel')
const manual={...anchors,points:[...anchors.points,point('manual-third',20,30)]}
const manualPolygon=addGeometryPolygon(manual,manual.points.map(p=>p.id))
assert.equal(manualPolygon.points[0].role,'explicit');assert.equal(manualPolygon.points.length,3)
assert.equal(addGeometryPolygon(manual,[anchor.id,anchor.id,'manual-third']),null)
assert.equal(manual.points[0].role,'implicit')
console.log('PASS: visible-role promotion preserves identity/coordinates/labels, legacy roles, capacity, atomic rejection and deletion; line-only reuse stays implicit')
