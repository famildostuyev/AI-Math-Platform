import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
export async function runPlaneAuthoringAcceptance({evaluate,until,textButton,click,send}){
 const ribbon='.universal-editor-geometry-ribbon',viewport='.geometry-3d-viewport'
 await textButton('H\u0259nd\u0259s\u0259');await textButton('3D s\u0259hn\u0259 \u0259lav\u0259 et');await until(`document.querySelector('${viewport} canvas')`);await until(`!document.querySelector('${ribbon} [data-geometry-action="point"]').disabled`)
 await click(`${ribbon} [data-geometry-action="plane"]`);await until(`document.querySelector('${viewport}').dataset.interactionTool==='plane'`)
 const rect=await evaluate(`(()=>{const r=document.querySelector('${viewport}').getBoundingClientRect();return {width:r.width,height:r.height}})()`),mouse=async(type,x,y,buttons=0)=>{const r=await evaluate(`(()=>{const r=document.querySelector('${viewport}').getBoundingClientRect();return{x:r.x,y:r.y}})()`);return send('Input.dispatchMouseEvent',{type,x:r.x+x,y:r.y+y,button:'left',buttons,clickCount:type==='mouseMoved'?0:1})}
 await mouse('mousePressed',rect.width/2,rect.height/2,1);await mouse('mouseReleased',rect.width/2,rect.height/2);await until('prismVisibilityScene.planes.length===1')
 const initial=await evaluate('structuredClone(prismVisibilityScene)'),id=initial.planes[0].id;assert.equal(initial.points.length,3);assert.deepEqual(initial.planes[0].display,{width:4,height:3,shape:'rectangle',skew:.35})
 await click('[aria-label="Plane display width"]');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:'6'});await textButton('M\u00fcst\u0259viy\u0259 t\u0259tbiq et');await until('prismVisibilityScene.planes[0].display.width===6')
 const projectionModule=await load('geometry3dProjection'),displayModule=await load('geometry3dPlaneDisplay')
 for(const shape of ['rectangle','parallelogram','cloud']){
  await click('[aria-label="Plane display shape"]');await evaluate(`(()=>{const s=document.querySelector('[aria-label="Plane display shape"]');s.value=${JSON.stringify(shape)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await until(`prismVisibilityScene.planes[0].display.shape===${JSON.stringify(shape)}`)
  if(await evaluate('!!document.querySelector(".geometry-properties-dialog[open] header button")'))await click('.geometry-properties-dialog[open] header button')
  await click(`${ribbon} [data-geometry-action="select"]`);await until(`document.querySelector('${viewport}').dataset.interactionTool==='select'`)
  await until('document.querySelectorAll("[data-plane-resize]").length>0')
  assert.equal(await evaluate(`document.querySelectorAll('${viewport} [data-point-id],${viewport} circle[data-id]').length`),0)
  for(const axis of ['width','height']){
   const before=await evaluate('structuredClone(prismVisibilityScene)'),camera=await evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`),display=displayModule.planeDisplay3D(before.planes[0],before),view=projectionModule.createProjection3D(camera,rect.width,rect.height),grip=display.grips.find(g=>axis==='width'?g.u===1&&g.v===0:g.u===0&&g.v===1),start=view.screen(view.view(grip.position)),end=view.screen(view.view(projectionModule.add(grip.position,projectionModule.scale(axis==='width'?display.x:display.y,.2))))
   await mouse('mousePressed',start[0],start[1],1);await mouse('mouseMoved',end[0],end[1],1);await mouse('mouseReleased',end[0],end[1]);await until(`prismVisibilityScene.planes[0].display.${axis}>${before.planes[0].display[axis]}`)
   const after=await evaluate('structuredClone(prismVisibilityScene)');assert.deepEqual(after.points,before.points);assert.ok(Math.abs(after.planes[0].display[axis]-before.planes[0].display[axis]-.4)<1e-5);assert.equal(after.planes[0].display[axis==='width'?'height':'width'],before.planes[0].display[axis==='width'?'height':'width'])
  }
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),file=path.join(os.tmpdir(),`plane-display-${shape}.png`);await fs.writeFile(file,Buffer.from(shot.result.data,'base64'));console.log('Screenshot: '+file)
 }
 if(await evaluate('!!document.querySelector(".geometry-properties-dialog[open] header button")'))await click('.geometry-properties-dialog[open] header button')
 await click(`${ribbon} [data-geometry-action="translate_solid"]`);await until(`document.querySelector('${viewport}').dataset.interactionTool==='translate_solid'`)
 await mouse('mousePressed',rect.width/2,rect.height/2,1);await mouse('mouseMoved',rect.width/2+30,rect.height/2+20,1);await mouse('mouseReleased',rect.width/2+30,rect.height/2+20)
 await until(`JSON.stringify(prismVisibilityScene.points)!==${JSON.stringify(JSON.stringify(initial.points))}`)
 const edited=await evaluate('structuredClone(prismVisibilityScene)');assert.equal(edited.planes[0].id,id);assert.deepEqual(edited.planes[0].point_ids,initial.planes[0].point_ids)
 const p=await load('geometry3dProjection');for(const projection of ['orthographic','perspective'])assert.ok(p.geometrySceneSVG3D({...edited,print_camera:{...edited.print_camera,projection}},700,500).includes(`data-id="${id}"`))
 await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-3d-editor")');const saved=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)')
 await evaluate('reloadEditor()');await until('document.querySelector("[data-frame-id]")');await click('[data-frame-id="frame-1"]');await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('prismVisibilityScene.planes.length===1');assert.deepEqual(await evaluate('prismVisibilityScene'),saved)
 console.log('PASS: real Edge Plane creation, all three shapes, hidden helpers, independent width/height mouse resizing, translation, saved SVG and Apply/reopen (mocked persistence)')
}
