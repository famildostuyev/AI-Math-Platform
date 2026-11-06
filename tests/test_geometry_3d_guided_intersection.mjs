import assert from 'node:assert/strict'
import test from 'node:test'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),author=load('geometry3dAuthoring'),math=load('geometry3dGuidedPlane'),p=load('geometry3dProjection'),pm=load('geometry3dPlanePerpendicular'),display=load('geometry3dPlaneDisplay'),normalizer=load('geometry3d')
const near=(a,b)=>assert.ok(Math.hypot(...p.sub(a,b))<1e-9,JSON.stringify({a,b}))
for(const working of ['XY','XZ','YZ'])for(const dimensions of [[4,16],[16,4]])test(`${working} ${dimensions.join('x')} intersection matches preview, patches and saved rendering`,()=>{
 for(const angle of [Math.PI/2,0,.6]){
  let doc=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],working,'alpha').scene
  doc=plane.resizePlaneDisplay3D(doc,'alpha',...dimensions)
  const frame=pm.planeReference3D(doc,{kind:'plane',id:'alpha'}).frame,t=p.add(p.scale(frame.x,Math.cos(angle)),p.scale(frame.y,Math.sin(angle)))
  doc=m.transactGeometryScene3D(doc,s=>s.points.push({id:'A',position:p.scale(frame.normal,3),label:null},{id:'B',position:p.add(p.scale(t,8),p.scale(frame.normal,6)),label:null}))
  const camera={...doc.print_camera,position:p.add(p.scale(frame.x,20),p.add(p.scale(frame.y,-24),p.scale(frame.normal,28))),up:frame.y,vertical_span:48},view=p.createProjection3D(camera,800,600),pointer=world=>{const q=view.screen(view.view(world));return {pointerId:1,button:0,x:q[0],y:q[1],width:800,height:600}},click=world=>{const q=pointer(world);interaction.pointer('down',q);interaction.pointer('up',q)}
  let commits=0;const interaction=author.createAuthoringInteraction3D({getScene:()=>doc,getCamera:()=>camera,commit:s=>{doc=s;commits++;return true},notify:()=>{}})
  interaction.setTool('perpendicular');interaction.setPerpendicularOutput('guided_plane')
  const target=[[-.3,-.3],[.3,-.3],[-.3,.3]].map(([x,y])=>p.add(p.scale(frame.x,x*dimensions[0]),p.scale(frame.y,y*dimensions[1]))).find(q=>author.pickGeometry3D(doc,camera,pointer(q))?.id==='alpha');assert.ok(target);click(target)
  click(doc.points.find(p=>p.id==='A').position);click(doc.points.find(p=>p.id==='B').position);assert.equal(interaction.snapshot().guidedPlanePreview,true)
  const span=(width,height)=>Math.min(Math.abs(Math.cos(angle))>1e-12?width/Math.abs(Math.cos(angle)):Infinity,Math.abs(Math.sin(angle))>1e-12?height/Math.abs(Math.sin(angle)):Infinity)
  const previewBefore=interaction.snapshot().preview;const expectedBefore=span(...dimensions)
  assert.ok(interaction.finish());assert.equal(commits,1)
  const beta=doc.planes.find(p=>p.id!=='alpha'),recipe=doc.constructions[0]
  assert.deepEqual([Math.hypot(...p.sub(previewBefore[1],previewBefore[0])),beta.display.width].map(v=>Number(v.toFixed(8))),[expectedBefore,expectedBefore].map(v=>Number(v.toFixed(8))))
  const snapshots=[]
  for(const [width,height] of [dimensions,[dimensions[0]*1.5,dimensions[1]*2]]){
   doc=plane.resizePlaneDisplay3D(doc,'alpha',width,height);const expected=span(width,height),segment=math.guidedIntersectionSegments3D(doc,recipe.reference,recipe.guide);assert.equal(segment.length,1)
   near(segment[0][0],p.scale(t,-expected/2));near(segment[0][1],p.scale(t,expected/2))
   const patch=display.planeDisplay3D(doc.planes.find(q=>q.id===beta.id),doc);near(patch.world(-1,0),segment[0][0]);near(patch.world(1,0),segment[0][1])
   for(const projection of ['orthographic','perspective']){
    const c={...camera,projection},projected=p.projectScene3D(doc,c,800,600,true),line=projected.lines.filter(l=>l.role==='plane_intersection');assert.equal(line.length,1)
    const v=p.createProjection3D(c,800,600),clipped=v.line(...segment[0],'segment');assert.ok(clipped);near(line[0].a,v.screen(clipped[0]));near(line[0].b,v.screen(clipped[1]))
    assert.match(p.geometrySceneSVG3D({...doc,print_camera:c},800,600,new Set([beta.id])),/data-render-curve="plane_intersection"/)
   }
   snapshots.push(doc);assert.deepEqual(normalizer.normalizeGeometryScene3D(JSON.parse(normalizer.serializeGeometryScene3D(doc))),doc)
  }
  const moved=m.moveGeometryPoint3D(doc,'B',p.add(doc.points.find(q=>q.id==='B').position,p.scale(frame.y,1)));assert.ok(moved)
  const rotated=plane.transformPlane3D(moved,'alpha',[.3,.2,.1],[1,2,3],.4);assert.ok(rotated)
  const ref=pm.planeReference3D(rotated,recipe.reference).frame,out=pm.planeReference3D(rotated,{kind:'plane',id:beta.id}).frame
  for(const segment of math.guidedIntersectionSegments3D(rotated,recipe.reference,recipe.guide))for(const point of segment){assert.ok(Math.abs(p.dot(p.sub(point,ref.origin),ref.normal))<1e-9);assert.ok(Math.abs(p.dot(p.sub(point,out.origin),out.normal))<1e-9)}
  const trimmed=m.transactGeometryScene3D(doc,s=>s.planes.find(q=>q.id===beta.id).display.lower_portion='upper');assert.ok(trimmed);assert.deepEqual(math.guidedIntersectionSegments3D(trimmed,recipe.reference,recipe.guide),math.guidedIntersectionSegments3D(doc,recipe.reference,recipe.guide))
  const baseSize=math.guidedPlaneDisplaySize3D(doc,recipe.reference,recipe.guide),edited=plane.resizePlaneDisplay3D(doc,beta.id,baseSize.width*1.25,baseSize.height*.75);assert.ok(edited);assert.ok(Math.abs(edited.planes.find(q=>q.id===beta.id).display.width-baseSize.width*1.25)<1e-9);assert.deepEqual(edited.points,doc.points)
  // Old manually resized documents retain their original numeric size/link.
  const legacy=structuredClone(doc);delete legacy.constructions[0].display_link.extent_mode;legacy.constructions[0].display_link.width_ratio=1.25
  const loaded=m.evaluateGeometryScene3D(legacy);assert.equal(loaded.status,'ok');assert.ok(Math.abs(loaded.scene.planes.find(q=>q.id===beta.id).display.width-legacy.planes.find(q=>q.id==='alpha').display.width*1.25)<1e-9)
  const legacyDefault=structuredClone(doc);delete legacyDefault.constructions[0].display_link.extent_mode;const loadedDefault=m.evaluateGeometryScene3D(legacyDefault);assert.equal(loadedDefault.status,'ok');assert.ok(Math.abs(loadedDefault.scene.planes.find(q=>q.id===beta.id).display.width-baseSize.width)<1e-9)
  assert.deepEqual(math.guidedIntersectionSegments3D(edited,recipe.reference,recipe.guide),math.guidedIntersectionSegments3D(doc,recipe.reference,recipe.guide))
  const resizedAgain=plane.resizePlaneDisplay3D(edited,'alpha',dimensions[0]*3,dimensions[1]*4);assert.ok(resizedAgain);assert.ok(Math.abs(resizedAgain.planes.find(q=>q.id===beta.id).display.width-math.guidedPlaneDisplaySize3D(resizedAgain,recipe.reference,recipe.guide).width*1.25)<1e-9)
  const hidden=m.transactGeometryScene3D(trimmed,s=>s.planes.find(q=>q.id===beta.id).display.intersection_visibility='hidden');assert.ok(hidden);assert.ok(!p.geometrySceneSVG3D(hidden).includes('data-render-curve="plane_intersection"'))
  const history=m.createGeometryHistory3D(snapshots[0],()=>{});assert.ok(history.commit(snapshots[1]));assert.ok(history.provider.undo());assert.ok(history.provider.redo())
 }
})
