import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const f=await loadGeometryModule('geometry3dFacePoints'),b=await loadGeometryModule('geometry3dFaces'),a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),g=await loadGeometryModule('geometry3dAuthoring'),e=await loadGeometryModule('geometry3dEdgePoints'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const close=(x,y)=>assert.ok(Math.hypot(...p.sub(x,y))<1e-8,`${x} != ${y}`),fixtures=[]
const vertices=(s,id)=>s.faces.find(f=>f.id===id).boundary.map(id=>s.points.find(v=>v.id===id).position)
const center=v=>p.scale(v.reduce(p.add,[0,0,0]),1/v.length)
for(const kind of ['cube','cuboid','prism','pyramid'])for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 const definition=a.defaultSolid3D(kind,'A');definition.frame=a.solidFrame3D([0,0,0],plane==='XZ'?[90,0,0]:plane==='YZ'?[0,90,0]:[0,0,0])
 let source=a.createSolid3D(m.emptyGeometryScene3D(),definition).scene
 const other=a.defaultSolid3D('cube','B');other.frame.origin=[8,0,0];source=a.createSolid3D(source,other).scene
 const camera={...source.print_camera,projection},savedCamera=structuredClone(camera),pr=p.createProjection3D(camera,800,600)
 const pointer=world=>{const s=pr.screen(pr.view(world));return {x:s[0],y:s[1],width:800,height:600,button:0,pointerId:1,altKey:false}}
 const start=source.faces.filter(v=>v.id.startsWith('A_')).map(v=>pointer(center(vertices(source,v.id)))).find(q=>f.pickSolidFace3D(source,camera,q)&&!g.pickGeometry3D(source,camera,q,true,id=>f.visiblePointForCreation3D(source,camera,q,id))&&!e.pickSolidEdge3D(source,camera,q));assert.ok(start)
 const hit=f.pickSolidFace3D(source,camera,start);assert.ok(hit)
 let doc=source,commits=0;const h=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return h.commit(v)},notify:()=>{}})
 i.setPlane(plane);i.setTool('point');i.pointer('down',start);i.pointer('up',start)
 const c=doc.constructions.find(c=>c.kind==='point_on_face');assert.ok(c);assert.equal(c.face_id,hit.face_id);assert.equal(commits,1)
 i.pointer('down',start);i.pointer('up',start);assert.equal(commits,1)
 const id=c.output_point_id,old=doc,position=doc.points.find(p=>p.id===id).position,target=p.add(p.scale(position,.8),p.scale(vertices(doc,c.face_id)[0],.2)),end=pointer(target)
 i.setTool('select');i.select(id);i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,1);i.cancel();assert.deepEqual(doc,old)
 i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.deepEqual(doc,old)
 i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,1,'no-op')
 i.pointer('down',start);i.pointer('move',end);const valid=structuredClone(i.snapshot().draft);i.pointer('move',{...end,x:5000,y:5000});assert.deepEqual(i.snapshot().draft,valid,'last valid preview retained');i.pointer('up',{...end,x:5000,y:5000});assert.equal(commits,2);close(doc.points.find(v=>v.id===id).position,target)
 assert.equal(doc.constructions.find(v=>v.id===c.id).kind,'point_on_face');const dragged=doc;h.provider.undo();assert.deepEqual(doc,old);h.provider.redo();assert.deepEqual(doc,dragged)
 doc=g.createPoint3D(doc,[9,5,3],'R').scene;doc=m.transactGeometryScene3D(doc,d=>{d.points.find(v=>v.id===id).label='P';d.points.push({id:'Q',label:null,position:[0,0,0]});d.constructions.push({id:'mid',kind:'midpoint',a:id,b:'R',output_point_id:'Q'});d.linear_objects.push({id:'dependent',kind:'segment',a:id,b:'Q'})})
 const initial=doc,pivot=a.solidPivot3D(initial,'A'),pos=initial.points.find(v=>v.id===id).position
 for(const factor of [2,.25]){
  const next=a.scaleSolid3D(initial,'A',factor);assert.ok(next,`${kind} scale ${factor}`);close(next.points.find(v=>v.id===id).position,p.add(pivot,p.scale(p.sub(pos,pivot),factor)))
  assert.deepEqual(next.points.filter(v=>v.id.startsWith('B_')||v.id==='R'),initial.points.filter(v=>v.id.startsWith('B_')||v.id==='R'));fixtures.push(next)
 }
 const translated=a.translateSolid3D(initial,'A',[.5,.7,.2]);assert.ok(translated);close(translated.points.find(v=>v.id===id).position,p.add(pos,[.5,.7,.2]));assert.deepEqual(translated.points.filter(v=>v.id.startsWith('B_')),initial.points.filter(v=>v.id.startsWith('B_')))
 const angle=.4,axis=p.unit([1,2,3]),delta=p.sub(pos,pivot),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],expected=p.add(pivot,p.add(p.add(p.scale(delta,Math.cos(angle)),p.scale(cross(axis,delta),Math.sin(angle))),p.scale(axis,p.dot(axis,delta)*(1-Math.cos(angle)))))
 const rotated=a.rotateSolid3D(initial,'A',axis,angle);assert.ok(rotated);close(rotated.points.find(v=>v.id===id).position,expected);assert.deepEqual(rotated.solids.find(v=>v.id==='A').features,initial.solids.find(v=>v.id==='A').features)
 close(rotated.points.find(v=>v.id==='Q').position,p.scale(p.add(expected,initial.points.find(v=>v.id==='R').position),.5));assert.deepEqual(camera,savedCamera)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(rotated))),rotated);assert.match(p.geometrySceneSVG3D(rotated),new RegExp(id))
 const removed=a.deleteSolid3D(rotated,'A');assert.ok(removed);close(removed.scene.points.find(v=>v.id===id).position,expected);assert.ok(!removed.scene.constructions.some(v=>v.output_point_id===id));assert.ok(removed.scene.linear_objects.some(v=>v.id==='dependent'));assert.ok(removed.losses.some(v=>v.subject_id===id));assert.equal(removed.scene.points.find(v=>v.id===id).label,'P');let deleted=rotated;const dh=m.createGeometryHistory3D(rotated,v=>deleted=v);dh.commit(removed.scene);dh.provider.undo();assert.deepEqual(deleted,rotated);dh.provider.redo();assert.deepEqual(deleted,removed.scene)
 for(const uv of [[NaN,0],[Infinity,0],[1e8,1e8]])assert.equal(f.editPointOnFace3D(initial,id,uv),null)
}
// Polygon transport: concavity, cyclic/reversed identity ordering, non-XY frames.
const polygon=[[0,0,0],[4,0,0],[4,4,0],[2,2,0],[0,4,0]],ids=['a','b','c','d','e']
for(const reverse of [false,true])for(const axis of ['XY','XZ','YZ']){
 const map=v=>axis==='XY'?v:axis==='XZ'?[v[0],0,v[1]]:[0,v[0],v[1]],old=(reverse?[...polygon].reverse():polygon).map(map),names=reverse?[...ids].reverse():ids,basis=b.faceBasis3D(old),tri=b.triangulateFace3D(names,old),[a0,a1,a2]=tri[0],world=p.add(p.add(p.scale(old[a0],.2),p.scale(old[a1],.3)),p.scale(old[a2],.5)),uv=basis.local(world),next=old.map((v,i)=>p.add(p.scale(v,1.3),map([i*.015,0,0]))),transport=b.transportFacePoint3D(names,old,next,uv)
 close(b.faceBasis3D(next).world(transport),p.add(p.add(p.scale(next[a0],.2),p.scale(next[a1],.3)),p.scale(next[a2],.5)))
 const diagonalSet=(names,vertices)=>b.triangulateFace3D(names,vertices).map(t=>t.map(i=>names[i]).sort().join(',')).sort()
 assert.deepEqual(diagonalSet(names,old),diagonalSet([...names.slice(2),...names.slice(0,2)],[...old.slice(2),...old.slice(0,2)]))
}
assert.throws(()=>b.transportFacePoint3D(['a','b','c','d'],[[0,0,0],[3,0,0],[3,3,0],[0,3,0]],[[2.5,1,0],[3,0,0],[3,3,0],[0,3,0]],[.2,.2]))
assert.throws(()=>b.faceBasis3D([[0,0,0],[2,0,0],[2,2,0],[0,2,1]]));assert.throws(()=>b.faceBasis3D([[0,0,0],[1,0,0],[2,0,0]]))
// Every pyramid face retains its barycentric attachment through apex/base editing.
let pyramid=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('pyramid','Pyr')).scene
for(const face of pyramid.faces){const v=vertices(pyramid,face.id),uv=b.faceBasis3D(v).local(center(v));pyramid=f.createPointOnFace3D(pyramid,face.id,uv,`point_${face.id}`).scene}
const apex=a.pyramidApexDrag3D(pyramid,'Pyr_v_4'),base=a.pyramidBaseDrag3D(pyramid,'Pyr_v_0')
for(const next of [a.changePyramidHeight3D(pyramid,'Pyr_v_4',.5),a.movePyramidApexParallel3D(pyramid,'Pyr_v_4',p.add(apex.position,[.2,.1,0])),a.movePyramidBaseVertex3D(pyramid,'Pyr_v_0',p.add(base.position,[.1,.1,0]))]){
 assert.ok(next)
 for(const face of pyramid.faces.filter(f=>f.boundary.length===3))close(next.points.find(v=>v.id===`point_${face.id}`).position,center(vertices(next,face.id)))
 fixtures.push(next)
}
// A face-point dependency cannot indirectly deform another solid during an independent edit.
{
 let shared=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('cube','owner')).scene
 shared=f.createPointOnFace3D(shared,'owner_f_0',[1,1],'attached').scene
 shared=m.transactGeometryScene3D(shared,d=>{d.points.push({id:'r',position:[4,1,0],label:null},{id:'s',position:[1,4,0],label:null});d.faces.push({id:'external',boundary:['attached','r','s']})})
 shared=a.createPyramidOnFace3D(shared,'external','dependentSolid').scene
 const snapshot=structuredClone(shared);assert.equal(a.translateSolid3D(shared,'owner',[.2,0,0]),null);assert.equal(a.scaleSolid3D(shared,'owner',1.2),null);assert.deepEqual(shared,snapshot)
}
// Full semantic concave face, including points in separate arms and native base editing.
{
 const base=[[0,0,0],[4,0,0],[4,1,0],[1,1,0],[1,4,0],[0,4,0]],definition=a.defaultSolid3D('pyramid','concave'),mean=center(base)
 definition.parameters={sides:6,height:2,base:{kind:'polygon',vertices:base},apex_offset:[.5-mean[0],.5-mean[1]]}
 let scene=a.createSolid3D(m.emptyGeometryScene3D(),definition).scene
 for(const [index,world] of [[0,[3,.5,0]],[1,[.5,3,0]]])scene=f.createPointOnFace3D(scene,'concave_f_0',b.faceBasis3D(vertices(scene,'concave_f_0')).local(world),'arm'+index).scene
 const candidate=a.movePyramidBaseVertex3D(scene,'concave_v_2',[4,1.1,0]);assert.ok(candidate)
 for(const next of [a.scaleSolid3D(scene,'concave',2),a.scaleSolid3D(scene,'concave',.25),candidate]){assert.ok(next);assert.ok(next.constructions.every(c=>b.insideFace3D(c.uv,b.faceBasis3D(vertices(next,c.face_id)).polygon)));fixtures.push(next)}
 const before=structuredClone(scene);assert.equal(a.movePyramidBaseVertex3D(scene,'concave_v_2',[4,1,1]),null);assert.deepEqual(scene,before)
}
// Nearest-hit depth excludes rear surfaces and hidden vertices, independent of face array order.
const cube=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('cube','visible')).scene,camera=cube.print_camera,pr=p.createProjection3D(camera,800,600),pointer=world=>{const s=pr.screen(pr.view(world));return {x:s[0],y:s[1],width:800,height:600}}
for(const face of cube.faces){const q=pointer(center(vertices(cube,face.id))),hit=f.pickSolidFace3D(cube,camera,q),reversed={...cube,faces:[...cube.faces].reverse()};assert.deepEqual(hit,f.pickSolidFace3D(reversed,camera,q));if(hit)assert.ok(hit.depth<=pr.view(center(vertices(cube,face.id)))[2]+1e-8)}
const overlap=a.createSolid3D(cube,a.defaultSolid3D('cube','overlap')).scene,q=pointer([1,1,1]);assert.deepEqual(f.pickSolidFace3D(overlap,camera,q),f.pickSolidFace3D({...overlap,faces:[...overlap.faces].reverse()},camera,q))
assert.ok(cube.points.some(v=>!f.visiblePointForCreation3D(cube,camera,pointer(v.position),v.id)))
assert.equal(f.facePlanePointer3D([[0,0,0],[2,0,0],[0,2,0]],p.standardView3D(camera,'front'),{x:400,y:300,width:800,height:600}),null)
if(process.argv[2]){const fs=await import('node:fs');fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))}
console.log(`PASS: 24 solid/orientation/projection combinations; atomic face creation/reuse/drag/history, boundary hold, metric UV, exact rigid and 2x/.25x transforms, concave/reversed triangulation, apex/base deformation, occlusion, dependencies, detach, isolation, SVG/reload; ${fixtures.length} canonical scenes`)
