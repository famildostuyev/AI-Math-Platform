import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const s=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),a=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),b=await loadGeometryModule('geometry3dSolidBounds'),g=await loadGeometryModule('geometry3dAnalytic'),n=await loadGeometryModule('geometry3d')
const close=(x,y)=>assert.ok(Math.hypot(...p.sub(x,y))<1e-8),fixtures=[];let gestures=0
for(const plane of ['XY','XZ','YZ'])for(const projection of ['perspective','orthographic'])for(const rotated of [false,true]){
 let scene=s.createConeAt3D(m.emptyGeometryScene3D(),[.2,-.3,.4],plane,'C').scene
 if(rotated)scene=s.rotateSolid3D(scene,'C',[1,2,3],.6)
 scene=s.translateSolid3D(scene,'C',[.3,.2,-.1])
 scene=s.createConeAt3D(scene,[8,3,1],plane,'other').scene
 scene=a.editConeCenterLabel3D(scene,'C_v_1','T₁ α');scene=a.editConeCenterLabel3D(scene,'C_v_2','M')
 scene=a.deletePrimitive3D(scene,'C_generator_sa').scene
 const original=structuredClone(scene),features=structuredClone(scene.solids.find(s=>s.id==='C').features),get=(scene,id)=>scene.points.find(p=>p.id===id).position,apex=get(scene,'C_v_1')
 for(const [dimension,value] of [['radius',1.8],['height',3.2],['radius',.7],['height',1.6]]){
  const before=scene;scene=s.resizeCone3D(scene,'C',dimension,value);assert.ok(scene)
  const solid=scene.solids.find(s=>s.id==='C'),old=before.solids.find(s=>s.id==='C'),frame=g.analyticFrame3D(solid.frame),r=solid.parameters.radius,h=solid.parameters.height
  assert.equal(solid.parameters[dimension],value);assert.equal(solid.parameters[dimension==='radius'?'height':'radius'],old.parameters[dimension==='radius'?'height':'radius'])
  close(get(scene,'C_v_1'),apex);close(get(scene,'C_v_0'),frame.toWorld([0,0,0]));close(get(scene,'C_v_2'),frame.toWorld([-.6*r,.8*r,0]));close(get(scene,'C_v_3'),frame.toWorld([.6*r,-.8*r,0]))
  assert.deepEqual(solid.features,features);assert.equal(scene.points.find(p=>p.id==='C_v_1').label,'T₁ α');assert.equal(scene.points.find(p=>p.id==='C_v_2').label,'M')
  for(const [id,length] of [['C_height',h],['C_diameter',2*r],['C_generator_sb',Math.hypot(r,h)]]){const l=scene.linear_objects.find(l=>l.id===id);assert.ok(Math.abs(Math.hypot(...p.sub(get(scene,l.a),get(scene,l.b)))-length)<1e-8)}
  assert.equal(scene.linear_objects.some(l=>l.id==='C_generator_sa'),false);assert.deepEqual(scene.print_camera,original.print_camera)
  assert.deepEqual(scene.solids.find(s=>s.id==='other'),original.solids.find(s=>s.id==='other'));assert.deepEqual(scene.points.filter(p=>p.id.startsWith('other')),original.points.filter(p=>p.id.startsWith('other')))
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene);assert.ok(p.geometrySceneSVG3D(scene).includes('>T₁ α</text>'));fixtures.push(scene)
 }
 for(const dimension of ['radius','height']){
  for(const value of [0,-1,NaN,Infinity,1e13,1e-30])assert.equal(s.resizeCone3D(scene,'C',dimension,value),null)
  assert.equal(s.resizeCone3D(scene,'C',dimension,scene.solids.find(s=>s.id==='C').parameters[dimension]),scene)
  const solid=scene.solids.find(s=>s.id==='C'),frame=g.analyticFrame3D(solid.frame),camera={...scene.print_camera,projection,position:frame.toWorld([6,-7,5]),target:frame.toWorld([0,0,.8]),up:frame.z},q=p.createProjection3D(camera,900,700)
  const handle=b.projectedSolidBounds3D(scene,camera,900,700,'C').handles.find(h=>h.kind===dimension&&a.apexHeightMapping3D(camera,{x:h.x,y:h.y,width:900,height:700},h.world,h.direction,h.length));assert.ok(handle,`${plane}/${projection}/${rotated}/${dimension}`)
  const start={x:handle.x,y:handle.y,width:900,height:700,pointerId:1,button:0,altKey:false},target=p.add(handle.world,p.scale(handle.direction,handle.length*.25)),screen=q.screen(q.view(target)),end={...start,x:screen[0]+handle.x-handle.screen[0],y:screen[1]+handle.y-handle.screen[1]}
  let doc=scene,commits=0;const history=m.createGeometryHistory3D(scene,v=>doc=v),i=a.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}});i.select('C')
  i.pointer('down',start);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(commits,0);close(get(i.snapshot().draft,'C_v_1'),apex);i.cancel();assert.deepEqual(doc,scene)
  i.pointer('down',start);i.pointer('move',end);i.pointer('cancel',end);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(commits,0)
  i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1)
  const after=structuredClone(doc),resized=doc.solids.find(s=>s.id==='C');assert.ok(Math.abs(resized.parameters[dimension]/solid.parameters[dimension]-1.25)<1e-8);assert.equal(resized.parameters[dimension==='radius'?'height':'radius'],solid.parameters[dimension==='radius'?'height':'radius']);assert.deepEqual(doc.print_camera,scene.print_camera)
  assert.ok(history.provider.undo());assert.deepEqual(doc,scene);assert.equal(history.provider.undo(),false);assert.ok(history.provider.redo());assert.deepEqual(doc,after);fixtures.push(after);gestures++
 }
}
// Fixed apex maintains exact textbook tangency through radius and height edits.
let clean=s.createConeAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','T').scene
for(const [dimension,value] of [['radius',1.5],['height',3],['height',1]]){
 const camera=structuredClone(clean.print_camera);clean=s.resizeCone3D(clean,'T',dimension,value);assert.deepEqual(clean.print_camera,camera);assert.equal(p.projectScene3D(clean,camera,800,600,true).lines.filter(l=>l.role==='silhouette').length,0)
 const {radius:r,height:h}=clean.solids[0].parameters
 for(const [id,length] of [['T_height',h],['T_diameter',2*r],['T_generator_sa',Math.hypot(r,h)],['T_generator_sb',Math.hypot(r,h)]]){const line=clean.linear_objects.find(l=>l.id===id),A=clean.points.find(p=>p.id===line.a).position,B=clean.points.find(p=>p.id===line.b).position;assert.ok(Math.abs(Math.hypot(...p.sub(A,B))-length)<1e-9)}
}
let bare=clean;for(const line of clean.linear_objects)bare=a.deletePrimitive3D(bare,line.id).scene
for(const dimension of ['radius','height']){const edited=s.resizeCone3D(bare,'T',dimension,2);assert.ok(edited);assert.equal(edited.linear_objects.length,0);assert.equal(edited.points.length,4)}
const legacy=structuredClone(clean);legacy.points=[];legacy.linear_objects=[];legacy.surfaces=[];legacy.solids[0].features=[]
assert.ok(s.resizeCone3D(legacy,'T','height',2));assert.ok(b.projectedSolidBounds3D(legacy,legacy.print_camera,800,600,'T').handles.some(h=>h.kind==='radius'))
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: ${fixtures.length} cone dimension fixtures and ${gestures} handle gestures; planes/cameras/transforms, independent dimensions, labels/IDs/lengths, fixed apex/textbook view, cancel/no-op/history and deletion persistence`)
