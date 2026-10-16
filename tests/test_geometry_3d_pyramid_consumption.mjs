import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dAuthoring'),s=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d')
const fixtures=[]
function sourceFor(plane='XY',reverse=false){
  let vertices=[[1.3,-2.1],[3.7,-1.4],[4.1,1.2],[.8,.6]].map(([x,y],i)=>({id:'p'+i,position:plane==='XY'?[x,y,0]:plane==='XZ'?[x,0,y]:plane==='YZ'?[0,x,y]:[x,.8*y,.6*y+1]}));if(reverse)vertices.reverse()
  const scene=a.createPlanarPath3D(m.emptyGeometryScene3D(),vertices,true,'source').scene
  scene.points.forEach((p,i)=>p.label=String.fromCharCode(65+i))
  return {scene,vertices}
}
for(const plane of ['XY','XZ','YZ','tilted'])for(const reverse of [false,true]){
  let {scene,vertices}=sourceFor(plane,reverse)
  scene=a.createPoint3D(scene,[-5,-4,-3],'unrelated').scene
  const original=structuredClone(scene),legacy=s.createPyramidOnFace3D(scene,'source','preview').scene,legacyApex=legacy.points.find(p=>p.id==='preview_v_4').position
  let commits=0;const history=m.createGeometryHistory3D(scene,next=>scene=next),camera=scene.print_camera
  const interaction=a.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:next=>{commits++;return history.commit(next)},notify:()=>{}})
  const center=vertices.reduce((sum,v)=>sum.map((x,i)=>x+v.position[i]/4),[0,0,0]),projection=p.createProjection3D(camera,800,600),[x,y]=projection.screen(projection.view(center)),pointer={x,y,width:800,height:600,button:0,pointerId:1,altKey:false}
  interaction.setTool('pyramid');interaction.pointer('down',pointer);interaction.pointer('cancel',pointer);assert.deepEqual(scene,original)
  interaction.pointer('down',pointer);interaction.pointer('up',pointer)
  assert.equal(commits,1);const solid=scene.solids[0],parameters=solid.parameters
  assert.equal(parameters.base.kind,'polygon');assert.deepEqual(parameters.base.vertices,vertices.map(v=>v.position));assert.equal(scene.faces.length,5);assert.equal(scene.points.length,6);assert.equal(scene.linear_objects.length,0)
  assert.ok(!scene.faces.some(f=>f.id==='source'));assert.ok(!scene.points.some(p=>vertices.some(v=>v.id===p.id)))
  assert.deepEqual(scene.points.find(p=>p.id==='unrelated'),original.points.find(p=>p.id==='unrelated'))
  for(let i=0;i<4;i++){const owned=scene.points.find(p=>p.id===solid.features.find(f=>f.slot===`v_${i}`).entity_id);assert.deepEqual(owned.position,vertices[i].position);assert.equal(owned.label,original.points.find(p=>p.id===vertices[i].id).label)}
  const apex=solid.features.find(f=>f.slot==='v_4').entity_id,apexPosition=scene.points.find(p=>p.id===apex).position
  assert.ok(Math.hypot(...apexPosition.map((x,i)=>x-legacyApex[i]))<1e-9)
  const created=structuredClone(scene);assert.ok(history.provider.undo());assert.deepEqual(scene,original);assert.ok(history.provider.redo());assert.deepEqual(scene,created)
  assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(JSON.stringify(scene))),scene);assert.equal(p.geometrySceneSVG3D(scene),p.geometrySceneSVG3D(structuredClone(scene)))
  const higher=s.changePyramidHeight3D(scene,apex,.5);assert.ok(higher)
  const basePoint=solid.features.find(f=>f.slot==='v_1').entity_id,drag=s.pyramidBaseDrag3D(higher,basePoint),moved=s.movePyramidBaseVertex3D(higher,basePoint,drag.position.map((v,i)=>v+(drag.base[0][i]-v)*.1))
  assert.ok(moved);assert.equal(moved.faces.length,5);assert.equal(moved.solids[0].parameters.base.kind,'polygon');assert.deepEqual(moved.solids[0].features,solid.features);assert.ok(!moved.faces.some(f=>f.id==='source'))
  const offset=s.movePyramidApexParallel3D(moved,apex,apexPosition.map((v,i)=>v+(vertices[1].position[i]-vertices[0].position[i])*.05));assert.ok(offset)
  fixtures.push({name:`${plane}-${reverse?'reversed':'forward'}`,source:original,created,edited:moved})
}
// Every external reference category must preserve the source instead of cascading.
const sharing=[
  d=>d.linear_objects.push({id:'shared_line',kind:'segment',a:'p0',b:'p2'}),
  d=>d.edges.push({id:'shared_edge',start:'p0',end:'p2'}),
  d=>d.faces.push({id:'shared_face',boundary:['p0','p1','p2']}),
  d=>d.planes.push({id:'shared_plane',point_ids:['p0','p1','p2']}),
  d=>d.markings.push({id:'mark',kind:'length',point_ids:['p0','p1'],label:null}),
  d=>d.annotations.push({id:'note',content:'Base',format:'text',anchor:{kind:'face',face_id:'source',uv:[0,0]},offset_mm:[0,0]}),
  d=>d.annotations.push({id:'note',content:'A',format:'text',anchor:{kind:'point',point_id:'p0'},offset_mm:[0,0]}),
  d=>{d.points.push({id:'out',position:[0,0,0],label:null});d.constructions.push({id:'on_face',kind:'point_on_face',face_id:'source',uv:[.2,.3],output_point_id:'out'})},
  d=>{d.points.push({id:'out',position:[0,0,0],label:null});d.constructions.push({id:'on_edge',kind:'point_on_linear',linear_id:'source_e0',t:.5,output_point_id:'out'})},
  d=>{d.linear_objects.find(e=>e.id==='source_e0').id='preexisting_segment'},
]
for(let i=0;i<sharing.length;i++){
  const {scene}=sourceFor();sharing[i](scene);const evaluated=m.evaluateGeometryScene3D(scene);assert.equal(evaluated.status,'ok')
  const result=s.createPyramidFromPolygon3D(evaluated.scene,'source',`safe_${i}`);assert.ok(result);assert.equal(result.sourceConsumed,false);assert.equal(result.scene.solids[0].parameters.base.kind,'face')
  for(const group of ['points','linear_objects','planes','faces','edges','constructions','annotations','markings'])for(const object of evaluated.scene[group])assert.deepEqual(result.scene[group].find(o=>o.id===object.id),object)
  fixtures.push({name:`preserved-${i}`,source:evaluated.scene,created:result.scene})
}
const invalid=sourceFor().scene;invalid.faces[0].boundary=['p0','p2','p1','p3'];const before=structuredClone(invalid);assert.equal(s.createPyramidFromPolygon3D(invalid,'source'),null);assert.deepEqual(invalid,before)
const sharedSolid=s.createPyramidOnFace3D(sourceFor().scene,'source','existing')
const sharedResult=s.createPyramidFromPolygon3D(sharedSolid.scene,'source','next')
assert.equal(sharedResult.sourceConsumed,false);assert.deepEqual(sharedResult.scene.solids.find(s=>s.id==='existing'),sharedSolid.scene.solids[0])
const cube=s.createSolid3D(m.emptyGeometryScene3D(),s.defaultSolid3D('cube','owned'))
const ownedFace=cube.scene.solids[0].features.find(f=>f.slot==='f_1').entity_id
const ownedResult=s.createPyramidFromPolygon3D(cube.scene,ownedFace,'on_owned_face')
assert.equal(ownedResult.sourceConsumed,false);assert.equal(ownedResult.reason,'ambiguous_ownership');assert.deepEqual(ownedResult.scene.solids.find(s=>s.id==='owned'),cube.scene.solids[0])
assert.equal(s.createPyramidFromPolygon3D(sourceFor().scene,'missing'),null)
assert.ok(s.createSolid3D(m.emptyGeometryScene3D(),s.defaultSolid3D('pyramid','template')))
if(process.argv.includes('--write-fixtures'))await fs.writeFile(new URL('./geometry_3d_pyramid_consumption_canonical.json',import.meta.url),JSON.stringify(fixtures,null,2)+'\n')
else for(const f of JSON.parse(await fs.readFile(new URL('./geometry_3d_pyramid_consumption_canonical.json',import.meta.url),'utf8')))assert.deepEqual(n.normalizeGeometryScene3D(f.created),f.created)
console.log('PASS: 8 plane/winding conversions, 10 shared/ambiguous fallback cases, exact coordinates/labels, source removal, cancellation, atomic history/IDs, M5 edits, SVG/reload and template compatibility')
