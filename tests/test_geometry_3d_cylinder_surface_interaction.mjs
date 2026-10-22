import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const m=await loadGeometryModule('geometry3dModel'),a=await loadGeometryModule('geometry3dSolidAuthoring'),g=await loadGeometryModule('geometry3dAuthoring'),p=await loadGeometryModule('geometry3dProjection'),n=await loadGeometryModule('geometry3d'),analytic=await loadGeometryModule('geometry3dAnalytic'),picking=await loadGeometryModule('geometry3dCylinderPicking'),api=await loadGeometryModule('geometry3dSurfacePoints'),ribbon=await loadGeometryModule('geometryRibbonMenu')
const fixtures=[],close=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-8,`${a} != ${b}`)
const pointer=(camera,world)=>{const projection=p.createProjection3D(camera,800,600),screen=projection.screen(projection.view(world));return {x:screen[0],y:screen[1],width:800,height:600,pointerId:1,button:0,altKey:false}}
const click=(i,q)=>{assert.equal(i.pointer('down',q),true);assert.equal(i.pointer('up',q),true)}
function harness(source,camera){
 let scene=source,commits=0,liveCamera=camera
 const history=m.createGeometryHistory3D(source,v=>scene=v)
 const interaction=g.createAuthoringInteraction3D({getScene:()=>scene,getCamera:()=>liveCamera,commit:v=>{commits++;return history.commit(v)},notify:()=>{}})
 return {interaction,history,scene:()=>scene,commits:()=>commits,setCamera:c=>liveCamera=c}
}
assert.equal(ribbon.GEOMETRY_RIBBON.find(c=>c.action==='point').action3D,'point','unified Point command activates the existing 3D tool')
for(const plane of ['XY','XZ','YZ'])for(const rotated of [false,true])for(const projection of ['orthographic','perspective']){
 let source=a.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],plane,'C').scene
 source=a.translateSolid3D(source,'C',[.3,-.4,.2])
 if(rotated)source=a.rotateSolid3D(source,'C',[1,2,3],.6)
 source=a.resizeCylinder3D(source,'C','radius',1.4);source=a.resizeCylinder3D(source,'C','height',3.2)
 let solid=source.solids[0];const frame=analytic.analyticFrame3D(solid.frame),target=frame.toWorld([0,0,solid.parameters.height/2])
 const other=a.defaultCylinder3D('Other');other.frame={...structuredClone(solid.frame),origin:p.add(solid.frame.origin,p.scale(frame.y,7))};source=a.createSolid3D(source,other).scene
 const camera={...source.print_camera,projection,position:p.add(target,p.add(p.scale(frame.x,10),p.scale(frame.z,2))),target,up:frame.z,vertical_span:9}
 const h=harness(source,camera),i=h.interaction,startUV=[.94,.35],endUV=[.06,.65],startWorld=analytic.evaluateAnalyticSurface3D(solid,startUV),endWorld=analytic.evaluateAnalyticSurface3D(solid,endUV),start=pointer(camera,startWorld),end=pointer(camera,endWorld)
 const hit=picking.pickCylinderSurface3D(source,camera,start);assert.ok(hit);assert.equal(hit.surface_id,'C_surface');close(hit.position,startWorld)
 i.setTool('point');click(i,start);assert.equal(h.commits(),1)
 const created=h.scene(),c=created.constructions.find(c=>c.kind==='point_on_surface'),id=c.output_point_id;assert.equal(c.surface_id,hit.surface_id);close(created.points.find(p=>p.id===id).position,startWorld);assert.equal(created.points.find(p=>p.id===id).label,null)
 fixtures.push(created)
 click(i,start);assert.equal(h.commits(),1,'point snapping reuses existing attachment')
 i.setTool('select');i.select(id)
 // Escape uses cancel(); pointercancel and foreign pointer events cannot publish.
 for(const cancel of ['escape','pointer']){
  i.pointer('down',start);assert.equal(i.snapshot().dragging,true);assert.equal(i.pointer('wheel',start),true);i.pointer('move',end);assert.ok(i.snapshot().draft);assert.equal(h.scene(),created)
  if(cancel==='escape')i.cancel();else i.pointer('cancel',end)
  i.pointer('up',end);assert.equal(h.commits(),1);assert.deepEqual(h.scene(),created)
 }
 i.pointer('down',start);i.pointer('move',end);i.pointer('move',start);i.pointer('up',start);assert.equal(h.commits(),1,'returning to grab position is a no-op')
 click(i,start);assert.equal(h.commits(),1,'click does not create history')
 // Preserve the screen grab offset and fixed camera, and cross the azimuth seam.
 const grab={...start,x:start.x+2,y:start.y+1},drop={...end,x:end.x+2,y:end.y+1}
 i.pointer('down',grab);i.pointer('move',{...drop,pointerId:22});i.pointer('cancel',{...drop,pointerId:22});assert.equal(i.snapshot().draft,null);assert.equal(i.snapshot().dragging,true)
 h.setCamera({...camera,position:p.add(camera.position,[1,1,0])})
 const seam=pointer(camera,analytic.evaluateAnalyticSurface3D(solid,[0,.5]));i.pointer('move',{...seam,x:seam.x+2,y:seam.y+1});assert.ok(i.snapshot().draft)
 i.pointer('move',drop);const valid=i.snapshot().draft;assert.ok(valid);close(valid.points.find(p=>p.id===id).position,endWorld);assert.equal(h.commits(),1)
 i.pointer('move',{...drop,x:5000,y:5000});assert.deepEqual(i.snapshot().draft,valid,'missing ray holds last valid preview')
 i.pointer('up',drop);h.setCamera(camera);assert.equal(h.commits(),2)
 const dragged=h.scene();assert.equal(dragged.constructions.find(v=>v.id===c.id).output_point_id,id);assert.deepEqual(dragged.solids,created.solids,'point drag cannot move or resize cylinders');assert.deepEqual(dragged.points.filter(p=>p.id!==id),created.points.filter(p=>p.id!==id));assert.equal(dragged.points.find(p=>p.id===id).label,null)
 assert.ok(Math.abs(dragged.constructions.find(v=>v.id===c.id).uv[0]-endUV[0])<1e-10)
 h.history.provider.undo();assert.deepEqual(h.scene(),created);h.history.provider.redo();assert.deepEqual(h.scene(),dragged)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(dragged))),dragged);assert.ok(p.geometrySceneSVG3D({...dragged,print_camera:camera}).includes(`data-id="${id}"`));fixtures.push(dragged)
 // UV edits preserve labels and downstream dependents without replacing the recipe.
 const dependent=m.transactGeometryScene3D(dragged,d=>{d.points.find(p=>p.id===id).label='S';d.points.push({id:'mid',position:[0,0,0],label:'M'});d.constructions.push({id:'mid_recipe',kind:'midpoint',a:id,b:'C_v_0',output_point_id:'mid'})})
 const dependentDrag=harness(dependent,camera);dependentDrag.interaction.setTool('select');dependentDrag.interaction.select(id);dependentDrag.interaction.pointer('down',end);dependentDrag.interaction.pointer('move',start);dependentDrag.interaction.pointer('up',start)
 assert.equal(dependentDrag.commits(),1);assert.equal(dependentDrag.scene().points.find(p=>p.id===id).label,'S');close(dependentDrag.scene().points.find(p=>p.id==='mid').position,p.scale(p.add(startWorld,dependent.points.find(p=>p.id==='C_v_0').position),.5))
 const edited=api.editPointOnCylinderSurface3D(dependent,id,[1,.5]);assert.ok(edited);assert.deepEqual(edited.constructions.find(v=>v.id===c.id).uv,[0,.5]);assert.equal(edited.points.find(p=>p.id===id).label,'S');close(edited.points.find(p=>p.id==='mid').position,p.scale(p.add(edited.points.find(p=>p.id===id).position,edited.points.find(p=>p.id==='C_v_0').position),.5))
 for(const uv of [[0,-.1],[0,1.1],[NaN,0],[0,Infinity],[true,0]])assert.equal(api.editPointOnCylinderSurface3D(dependent,id,uv),null)
 const deleted=a.deleteSolid3D(edited,'C');assert.ok(deleted);assert.deepEqual(deleted.scene.points,edited.points);assert.ok(deleted.scene.constructions.some(v=>v.id==='mid_recipe'));assert.ok(!deleted.scene.constructions.some(v=>v.id===c.id));fixtures.push(deleted.scene)
 // A nearer cylinder cannot redirect a constrained drag onto its surface.
 const cover=a.defaultCylinder3D('Cover');cover.parameters=structuredClone(solid.parameters);cover.frame={...structuredClone(solid.frame),origin:p.add(solid.frame.origin,p.add(p.scale(frame.x,4),p.scale(frame.z,.8)))};const covered=a.createSolid3D(dragged,cover).scene
 assert.equal(picking.pickCylinderSurface3D(covered,camera,end,'C_surface'),null)
 assert.equal(picking.pickCylinderSurface3D(covered,camera,end).surface_id,'Cover_surface')
 const coverInteraction=harness(covered,camera);coverInteraction.interaction.setTool('point');click(coverInteraction.interaction,end)
 assert.ok(coverInteraction.scene().constructions.some(c=>c.kind==='point_on_surface'&&c.surface_id==='Cover_surface'),'creation attaches to nearest cylinder, not the selected/rear cylinder')
}
// Cap rejection, self/foreground occlusion, and existing working-plane behavior.
for(const projection of ['orthographic','perspective']){
 const source=a.createCylinderAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','C').scene,solid=source.solids[0],camera={...source.print_camera,projection,position:[10,0,1],target:[0,0,1],up:[0,0,1]}
 const top={...camera,position:[0,0,10],target:[0,0,1],up:[0,1,0]},cap=pointer(top,[.6,0,2]);assert.equal(picking.pickCylinder3D(source,top,cap).region,'top_cap');assert.equal(picking.pickCylinderSurface3D(source,top,cap),null)
 const h=harness(source,top);h.interaction.setTool('point');click(h.interaction,cap);assert.equal(h.commits(),0)
 const bottom={...top,position:[0,0,-10]},bottomCap=pointer(bottom,[.6,0,0]);assert.equal(picking.pickCylinder3D(source,bottom,bottomCap).region,'bottom_cap');assert.equal(picking.pickCylinderSurface3D(source,bottom,bottomCap),null)
 const empty={...cap,x:780,y:50};assert.equal(picking.pickCylinderSurface3D(source,top,empty),null);click(h.interaction,empty);assert.equal(h.scene().constructions.length,0,'empty-space placement is still a free point')
 // O1/O2 retain point-snap priority even when the cap itself rejects placement.
 const center=pointer(top,[0,0,2]),centers=harness(source,top);centers.interaction.setTool('point');click(centers.interaction,center);assert.equal(centers.commits(),0);assert.equal(centers.interaction.snapshot().selected,'C_v_1')
 const rear=api.createPointOnCylinderSurface3D(source,'C_surface',[.5,.5],'rear'),q=pointer(camera,[-1,0,1]);assert.notEqual(g.pickGeometry3D(rear,camera,q)?.id,'rear');close(picking.pickCylinderSurface3D(rear,camera,q).position,[1,0,1])
 const blocker=a.defaultSolid3D('cube','Blocker');blocker.frame.origin=[3,-1,0];const blocked=a.createSolid3D(source,blocker).scene,front=pointer(camera,[1,0,1]);assert.equal(picking.pickCylinderSurface3D(blocked,camera,front),null)
 const b=harness(blocked,camera);b.interaction.setTool('point');click(b.interaction,front);assert.ok(!b.scene().constructions.some(c=>c.kind==='point_on_surface'));assert.ok(b.scene().constructions.some(c=>c.kind==='point_on_face'),'visible polyhedron face retains point authoring')
 const cone=structuredClone(source);cone.solids[0].kind='cone';cone.surfaces[0].kind='cone';assert.equal(picking.pickCylinderSurface3D(cone,camera,front),null)
 // A cap/miss while dragging holds the attachment, rather than moving it to a cap.
 const nearTop=api.createPointOnCylinderSurface3D(source,'C_surface',[0,.8],'nearTop'),drag=harness(nearTop,camera),start=pointer(camera,nearTop.points.find(p=>p.id==='nearTop').position)
 drag.interaction.setTool('select');drag.interaction.select('nearTop');drag.interaction.pointer('down',start);drag.interaction.pointer('move',{...start,y:start.y-1000});drag.interaction.pointer('up',{...start,y:start.y-1000});assert.equal(drag.commits(),0)
 // Editing an existing point instead of a selected cylinder's resize handle.
 const handles=harness(nearTop,camera);handles.interaction.select('C');click(handles.interaction,start);assert.equal(handles.interaction.snapshot().selected,'nearTop');assert.equal(handles.commits(),0)
 assert.equal(picking.pickCylinderSurface3D(source,camera,{...front,width:0}),null)
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(fixtures))
console.log(`PASS: 12 plane/rotation/projection gestures; lateral/cap/occlusion filtering, seam/UV, snap/reuse, draft/cancel/no-op/one-step history, isolation, centers/polyhedra, canonical reload; ${fixtures.length} shared scenes`)
