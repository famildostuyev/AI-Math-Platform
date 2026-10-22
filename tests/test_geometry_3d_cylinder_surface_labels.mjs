import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),a=await loadGeometryModule('geometry3dSolidAuthoring'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d'),api=await loadGeometryModule('geometry3dSurfacePoints'),analytic=await loadGeometryModule('geometry3dAnalytic')
const fixtures=[],point=s=>s.points.find(p=>p.id==='attached'),close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8)
const escaped=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
function verify(scene,projection){
 assert.ok(scene);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 if(scene.solids.length){
  const solid=scene.solids[0],frame=analytic.analyticFrame3D(solid.frame),target=frame.toWorld([0,0,solid.parameters.height/2]),camera={...scene.print_camera,projection,target,position:p.add(target,p.scale(frame.x,10)),up:frame.z}
  const svg=p.geometrySceneSVG3D({...scene,print_camera:camera}),label=point(scene).label
  assert.ok(svg.includes('data-id="attached"'))
  if(label)assert.ok(svg.includes('>'+escaped(label)+'</text>'))
  const hidden=p.geometrySceneSVG3D({...scene,print_camera:{...camera,position:p.add(target,p.scale(frame.x,-10))}})
  assert.ok(!hidden.includes('data-id="attached"'));if(label)assert.ok(!hidden.includes('>'+escaped(label)+'</text>'))
  assert.deepEqual(scene.points.filter(p=>/^C_v_/.test(p.id)).map(p=>p.label),['O1','O2'])
 }
 fixtures.push(scene)
}
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 let scene=a.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],plane,'C').scene
 scene=api.createPointOnCylinderSurface3D(scene,'C_surface',[.06,.5],'attached');assert.equal(point(scene).label,null);verify(scene,projection)
 const recipes=structuredClone(scene.constructions),position=point(scene).position
 for(const label of ['P','M₁ & <Q>','',null,'Q']){
  const before=scene,snapshot=structuredClone(before);scene=api.editCylinderSurfacePointLabel3D(before,'attached',label);assert.ok(scene)
  assert.deepEqual(before,snapshot);assert.deepEqual(scene.constructions,recipes);assert.deepEqual(point(scene).position,position);assert.equal(scene.points.length,before.points.length);assert.equal(point(scene).label,label||null)
  const h=m.createGeometryHistory3D(before,()=>{}),changed=JSON.stringify(before)!==JSON.stringify(scene)
  assert.equal(h.commit(scene),changed)
  if(changed){assert.ok(h.provider.undo());assert.deepEqual(h.getScene(),before);assert.ok(h.provider.redo());assert.deepEqual(h.getScene(),scene)}
  verify(scene,projection)
 }
 for(const transform of [s=>a.translateSolid3D(s,'C',[.3,-.5,.7]),s=>a.rotateSolid3D(s,'C',[1,2,3],.4),s=>a.scaleSolid3D(s,'C',1.3),s=>a.resizeCylinder3D(s,'C','radius',2.1),s=>a.resizeCylinder3D(s,'C','height',3.4)]){
  scene=transform(scene);assert.equal(point(scene).label,'Q');assert.deepEqual(scene.constructions,recipes);verify(scene,projection)
 }
 scene=api.editPointOnCylinderSurface3D(scene,'attached',[.94,.6]);assert.equal(point(scene).label,'Q');verify(scene,projection)
 const original=scene,snapshot=structuredClone(scene)
 for(const label of ['x'.repeat(4097),'\ud800',1,false,{}])assert.equal(api.editCylinderSurfacePointLabel3D(scene,'attached',label),null)
 for(const id of ['missing','C_v_0','C_v_1'])assert.equal(api.editCylinderSurfacePointLabel3D(scene,id,'bad'),null)
 assert.deepEqual(scene,snapshot)
 const detached=a.deleteSolid3D(scene,'C').scene;assert.deepEqual(point(detached),point(scene));assert.equal(detached.constructions.length,0);verify(detached,projection)
 const history=m.createGeometryHistory3D(original,()=>{});assert.ok(history.commit(detached));history.provider.undo();assert.deepEqual(history.getScene(),original);history.provider.redo();assert.deepEqual(history.getScene(),detached)
 const renamedFree=g.editPoint3D(detached,'attached',point(detached).position,'Free');assert.equal(point(renamedFree).label,'Free');close(point(renamedFree).position,point(detached).position);verify(renamedFree,projection)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} manual-label scenes; entry/edit/clear/null, immutable identity/UV/XYZ, validation/escaping, history/no-op, transforms/drag, occlusion/SVG, detach and O1/O2 preservation`)
