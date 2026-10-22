import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const e=await loadGeometryModule('geometry3dEdgePoints'),a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8,`${a} != ${b}`)
let count=0;const fixtures=[]
for(const kind of ['cube','cuboid','prism','pyramid'])for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 const definition=a.defaultSolid3D(kind,'A');definition.frame=a.solidFrame3D([0,0,0],plane==='XZ'?[90,0,0]:plane==='YZ'?[0,90,0]:[0,0,0])
 let source=a.createSolid3D(m.emptyGeometryScene3D(),definition).scene
 const b=a.defaultSolid3D('cube','B');b.frame.origin=[8,0,0];source=a.createSolid3D(source,b).scene
 const camera={...source.print_camera,projection},projected=p.projectScene3D(source,camera,800,600)
 const strokes=p.projectedEdgeStrokes3D(projected,projection)
 const stroke=strokes.find(l=>!l.hidden&&l.id.startsWith('A_')&&Math.hypot(l.b[0]-l.a[0],l.b[1]-l.a[1])>40)
 assert.ok(stroke)
 const start={x:(stroke.a[0]+stroke.b[0])/2,y:(stroke.a[1]+stroke.b[1])/2,width:800,height:600,pointerId:1,button:0,altKey:false}
 const hit=e.pickSolidEdge3D(source,camera,start);assert.ok(hit)
 let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}})
 i.setPlane(plane);i.setTool('point');i.pointer('down',start);i.pointer('up',start)
 const c=doc.constructions.find(c=>c.kind==='point_on_edge');assert.ok(c);assert.equal(c.edge_id,hit.edge_id);assert.equal(commits,1)
 i.pointer('down',start);i.pointer('up',start);assert.equal(commits,1)
 const id=c.output_point_id,edge=doc.edges.find(v=>v.id===c.edge_id),v=id=>doc.points.find(v=>v.id===id).position
 for(const t of [0,.25,.5,1]){const next=e.editPointOnEdge3D(doc,id,t);assert.ok(next);close(next.points.find(v=>v.id===id).position,p.add(v(edge.start),p.scale(p.sub(v(edge.end),v(edge.start)),t)))}
 for(const t of [-.1,1.1,NaN,Infinity])assert.equal(e.editPointOnEdge3D(doc,id,t),null)
 const before=doc;i.setTool('select');i.select(id)
 const target=p.add(v(edge.start),p.scale(p.sub(v(edge.end),v(edge.start)),Math.min(.85,c.t+.2))),screen=projected.projection.screen(projected.projection.view(target)),end={...start,x:screen[0],y:screen[1]}
 i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);i.cancel();assert.deepEqual(doc,before)
 i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.deepEqual(doc,before)
 i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,1,'return-to-start is a no-op')
 i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,2);const dragged=doc;assert.ok(history.provider.undo());assert.deepEqual(doc,before);assert.ok(history.provider.redo());assert.deepEqual(doc,dragged)
 doc=g.createPoint3D(doc,[10,2,3],'R').scene
 doc=m.transactGeometryScene3D(doc,d=>{d.points.push({id:'Q',position:[0,0,0],label:null});d.constructions.push({id:'mid',kind:'midpoint',a:id,b:'R',output_point_id:'Q'});d.linear_objects.push({id:'dependent',kind:'segment',a:id,b:'Q'})})
 for(const transform of [s=>a.rotateSolid3D(s,'A',[1,2,3],.4),s=>a.translateSolid3D(s,'A',[1,2,0]),s=>a.scaleSolid3D(s,'A',1.4)]){
  const next=transform(doc);assert.ok(next);assert.deepEqual(next.points.filter(v=>v.id.startsWith('B_')||v.id==='R'),doc.points.filter(v=>v.id.startsWith('B_')||v.id==='R'))
  const recipe=next.constructions.find(v=>v.output_point_id===id),edge=next.edges.find(v=>v.id===recipe.edge_id),v=id=>next.points.find(v=>v.id===id).position
  close(v(id),p.add(v(edge.start),p.scale(p.sub(v(edge.end),v(edge.start)),recipe.t)));close(v('Q'),p.scale(p.add(v(id),v('R')),.5));doc=next
 }
 if(kind==='pyramid'){
  const apex=doc.solids.find(s=>s.id==='A').features.filter(f=>f.slot.startsWith('v_')).at(-1).entity_id
  const next=a.changePyramidHeight3D(doc,apex,.3);assert.ok(next);const recipe=next.constructions.find(c=>c.output_point_id===id),edge=next.edges.find(e=>e.id===recipe.edge_id),v=id=>next.points.find(p=>p.id===id).position;close(v(id),p.add(v(edge.start),p.scale(p.sub(v(edge.end),v(edge.start)),recipe.t)))
 }
 fixtures.push(doc)
 const removed=a.deleteSolid3D(doc,'A');assert.ok(removed);close(removed.scene.points.find(v=>v.id===id).position,doc.points.find(v=>v.id===id).position);assert.ok(removed.scene.linear_objects.some(v=>v.id==='dependent'));assert.ok(!removed.scene.constructions.some(v=>v.output_point_id===id));assert.ok(removed.losses.some(v=>v.subject_id===id));let deleted=doc;const dh=m.createGeometryHistory3D(doc,v=>deleted=v);dh.commit(removed.scene);dh.provider.undo();assert.deepEqual(deleted,doc);dh.provider.redo();assert.deepEqual(deleted,removed.scene)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(doc))),doc);assert.match(p.geometrySceneSVG3D(doc),new RegExp(id));count++
}
// An already selected attachment remains draggable after clamping onto a vertex.
{
 let doc=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('pyramid','endpoint')).scene
 const edge=doc.edges[0];doc=e.createPointOnEdge3D(doc,edge.id,1,'P').scene
 const camera=doc.print_camera,pr=p.createProjection3D(camera,800,600),aPos=doc.points.find(v=>v.id===edge.start).position,bPos=doc.points.find(v=>v.id===edge.end).position
 const pointer=t=>{const s=pr.screen(pr.view(p.add(aPos,p.scale(p.sub(bPos,aPos),t))));return {x:s[0],y:s[1],width:800,height:600,button:0,pointerId:1,altKey:false}}
 const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{doc=v;return true},notify:()=>{}});i.select('P');i.pointer('down',pointer(1));i.pointer('move',pointer(.7));i.pointer('up',pointer(.7));assert.ok(Math.abs(doc.constructions[0].t-.7)<1e-8)
}
// Endpoint snapping and empty-space creation use the existing Point interaction.
{
 const source=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('cube','snap')).scene,camera=source.print_camera,pr=p.projectScene3D(source,camera,800,600)
 let doc=source,commits=0;const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{doc=v;commits++;return true},notify:()=>{}});i.setTool('point')
 const fp=await loadGeometryModule('geometry3dFacePoints'),q=pr.points.find(v=>fp.visiblePointForCreation3D(source,camera,{x:v.position[0],y:v.position[1],width:800,height:600},v.id)).position,start={x:q[0],y:q[1],width:800,height:600,pointerId:1,button:0,altKey:false};i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
 const empty={...start,x:40,y:40};i.pointer('down',empty);i.pointer('up',empty);assert.equal(commits,1);assert.equal(doc.constructions.length,0)
 for(const s of p.projectedEdgeStrokes3D(pr,camera.projection).filter(s=>s.hidden)){
  const q={...start,x:(s.a[0]+s.b[0])/2,y:(s.a[1]+s.b[1])/2},hit=e.pickSolidEdge3D(source,camera,q)
  assert.ok(!hit||hit.edge_id!==s.id,'hidden edge itself cannot be picked')
 }
}
// Visibility excludes hidden stroke interiors; clipping retains full-edge t.
let source=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('cube','clip')).scene
for(const projection of ['orthographic','perspective']){
 const base=p.createProjection3D({...source.print_camera,projection},800,600),depths=source.points.map(v=>base.view(v.position)[2]),near=Math.min(...depths)+(Math.max(...depths)-Math.min(...depths))*.3
 const camera={...source.print_camera,projection,near},pr=p.projectScene3D(source,camera,800,600)
 assert.ok(pr.lines.some(l=>Math.abs(l.a[2]-near)<1e-8||Math.abs(l.b[2]-near)<1e-8),'near plane actually clips the solid')
 for(const s of p.projectedEdgeStrokes3D(pr,projection).filter(s=>!s.hidden)){
  const q={x:(s.a[0]+s.b[0])/2,y:(s.a[1]+s.b[1])/2,width:800,height:600},hit=e.pickSolidEdge3D(source,camera,q);if(!hit)continue
  const edge=source.edges.find(v=>v.id===hit.edge_id),v=id=>source.points.find(v=>v.id===id).position,pos=p.add(v(edge.start),p.scale(p.sub(v(edge.end),v(edge.start)),hit.t)),screen=pr.projection.screen(pr.projection.view(pos));assert.ok(Math.hypot(q.x-screen[0],q.y-screen[1])<7.0001)
 }
}
{
 const overlap=a.createSolid3D(source,a.defaultSolid3D('cube','overlap')).scene,camera=source.print_camera,pr=p.projectScene3D(overlap,camera,800,600),stroke=p.projectedEdgeStrokes3D(pr,camera.projection).find(s=>!s.hidden),q={x:(stroke.a[0]+stroke.b[0])/2,y:(stroke.a[1]+stroke.b[1])/2,width:800,height:600}
 assert.deepEqual(e.pickSolidEdge3D(overlap,camera,q),e.pickSolidEdge3D(overlap,camera,q),'overlap selection is deterministic')
 assert.equal(e.pickSolidEdge3D(overlap,camera,{...q,x:NaN}),null)
}
if(process.argv[2]){const fs=await import('node:fs');fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))}
console.log(`PASS: ${count} solid/plane/projection combinations; visible picking, creation/reuse, constrained drag/cancel/history, bounded t, dependency-aware transforms, isolation, detach, serialization/SVG, clipped perspective parameters`)
