import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring'),plane=await load('geometry3dPlaneAuthoring'),constructed=await load('geometry3dConstructedPlaneAuthoring'),perp=await load('geometry3dPlanePerpendicularAuthoring'),labels=await load('geometry3dPerpendicularAuthoring'),parallel=await load('geometry3dParallelAuthoring'),solid=await load('geometry3dSolidAuthoring')
const records=[]
let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:[0,0,2],label:'P α'}))
source=constructed.createParallelPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},'beta').scene
assert.equal(source.points.find(p=>p.id==='P').visibility,undefined)
const hidden=m.setGeometryPointVisibility3D(source,'P','hidden');assert.ok(hidden)
assert.deepEqual(hidden.constructions,source.constructions);assert.deepEqual(hidden.planes,source.planes)
const withoutVisibility=structuredClone(hidden);delete withoutVisibility.points.find(p=>p.id==='P').visibility;assert.deepEqual(withoutVisibility,source)
for(const projection of ['orthographic','perspective']){
 const camera={...source.print_camera,projection,position:[5,-7,8]},view=p.createProjection3D(camera,800,600),xy=view.screen(view.view([0,0,2])),pointer={pointerId:1,button:0,x:xy[0],y:xy[1],width:800,height:600,altKey:false}
 assert.equal(g.pickGeometry3D(source,camera,pointer,true)?.id,'P');assert.equal(g.pickGeometry3D(hidden,camera,pointer,true),null);assert.notEqual(g.pickGeometry3D(hidden,camera,pointer)?.id,'P')
 const out=p.projectScene3D(hidden,camera,800,600,true);assert.ok(!out.points.some(p=>p.id==='P'));assert.ok(out.faces.some(f=>f.id==='beta'))
 const svg=p.geometrySceneSVG3D({...hidden,print_camera:camera},800,600);assert.ok(!svg.includes('data-id="P"'));assert.ok(!svg.includes('P α'));assert.ok(svg.includes('data-id="beta"'))
 const history=m.createGeometryHistory3D(source,()=>{});assert.ok(history.commit(hidden));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),source);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),hidden)
 const shown=m.setGeometryPointVisibility3D(hidden,'P','visible');assert.ok(shown);assert.equal(g.pickGeometry3D(shown,camera,pointer,true)?.id,'P');assert.ok(p.projectScene3D(shown,camera,800,600,true).points.some(p=>p.id==='P'&&p.label==='P α'))
 const interaction=g.createAuthoringInteraction3D({getScene:()=>hidden,getCamera:()=>camera,commit:()=>{throw Error('Read-only selection')},notify:()=>{}});interaction.select('P');assert.equal(interaction.snapshot().selected,'P')
 const moved=m.moveGeometryPoint3D(hidden,'P',[1,2,3]);assert.ok(moved);assert.equal(moved.points.find(p=>p.id==='P').visibility,'hidden');assert.deepEqual(moved.points.find(p=>p.id==='beta_origin').position,[1,2,3]);assert.equal(moved.constructions[0].through.id,'P')
 for(const q of [source,hidden,shown,moved]){assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(q))),q);records.push(q)}
}
let foot=perp.createPlanePerpendicular3D(source,'P',{kind:'plane',id:'alpha'},'foot').scene
assert.ok(foot);const hiddenLabel=p.projectScene3D(foot,foot.print_camera,800,600,true).points.find(p=>p.id==='foot_H');assert.equal(hiddenLabel.label,null)
foot=labels.editPerpendicularDisplay3D(foot,'foot',{label_visibility:'visible',label:'H α'});assert.equal(p.projectScene3D(foot,foot.print_camera,800,600,true).points.find(p=>p.id==='foot_H').label,'H α')
const hiddenFoot=m.setGeometryPointVisibility3D(foot,'foot_H','hidden');assert.deepEqual(hiddenFoot.constructions,foot.constructions);const out=p.projectScene3D(hiddenFoot,hiddenFoot.print_camera,800,600,true);assert.ok(!out.points.some(p=>p.id==='foot_H'));assert.equal(out.lines.filter(l=>l.role==='right_angle').length,2)
const shownFoot=m.setGeometryPointVisibility3D(hiddenFoot,'foot_H','visible');assert.equal(p.projectScene3D(shownFoot,shownFoot.print_camera,800,600,true).points.find(p=>p.id==='foot_H').label,'H α')
records.push(hiddenFoot)
let helpers=parallel.createPlaneParallel3D(source,'P',{kind:'plane',id:'alpha',angle_radians:.4},'parallel').scene;helpers=m.setGeometryPointVisibility3D(helpers,'parallel_end','visible');helpers=m.setGeometryPointVisibility3D(helpers,'beta_origin','visible');const primitives=p.scenePrimitives3D(helpers).primitives;assert.ok(!primitives.some(p=>p.kind==='point'&&['parallel_end','beta_origin','beta_x','beta_y'].includes(p.id)))
for(const kind of ['cube','cone','sphere']){
 let scene=kind==='cube'?solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','S')).scene:(kind==='cone'?solid.createConeAt3D:solid.createSphereAt3D)(m.emptyGeometryScene3D(),[0,0,0],'XY','S').scene
 const id=scene.solids[0].features.find(f=>f.slot==='v_0').entity_id;scene=m.setGeometryPointVisibility3D(scene,id,'hidden');assert.ok(scene);scene=solid.translateSolid3D(scene,'S',[1,2,3]);assert.ok(scene);assert.equal(scene.points.find(p=>p.id===id).visibility,'hidden');assert.ok(!p.scenePrimitives3D(scene).primitives.some(p=>p.kind==='point'&&p.id===id))
 records.push(scene)
}
for(const visibility of [null,true,'hide',0]){const bad=structuredClone(source);bad.points.find(p=>p.id==='P').visibility=visibility;assert.equal(n.normalizeGeometryScene3D(bad),null);assert.equal(m.setGeometryPointVisibility3D(source,'P',visibility),null)}
assert.equal(m.setGeometryPointVisibility3D(source,'missing','hidden'),null)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} point visibility parity scenes; defaults, marker/label/picking, semantic dependencies, owned points, helper suppression, label controls, history and canonical reload`)
