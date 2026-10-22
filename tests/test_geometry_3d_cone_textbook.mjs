import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),g=await loadGeometryModule('geometry3dAnalytic'),p=await loadGeometryModule('geometry3dProjection'),r=await loadGeometryModule('geometry3dRenderGeometry'),a=await loadGeometryModule('geometry3dAuthoring'),n=await loadGeometryModule('geometry3d')
const fixtures=[]
for(const plane of ['XY','XZ','YZ'])for(const initialProjection of ['orthographic','perspective']){
 const empty=m.emptyGeometryScene3D();empty.print_camera.projection=initialProjection
 const input=structuredClone(empty),scene=s.createConeAt3D(empty,[.2,-.3,.4],plane,'C').scene,solid=scene.solids[0],frame=g.analyticFrame3D(solid.frame),camera=scene.print_camera
 assert.deepEqual(empty,input);assert.equal(camera.projection,'perspective');assert.deepEqual(frame.toLocal(camera.target).map(v=>Math.round(v*1e9)/1e9),[0,0,1]);assert.ok(Math.abs(frame.toLocal(camera.position)[2]-2)<1e-9)
 const render=r.coneRenderGeometry3D(solid,camera),points=scene.points.filter(p=>['A','B'].includes(p.label))
 for(const contact of render.curves.filter(c=>c.role==='silhouette'))assert.ok(points.some(p=>Math.hypot(...p.position.map((v,i)=>v-contact.vertices[0][i]))<1e-9))
 const projected=p.projectScene3D(scene,camera,520,400,true);assert.equal(projected.lines.filter(l=>l.role==='silhouette').length,0)
 const q=projected.projection,base=render.curves[0].vertices.map(v=>q.screen(q.view(v)));assert.ok(Math.max(...base.map(v=>v[1]))-Math.min(...base.map(v=>v[1]))>15,'nondegenerate base ellipse')
 const svg=p.geometrySceneSVG3D(scene,520,400);assert.equal((svg.match(/data-cone-point-label=/g)||[]).length,4);assert.equal((svg.match(/background:transparent;user-select:none;-webkit-user-select:none/g)||[]).length,4);assert.equal((svg.match(/fill="#2563eb"/g)||[]).length,4);assert.ok(svg.includes('text-anchor="end"'));assert.ok(svg.includes('text-anchor="middle"'));for(const label of ['S','O','A','B'])assert.ok(svg.includes(`>${label}</text>`))
 for(const point of projected.points)assert.ok(point.position[0]>25&&point.position[0]<495&&point.position[1]>25&&point.position[1]<375,'framing leaves label room')
 const orbit={...camera,position:frame.toWorld([6,-5,5])},orbited=p.projectScene3D(scene,orbit,520,400,true);assert.equal(orbited.lines.filter(l=>l.role==='silhouette').length,2);assert.deepEqual(scene.print_camera,camera)
 // Elevated orthographic view must retain correct, separate contacts.
 const ortho={...camera,projection:'orthographic',position:frame.toWorld([4,3,5]),target:frame.toWorld([0,0,0])}
 assert.equal(p.projectScene3D(scene,ortho,520,400,true).lines.filter(l=>l.role==='silhouette').length,2)
 const level={...ortho,position:frame.toWorld([4,3,0])},levelDisplay=r.coneRenderGeometry3D(solid,level),levelQ=p.createProjection3D(level,520,400),ys=levelDisplay.curves[0].vertices.map(v=>levelQ.screen(levelQ.view(v))[1]);assert.ok(Math.max(...ys)-Math.min(...ys)<1e-9,'aligned orthographic base collapses')
 let removed=scene;for(const line of scene.linear_objects)removed=a.deletePrimitive3D(removed,line.id).scene
 assert.equal(removed.points.length,4);assert.equal(removed.linear_objects.length,0);assert.deepEqual(m.prepareAnalyticCenters3D(removed),removed);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 const history=m.createGeometryHistory3D(scene,()=>{});assert.ok(history.commit(removed));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),removed)
 fixtures.push(scene,removed)
}
// Existing/custom saved views and scenes with content never receive the preset.
const custom=m.emptyGeometryScene3D();custom.print_camera.position=[8,4,6]
assert.deepEqual(s.createConeAt3D(custom,[0,0,0],'XY','C').scene.print_camera,custom.print_camera)
const occupied=m.emptyGeometryScene3D();occupied.points.push({id:'p',position:[9,9,9],label:null})
assert.deepEqual(s.createConeAt3D(occupied,[0,0,0],'XY','C').scene.print_camera,occupied.print_camera)
const existing=s.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','C').scene
assert.deepEqual(s.createConeAt3D(existing,[4,0,0],'XY','D').scene.print_camera,existing.print_camera)
assert.deepEqual(s.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','CY').scene.print_camera,m.emptyGeometryScene3D().print_camera)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} textbook default fixtures; all planes/input projections, true tangent alignment, framing/labels, orbit/orthographic limits, removals/history/reload and saved-camera isolation`)
