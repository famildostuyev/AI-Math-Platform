import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const model=await loadGeometryModule('geometry3dModel'),author=await loadGeometryModule('geometry3dSolidAuthoring'),analytic=await loadGeometryModule('geometry3dAnalytic'),render=await loadGeometryModule('geometry3dRenderGeometry'),projection=await loadGeometryModule('geometry3dProjection')
let count=0
for(const plane of ['XY','XZ','YZ'])for(const mode of ['orthographic','perspective'])for(const azimuth of [0,.3,1.7,3.8,6.2])for(const transformed of [false,true]){
 let scene=author.createConeAt3D(model.emptyGeometryScene3D(),[.2,-.3,.4],plane,'C').scene
 if(transformed){scene=author.rotateSolid3D(scene,'C',[1,2,3],.7);scene=author.scaleSolid3D(scene,'C',1.4);scene=author.translateSolid3D(scene,'C',[2,-1,.5])}
 const solid=scene.solids[0],frame=analytic.analyticFrame3D(solid.frame),r=solid.parameters.radius,h=solid.parameters.height
 const camera={...scene.print_camera,projection:mode,position:frame.toWorld([8*r*Math.cos(azimuth),8*r*Math.sin(azimuth),2*h]),target:frame.toWorld([0,0,h/2]),up:frame.z}
 scene={...scene,print_camera:camera};const before=JSON.stringify(scene),display=render.coneRenderGeometry3D(solid,camera),rim=display.curves[0],contacts=display.curves.filter(c=>c.role==='silhouette')
 assert.equal(contacts.length,2);assert.equal(rim.angles.length,rim.vertices.length)
 for(const contact of contacts){
  const base=contact.vertices[0],local=frame.toLocal(base),eye=frame.toLocal(camera.position),toward=frame.vectorToLocal(camera.position.map((x,i)=>x-camera.target[i]))
  assert.ok(rim.vertices.some(p=>p===base),'shared exact rim vertex')
  assert.ok(display.patches.some(p=>p.vertices.includes(base)),'shared fill endpoint')
  assert.ok(Math.abs(Math.hypot(local[0],local[1])-r)<1e-10);assert.ok(Math.abs(local[2])<1e-10)
  const v=mode==='perspective'?eye:toward,residual=v[0]*local[0]/r+v[1]*local[1]/r+r/h*v[2]-(mode==='perspective'?r:0)
  assert.ok(Math.abs(residual)<1e-9)
 }
 assert.ok(projection.geometrySceneSVG3D(scene).includes('>O</text>'));assert.equal(JSON.stringify(scene),before)
 assert.equal(projection.geometrySceneSVG3D(scene),projection.geometrySceneSVG3D(structuredClone(scene)))
 count++
}
// A perspective eye at apex height has antipodal tangent contacts: a valid
// symmetric textbook diameter. Elevated oblique views generally do not.
const scene=author.createConeAt3D(model.emptyGeometryScene3D(),[0,0,0],'XY','C').scene,solid=scene.solids[0]
for(const [height,antipodal] of [[2,true],[4,false]]){
 const camera={...scene.print_camera,projection:'perspective',position:[0,-8,height],target:[0,0,1],up:[0,0,1]}
 const points=render.coneRenderGeometry3D(solid,camera).curves.filter(c=>c.role==='silhouette').map(c=>c.vertices[0])
 assert.equal(Math.hypot(...points[0].map((x,i)=>x+points[1][i]))<1e-10,antipodal)
}
for(const mode of ['orthographic','perspective'])for(const height of [-8,8]){
 const camera={...scene.print_camera,projection:mode,position:[0,0,height],target:[0,0,1],up:[0,1,0]}
 const display=render.coneRenderGeometry3D(solid,camera)
 assert.equal(display.curves.filter(c=>c.role==='silhouette').length,0)
 assert.ok(display.patches.length)
 assert.ok(!projection.geometrySceneSVG3D({...scene,print_camera:camera}).includes('NaN'))
}
console.log(`PASS: ${count} cone plane/projection/orbit/transform cases; symmetric and oblique diameter distinction`)
