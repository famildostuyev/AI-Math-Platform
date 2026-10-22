import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),r=await loadGeometryModule('geometry3dRenderGeometry'),n=await loadGeometryModule('geometry3d')
const fixtures=[]
const verify=scene=>{
 const snapshot=structuredClone(scene),solid=scene.solids[0],frame=g.analyticFrame3D(solid.frame),curve=r.sphereRenderGeometry3D(solid,scene.print_camera).curves.find(c=>c.role==='equator')
 assert.ok(curve);for(const v of curve.vertices){const local=frame.toLocal(v);assert.ok(Math.abs(local[2])<1e-8);assert.ok(Math.abs(Math.hypot(local[0],local[1])-solid.parameters.radius)<1e-8)}
 const display=p.projectScene3D(scene,scene.print_camera,800,600,true),strokes=p.projectedEdgeStrokes3D(display,scene.print_camera.projection),equator=strokes.filter(l=>l.role==='equator')
 assert.ok(equator.some(l=>l.hidden));assert.ok(equator.some(l=>!l.hidden));assert.ok(strokes.filter(l=>l.role==='silhouette').every(l=>!l.hidden))
 assert.ok(display.points.some(point=>point.id===solid.features.find(f=>f.slot==='v_0').entity_id))
 const svg=p.geometrySceneSVG3D(scene);assert.ok(svg.includes('data-render-curve="equator"'));assert.ok(svg.includes('stroke-dasharray="4 3"'));assert.deepEqual(scene,snapshot)
}
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective']){
 let scene=s.createSphereAt3D(m.emptyGeometryScene3D(),[0,0,0],plane,'Sphere').scene
 scene.print_camera.projection=projection;verify(scene)
 // Default world camera has nonzero elevation above every supported local plane.
 const projected=p.projectScene3D(scene,scene.print_camera,800,600,true).lines.filter(l=>l.role==='equator'),area=Math.abs(projected.reduce((sum,l)=>sum+l.a[0]*l.b[1]-l.b[0]*l.a[1],0))/2
 assert.ok(area>500,'default equator must be a readable ellipse');fixtures.push(scene)
 const before=structuredClone(scene),custom={...scene,print_camera:{...scene.print_camera,position:[8,-6,3],target:[1,0,0]}}
 assert.deepEqual(s.createSphereAt3D(custom,[3,0,0],plane,'Other').scene.print_camera,custom.print_camera)
 scene=s.translateSolid3D(scene,'Sphere',[.5,-.2,.3]);scene=s.rotateSolid3D(scene,'Sphere',[1,2,3],.3);scene=s.scaleSolid3D(scene,'Sphere',1.4);verify(scene);fixtures.push(scene)
 const hidden=s.setSphereEquator3D(scene,'Sphere',false);assert.ok(hidden);const expected=structuredClone(scene);expected.solids[0].parameters.equator='hidden';assert.deepEqual(hidden,expected)
 assert.ok(!p.geometrySceneSVG3D(hidden).includes('data-render-curve="equator"'));assert.deepEqual(n.normalizeGeometryScene3D(hidden),hidden);assert.equal(s.setSphereEquator3D(hidden,'Sphere',false),hidden);fixtures.push(hidden)
 assert.deepEqual(s.setSphereEquator3D(hidden,'Sphere',true),scene)
 let current=scene;const history=m.createGeometryHistory3D(scene,next=>{current=next});assert.ok(history.commit(hidden));assert.ok(!history.commit(hidden));assert.ok(history.provider.undo());assert.deepEqual(current,scene);assert.ok(history.provider.redo());assert.deepEqual(current,hidden)
 const legacy=structuredClone(before);delete legacy.solids[0].parameters.equator;assert.deepEqual(n.normalizeGeometryScene3D(legacy),legacy);assert.ok(!p.geometrySceneSVG3D(legacy).includes('data-render-curve="equator"'));fixtures.push(legacy)
 for(const value of ['bad',true,null,0]){const invalid=structuredClone(scene);invalid.solids[0].parameters.equator=value;assert.equal(n.normalizeGeometryScene3D(invalid),null)}
 // Orbit to a plane-normal view and an edge-on view without changing geometry.
 const frame=g.analyticFrame3D(scene.solids[0].frame),center=scene.solids[0].frame.origin
 for(const local of [[0,0,7],[0,-7,0]]){const camera={...scene.print_camera,position:frame.toWorld(local),target:center,up:local[2]?frame.y:frame.z},copy=structuredClone(scene);const display=p.projectScene3D(scene,camera,800,600,true);assert.equal(display.status,'ok');assert.ok(display.lines.every(l=>[...l.a,...l.b].every(Number.isFinite)));assert.deepEqual(scene,copy)}
 assert.deepEqual(s.deleteSolid3D(hidden,'Sphere').scene.points,hidden.points)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} equator fixtures; local plane/circumference, all planes/projections, solid/dashed visibility, orbit/edge-on, default ellipse/custom camera, transforms, show/hide/history, legacy/invalid contract, detach and SVG`)
