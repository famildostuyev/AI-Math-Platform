import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
export async function runDihedralAcceptance({evaluate,until,textButton,click,send}){
 const ribbon='.universal-editor-geometry-ribbon',viewport='.geometry-3d-viewport';await textButton('H\u0259nd\u0259s\u0259');await textButton('3D s\u0259hn\u0259 \u0259lav\u0259 et');await until(`document.querySelector('${viewport} canvas')`);await until(`!document.querySelector('${ribbon} [data-geometry-action="point"]').disabled`)
 await click(`${ribbon} [data-geometry-action="dihedral"]`)
 const rect=await evaluate(`(()=>{const r=document.querySelector('${viewport}').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`),mouse=(type,x,y,buttons=0)=>send('Input.dispatchMouseEvent',{type,x:rect.x+x,y:rect.y+y,button:'left',buttons,clickCount:type==='mouseMoved'?0:1})
 await mouse('mousePressed',rect.width/2,rect.height/2,1);await mouse('mouseReleased',rect.width/2,rect.height/2);await until('prismVisibilityScene.dihedrals.length===1')
 const initial=await evaluate('structuredClone(prismVisibilityScene)'),id=initial.dihedrals[0].id;assert.equal(initial.dihedrals[0].angle_radians,Math.PI/2);assert.equal(initial.planes.length,2);assert.equal(initial.linear_objects.length,1);assert.equal(initial.points.length,4);assert.ok(initial.points.every(p=>p.label===null));assert.equal(initial.dihedrals[0].label_visibility,'hidden');await until('document.querySelectorAll(".geometry-3d-shared-screen polygon").length===2');assert.equal(initial.dihedrals[0].arc_visibility,'hidden');assert.equal(await evaluate('document.querySelectorAll("[data-dihedral-handle]").length'),0)
 const artifact=path.join(os.tmpdir(),'dihedral-clean-default.png');await fs.writeFile(artifact,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).result.data,'base64'));console.log('Screenshot: '+artifact)
 const input='[aria-label="Dihedral angle degrees"]';await click(input);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:'45'});await textButton('Buca\u011fa t\u0259tbiq et');await until('Math.abs(prismVisibilityScene.dihedrals[0].angle_radians-Math.PI/4)<1e-8')
 // Close Properties before pointer interaction; the dialog must not intercept a handle.
 if(await evaluate('!!document.querySelector(".geometry-properties-dialog[open] header button")'))await click('.geometry-properties-dialog[open] header button')
 const source=await evaluate('structuredClone(prismVisibilityScene)'),camera=await evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`),p=await load('geometry3dProjection'),math=await load('geometry3dDihedral'),geo=math.dihedralGeometry3D(source.dihedrals[0]),view=p.createProjection3D(camera,rect.width,rect.height),center=p.add(source.dihedrals[0].frame.origin,p.scale(geo.e,.6)),start=view.screen(view.view(p.add(center,p.scale(geo.b,1.2)))),target=p.add(center,p.scale(geo.c,1.2)),end=view.screen(view.view(target))
 await mouse('mousePressed',start[0],start[1],1);await mouse('mouseMoved',end[0],end[1],1);await until('Math.abs(prismVisibilityScene.dihedrals[0].angle_radians-Math.PI/2)<1e-4');await mouse('mouseReleased',end[0],end[1]);await until('Math.abs(prismVisibilityScene.dihedrals[0].angle_radians-Math.PI/2)<1e-4');assert.deepEqual(await evaluate('prismVisibilityScene.dihedrals[0].features'),initial.dihedrals[0].features)
 // Selected-object display grips resize each width and common-edge length independently.
 for(const kind of ['width0','width1','edge']){
  const before=await evaluate('structuredClone(prismVisibilityScene)'),d=before.dihedrals[0],h=math.dihedralDisplay3D(d).handles.find(h=>h.kind===kind),a=view.screen(view.view(h.position)),b=view.screen(view.view(p.add(h.position,p.scale(h.direction,.35))))
  await mouse('mousePressed',a[0],a[1],1);await mouse('mouseMoved',b[0],b[1],1);await mouse('mouseReleased',b[0],b[1]);await until(`JSON.stringify(prismVisibilityScene.dihedrals[0].display)!==${JSON.stringify(JSON.stringify(d.display))}`)
  const after=await evaluate('structuredClone(prismVisibilityScene)');assert.equal(after.dihedrals[0].angle_radians,d.angle_radians);assert.deepEqual(after.points,before.points)
  if(kind==='edge'){assert.ok(Math.abs(after.dihedrals[0].display.edge_length-d.display.edge_length-.7)<1e-4);assert.deepEqual(after.dihedrals[0].display.widths,d.display.widths)}
  else{const index=kind==='width0'?0:1;assert.ok(Math.abs(after.dihedrals[0].display.widths[index]-d.display.widths[index]-.35)<1e-4);assert.equal(after.dihedrals[0].display.widths[1-index],d.display.widths[1-index])}
 }
 await click('[aria-label="Show dihedral arc"]');await until('prismVisibilityScene.dihedrals[0].arc_visibility==="visible"');await click('[aria-label="Show dihedral arc"]');await until('prismVisibilityScene.dihedrals[0].arc_visibility==="hidden"');assert.equal(await evaluate('prismVisibilityScene.dihedrals[0].label_visibility'),'hidden')
 await click('[aria-label="Show dihedral degree label"]');await until('prismVisibilityScene.dihedrals[0].label_visibility==="visible"');await click('[aria-label="Show dihedral degree label"]');await until('prismVisibilityScene.dihedrals[0].label_visibility==="hidden"')
 await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-3d-editor")');const saved=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)');assert.equal(saved.dihedrals[0].id,id);assert.deepEqual(saved.print_camera,initial.print_camera)
 await evaluate('reloadEditor()');await until('document.querySelector("[data-frame-id]")');await click('[data-frame-id="frame-1"]');await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('prismVisibilityScene.dihedrals.length===1');assert.deepEqual(await evaluate('prismVisibilityScene'),saved)
 // Inspect the production saved-camera SVG in Edge for each projection, without changing the document.
 for(const projection of ['orthographic','perspective']){
  // Fit the perspective inspection camera without changing the editor/saved document camera.
  const inspectionCamera={...saved.print_camera,projection}
  if(projection==='perspective')inspectionCamera.position=p.add(inspectionCamera.target,p.scale(p.sub(inspectionCamera.position,inspectionCamera.target),2))
  const svg=p.geometrySceneSVG3D({...saved,print_camera:inspectionCamera},700,500)
  assert.ok(!svg.includes('90\u00b0'));for(const point of initial.points)assert.ok(!svg.includes(`data-id="${point.id}"`))
  await evaluate(`(()=>{const d=document.createElement('div');d.id='dihedral-svg-acceptance';d.style='position:fixed;inset:0;background:white;z-index:999999';d.innerHTML=${JSON.stringify(svg)};document.body.append(d)})()`)
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),file=path.join(os.tmpdir(),`dihedral-clean-${projection}.png`)
  await fs.writeFile(file,Buffer.from(screenshot.result.data,'base64'));console.log('Saved-camera SVG screenshot: '+file);await evaluate('document.getElementById("dihedral-svg-acceptance").remove()')
 }
 console.log('PASS: real Edge dihedral click creation at 90 degrees, Properties 45 degrees, direct surface drag to 90 degrees, independent width0/width1/edge resizing, arc/label toggles, stable IDs/camera and Apply/reopen (mocked persistence)')
}
