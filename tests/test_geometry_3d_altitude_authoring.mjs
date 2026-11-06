import assert from 'node:assert/strict'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dPlanePerpendicularAuthoring'),s=await load('geometry3dSolidAuthoring'),m=await load('geometry3dModel'),g=await load('geometry3dAuthoring'),p=await load('geometry3dProjection'),n=await load('geometry3d')
let cases=0
for(const regular of [false,true])for(const exterior of [false,true])for(const projection of ['orthographic','perspective']){
 if(regular&&exterior)continue
 const spec=regular?s.defaultRegularPyramid3D('P'):s.defaultSolid3D('pyramid','P');if(exterior)spec.parameters.apex_offset=[3,1]
 const source=s.createSolid3D(m.emptyGeometryScene3D(),spec).scene,base=source.faces.find(f=>f.id==='P_f_0'),apex=source.points.find(p=>p.id===`P_v_${base.boundary.length}`)
 const camera={...source.print_camera,projection},view=p.createProjection3D(camera,800,600),xy=view.screen(view.view(apex.position)),pointer={pointerId:1,button:0,x:xy[0],y:xy[1],width:800,height:600,altKey:false}
 let doc=source,commits=0
 const i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:q=>{doc=q;commits++;return true},notify:()=>{}})
 i.select(apex.id);i.setTool('altitude');assert.deepEqual(i.snapshot().pending,[]);i.cancel();assert.equal(commits,0)
 i.setTool('altitude');i.pointer('down',pointer);i.pointer('cancel',pointer);assert.equal(commits,0);assert.deepEqual(doc,source)
 i.setTool('altitude');i.pointer('down',pointer);i.pointer('up',pointer);assert.equal(commits,1,JSON.stringify(i.snapshot()))
 const c=doc.constructions[0],H=doc.points.find(p=>p.id===c.output_point_id)
 assert.equal(c.kind,'pyramid_altitude');assert.equal(c.pyramid_id,'P');assert.equal(c.reference.id,base.id);assert.equal(c.label_visibility,'hidden');assert.equal(doc.points.length,source.points.length+1)
 assert.ok(Math.hypot(H.position[0]-apex.position[0],H.position[1]-apex.position[1],H.position[2])<1e-8)
 const serialized=n.serializeGeometryScene3D(doc);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(serialized)),doc)
 const svg=p.geometrySceneSVG3D({...doc,print_camera:camera},800,600),paths=svg.match(new RegExp(`<path data-id="${c.segment_id}"[^>]*>`,'g'))
 assert.ok(paths?.length);for(const path of paths){assert.match(path,/data-construction="altitude"/);assert.match(path,/stroke-width="1.8"/);assert.match(path,/#0f766e/);if(path.includes('stroke-dasharray'))assert.match(path,/opacity="0.85"/)}
 if(!exterior)assert.ok(paths.some(x=>x.includes('stroke-dasharray="4 3"')))
 const before=JSON.stringify(doc);for(const position of [[4,3,5],[-5,2,4],[2,-3,-8]])p.projectScene3D(doc,{...camera,position},800,600,true);assert.equal(JSON.stringify(doc),before)
 const changed=s.editSolid3D(doc,{...doc.solids[0],parameters:{...doc.solids[0].parameters,height:4}});assert.ok(changed);assert.equal(changed.constructions[0].output_point_id,H.id)
 const history=m.createGeometryHistory3D(source,()=>{});assert.ok(history.commit(doc));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),source);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),doc)
 assert.equal(a.createPyramidAltitudeFromApex3D(source,base.boundary[0]).scene,null);assert.equal(a.createPyramidAltitudeFromApex3D(source,'missing').scene,null);assert.deepEqual(source,s.createSolid3D(m.emptyGeometryScene3D(),spec).scene)
 // Unsupported/ambiguous owners are never guessed, even before normalisation.
 const ambiguous=structuredClone(source);ambiguous.solids.push({...structuredClone(source.solids[0]),id:'other'});const snapshot=JSON.stringify(ambiguous);assert.equal(a.createPyramidAltitudeFromApex3D(ambiguous,apex.id).scene,null);assert.equal(JSON.stringify(ambiguous),snapshot)
 const wrong=view.screen(view.view(source.points.find(p=>p.id===base.boundary[0]).position)),bad={...pointer,x:wrong[0],y:wrong[1]};doc=source;commits=0;i.setTool('altitude');i.pointer('down',bad);i.pointer('up',bad);assert.equal(commits,0);assert.deepEqual(doc,source)
 cases++
}
console.log(`PASS: ${cases} default-camera altitude cases; one apex click, ownership rejection, exterior feet, styling, orbit, edits, cancellation, history and reload`)
