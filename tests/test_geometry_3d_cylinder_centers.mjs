import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),a=await loadGeometryModule('geometry3dSolidAuthoring'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),analytic=await loadGeometryModule('geometry3dAnalytic'),n=await loadGeometryModule('geometry3d')
const close=(x,y)=>assert.ok(Math.hypot(...p.sub(x,y))<1e-8,`${x} ~= ${y}`),fixtures=[]
const centers=scene=>scene.solids[0].features.filter(f=>/^v_[01]$/.test(f.slot)).map(f=>scene.points.find(v=>v.id===f.entity_id))
for(const plane of ['XY','XZ','YZ'])for(const rotated of [false,true]){
 let source=a.createCylinderAt3D(m.emptyGeometryScene3D(),[.2,.1,-.3],plane,'A').scene
 if(rotated)source=a.rotateSolid3D(source,'A',[1,2,3],.6)
 const ids=centers(source).map(v=>v.id),features=structuredClone(source.solids[0].features)
 assert.equal(ids.length,2);assert.deepEqual(centers(source).map(p=>p.label),['O1','O2'])
 assert.ok(ids.every(id=>!g.isFreePoint3D(source,id)));assert.equal(g.editPoint3D(source,ids[0],[99,0,0],'bad'),null)
 const before=structuredClone(source),pivot=a.solidPivot3D(source,'A')
 for(const operation of [s=>a.resizeCylinder3D(s,'A','radius',1.7),s=>a.resizeCylinder3D(s,'A','height',3.1),s=>a.scaleSolid3D(s,'A',.8),s=>a.rotateSolid3D(s,'A',[1,-2,3],.3),s=>a.translateSolid3D(s,'A',[.3,-.2,.4])]){
  const old=source;source=operation(source);assert.ok(source)
  assert.deepEqual(source.solids[0].features,features);assert.deepEqual(centers(source).map(p=>p.id),ids)
  const solid=source.solids[0],f=analytic.analyticFrame3D(solid.frame),c=centers(source)
  close(c[0].position,f.toWorld([0,0,0]));close(c[1].position,f.toWorld([0,0,solid.parameters.height]));close(p.scale(p.add(c[0].position,c[1].position),.5),a.solidPivot3D(source,'A'))
  if(solid.parameters.height===old.solids[0].parameters.height&&solid.parameters.radius!==old.solids[0].parameters.radius)assert.deepEqual(centers(source),centers(old),'radius leaves centers exactly fixed')
 }
 assert.deepEqual(before.solids[0].features,features);close(a.solidPivot3D(before,'A'),pivot)
 assert.deepEqual(m.prepareCylinderCenters3D(source),source);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(source))),source)
 let doc=before;const history=m.createGeometryHistory3D(before,next=>doc=next);assert.ok(history.commit(source));assert.ok(history.provider.undo());assert.deepEqual(doc,before);assert.ok(history.provider.redo());assert.deepEqual(doc,source)
 const solid=source.solids[0],frame=analytic.analyticFrame3D(solid.frame),center=a.solidPivot3D(source,'A')
 for(const projection of ['orthographic','perspective'])for(const sign of [1,-1]){
  const camera={...source.print_camera,projection,position:p.add(center,p.scale(frame.z,12*sign)),target:center,up:frame.y}
  const visibleId=sign>0?ids[1]:ids[0],hiddenId=sign>0?ids[0]:ids[1],projected=p.projectScene3D(source,camera,800,600)
  assert.ok(projected.points.some(p=>p.id===visibleId));assert.ok(!projected.points.some(p=>p.id===hiddenId),'opaque parent hides opposite center')
  const world=source.points.find(p=>p.id===visibleId).position,project=p.createProjection3D(camera,800,600),screen=project.screen(project.view(world)),pointer={x:screen[0],y:screen[1],width:800,height:600,pointerId:1,button:0,altKey:false}
  assert.equal(g.pickGeometry3D(source,camera,pointer).id,visibleId,'semantic center precedes cap solid')
  if(sign>0){
   const blocker=a.defaultCylinder3D('occluder');blocker.frame={...structuredClone(solid.frame),origin:p.add(solid.frame.origin,p.scale(frame.z,solid.parameters.height+2))}
   const overlapping=a.createSolid3D(source,blocker).scene
   assert.ok(!p.projectScene3D(overlapping,camera,800,600).points.some(p=>p.id===visibleId),'foreground opaque solid hides the center')
  }
  let current=source;const interaction=g.createAuthoringInteraction3D({getScene:()=>current,getCamera:()=>camera,commit:v=>{current=v;return true},notify:()=>{}})
  interaction.setTool('point');interaction.pointer('down',pointer);interaction.pointer('up',pointer);assert.deepEqual(current,source,'Point tool reuses center')
  interaction.setTool('select');interaction.pointer('down',pointer);interaction.pointer('move',{...pointer,x:pointer.x+25});interaction.pointer('up',{...pointer,x:pointer.x+25});assert.deepEqual(current,source,'center cannot drift')
  if(projection==='orthographic'){
   const svg=p.geometrySceneSVG3D({...source,print_camera:camera},800,600)
   assert.ok(svg.includes(`data-id="${visibleId}"`));assert.ok(!svg.includes(`data-id="${hiddenId}"`));assert.ok(svg.includes(sign>0?'>O2</text>':'>O1</text>'))
  }
 }
 fixtures.push(before,source)
}
// Old sparse scenes are never migrated by the normalizer. Preparation is explicit,
// idempotent, collision-safe and preserves existing semantic IDs/custom labels.
{
 const scene=m.emptyGeometryScene3D(),solid=a.defaultCylinder3D('old')
 scene.solids=[solid];scene.points=[{id:'old_v_0',position:[7,8,9],label:'free'}]
 const original=structuredClone(scene),prepared=m.prepareCylinderCenters3D(scene)
 assert.ok(prepared);assert.deepEqual(scene,original);assert.deepEqual(n.normalizeGeometryScene3D(scene).solids[0].features,[])
 assert.equal(prepared.solids[0].features.find(f=>f.slot==='v_0').entity_id,'old_v_0_2');assert.deepEqual(prepared.points.find(p=>p.id==='old_v_0'),original.points[0])
 assert.deepEqual(m.prepareCylinderCenters3D(prepared),prepared)
 const camera={...scene.print_camera,position:[0,0,8],target:[0,0,1],up:[0,1,0]}
 assert.ok(p.geometrySceneSVG3D({...scene,print_camera:camera},800,600).includes('data-id="old_v_1"'));assert.deepEqual(scene,original,'read-only legacy rendering does not migrate source')
 const partial=structuredClone(scene);partial.solids[0].features=[{slot:'v_1',entity_id:'custom_top'}];partial.points.push({id:'custom_top',position:[0,0,2],label:'Custom'})
 const completed=m.prepareCylinderCenters3D(partial);assert.equal(completed.solids[0].features.find(f=>f.slot==='v_1').entity_id,'custom_top');assert.equal(completed.points.find(p=>p.id==='custom_top').label,'Custom')
 assert.equal(completed.points.length,3);fixtures.push(prepared,completed)
 const long=m.emptyGeometryScene3D();long.solids=[a.defaultCylinder3D('A'.repeat(63)+'B'),a.defaultCylinder3D('A'.repeat(63)+'C')]
 const first=m.prepareCylinderCenters3D(long);assert.ok(first);assert.equal(new Set(first.points.map(p=>p.id)).size,4);assert.ok(first.points.every(p=>p.id.length<=64));assert.deepEqual(m.prepareCylinderCenters3D({...long,solids:[...long.solids].reverse()}),first)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cylinder center fixtures; O1/O2 ownership, stable sparse IDs, lazy legacy preparation/collisions, all transforms, radial invariance, symmetric height, occlusion, picking/snapping, locked drag, history, serialization and SVG`)
