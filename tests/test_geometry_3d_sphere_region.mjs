import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const s=await load('geometry3dSolidAuthoring'),m=await load('geometry3dModel'),a=await load('geometry3dAuthoring'),p=await load('geometry3dProjection'),b=await load('geometry3dSolidBounds'),g=await load('geometry3dAnalytic'),n=await load('geometry3d'),api=await load('geometry3dSurfacePoints')
const fixtures=[];let gestures=0
for(const plane of ['XY','XZ','YZ'])for(const projection of ['orthographic','perspective'])for(const rotated of [false,true]){
 let scene=s.createSphereSurfaceAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'S').scene
 assert.deepEqual(scene.solids[0].parameters,{radius:1,equator:'visible',region:'surface'});assert.equal(scene.points[0].label,'O')
 const legacy=s.createSphereAt3D(m.emptyGeometryScene3D(),[40,40,40],plane,'zBall').scene
 assert.equal(legacy.solids[0].parameters.region,undefined);assert.deepEqual(n.normalizeGeometryScene3D(legacy),legacy)
 scene=s.createSphereAt3D(scene,[40,40,40],plane,'zBall').scene;const ball=structuredClone(scene.solids[1])
 if(rotated)scene=s.rotateSolid3D(scene,'S',[1,2,3],.6)
 scene=s.translateSolid3D(scene,'S',[.4,.3,-.2]);const solid=scene.solids[0],frame=g.analyticFrame3D(solid.frame),camera={...scene.print_camera,projection,position:frame.toWorld([7,0,.1]),target:solid.frame.origin,up:frame.z,vertical_span:5}
 for(const [id,uv] of [['Front',[0,.5]],['Back',[.5,.5]],['North',[.8,1]],['South',[.9,0]],['Seam',[1,.7]]])scene=api.createPointOnSurface3D(scene,'S_surface',uv,id,id==='Front'?'M':null)
 assert.ok(scene);for(const id of ['North','South','Seam'])assert.equal(scene.constructions.find(c=>c.output_point_id===id).uv[0],0)
 assert.equal(api.createPointOnSurface3D(scene,'S_surface',[.3,1],'Duplicate'),null)
 for(const uv of [[NaN,.5],[0,Infinity],[0,-.1],[0,1.1]])assert.equal(api.createPointOnSurface3D(scene,'S_surface',uv,'Bad'),null)
 const projected=p.projectScene3D(scene,camera,900,700,true);assert.ok(projected.points.some(p=>p.id==='Front'),JSON.stringify({plane,projection,rotated,status:projected.status,points:projected.points.map(p=>p.id),solids:scene.solids.map(s=>s.frame.origin)}));assert.ok(!projected.points.some(p=>p.id==='Back'))
 const view=p.createProjection3D(camera,900,700),back=view.screen(view.view(scene.points.find(p=>p.id==='Back').position)),pointer={x:back[0],y:back[1],width:900,height:700,pointerId:1,button:0,altKey:false}
 assert.notEqual(a.pickGeometry3D(scene,camera,pointer,true)?.id,'Back')
 const strokes=p.projectedEdgeStrokes3D(projected,projection).filter(l=>l.id==='S'&&l.role==='equator');assert.ok(strokes.some(l=>l.hidden));assert.ok(strokes.some(l=>!l.hidden))
 const center=scene.points.find(p=>p.id==='S_v_0'),bounds=b.projectedSolidBounds3D(scene,camera,900,700,'S'),h=bounds.handles.find(h=>h.kind==='radius')
 const start={...pointer,x:h.x,y:h.y},target=view.screen(view.view(p.add(h.world,p.scale(h.direction,.3)))),end={...start,x:target[0]+h.x-h.screen[0],y:target[1]+h.y-h.screen[1]}
 let doc=scene,commits=0;const history=m.createGeometryHistory3D(scene,v=>doc=v),interaction=a.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});interaction.select('S')
 interaction.pointer('down',start);interaction.pointer('move',end);interaction.cancel();assert.deepEqual(doc,scene);assert.equal(commits,0)
 interaction.pointer('down',start);interaction.pointer('up',start);assert.equal(commits,0)
 interaction.pointer('down',start);interaction.pointer('move',end);interaction.pointer('up',end);assert.equal(commits,1);assert.ok(Math.abs(doc.solids[0].parameters.radius-1.3)<1e-8);assert.deepEqual(doc.points.find(p=>p.id===center.id),center)
 assert.ok(history.provider.undo());assert.deepEqual(doc,scene);assert.ok(history.provider.redo());gestures++
 doc=s.scaleSolid3D(doc,'S',1.2);assert.ok(doc);assert.equal(doc.solids[0].parameters.region,'surface');assert.deepEqual(doc.solids[1],ball)
 doc=api.editPointOnSurface3D(doc,'Front',[.03,.6]);doc=api.editSurfacePointLabel3D(doc,'Front','M \u03b1');assert.ok(doc)
 for(const point of doc.points.filter(p=>doc.constructions.some(c=>c.output_point_id===p.id)))assert.ok(Math.abs(Math.hypot(...p.sub(point.position,doc.solids[0].frame.origin))-doc.solids[0].parameters.radius)<1e-8)
 const svg=p.geometrySceneSVG3D({...doc,print_camera:camera},900,700);assert.ok(svg.includes('data-render-curve="equator"'));assert.ok(!svg.includes('data-resize-handle'))
 const hidden=s.setSphereEquator3D(doc,'S',false);assert.equal(hidden.solids[0].parameters.region,'surface');assert.ok(!p.projectedEdgeStrokes3D(p.projectScene3D(hidden,camera,900,700),projection).some(l=>l.id==='S'&&l.role==='equator'))
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(doc))),doc)
 const deleted=s.deleteSolid3D(doc,'S').scene;assert.deepEqual(deleted.points,doc.points);assert.equal(deleted.constructions.length,0);assert.ok(deleted.solids.some(s=>s.id==='zBall'))
 for(const region of ['shell',null,1,true]){const bad=structuredClone(doc);bad.solids[0].parameters.region=region;assert.equal(n.normalizeGeometryScene3D(bad),null)}
 fixtures.push(doc)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} mixed Ball/Sfera scenes, ${gestures} radius gestures; regions/legacy/strict validation, planes/cameras, UV/poles, rear-point picking, equator occlusion, transforms/history/detachment/reload/SVG`)
