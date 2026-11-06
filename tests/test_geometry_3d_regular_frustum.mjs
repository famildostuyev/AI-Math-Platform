import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),n=await loadGeometryModule('geometry3d'),s=await loadGeometryModule('geometry3dSolids'),p=await loadGeometryModule('geometry3dProjection'),edge=await loadGeometryModule('geometry3dEdgePoints'),face=await loadGeometryModule('geometry3dFacePoints'),g=await loadGeometryModule('geometry3dAuthoring'),b=await loadGeometryModule('geometry3dSolidBounds')
const records=[];let gestures=0
function check(scene){
 const solid=scene.solids.find(x=>x.id==='F'),t=s.solidTopology3D(scene,solid),q=solid.parameters,count=q.sides,axis=p.unit(p.cross(solid.frame.x_axis,solid.frame.y_axis));assert.equal(t.vertices.length,2*count);assert.equal(t.faces.length,count+2);assert.equal(t.edges.length,3*count)
 const center=t.vertices.slice(0,count).reduce(p.add,[0,0,0]).map(x=>x/count),top=t.vertices.slice(count).reduce(p.add,[0,0,0]).map(x=>x/count)
 assert.ok(Math.hypot(...p.sub(top,p.add(center,p.scale(axis,q.height))))<1e-8)
 for(let i=0;i<count;i++){
  assert.ok(Math.abs(Math.hypot(...p.sub(t.vertices[i],center))-q.bottom_radius)<1e-8)
  assert.ok(Math.abs(Math.hypot(...p.sub(t.vertices[count+i],top))-q.top_radius)<1e-8)
  assert.ok(Math.abs(Math.hypot(...p.sub(t.vertices[(i+1)%count],t.vertices[i]))-2*q.bottom_radius*Math.sin(Math.PI/count))<1e-8)
  assert.ok(Math.hypot(...p.sub(p.sub(t.vertices[count+i],top),p.scale(p.sub(t.vertices[i],center),q.top_radius/q.bottom_radius)))<1e-8)
  assert.deepEqual(t.faces[i+2],[i,(i+1)%count,(i+1)%count+count,i+count])
 }
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene);records.push(scene)
}
for(const sides of [3,6,128]){
 const d=a.defaultRegularFrustum3D('F');d.parameters.sides=sides;let scene=a.createSolid3D(m.emptyGeometryScene3D(),d)?.scene;assert.ok(scene);check(scene);scene.points[0].label='M';const ids=scene.solids[0].features
 for(const [dim,value]of [['bottom_radius',3],['top_radius',.5],['height',4]]){const next=a.resizeFrustum3D(scene,'F',dim,value);assert.ok(next);for(const k of ['bottom_radius','top_radius','height'])assert.equal(next.solids[0].parameters[k],k===dim?value:scene.solids[0].parameters[k]);assert.deepEqual(next.solids[0].frame,scene.solids[0].frame);assert.deepEqual(next.print_camera,scene.print_camera);assert.deepEqual(next.solids[0].features,ids);assert.equal(next.points[0].label,'M');check(next)}
 for(const change of [{sides:sides+1},{bottom_radius:1},{top_radius:2},{height:0},{top_radius:-1},{bottom_radius:Infinity},{direction:[0,0,1]},{apex_offset:[1,0]}]){const before=structuredClone(scene);assert.equal(a.editSolid3D(scene,{...scene.solids[0],parameters:{...scene.solids[0].parameters,...change}}),null);assert.deepEqual(scene,before)}
 const history=m.createGeometryHistory3D(scene,()=>{});assert.equal(history.commit(scene),false)
 for(const fn of [x=>a.translateSolid3D(x,'F',[1,2,3]),x=>a.rotateSolid3D(x,'F',[1,2,3],.4),x=>a.scaleSolid3D(x,'F',1.5)]){const next=fn(scene);assert.ok(next);check(next);assert.ok(history.commit(next));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),next);history.provider.undo()}
 assert.equal(m.moveGeometryPoint3D(scene,scene.points[0].id,[9,0,0]),null)
 for(const projection of ['orthographic','perspective'])assert.ok(p.geometrySceneSVG3D({...scene,print_camera:{...scene.print_camera,projection}},600,400).includes('polygon'))
 const deleted=a.deleteSolid3D(scene,'F');assert.ok(deleted);assert.equal(deleted.scene.solids.length,0);assert.deepEqual(deleted.scene.points,scene.points)
}
for(const sides of [2,129,3.5,NaN,true]){const d=a.defaultRegularFrustum3D('bad');d.parameters.sides=sides;assert.equal(a.createSolid3D(m.emptyGeometryScene3D(),d),null)}
for(const projection of ['orthographic','perspective'])for(const rotated of [false,true])for(const dimension of ['bottom_radius','top_radius','height']){
 let source=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultRegularFrustum3D('F')).scene;if(rotated)source=a.rotateSolid3D(source,'F',[1,2,3],.4);source=a.translateSolid3D(source,'F',[.2,-.3,.4])
 const camera={...source.print_camera,projection,position:[8,-9,7],target:[0,0,1]},view=p.createProjection3D(camera,900,700),handle=b.projectedSolidBounds3D(source,camera,900,700,'F').handles.find(h=>h.kind===dimension);assert.ok(handle,dimension)
 const start={pointerId:1,button:0,x:handle.x,y:handle.y,width:900,height:700,altKey:false},target=view.screen(view.view(p.add(handle.world,p.scale(handle.direction,handle.length*.2)))),end={...start,x:target[0]+handle.x-handle.screen[0],y:target[1]+handle.y-handle.screen[1]}
 let doc=source,commits=0;const history=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});i.select('F')
 i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);i.cancel();assert.equal(commits,0);assert.deepEqual(doc,source)
 const badFactor=dimension==='bottom_radius'?.25:dimension==='top_radius'?3:-1,badPoint=view.screen(view.view(p.add(handle.world,p.scale(handle.direction,handle.length*(badFactor-1))))),bad={...start,x:badPoint[0]+handle.x-handle.screen[0],y:badPoint[1]+handle.y-handle.screen[1]}
 i.pointer('down',start);i.pointer('move',bad);assert.equal(i.snapshot().draft,null);i.pointer('up',bad);assert.equal(commits,0);assert.deepEqual(doc,source)
 i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
 i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);for(const k of ['bottom_radius','top_radius','height'])assert.ok(Math.abs(doc.solids[0].parameters[k]-source.solids[0].parameters[k]*(k===dimension?1.2:1))<1e-8);const final=doc;assert.ok(history.provider.undo());assert.deepEqual(doc,source);assert.ok(history.provider.redo());assert.deepEqual(doc,final);gestures++
}
let scene=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultRegularFrustum3D('F')).scene;scene=edge.createPointOnEdge3D(scene,'F_e_0',.3,'E').scene;scene=face.createPointOnFace3D(scene,'F_f_0',[0,0],'Q').scene;const updated=a.resizeFrustum3D(scene,'F','height',4);assert.ok(updated);assert.deepEqual(updated.constructions,scene.constructions);check(updated)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} frustum parity scenes; n=3/6/128, rings/faces, dimensions, IDs/labels, dependencies, transforms/history, deletion, saved SVG; ${gestures} R1/R2/H gesture cases`)
