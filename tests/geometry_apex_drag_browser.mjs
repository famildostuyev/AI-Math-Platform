import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
import assert from 'node:assert/strict'

export async function runApexDragAcceptance({evaluate,until,textButton,click,box,pointer,send},heightMode=false){
  const frame='[data-frame-id="frame-1"]',editor=`${frame} .geometry-3d-editor`,viewport=`${frame} .geometry-3d-viewport`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const key=async(key,code,vk,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers});await settle()}
  const right=async p=>{await pointer('mousePressed',p.x,p.y,{button:'right',buttons:2});await pointer('mouseReleased',p.x,p.y,{button:'right',buttons:0});await until('document.querySelector(".geometry-frame-context-menu:not([hidden])")');await settle()}
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  await createScenePyramid({evaluate,until,click,pointer})
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  const original=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)'),apex=original.points.at(-1)
  await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  await click('[data-tool-3d="select"]')
  const screen=async position=>{await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center',behavior:'instant'})`);await settle();return evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),v=p.screen(p.view(${JSON.stringify(position)}));return {x:b.x+v[0],y:b.y+v[1]}})()`)}
  const expected=heightMode?[apex.position[0],apex.position[1],apex.position[2]+1]:[apex.position[0]+.7,apex.position[1]+.35,apex.position[2]]
  const start=await screen(apex.position),end=await screen(expected)
  const selected=()=>evaluate(`document.querySelector('${editor}').dataset.selectedId`)
  const svg=()=>evaluate(`document.querySelector('${viewport} .geometry-3d-static').innerHTML`)
  const cameraBefore=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),frameBefore=await box(frame),svgBefore=await svg()
  const historyBefore=await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled');assert.equal(historyBefore,true)
  const begin=async()=>{await pointer('mouseMoved',start.x,start.y);await pointer('mousePressed',start.x,start.y,{button:'left',buttons:1,modifiers:heightMode?8:0});await settle();assert.equal(await selected(),apex.id)}
  const move=async()=>{for(let i=1;i<=10;i++){await pointer('mouseMoved',start.x+(end.x-start.x)*i/10,start.y+(end.y-start.y)*i/10,{button:'left',buttons:1})}await settle()}
  await begin();await move();assert.notEqual(await svg(),svgBefore,'semantic draft updates projected geometry live')
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled'),true,'moves do not enter history')
  await key('Escape','Escape',27);await pointer('mouseReleased',end.x,end.y,{button:'left',buttons:0});await settle();assert.equal(await svg(),svgBefore,'Escape restores original geometry')
  await begin();await move()
  await evaluate(`document.querySelector('${viewport}').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}))`)
  await pointer('mouseReleased',end.x,end.y,{button:'left',buttons:0});await settle();assert.equal(await svg(),svgBefore,'pointer cancellation restores original geometry')
  await begin();await move();await pointer('mouseReleased',end.x,end.y,{button:'left',buttons:0});await settle()
  const svgAfter=await svg();assert.notEqual(svgAfter,svgBefore)
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraBefore,'apex edit cannot navigate camera')
  assert.deepEqual(await box(frame),frameBefore,'apex edit cannot move or resize frame')
  await click('[aria-label="Geri al"]');await settle();assert.equal(await svg(),svgBefore)
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled'),true,'one undo removes complete drag')
  await click('[aria-label="Yenidən et"]');await settle();assert.equal(await svg(),svgAfter)
  const actual=await screen(expected)
  await right(actual);assert.equal(await selected(),apex.id)
  const menu=await box('.geometry-frame-context-menu:not([hidden])')
  assert.ok(actual.x+12<=menu.x||actual.x-12>=menu.x+menu.width||actual.y+12<=menu.y||actual.y-12>=menu.y+menu.height,'menu leaves edited apex clear')
  await textButton('Xassələr');await settle()
  const coordinates=await evaluate(`['X','Y','Z'].map(axis=>Number(document.querySelector('[aria-label="3D nöqtə '+axis+'"]').value))`)
  // CDP mouse coordinates are converted to browser floating-point screen coordinates.
  assert.ok(Math.hypot(...coordinates.map((v,i)=>v-expected[i]))<1e-5,`Properties coordinates: actual=${coordinates}, expected=${expected}`)
  if(!heightMode)assert.equal(coordinates[2],apex.position[2],'signed height is unchanged exactly')
  else assert.deepEqual(coordinates.slice(0,2),apex.position.slice(0,2),'tangential offset is unchanged exactly')
  assert.equal(await evaluate('document.querySelector(\'[aria-label="3D obyekt seç"]\').value'),apex.id)
  assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Nöqtəyə tətbiq et").disabled'),true,'solid vertices do not gain unrestricted coordinate editing')
  await click('.geometry-properties-dialog[open] header button')
  // Selecting a base vertex without dragging must not convert or change the solid.
  const base=await screen(original.points[0].position);await pointer('mousePressed',base.x,base.y,{button:'left',buttons:1});await pointer('mouseReleased',base.x,base.y,{button:'left',buttons:0});await settle();assert.equal(await svg(),svgAfter)
  if(heightMode){
    const from=await screen(expected),throughBase=await screen([expected[0],expected[1],-1])
    await pointer('mousePressed',from.x,from.y,{button:'left',buttons:1,modifiers:8});await pointer('mouseMoved',throughBase.x,throughBase.y,{button:'left',buttons:1});await pointer('mouseReleased',throughBase.x,throughBase.y,{button:'left',buttons:0});await settle()
    assert.equal(await svg(),svgAfter,'height drag cannot silently flip through the base')
  }
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  const saved=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)')
  if(heightMode){assert.ok(Math.abs(saved.solids[0].parameters.height-original.solids[0].parameters.height-1)<1e-5);assert.deepEqual(saved.solids[0].parameters.apex_offset,original.solids[0].parameters.apex_offset)}
  else assert.equal(saved.solids[0].parameters.height,original.solids[0].parameters.height)
  assert.deepEqual(saved.solids[0].features,original.solids[0].features)
  for(const group of ['edges','faces'])assert.deepEqual(saved[group],original[group])
  assert.deepEqual(saved.points.filter(p=>p.id!==apex.id),original.points.filter(p=>p.id!==apex.id))
  assert.deepEqual(saved.points.find(p=>p.id===apex.id).position,coordinates,'Apply persists the exact Properties coordinates')
  await evaluate('reloadEditor()');await until(`document.querySelector('${frame} svg')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved)
  await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  // Frame Cancel rolls back a later completed edit to the saved apex.
  await click('[data-tool-3d="select"]');const again=await screen(expected)
  const restoredSVG=await svg(),cancelEnd=heightMode?{x:again.x,y:again.y-25}:{x:again.x+25,y:again.y}
  await pointer('mousePressed',again.x,again.y,{button:'left',buttons:1,modifiers:heightMode?8:0});await pointer('mouseMoved',cancelEnd.x,cancelEnd.y,{button:'left',buttons:1});await pointer('mouseReleased',cancelEnd.x,cancelEnd.y,{button:'left',buttons:0});await settle()
  assert.notEqual(await svg(),restoredSVG,'Frame Cancel is tested after a completed semantic edit')
  await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until(`!document.querySelector('${editor}')`)
  assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved)
  console.log('APEX MEASUREMENT',JSON.stringify({mode:heightMode?'height':'horizontal',before:apex.position,after:coordinates,height:saved.solids[0].parameters.height,featureIdsPreserved:true,undoOperations:1,cameraChanged:false}))
  console.log('PASS: real Edge apex selection/live semantic edit, height/offset/base/stable topology, pointercancel/Escape rollback, one Undo/Redo, Properties, camera/frame isolation, right-click placement, Apply/reload/Cancel (fixture API)')
}
