import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const a=await load('geometry3dDihedralAuthoring'),math=await load('geometry3dDihedral'),m=await load('geometry3dModel'),n=await load('geometry3d'),p=await load('geometry3dProjection'),g=await load('geometry3dAuthoring')
const records=[];let gestures=0
for(const plane of ['XY','XZ','YZ']){
 const result=a.createDihedral3D(m.emptyGeometryScene3D(),[.2,.3,.4],plane,'D');assert.ok(result);const source=result.scene,d=source.dihedrals[0];assert.equal(d.angle_radians,Math.PI/2);assert.equal(d.features.length,7)
 const legacy=structuredClone(m.emptyGeometryScene3D());delete legacy.dihedrals;assert.deepEqual(n.normalizeGeometryScene3D(legacy).dihedrals,[]);assert.equal(legacy.dihedrals,undefined)
 assert.equal(d.label_visibility,'hidden');assert.equal(d.arc_visibility,'hidden')
 const presentation=m.transactGeometryScene3D(source,s=>{s.points.forEach(p=>p.label='internal');s.points.push({id:'free_a',position:[3,0,0],label:'Free'},{id:'free_b',position:[3,1,0],label:null});s.linear_objects.push({id:'ordinary',kind:'line',a:'free_a',b:'free_b'})})
 const before=n.serializeGeometryScene3D(presentation),primitives=p.scenePrimitives3D(presentation).primitives,edge=primitives.find(p=>p.id==='D_edge')
 assert.equal(edge.kind,'segment');assert.equal(Math.hypot(...p.sub(edge.b,edge.a)),4);assert.equal(primitives.find(p=>p.id==='ordinary').kind,'line');assert.deepEqual(primitives.filter(p=>p.kind==='point').map(p=>p.id),['free_a','free_b'])
 for(const projection of ['orthographic','perspective']){
  const rendered={...presentation,print_camera:{...presentation.print_camera,projection}},svg=p.geometrySceneSVG3D(rendered,700,500)
  assert.ok(!svg.includes('internal'));assert.ok(svg.includes('Free'));assert.ok(!svg.includes('90\u00b0'));assert.equal((svg.match(/data-id="D_edge"/g)??[]).length,1)
  const displayed=p.projectScene3D(rendered,rendered.print_camera,700,500);assert.equal(displayed.faces.filter(f=>f.id.startsWith('D_half_')&&f.outline===false).length,2)
  assert.equal(displayed.lines.filter(l=>l.id==='D').length,0)
  const withArc=a.editDihedral3D(rendered,'D',{arc_visibility:'visible'}),reloaded=n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(withArc)))
  assert.equal(reloaded.dihedrals[0].arc_visibility,'visible');assert.ok(p.projectScene3D(reloaded,reloaded.print_camera,700,500).lines.some(l=>l.id==='D'))
 }
 assert.equal(n.serializeGeometryScene3D(presentation),before)
 for(const degrees of [0,45,90,135,180]){
  let scene=a.editDihedral3D(source,'D',{angle_radians:degrees*Math.PI/180});assert.ok(scene);const geo=math.dihedralGeometry3D(scene.dihedrals[0]);assert.ok(Math.abs(p.dot(geo.e,geo.a))<1e-9);assert.ok(Math.abs(p.dot(geo.e,geo.b))<1e-9);assert.ok(Math.abs(p.dot(geo.a,geo.b)-Math.cos(degrees*Math.PI/180))<1e-9);assert.ok(Object.values(geo.positions).flat().every(Number.isFinite));assert.deepEqual(scene.dihedrals[0].features,d.features)
  scene=m.transactGeometryScene3D(scene,s=>s.points.find(p=>p.id==='D_v_3').label='M');assert.ok(scene);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(scene))),scene)
  scene=a.editDihedral3D(scene,'D',{display:{edge_length:4+degrees/180,widths:[2.5+degrees/360,3]}});assert.ok(scene)
  for(const projection of ['orthographic','perspective']){const rendered=a.editDihedral3D({...scene,print_camera:{...scene.print_camera,projection}},'D',{label_visibility:'visible',arc_visibility:'visible'}),svg=p.geometrySceneSVG3D(rendered,700,500);assert.ok(svg.includes('polygon'));assert.ok(svg.includes(degrees+'\u00b0'));const noLabel=a.editDihedral3D(rendered,'D',{label_visibility:'hidden'});assert.ok(!p.geometrySceneSVG3D(noLabel,700,500).includes(degrees+'\u00b0'));const noArc=a.editDihedral3D(rendered,'D',{arc_visibility:'hidden'});assert.ok(noArc);assert.ok(p.geometrySceneSVG3D(noArc,700,500).includes(degrees+'\u00b0'))}
  const moved=a.transformDihedral3D(scene,'D',[1,2,3],[1,2,3],.3);assert.ok(moved);assert.equal(moved.dihedrals[0].angle_radians,scene.dihedrals[0].angle_radians);assert.equal(moved.points.find(p=>p.id==='D_v_3').label,'M');assert.deepEqual(moved.print_camera,scene.print_camera);records.push(scene,moved)
 }
 for(const angle of [-.01,Math.PI+.01,NaN,Infinity])assert.equal(a.editDihedral3D(source,'D',{angle_radians:angle}),null)
 assert.equal(a.editDihedral3D(source,'D',{frame:{...d.frame,x_axis:[0,0,0]}}),null)
 assert.equal(a.editDihedral3D(source,'D',{features:d.features}),null)
 const navigated=m.createGeometryHistory3D(source,()=>{});assert.ok(navigated.navigate({...source.print_camera,position:[8,4,6]}));assert.deepEqual(navigated.getScene(),source)
 const projected=p.projectScene3D(source,source.print_camera,800,600);assert.ok(projected.faces.filter(f=>f.id.startsWith('D_half_')).some(f=>{const center=f.vertices.reduce(p.add,[0,0,0]).map(x=>x/f.vertices.length);return g.pickGeometry3D(source,source.print_camera,{x:center[0],y:center[1],width:800,height:600})?.id==='D'}),'half-plane body picks the dihedral owner')
 const changed=structuredClone(source);changed.planes[0].point_ids.reverse();assert.equal(n.normalizeGeometryScene3D(changed),null)
 const duplicate=structuredClone(source);duplicate.dihedrals[0].features[0].entity_id=duplicate.dihedrals[0].features[1].entity_id;assert.equal(n.normalizeGeometryScene3D(duplicate),null)
 assert.equal(g.editPoint3D(source,'D_v_3',[9,9,9],null),null)
 let dep=m.transactGeometryScene3D(source,s=>{s.points.push({id:'T',position:[0,0,0],label:'T'},{id:'Q',position:[0,0,0],label:null});s.constructions.push({id:'attached',kind:'point_on_linear',linear_id:'D_edge',t:.4,output_point_id:'T'},{id:'mid',kind:'midpoint',a:'D_v_2',b:'D_v_3',output_point_id:'Q'})});assert.ok(dep);dep=a.editDihedral3D(dep,'D',{angle_radians:Math.PI/4});assert.ok(dep);const deleted=a.deleteDihedral3D(dep,'D');assert.ok(deleted);assert.deepEqual(deleted.scene.points,dep.points);assert.equal(deleted.scene.dihedrals.length,0);assert.equal(deleted.scene.constructions.length,1);const history=m.createGeometryHistory3D(dep,()=>{});assert.ok(history.commit(deleted.scene));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),dep);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),deleted.scene)
 for(const projection of ['orthographic','perspective']){
  const geo=math.dihedralGeometry3D(d),camera={...source.print_camera,projection,position:p.add(d.frame.origin,p.add(p.scale(geo.e,6),p.add(p.scale(geo.a,5),p.scale(geo.c,5)))),target:d.frame.origin,up:geo.c},view=p.createProjection3D(camera,800,600),startPos=view.screen(view.view(geo.handle)),start={pointerId:1,button:0,x:startPos[0],y:startPos[1],width:800,height:600,altKey:false},target=p.add(d.frame.origin,p.add(p.scale(geo.a,1.8*Math.cos(Math.PI/4)),p.scale(geo.c,1.8*Math.sin(Math.PI/4)))),endPos=view.screen(view.view(target)),end={...start,x:endPos[0],y:endPos[1]}
  let doc=source,commits=0;const h=m.createGeometryHistory3D(source,v=>doc=v),i=g.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{commits++;return h.commit(s)},notify:()=>{}});i.select('D');assert.equal(i.pointer('down',start),true);i.pointer('move',end);assert.ok(i.snapshot().draft);i.cancel();assert.deepEqual(doc,source);assert.equal(commits,0);i.pointer('down',start);i.pointer('up',start);assert.equal(commits,0);i.pointer('down',start);i.pointer('move',end);i.pointer('up',end);assert.equal(commits,1);assert.ok(Math.abs(doc.dihedrals[0].angle_radians-Math.PI/4)<1e-8);assert.deepEqual(doc.linear_objects,source.linear_objects);assert.ok(h.provider.undo());assert.deepEqual(doc,source);assert.ok(h.provider.redo());assert.ok(Math.abs(doc.dihedrals[0].angle_radians-Math.PI/4)<1e-8);gestures++
 }
}
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: ${records.length} dihedral parity scenes, 0/45/90/135/180 degrees, XY/XZ/YZ, frames/IDs/labels, half-planes/SVG/toggles, legacy/invalid/ownership, dependencies/deletion/history; ${gestures} angle handle cases, both cameras`)
