import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dConstructedPlaneAuthoring'),math=await load('geometry3dConstructedPlane'),plane=await load('geometry3dPlaneAuthoring'),pm=await load('geometry3dPlanePerpendicular'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring'),solid=await load('geometry3dSolidAuthoring')
const records=[],near=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-9,JSON.stringify({a,b}))
function check(scene){
 const c=scene.constructions.find(c=>c.kind==='constructed_plane'&&c.relation==='perpendicular'),P=scene.points.find(p=>p.id===c.through.id).position,f=pm.planeReference3D(scene,c.reference).frame,b=pm.planeReference3D(scene,{kind:'plane',id:c.output_plane_id}).frame
 const intersection=math.perpendicularPlaneIntersection3D(scene,c.through.id,c.reference,c.orientation.angle_radians)
 for(const q of intersection){assert.ok(Math.abs(p.dot(p.sub(q,f.origin),f.normal))<1e-9);assert.ok(Math.abs(p.dot(p.sub(q,b.origin),b.normal))<1e-9)}
 near(p.sub(intersection[1],intersection[0]),b.x)
 const primitives=p.scenePrimitives3D(scene).primitives;assert.deepEqual(primitives.filter(l=>l.role==='plane_intersection').map(l=>[l.a,l.b]),math.perpendicularPlaneDisplay3D(scene,c.through.id,c.reference,c.orientation.angle_radians).segments)
 const hidden=m.transactGeometryScene3D(scene,s=>s.planes.find(p=>p.id===c.output_plane_id).display.intersection_visibility='hidden');assert.ok(hidden);assert.equal(p.scenePrimitives3D(hidden).primitives.filter(l=>l.role==='plane_intersection').length,0);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(hidden))),hidden)
 const shown=m.transactGeometryScene3D(hidden,s=>s.planes.find(p=>p.id===c.output_plane_id).display.intersection_visibility='visible');assert.ok(shown);assert.deepEqual(p.scenePrimitives3D(shown).primitives.filter(l=>l.role==='plane_intersection').map(l=>[l.a,l.b]),math.perpendicularPlaneDisplay3D(shown,c.through.id,c.reference,c.orientation.angle_radians).segments);assert.deepEqual(shown.points,scene.points);assert.deepEqual(shown.constructions,scene.constructions);const visibilityHistory=m.createGeometryHistory3D(scene,()=>{});assert.ok(visibilityHistory.commit(hidden));assert.ok(visibilityHistory.provider.undo());assert.ok(visibilityHistory.provider.redo());const editedHidden=a.editPerpendicularPlaneOrientation3D(hidden,c.output_plane_id,.91);assert.ok(editedHidden);assert.equal(p.scenePrimitives3D(editedHidden).primitives.filter(l=>l.role==='plane_intersection').length,0)
 near(b.origin,P);assert.ok(Math.abs(p.dot(b.normal,f.normal))<1e-9);near(b.y,f.normal);assert.ok(c.orientation.angle_radians>=0&&c.orientation.angle_radians<2*Math.PI)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
 const before=JSON.stringify(scene)
 for(const projection of ['orthographic','perspective'])for(const position of [[7,-8,9],[-6,4,5],[3,4,-7]]){
  const camera={...scene.print_camera,projection,position:p.add(P,position),target:P,vertical_span:12},view=p.projectScene3D(scene,camera,800,600,true),svg=p.geometrySceneSVG3D({...scene,print_camera:camera},800,600)
  const expected=math.perpendicularPlaneSurface3D(scene,c.through.id,c.reference,c.orientation.angle_radians).polygons,projector=p.createProjection3D(camera,800,600);assert.equal(view.faces.filter(f=>f.id===c.output_plane_id).length,expected.filter(q=>projector.polygon(q).length>=3).length);assert.ok(!view.points.some(p=>c.output_point_ids.includes(p.id)));assert.equal(svg.includes(`<polygon data-id="${c.output_plane_id}"`),view.faces.some(f=>f.id===c.output_plane_id));assert.ok(!svg.includes('data-plane-orientation-handle'));assert.equal(JSON.stringify(scene),before)
 }
 records.push(scene)
}
for(const working of ['XY','XZ','YZ'])for(const on of [false,true])for(const angle of [0,Math.PI/4,Math.PI/2,-.7,2*Math.PI+.3]){
 let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[.1,.2,.3],working,'alpha').scene
 const f=pm.planeReference3D(source,{kind:'plane',id:'alpha'}).frame,P=p.add(p.add(f.origin,p.scale(f.x,.4)),p.scale(f.normal,on?0:2))
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:P,label:'P α',visibility:'hidden'}))
 const result=a.createPerpendicularPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},angle,'beta');assert.ok(result.scene,result.error);assert.equal(result.coincident,false);let scene=result.scene;check(scene)
 const c=scene.constructions[0],ids=[...c.output_point_ids];assert.equal(scene.points.find(p=>p.id==='P').visibility,'hidden');near(scene.points.find(p=>p.id==='P').position,P)
 const rotated=plane.transformPlane3D(scene,'alpha',[.3,-.2,.1],[1,2,3],.8);assert.ok(rotated);check(rotated);near(rotated.points.find(p=>p.id==='P').position,P)
 const moved=m.moveGeometryPoint3D(rotated,'P',p.add(P,[1,2,3]));assert.ok(moved);check(moved)
 let downstream=a.createParallelPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'beta'},'gamma').scene;assert.ok(downstream)
 const reordered=structuredClone(downstream);reordered.constructions.reverse();assert.deepEqual(m.evaluateGeometryScene3D(reordered).scene,downstream)
 const edited=a.editPerpendicularPlaneOrientation3D(downstream,'beta',1.2);assert.ok(edited);assert.deepEqual(edited.constructions.find(c=>c.output_plane_id==='beta').output_point_ids,ids);assert.deepEqual(edited.constructions.find(c=>c.output_plane_id==='gamma'),downstream.constructions.find(c=>c.output_plane_id==='gamma'));near(pm.planeReference3D(edited,{kind:'plane',id:'gamma'}).frame.normal,pm.planeReference3D(edited,{kind:'plane',id:'beta'}).frame.normal)
 for(const shape of ['rectangle','parallelogram','cloud']){const shaped=plane.setPlaneShape3D(scene,'beta',shape,.4),sized=plane.resizePlaneDisplay3D(shaped,'beta',6,5),next=a.editPerpendicularPlaneOrientation3D(sized,'beta',.9);assert.ok(next);assert.deepEqual(next.planes.find(p=>p.id==='beta').display,sized.planes.find(p=>p.id==='beta').display)}
 assert.equal(plane.transformPlane3D(scene,'beta',[1,0,0]),null);assert.equal(m.moveGeometryPoint3D(scene,ids[1],[9,9,9]),null)
 const deleted=g.deletePrimitive3D(scene,'alpha');assert.ok(deleted);assert.equal(deleted.scene.constructions.length,0);assert.equal(p.scenePrimitives3D(deleted.scene).primitives.filter(l=>l.role==='plane_intersection').length,0);ids.forEach(id=>near(deleted.scene.points.find(p=>p.id===id).position,scene.points.find(p=>p.id===id).position));assert.ok(!deleted.scene.points.some(p=>p.id.startsWith('alpha_')))
 const sourceDeleted=g.deletePrimitive3D(downstream,'P');assert.ok(sourceDeleted);assert.equal(sourceDeleted.scene.constructions.length,0);assert.ok(sourceDeleted.scene.planes.some(p=>p.id==='beta'))
 const outputDeleted=g.deletePrimitive3D(downstream,'beta');assert.ok(outputDeleted);assert.ok(!outputDeleted.scene.points.some(p=>ids.includes(p.id)));assert.ok(outputDeleted.scene.planes.some(p=>p.id==='gamma'));assert.equal(outputDeleted.scene.constructions.length,0)
 const protectedScene=m.transactGeometryScene3D(scene,s=>s.linear_objects.push({id:'L',kind:'segment',a:ids[1],b:'P'}));assert.ok(protectedScene);assert.equal(g.deletePrimitive3D(protectedScene,'beta'),null)
 const history=m.createGeometryHistory3D(scene,()=>{});assert.ok(history.commit(edited));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),scene);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),edited)
 for(const mutate of [s=>s.constructions[0].reference.id='beta',s=>s.constructions[0].through.id=ids[1],s=>s.constructions[0].orientation={kind:'unique'},s=>s.constructions[0].relation='parallel',s=>s.constructions.push({...s.constructions[0],id:'duplicate'})]){const bad=structuredClone(scene);mutate(bad);assert.equal(n.normalizeGeometryScene3D(bad),null)}
 for(const invalid of [NaN,Infinity,undefined]){assert.equal(a.createPerpendicularPlaneThroughPoint3D(source,'P',{kind:'plane',id:'alpha'},invalid).scene,null);assert.equal(a.editPerpendicularPlaneOrientation3D(scene,'beta',invalid),null)}
}
{
 let scene=solid.createSolid3D(m.emptyGeometryScene3D(),solid.defaultSolid3D('cube','cube')).scene
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,3],label:'P'}));scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'face',id:'cube_f_0'},.7,'beta').scene;assert.ok(scene);check(scene)
 const rotated=solid.rotateSolid3D(scene,'cube',[1,2,3],.6);assert.ok(rotated);check(rotated);const removed=solid.deleteSolid3D(rotated,'cube');assert.ok(removed);assert.equal(removed.scene.constructions.length,0)
}
for(const working of ['XY','XZ','YZ','oblique'])for(const projection of ['orthographic','perspective']){
 let source=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],working==='oblique'?'XY':working,'alpha').scene
 if(working==='oblique')source=plane.transformPlane3D(source,'alpha',[0,0,0],[1,2,0],.4)
 const f=pm.planeReference3D(source,{kind:'plane',id:'alpha'}).frame,P=p.scale(f.normal,2),referenceTarget=p.add(p.scale(f.x,.7),p.scale(f.y,.4))
 source=m.transactGeometryScene3D(source,s=>s.points.push({id:'P',position:P,label:'P',visibility:'visible'}))
 const camera={...source.print_camera,projection,position:p.add(P,p.add(p.scale(f.x,5),p.add(p.scale(f.y,-7),p.scale(f.normal,8)))),target:P},view=p.createProjection3D(camera,800,600),pointer=world=>{const xy=view.screen(view.view(world));return {pointerId:1,button:0,x:xy[0],y:xy[1],width:800,height:600,altKey:false}}
 let doc=source,commits=0;const history=m.createGeometryHistory3D(source,s=>{doc=s}),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:q=>{commits++;return history.commit(q)},notify:()=>{}})
 const click=world=>{const q=pointer(world);i.pointer('down',q);i.pointer('up',q)}
 const startCreation=()=>{i.select('P');i.setTool('perpendicular');i.setPerpendicularOutput('plane');assert.deepEqual(i.snapshot().pending,[]);assert.match(i.snapshot().message,/reference plane first/);click(P);assert.equal(i.snapshot().planeOrientationSelection,false);assert.deepEqual(i.snapshot().pending,[]);assert.equal(i.finish(),false);assert.equal(commits,0);click(referenceTarget);assert.equal(i.snapshot().planeOrientationSelection,false);assert.match(i.snapshot().message,/point P second/);click(referenceTarget);assert.equal(i.snapshot().planeOrientationSelection,false);assert.deepEqual(i.snapshot().pending,[]);click(P);assert.equal(i.snapshot().planeOrientationSelection,true);assert.deepEqual(i.snapshot().pending,['P'])}
 const drag=angle=>{const start=pointer(i.snapshot().orientationHandlePreview[1]),end={...pointer(p.add(P,p.scale(p.add(p.scale(f.x,Math.cos(angle)),p.scale(f.y,Math.sin(angle))),2))),button:-1};i.pointer('down',start);i.pointer('move',end);i.pointer('up',{...end,button:0});i.pointer('cancel',end)}
 startCreation();assert.equal(i.snapshot().intersectionLinePreview.length,1);assert.equal(i.snapshot().planeOrientationChosen,false);assert.equal(i.finish(),false);assert.deepEqual(doc,source);assert.equal(commits,0)
 let q=pointer(i.snapshot().orientationHandlePreview[1]);i.pointer('down',q);i.pointer('up',q);assert.equal(i.snapshot().planeOrientationChosen,false)
 const beforeIntersection=i.snapshot().intersectionLinePreview;drag(.8);assert.notDeepEqual(i.snapshot().intersectionLinePreview,beforeIntersection);i.snapshot().previewSurfacePolygons.forEach((polygon,j)=>polygon.forEach((q,k)=>near(q,math.perpendicularPlaneSurface3D(doc,'P',{kind:'plane',id:'alpha'},.8).polygons[j][k])));assert.equal(i.snapshot().planeOrientationChosen,true);assert.equal(commits,0);i.cancel();assert.deepEqual(i.snapshot().previewSurfacePolygons,[]);assert.deepEqual(doc,source)
 startCreation();drag(.8);const surfacePreview=i.snapshot().previewSurfacePolygons;assert.deepEqual(doc,source);assert.equal(i.pointer('wheel',q),false);assert.ok(i.finish());assert.equal(commits,1);assert.deepEqual(p.displayPrimitives3D(p.scenePrimitives3D(doc).primitives).primitives.filter(q=>q.kind==='plane'&&q.id===doc.constructions[0].output_plane_id).map(q=>q.displayPatch),surfacePreview);assert.deepEqual(i.snapshot().previewSurfacePolygons,[])
 assert.equal(i.snapshot().planeOrientationSelection,false);assert.deepEqual(i.snapshot().orientationHandlePreview,[])
 const initial=structuredClone(doc),c=doc.constructions[0],ids=c.output_point_ids;assert.equal(doc.planes.find(p=>p.id===c.output_plane_id).display.intersection_mode,'cross');assert.deepEqual(c.reference,{kind:'plane',id:'alpha'});assert.equal(c.through.id,'P');assert.ok(Math.abs(c.orientation.angle_radians-.8)<1e-9)
 assert.ok(i.editPlaneOrientation(c.output_plane_id));assert.ok(i.finish());assert.equal(commits,1);assert.deepEqual(doc,initial)
 assert.ok(i.editPlaneOrientation(c.output_plane_id));drag(1.4);i.cancel();assert.deepEqual(doc,initial);assert.equal(commits,1)
 assert.ok(i.editPlaneOrientation(c.output_plane_id));q=pointer(i.snapshot().orientationHandlePreview[1]);i.pointer('down',q);i.pointer('cancel',q);assert.equal(i.snapshot().planeOrientationSelection,false);assert.deepEqual(doc,initial)
 assert.ok(i.editPlaneOrientation(c.output_plane_id));drag(1.4);assert.ok(i.finish());assert.equal(commits,2);assert.equal(doc.constructions[0].output_plane_id,c.output_plane_id);assert.deepEqual(doc.constructions[0].output_point_ids,ids);assert.deepEqual(doc.print_camera,initial.print_camera)
 assert.ok(history.provider.undo());assert.deepEqual(doc,initial);assert.ok(history.provider.redo());assert.ok(Math.abs(doc.constructions[0].orientation.angle_radians-1.4)<1e-9)
 assert.equal(i.editPlaneOrientation('alpha'),false)
}
// Display bounds are independent of semantic geometry and camera projection.
const clip=await load('geometry3dGuidedPlane'),display=await load('geometry3dPlaneDisplay')
for(const shape of ['rectangle','parallelogram','cloud'])for(const offset of [0,3])for(const outside of [false,true])for(const angle of [0,.6]){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[1,2,3],'XY','alpha').scene
 scene=plane.resizePlaneDisplay3D(scene,'alpha',.4,.3);scene=plane.setPlaneShape3D(scene,'alpha',shape,.7);scene=plane.transformPlane3D(scene,'alpha',[2,-1,3],[1,2,3],.6)
 const ref={kind:'plane',id:'alpha'},f=pm.planeReference3D(scene,ref).frame,P=p.add(f.origin,p.add(p.scale(f.normal,offset),p.scale(f.y,outside?4:0)))
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:P,label:null}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',ref,angle,'beta').scene
 const before=JSON.stringify(scene),bounds=math.perpendicularPlaneDisplay3D(scene,'P',ref,angle),contour=display.planeDisplay3D(scene.planes[0],scene).contour
 const expected=clip.clipLineToPlaneContour3D(...math.perpendicularPlaneIntersection3D(scene,'P',ref,angle),contour,f.x,f.y)
 assert.deepEqual(bounds.segments,expected);assert.equal(bounds.indicator.length,outside?0:2);assert.equal(bounds.segments.length,outside?0:1)
 if(!outside){
  for(const q of bounds.indicator){assert.ok(Math.abs(p.dot(p.sub(q,P),f.normal))<1e-9);assert.ok(clip.clipLineToPlaneContour3D(q,p.add(q,f.x),bounds.contour,f.x,f.y).some(([a,b])=>p.dot(p.sub(a,q),f.x)<=1e-9&&p.dot(p.sub(b,q),f.x)>=-1e-9))}
 }
 const guides=p.scenePrimitives3D(scene).primitives.filter(l=>l.role==='plane_intersection');assert.ok(guides.every(l=>l.kind==='segment'));assert.deepEqual(guides.map(l=>[l.a,l.b]),expected)
 for(const projection of ['orthographic','perspective']){
  const camera={...scene.print_camera,projection,position:p.add(f.origin,[8,-9,10]),target:f.origin,vertical_span:20},svg=p.geometrySceneSVG3D({...scene,print_camera:camera},800,600),view=p.createProjection3D(camera,800,600)
  assert.equal(svg.includes('data-render-curve="plane_intersection"'),!outside)
  const actual=p.projectScene3D(scene,camera,800,600,true).lines.filter(l=>l.role==='plane_intersection')
  assert.deepEqual(actual.map(l=>[l.a,l.b]),expected.flatMap(([a,b])=>{const line=view.line(a,b,'segment');return line?[line.map(view.screen)]:[]}))
  const interaction=g.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>camera,commit:()=>{assert.fail('preview must not commit')},notify:()=>{}})
  assert.ok(interaction.editPlaneOrientation('beta'));assert.deepEqual(interaction.snapshot().intersectionLinePreview,expected);assert.deepEqual(interaction.snapshot().orientationHandlePreview,bounds.indicator)
  const q=view.screen(view.view(outside?P:bounds.indicator[1])),pointer={pointerId:1,button:0,x:q[0],y:q[1],width:800,height:600,altKey:false}
  interaction.pointer('down',pointer);assert.equal(interaction.snapshot().dragging,!outside);interaction.cancel()
 }
 assert.equal(JSON.stringify(scene),before)
}
for(const angle of [-2*Math.PI,-.3,0,Math.PI,2*Math.PI,30]){const value=math.normalizePlaneAngle3D(angle);assert.ok(value>=0&&value<2*Math.PI)}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} perpendicular-plane parity scenes; 1e-9 invariants, local orientation/rotations, hidden P, nested outputs, pointer capture, explicit confirmation, stable-ID editing, no-op/cancel/history, freeze/delete and SVG`)
