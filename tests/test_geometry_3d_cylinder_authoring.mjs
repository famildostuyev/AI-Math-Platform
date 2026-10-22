import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),a=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d'),c=await loadGeometryModule('geometry3dCylinderPicking'),g=await loadGeometryModule('geometry3dAnalytic')
const scenes=[]
const pointer={pointerId:1,button:0,x:400,y:300,width:800,height:600,altKey:false}
const screen=(world,camera)=>{const projection=p.createProjection3D(camera,800,600),v=projection.screen(projection.view(world));return {...pointer,x:v[0],y:v[1]}}
for(const plane of ['XY','XZ','YZ']){
  let scene=m.emptyGeometryScene3D(),camera=structuredClone(scene.print_camera)
  const history=m.createGeometryHistory3D(scene,next=>{scene=next}),interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:history.commit,notify:()=>{}})
  interaction.setPlane(plane);interaction.setTool('cylinder')
  interaction.pointer('down',pointer);interaction.cancel();interaction.pointer('up',pointer);assert.equal(scene.solids.length,0)
  interaction.pointer('down',pointer);interaction.pointer('cancel',pointer);interaction.pointer('up',pointer);assert.equal(scene.solids.length,0)
  interaction.pointer('down',pointer);interaction.pointer('move',{...pointer,x:420});interaction.pointer('up',{...pointer,x:420});assert.equal(scene.solids.length,0,'drag is not a creation click')
  interaction.pointer('down',pointer);interaction.pointer('up',pointer)
  assert.equal(scene.solids.length,1);assert.equal(interaction.snapshot().tool,'select')
  const original=structuredClone(scene),solid=scene.solids[0],id=solid.id
  assert.deepEqual(solid.parameters,{radius:1,height:2});assert.equal(solid.features.length,3);assert.equal(scene.surfaces[0].id,solid.features[0].entity_id)
  assert.equal(scene.points.length,2);assert.equal(scene.faces.length,0);assert.equal(scene.edges.length,0)
  const frame=g.analyticFrame3D(solid.frame)
  assert.deepEqual(frame.z.map(v=>v||0),a.planeNormal3D(plane))
  assert.deepEqual(solid.frame.origin,a.workingPlanePoint3D(camera,pointer,plane))
  assert.deepEqual(camera,scene.print_camera)
  assert.equal(history.provider.undo(),true);assert.equal(scene.solids.length,0);assert.equal(history.provider.undo(),false)
  assert.equal(history.provider.redo(),true);assert.deepEqual(scene,original)
  // Select/empty select/no-op gestures must not mutate geometry or history.
  const center=frame.toWorld([0,0,1]),hit=a.pickGeometry3D(scene,camera,screen(center,camera))
  assert.equal(hit?.id,id);assert.equal(hit?.kind,'solid')
  interaction.pointer('down',screen(center,camera));interaction.pointer('up',screen(center,camera));assert.deepEqual(scene,original)
  assert.equal(history.provider.getSnapshot(),1)
  for(const transform of [()=>s.rotateSolid3D(scene,id,[0,0,1],.3),()=>s.translateSolid3D(scene,id,[1,0,0]),()=>s.scaleSolid3D(scene,id,2),()=>s.solidBounds3D(scene,id)])assert.ok(transform())
  for(const tool of ['rotate_solid','translate_solid']){
    interaction.setTool(tool);interaction.select(id);interaction.pointer('down',pointer);interaction.pointer('move',{...pointer,x:430});interaction.pointer('up',{...pointer,x:430});assert.notDeepEqual(scene,original);assert.ok(history.provider.undo());assert.deepEqual(scene,original)
  }
  const deleted=a.deletePrimitive3D(scene,id);assert.ok(deleted);assert.equal(deleted.scene.solids.length,0);assert.equal(deleted.scene.surfaces.length,0);assert.equal(deleted.scene.points.length,2)
  assert.ok(history.commit(deleted.scene));assert.ok(history.provider.undo());assert.deepEqual(scene,original);assert.ok(history.provider.redo());assert.deepEqual(scene,deleted.scene)
  assert.equal(history.commit(deleted.scene),false)
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(original))),original)
  scenes.push(original,deleted.scene)
}
// Caps and side all resolve to the same semantic solid, in both camera modes.
let base=s.createSolid3D(m.emptyGeometryScene3D(),s.defaultCylinder3D('cylinder')).scene
for(const projection of ['orthographic','perspective'])for(const [position,up,expected] of [[[0,-8,1],[0,0,1],'lateral'],[[0,0,8],[0,1,0],'top_cap'],[[0,0,-6],[0,1,0],'bottom_cap']]){
  const camera={...base.print_camera,projection,position,target:[0,0,1],up},hit=c.pickCylinder3D(base,camera,pointer)
  assert.equal(hit.id,'cylinder');assert.equal(hit.region,expected);assert.equal(a.pickGeometry3D(base,camera,pointer).id,expected==='lateral'?'cylinder':expected==='top_cap'?'cylinder_v_1':'cylinder_v_0')
}
const camera={...base.print_camera,position:[0,-10,1],target:[0,0,1],vertical_span:10}
const second=s.defaultCylinder3D('front');second.frame.origin=[0,-3,0]
base=s.createSolid3D(base,second).scene;assert.equal(a.pickGeometry3D(base,camera,pointer).id,'front')
{
  const scene=s.createSolid3D(base,s.defaultCylinder3D('equal_depth')).scene
  assert.equal(a.pickGeometry3D(scene,{...camera,position:[0,0,10],target:[0,0,1],up:[0,1,0]},pointer).id,'cylinder_v_1','coincident depth uses stable semantic IDs')
  const foreground=structuredClone(base)
  foreground.points.push({id:'left',position:[-.3,-7,1],label:null},{id:'right',position:[.3,-7,1],label:null})
  foreground.linear_objects.push({id:'foreground_edge',kind:'segment',a:'left',b:'right'})
  assert.equal(a.pickGeometry3D(foreground,camera,pointer).id,'foreground_edge','visible segment retains priority over a cylinder')
}
// A visible point/edge retains priority; occluded polyhedral faces cannot win.
for(const kind of ['cube','cuboid','prism','pyramid']){
  const definition=s.defaultSolid3D(kind,'poly');definition.frame.origin=[-1,-1,0]
  let mixed=s.createSolid3D(m.emptyGeometryScene3D(),definition).scene
  const cylinder=s.defaultCylinder3D('cyl');cylinder.frame.origin=[0,-4,0];mixed=s.createSolid3D(mixed,cylinder).scene
  assert.equal(a.pickGeometry3D(mixed,camera,pointer).id,'cyl')
  for(const operation of [scene=>s.rotateSolid3D(scene,'poly',[0,0,1],.2),scene=>s.translateSolid3D(scene,'poly',[1,0,0]),scene=>s.scaleSolid3D(scene,'poly',1.2)]){
    const edited=operation(mixed);assert.ok(edited);assert.deepEqual(edited.solids.find(s=>s.id==='cyl'),mixed.solids.find(s=>s.id==='cyl'),'existing polyhedral transforms leave the cylinder unchanged')
  }
  mixed.points.push({id:'foreground_point',position:[0,-7,1],label:'P'})
  assert.equal(a.pickGeometry3D(mixed,camera,pointer).id,'foreground_point')
  scenes.push(m.evaluateGeometryScene3D(mixed).scene)
}
{
  const cube=s.defaultSolid3D('cube','cube');cube.frame.origin=[-1,-3,0]
  let mixed=s.createSolid3D(m.emptyGeometryScene3D(),cube).scene;mixed=s.createSolid3D(mixed,s.defaultCylinder3D('cyl')).scene
  assert.equal(a.pickGeometry3D(mixed,camera,pointer).id,'cube','foreground face beats cylinder by exact depth')
}
// Sparse centers survive parent deletion; downstream constructions and surface
// annotations detach without deleting unrelated objects or leaving a carrier.
for(const features of [[],[{slot:'v_0',entity_id:'center'}],[{slot:'surface',entity_id:'surface'}],[{slot:'v_0',entity_id:'center'},{slot:'v_1',entity_id:'top'},{slot:'surface',entity_id:'surface'}]]){
  const definition={...s.defaultCylinder3D('sparse'),features}
  let scene=s.createSolid3D(m.emptyGeometryScene3D(),definition).scene
  // Also exercise an imported scene with no materialized feature map at all.
  if(!features.length){scene.solids[0].features=[];scene.surfaces=[]}
  if(features.some(f=>f.slot==='v_0')){
    scene.points.find(p=>p.id==='center').label='O';scene.points.push({id:'free',position:[3,4,5],label:null},{id:'dependent',position:[0,0,0],label:'D'})
    scene.constructions.push({id:'mid',kind:'midpoint',a:'center',b:'free',output_point_id:'dependent'})
  }
  if(features.some(f=>f.slot==='surface'))scene.annotations.push({id:'note',content:'Lateral',format:'text',anchor:{kind:'surface',surface_id:'surface',uv:[.25,.5]},offset_mm:[0,0]})
  const evaluated=m.evaluateGeometryScene3D(scene);assert.equal(evaluated.status,'ok');scene=evaluated.scene
  const before=structuredClone(scene),deleted=s.deleteSolid3D(scene,'sparse');assert.ok(deleted)
  assert.equal(deleted.scene.surfaces.length,0);assert.equal(deleted.scene.solids.length,0)
  assert.deepEqual(deleted.scene.points,before.points);assert.deepEqual(deleted.scene.constructions,before.constructions)
  if(before.annotations.length){assert.equal(deleted.scene.annotations[0].anchor.kind,'world');assert.equal(deleted.losses.length,1);assert.deepEqual(deleted.scene.annotations[0].anchor.position,g.evaluateAnalyticSurface3D(before.solids[0],[.25,.5]))}
  assert.deepEqual(scene,before);scenes.push(before,deleted.scene)
}
assert.equal(s.createCylinderAt3D(m.emptyGeometryScene3D(),[1e12,0,0],'XY'),null)
assert.equal(s.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],'bad'),null)
assert.equal(s.createSolid3D(base,{...s.defaultCylinder3D('invalid'),parameters:{radius:0,height:2}}),null)
// Point tool creates lateral attachments but never a free point through a cap.
{
  let scene=s.createSolid3D(m.emptyGeometryScene3D(),s.defaultCylinder3D()).scene
  const before=structuredClone(scene),i=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:next=>{scene=next;return true},notify:()=>{}})
  i.setTool('point');i.pointer('down',pointer);i.pointer('up',pointer)
  assert.equal(scene.points.length,before.points.length+1);assert.equal(scene.constructions[0].kind,'point_on_surface')
  const old=structuredClone(scene),top={...camera,position:[0,0,8],target:[0,0,1],up:[0,1,0]},cap=screen([.6,0,2],top)
  const capInteraction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>top,commit:next=>{scene=next;return true},notify:()=>{}})
  capInteraction.setTool('point');capInteraction.pointer('down',cap);capInteraction.pointer('up',cap);assert.deepEqual(scene,old)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(scenes))
console.log(`PASS: cylinder XY/XZ/YZ creation, sparse stable features, analytic cap/side/depth picking, transform integration, cancellations, atomic history, deletion/detachment, canonical reload; ${scenes.length} shared scenes`)
