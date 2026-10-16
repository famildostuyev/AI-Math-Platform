import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolids'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const author=await loadGeometryModule('geometry3dAuthoring')
const point=(scene,id)=>scene.points.find(p=>p.id===id)
for(const angles of [[20,30,40],[20,90,40],[20,-90,40]]){const frame=a.solidFrame3D([0,0,0],angles),recreated=a.solidFrame3D(frame.origin,a.solidAngles3D(frame));for(const axis of ['x_axis','y_axis'])assert.ok(Math.hypot(...frame[axis].map((v,i)=>v-recreated[axis][i]))<1e-8,'orientation roundtrip including gimbal lock')}
for(const kind of ['cube','cuboid','prism','pyramid']){
  const definition=a.defaultSolid3D(kind,kind),result=a.createSolid3D(m.emptyGeometryScene3D(),definition);assert.ok(result,kind)
  const scene=result.scene,solid=scene.solids[0],t=s.solidTopology3D(scene,solid)
  if(kind==='cube'){const projection=p.createProjection3D(scene.print_camera,600,400),[x,y]=projection.screen(projection.view([1,1,2]));assert.equal(author.pickGeometry3D(scene,scene.print_camera,{x,y,width:600,height:400}).id,solid.id)}
  const expected=kind==='pyramid'?[5,8,5]:kind==='prism'?[6,9,5]:[8,12,6]
  assert.deepEqual([scene.points.length,scene.edges.length,scene.faces.length],expected)
  for(const e of scene.edges)if(kind==='cube')assert.ok(Math.abs(Math.hypot(...point(scene,e.start).position.map((v,i)=>v-point(scene,e.end).position[i]))-2)<1e-9)
  assert.equal(m.moveGeometryPoint3D(scene,scene.points[0].id,[99,0,0]),null)
  const edited=structuredClone(solid);if(kind==='cube')edited.parameters.side=3;else edited.parameters.height=4
  edited.frame=a.solidFrame3D([1,2,3],[20,30,40]);const changed=a.editSolid3D(scene,edited);assert.ok(changed);assert.deepEqual(changed.solids[0].features,solid.features)
  for(const bad of (kind==='pyramid'?[0,NaN,Infinity,1e13]:[0,-1,NaN,Infinity,1e13])){const invalid=structuredClone(edited);if(kind==='cube')invalid.parameters.side=bad;else invalid.parameters.height=bad;assert.equal(a.editSolid3D(scene,invalid),null)}
  const topologyEdit=structuredClone(solid);if('sides'in topologyEdit.parameters){topologyEdit.parameters.sides++;assert.equal(a.editSolid3D(scene,topologyEdit),null)}
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(JSON.stringify(changed))),changed)
  const svg=p.geometrySceneSVG3D(changed);assert.equal(svg,p.geometrySceneSVG3D(changed));assert.ok(svg.includes(scene.faces[0].id));assert.equal(p.scenePrimitives3D(changed).status,'ok')
  let doc=scene;const h=m.createGeometryHistory3D(scene,x=>doc=x);assert.equal(h.commit(a.editSolid3D(scene,solid)),false,'no-op parameter edit has no history');assert.ok(h.commit(changed));assert.ok(h.provider.undo());assert.deepEqual(doc,scene);assert.ok(h.provider.redo());assert.deepEqual(doc,changed)
  assert.ok(a.deleteSolid3D(changed,kind));assert.equal(t.vertices.length,expected[0])
}
let base=m.emptyGeometryScene3D()
for(const count of [3,4,5,6,12,128]){const definition=a.defaultSolid3D('prism',`prism${count}`);definition.parameters.sides=count;const result=a.createSolid3D(m.emptyGeometryScene3D(),definition);assert.ok(result);assert.deepEqual([result.scene.points.length,result.scene.edges.length,result.scene.faces.length],[2*count,3*count,count+2]);if(count===128){const removed=a.deleteSolid3D(result.scene,definition.id);assert.ok(removed);assert.equal(removed.scene.edges.length,0);assert.equal(removed.scene.faces.length,0);assert.equal(removed.scene.points.length,256)}}
const coords=[[0,0,0],[3,0,0],[3,3,0],[1.5,1.5,0],[0,3,0]]
base.points=coords.map((position,i)=>({id:`b${i}`,position,label:null}));base.linear_objects=coords.map((_,i)=>({id:`segment${i}`,kind:'segment',a:`b${i}`,b:`b${(i+1)%5}`}))
const polygon=a.addBasePolygon3D(base,coords.map((_,i)=>`b${i}`),'base');assert.ok(polygon);base=polygon.scene
assert.equal(a.addBasePolygon3D({...base,linear_objects:[]},['b0','b1','b2']),null,'unclosed source rejected')
const def=a.defaultSolid3D('prism','concave');def.parameters={sides:5,height:2,base:{kind:'face',face_id:'base',point_ids:base.faces[0].boundary},direction:[0,0,1]}
let scene=a.createSolid3D(base,def).scene;assert.deepEqual([scene.points.length-base.points.length,scene.edges.length,scene.faces.length-base.faces.length],[10,15,7])
const changed=m.moveGeometryPoint3D(scene,'b1',[4,0,0]);assert.ok(changed);assert.deepEqual(point(changed,'concave_v_1').position,[4,0,0]);assert.deepEqual(changed.solids[0].features,scene.solids[0].features)
assert.equal(m.moveGeometryPoint3D(scene,'b1',[3,0,1]),null,'noncoplanar dependency rejected')
assert.equal(m.moveGeometryPoint3D(scene,'b3',[-1,1,0]),null,'self intersection rejected')
assert.equal(m.transactGeometryScene3D(scene,d=>d.faces.find(f=>f.id==='base').boundary.reverse()),null,'source order never retargets feature IDs')
assert.equal(m.deleteGeometryTarget3D(scene,'base'),null,'referenced source deletion blocked')
const dependency=a.defaultSolid3D('prism','child');let owned=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('cube','parent')).scene
const ownedBase=owned.faces.find(f=>f.id==='parent_f_1');dependency.parameters={sides:4,height:2,base:{kind:'face',face_id:ownedBase.id,point_ids:ownedBase.boundary},direction:[0,0,1]};owned=a.createSolid3D(owned,dependency).scene
const parentEdit=structuredClone(owned.solids.find(s=>s.id==='parent'));parentEdit.parameters.side=3;const updated=a.editSolid3D(owned,parentEdit);assert.ok(updated);assert.deepEqual(point(updated,'child_v_1').position,[3,0,3]);assert.equal(a.deleteSolid3D(owned,'parent'),null,'dependent source solid deletion explicitly blocked')
const py=a.defaultSolid3D('pyramid','concave_pyramid');py.parameters={sides:5,height:2,base:{kind:'face',face_id:'base',point_ids:base.faces[0].boundary},apex_offset:[0,0]}
assert.ok(a.createSolid3D(base,py));py.parameters.apex_offset=[10,10];assert.equal(a.createSolid3D(base,py),null,'concave apex kernel safety')
const obliquePrism=structuredClone(def);obliquePrism.parameters.direction=[.6,0,.8];const obliqueScene=a.createSolid3D(base,obliquePrism).scene;assert.ok(obliqueScene);assert.ok(Math.abs(point(obliqueScene,'concave_v_5').position[0]-1.5)<1e-9)
obliquePrism.parameters.direction=[0,0,-1];const belowPrism=a.createSolid3D(base,obliquePrism).scene;assert.ok(belowPrism);assert.equal(point(belowPrism,'concave_v_5').position[2],-2)
const convex=a.defaultSolid3D('pyramid','oblique');convex.parameters.apex_offset=[4,1];assert.ok(a.createSolid3D(m.emptyGeometryScene3D(),convex),'convex oblique pyramid')
const apexScene=a.createSolid3D(m.emptyGeometryScene3D(),convex).scene,apexSolid=apexScene.solids[0],apexDefinition={...apexSolid,parameters:s.pyramidApexParameters3D(apexScene,apexSolid,[1,2,5])},apexEdited=a.editSolid3D(apexScene,apexDefinition);assert.ok(apexEdited);assert.ok(Math.hypot(...s.solidTopology3D(apexEdited,apexEdited.solids[0]).vertices.at(-1).map((v,i)=>v-[1,2,5][i]))<1e-9)
const belowApex={...apexSolid,parameters:s.pyramidApexParameters3D(apexScene,apexSolid,[1,2,-5])};assert.ok(a.editSolid3D(apexScene,belowApex));const planarApex={...apexSolid,parameters:s.pyramidApexParameters3D(apexScene,apexSolid,[1,2,0])};assert.equal(a.editSolid3D(apexScene,planarApex),null)
// Attachment and downstream preservation on solid deletion.
scene.points.push({id:'attached',position:[1.5,0,0],label:null});scene.constructions.push({id:'attachment',kind:'point_on_edge',edge_id:'concave_e_0',t:.5,output_point_id:'attached'});scene.linear_objects.push({id:'downstream',kind:'segment',a:'attached',b:'b4'})
scene.annotations.push({id:'face_note',content:'x',format:'latex',anchor:{kind:'face',face_id:'concave_f_1',uv:[.2,.2]},offset_mm:[0,0]})
scene=m.evaluateGeometryScene3D(scene).scene;const deleted=a.deleteSolid3D(scene,'concave');assert.ok(deleted);assert.equal(deleted.losses[0].subject_id,'attached');assert.deepEqual(point(deleted.scene,'attached').position,[1.5,0,0]);assert.ok(deleted.scene.linear_objects.some(l=>l.id==='downstream'));assert.equal(deleted.scene.solids.length,0)
assert.equal(deleted.scene.annotations[0].anchor.kind,'world');assert.ok(deleted.losses.some(l=>l.subject_id==='face_note'))
const invalid=structuredClone(def);invalid.parameters.direction=[1,0,0];assert.equal(a.createSolid3D(base,invalid),null)
if(process.argv.includes('--fixture')){
  let fixture=a.createSolid3D(m.emptyGeometryScene3D(),a.defaultSolid3D('cube','cube')).scene
  fixture=a.createSolid3D(fixture,a.defaultSolid3D('cuboid','cuboid')).scene
  const existing=a.createSolid3D(base,def).scene
  fixture={...fixture,points:[...fixture.points,...existing.points],linear_objects:existing.linear_objects,faces:[...fixture.faces,...existing.faces],edges:[...fixture.edges,...existing.edges],solids:[...fixture.solids,...existing.solids]}
  fixture=a.createSolid3D(fixture,a.defaultSolid3D('pyramid','pyramid')).scene
  const existingPyramid=a.defaultSolid3D('pyramid','existing_pyramid');existingPyramid.parameters={sides:5,height:2,base:{kind:'face',face_id:'base',point_ids:base.faces[0].boundary},apex_offset:[0,0]};fixture=a.createSolid3D(fixture,existingPyramid).scene
  const negativePrism=a.defaultSolid3D('prism','negative_prism');negativePrism.parameters.direction=[0,0,-1];fixture=a.createSolid3D(fixture,negativePrism).scene
  const negativePyramid=a.defaultSolid3D('pyramid','negative_pyramid');negativePyramid.parameters.height=-2;fixture=a.createSolid3D(fixture,negativePyramid).scene
  await fs.writeFile(new URL('./geometry_3d_m4_canonical.json',import.meta.url),JSON.stringify(n.normalizeGeometryScene3D(fixture),null,2)+'\n')
}
if(!process.argv.includes('--fixture')){const canonical=JSON.parse(await fs.readFile(new URL('./geometry_3d_m4_canonical.json',import.meta.url),'utf8'));assert.deepEqual(n.normalizeGeometryScene3D(canonical),canonical);assert.deepEqual(m.evaluateGeometryScene3D(canonical).scene,canonical)}
console.log('PASS: M4 solids, invariants/topology, convex/concave bases, invalid dependencies, stable features, editing, atomic history, deletion, SVG and reload')
