import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const m=await load('geometry3dModel'),a=await load('geometry3dConstructedPlaneAuthoring'),g=await load('geometry3dGuidedPlane'),p=await load('geometry3dProjection'),plane=await load('geometry3dPlaneAuthoring'),display=await load('geometry3dPlaneDisplay'),pm=await load('geometry3dPlanePerpendicular'),author=await load('geometry3dAuthoring'),n=await load('geometry3d')
const records=[],near=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-9,JSON.stringify({a,b}))
function source(working='XY',normal=false,outside=false){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],working,'alpha').scene,f=pm.planeReference3D(scene,{kind:'plane',id:'alpha'}).frame
 const A=p.add(p.scale(f.normal,1),p.scale(f.y,outside?10:0)),B=p.add(A,normal?p.scale(f.normal,2):p.add(p.scale(f.x,2),p.scale(f.normal,1)))
 scene=m.transactGeometryScene3D(scene,s=>{s.points.push({id:'A',position:A,label:'A'},{id:'B',position:B,label:'B'});s.linear_objects.push({id:'l',kind:'line',a:'A',b:'B'},{id:'s',kind:'segment',a:'A',b:'B'})});assert.ok(scene);return scene
}
function check(scene){
 const c=scene.constructions.find(c=>c.kind==='perpendicular_plane_on_line'),f=pm.planeReference3D(scene,c.reference).frame,b=pm.planeReference3D(scene,{kind:'plane',id:c.output_plane_id}).frame
 for(const id of g.planeGuidePointIds3D(scene,c.guide)){const P=scene.points.find(p=>p.id===id).position;assert.ok(Math.abs(p.dot(p.sub(P,b.origin),b.normal))<1e-9)}
 assert.ok(Math.abs(p.dot(f.normal,b.normal))<1e-9)
 const line=g.guidedIntersectionSegments3D(scene,c.reference,c.guide)
 for(const segment of line)for(const point of segment){assert.ok(Math.abs(p.dot(p.sub(point,f.origin),f.normal))<1e-9);assert.ok(Math.abs(p.dot(p.sub(point,b.origin),b.normal))<1e-9)}
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 for(const projection of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection,position:[8,-9,10],target:b.origin},svg=p.geometrySceneSVG3D({...scene,print_camera:camera},800,600)
  assert.ok(svg.includes('data-id="beta"'));if(line.length)assert.ok(svg.includes('data-render-curve="plane_intersection"'))
  const projected=p.projectScene3D(scene,camera,800,600,true);assert.equal(projected.status,'ok');assert.ok(projected.lines.filter(l=>l.role==='plane_intersection').every(l=>l.kind==='segment'))
 }
 records.push(scene)
}
for(const working of ['XY','XZ','YZ'])for(const normal of [false,true])for(const guide of [{kind:'points',a:'A',b:'B'},{kind:'linear',id:'l'},{kind:'linear',id:'s'}]){
 const start=source(working,normal),created=a.createGuidedPerpendicularPlane3D(start,{kind:'plane',id:'alpha'},guide,'beta');assert.ok(created.scene,created.error);assert.equal(created.ambiguous,normal);let scene=created.scene;check(scene)
 assert.equal(scene.points.length,start.points.length+3);assert.equal(scene.linear_objects.length,start.linear_objects.length)
 let resized=plane.resizePlaneDisplay3D(scene,'alpha',8,9);assert.ok(resized);assert.equal(resized.planes.find(p=>p.id==='beta').display.width,8);assert.equal(resized.planes.find(p=>p.id==='beta').display.height,9);check(resized)
 resized=plane.resizePlaneDisplay3D(resized,'beta',4,6);resized=plane.resizePlaneDisplay3D(resized,'alpha',16,18);assert.equal(resized.planes.find(p=>p.id==='beta').display.width,8);assert.equal(resized.planes.find(p=>p.id==='beta').display.height,12)
 const rotated=plane.transformPlane3D(scene,'alpha',[.2,.3,.4],[1,2,3],.7);assert.ok(rotated);check(rotated)
 const updated=m.moveGeometryPoint3D(scene,'B',p.add(scene.points.find(p=>p.id==='B').position,[.2,.4,.3]));assert.ok(updated);check(updated);assert.deepEqual(updated.constructions,scene.constructions)
 const trimmed=m.transactGeometryScene3D(scene,s=>s.planes.find(p=>p.id==='beta').display.lower_portion='upper');assert.ok(trimmed);const d=display.planeDisplay3D(trimmed.planes.find(p=>p.id==='beta'),trimmed);assert.ok(d.contour.every(q=>p.dot(p.sub(q,d.o),d.y)>=-1e-9))
 const hidden=m.transactGeometryScene3D(trimmed,s=>s.planes.find(p=>p.id==='beta').display.intersection_visibility='hidden');assert.ok(hidden);assert.equal(p.scenePrimitives3D(hidden).primitives.filter(l=>l.role==='plane_intersection').length,0)
 const history=m.createGeometryHistory3D(scene,()=>{});assert.ok(history.commit(hidden));assert.ok(history.provider.undo());assert.ok(history.provider.redo())
 const deleted=author.deletePrimitive3D(hidden,'alpha');assert.ok(deleted);assert.equal(deleted.scene.constructions.length,0);assert.deepEqual(deleted.scene.planes.find(p=>p.id==='beta'),hidden.planes.find(p=>p.id==='beta'));assert.ok(!deleted.scene.points.some(p=>p.id.startsWith('alpha_')))
 const output=author.deletePrimitive3D(scene,'beta');assert.ok(output);assert.ok(!output.scene.points.some(p=>p.id.startsWith('beta_')))
 if(guide.kind==='points'){const lost=author.deletePrimitive3D(scene,'B');assert.ok(lost===null,'A point still used by ordinary lines remains protected')}
 else {const lost=author.deletePrimitive3D(scene,guide.id);assert.ok(lost);assert.equal(lost.scene.constructions.length,0);assert.ok(lost.scene.planes.some(p=>p.id==='beta'))}
 for(const shape of ['rectangle','parallelogram','cloud']){const shaped=plane.setPlaneShape3D(scene,'alpha',shape,.3);assert.ok(g.guidedIntersectionSegments3D(shaped,{kind:'plane',id:'alpha'},guide).length)}
}
const outside=a.createGuidedPerpendicularPlane3D(source('XY',false,true),{kind:'plane',id:'alpha'},{kind:'linear',id:'l'},'beta');assert.ok(outside.scene);assert.equal(g.guidedIntersectionSegments3D(outside.scene,{kind:'plane',id:'alpha'},{kind:'linear',id:'l'}).length,0);check(outside.scene)
for(const guide of [{kind:'points',a:'A',b:'A'},{kind:'points',a:'A',b:'missing'},{kind:'linear',id:'missing'},{kind:'linear',id:'alpha'}])assert.equal(a.createGuidedPerpendicularPlane3D(source(),{kind:'plane',id:'alpha'},guide,'beta').scene,null)
const coincident=source();coincident.points.find(p=>p.id==='B').position=[...coincident.points.find(p=>p.id==='A').position];assert.equal(a.createGuidedPerpendicularPlane3D(coincident,{kind:'plane',id:'alpha'},{kind:'linear',id:'l'},'beta').scene,null)
// Guided browser-independent pointer workflow: alpha first, then two existing points.
for(const projection of ['orthographic','perspective'])for(const input of ['points','line','segment']){
 let doc=source();doc=m.transactGeometryScene3D(doc,s=>{s.linear_objects=input==='points'?[]:[s.linear_objects.find(l=>l.kind===input)]});const camera={...doc.print_camera,projection,position:[7,-8,9]},view=p.createProjection3D(camera,800,600),pointer=world=>{const q=view.screen(view.view(world));return {pointerId:1,button:0,x:q[0],y:q[1],width:800,height:600}},click=(i,world)=>{const q=pointer(world);i.pointer('down',q);i.pointer('up',q)};let commits=0
 const i=author.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{doc=s;commits++;return true},notify:()=>{}}),initial=structuredClone(doc)
 const begin=()=>{i.setTool('perpendicular');i.setPerpendicularOutput('guided_plane');click(i,[-1,-1,0]);const A=doc.points.find(p=>p.id==='A').position,B=doc.points.find(p=>p.id==='B').position;if(input==='points'){click(i,A);click(i,B)}else click(i,p.scale(p.add(A,B),.5))}
 begin();assert.equal(i.snapshot().guidedPlanePreview,true);assert.ok(i.snapshot().guidedIntersectionPreview.length);assert.equal(commits,0);i.cancel();assert.deepEqual(doc,initial)
 begin();assert.ok(i.finish());assert.equal(commits,1);assert.equal(doc.constructions[0].kind,'perpendicular_plane_on_line')
}
// True polygon clipping includes a line coincident with a display boundary.
const contour=[[-2,-1,0],[2,-1,0],[2,1,0],[-2,1,0]]
assert.deepEqual(g.clipLineToPlaneContour3D([0,1,0],[1,1,0],contour,[1,0,0],[0,1,0]),[[[-2,1,0],[2,1,0]]])
assert.equal(g.clipLineToPlaneContour3D([0,2,0],[1,2,0],contour,[1,0,0],[0,1,0]).length,0)
let trimmed=a.createGuidedPerpendicularPlane3D(source(),{kind:'plane',id:'alpha'},{kind:'points',a:'A',b:'B'},'beta').scene
trimmed=m.transactGeometryScene3D(trimmed,s=>s.planes.find(p=>p.id==='beta').display.lower_portion='upper')
let resizedDoc=trimmed,resizeCommits=0;const camera={...trimmed.print_camera,position:[7,-8,9]},view=p.createProjection3D(camera,800,600),d=display.planeDisplay3D(trimmed.planes.find(p=>p.id==='beta'),trimmed),grip=d.grips.find(g=>g.u===-1&&g.v===1),pointer=world=>{const q=view.screen(view.view(world));return {pointerId:1,button:0,x:q[0],y:q[1],width:800,height:600}}
const interaction=author.createAuthoringInteraction3D({getScene:()=>resizedDoc,getCamera:()=>camera,commit:s=>{resizedDoc=s;resizeCommits++;return true},notify:()=>{}});interaction.select('beta');interaction.setTool('select');interaction.pointer('down',pointer(grip.position));interaction.pointer('move',{...pointer(p.add(grip.position,p.scale(d.y,.5))),button:-1});interaction.pointer('up',pointer(p.add(grip.position,p.scale(d.y,.5))));assert.equal(resizeCommits,1);assert.ok(Math.abs(resizedDoc.planes.find(p=>p.id==='beta').display.height-4)<1e-9)
const withoutLines=m.transactGeometryScene3D(source(),s=>{s.linear_objects=[]}),twoPoint=a.createGuidedPerpendicularPlane3D(withoutLines,{kind:'plane',id:'alpha'},{kind:'points',a:'A',b:'B'},'beta').scene
assert.ok(author.deletePrimitive3D(twoPoint,'B'));assert.equal(plane.transformPlane3D(twoPoint,'beta',[1,0,0]),null)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} guided-plane parity scenes; incidence/perpendicularity 1e-9, linked sizes, trim, clipping, transforms, history, deletion/freeze and both projections`)
