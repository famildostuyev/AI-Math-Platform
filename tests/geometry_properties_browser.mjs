import assert from 'node:assert/strict'
import {runGeometryFrameContextAcceptance} from './geometry_frame_context_browser.mjs'

export async function runGeometryPropertiesAcceptance(api){
  const {evaluate,until,click,textButton,send,box,pointer,drag}=api
  await runGeometryFrameContextAcceptance(api)
  const f2='[data-frame-id="frame-1"]',f3='[data-frame-id="frame-2"]',panel='.geometry-properties-dialog',editor=`${f3} .geometry-3d-editor`
  const input=async(selector,value)=>{await click(selector);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:String(value)})}
  const close=async()=>{await click(`${panel} header button`);await until(`!document.querySelector('${panel}').open`)}
  const choose=async id=>{await click('[aria-label="3D obyekt seç"]');await evaluate(`(()=>{const s=document.querySelector('[aria-label="3D obyekt seç"]');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await until(`document.querySelector('${editor}').dataset.selectedId===${JSON.stringify(id)}`)}
  // Saved-frame properties entry must start the existing edit session and open its own panel.
  await click('[data-frame-menu-owner="frame-2"] > button');await until(`document.querySelector('${panel}').open&&document.querySelector('${panel}').dataset.geometryPropertiesOwner==='frame-2'`)
  assert.equal(await evaluate(`document.querySelector('${panel}').matches(':modal')`),false,'geometry properties do not make the canvas inert')
  assert.equal(await evaluate(`document.querySelector('.universal-editor-document-drawer').open`),false)
  await click('header button[aria-haspopup="dialog"]');await until('document.querySelector(".universal-editor-document-drawer").open')
  assert.equal(await evaluate(`document.querySelectorAll('.universal-editor-document-drawer .geometry-properties-content,.universal-editor-document-drawer .geometry-3d-inspector,.universal-editor-document-drawer .geometry-3d-metadata').length`),0)
  assert.equal(await evaluate(`['Reviziya','Status','Sual tipi','Mənbə'].every(t=>[...document.querySelectorAll('.universal-editor-document-drawer dt')].some(e=>e.textContent.trim()===t))`),true,'document metadata retained')
  await click('.universal-editor-document-drawer header button');await until('!document.querySelector(".universal-editor-document-drawer").open')
  assert.equal(await evaluate(`document.querySelector('${panel}').open`),true,'document drawer and geometry panel have independent visibility')
  await click('[data-geometry-action="select"]');await click('.geometry-3d-inspector summary')
  const original=await evaluate('structuredClone(savedRevision.blocks[1].payload.source_data)'),id=original.points[0].id
  await choose(id)
  await input('[aria-label="3D nöqtə X"]',4);await input('[aria-label="3D nöqtə etiketi"]','P')
  await textButton('Nöqtəyə tətbiq et');await until(`document.querySelector('[aria-label="3D nöqtə X"]').value==='4'`)
  await click('[aria-label="Geri al"]');await until(`document.querySelector('[aria-label="3D nöqtə X"]').value==='${original.points[0].position[0]}'`)
  await click('[aria-label="Yenidən et"]');await until(`document.querySelector('[aria-label="3D nöqtə X"]').value==='4'`)
  await input('[aria-label="3D nöqtə etiketi"]','Unapplied draft')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(`!document.querySelector('${panel}').open`)
  await click('[data-frame-menu-owner="frame-2"] .geometry-frame-menu__items > button');await until(`document.querySelector('${panel}').open`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="3D nöqtə etiketi"]').value`),'Unapplied draft','closing preserves uncommitted form values')
  await input('[aria-label="3D nöqtə etiketi"]','P')
  // Empty-space right-click clears the object target without mutating the scene.
  await evaluate(`document.querySelector('${f3} .geometry-3d-viewport').scrollIntoView({block:'center'})`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const b=await box(`${f3} .geometry-3d-viewport`),beforeCount=await evaluate(`document.querySelector('[aria-label="3D obyekt seç"]').options.length`)
  assert.equal(await evaluate(`document.elementFromPoint(${b.x+30},${b.y+35})?.closest('[data-frame-id]')?.dataset.frameId`),'frame-2','physical right-click hits the visible canvas')
  await pointer('mousePressed',b.x+30,b.y+35,{button:'right',buttons:2,clickCount:1});await pointer('mouseReleased',b.x+30,b.y+35,{button:'right',clickCount:1});await until('document.querySelector(".geometry-frame-context-menu:not([hidden])")')
  assert.equal(await evaluate(`document.querySelector('${editor}').dataset.selectedId`),'')
  assert.equal(await evaluate(`document.querySelector('[aria-label="3D obyekt seç"]').options.length`),beforeCount)
  await textButton('Xassələr')
  await until(`document.querySelector('${panel}').contains(document.activeElement)`)
  await choose(id)
  const size=await box(f3);await drag(`${f3} [data-handle="e"]`,30,0);await until(`document.querySelector('${f3}').getBoundingClientRect().width===${size.width+30}`)
  await drag(`${f3} .visual-frame__move`,20,15);assert.equal(await evaluate(`document.querySelector('${panel}').open`),true,'canvas drag/resize does not dismiss properties')
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.querySelector('${f3}').scrollIntoView({block:'center',inline:'center'})`);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  assert.equal(await evaluate(`(()=>{const frame=document.querySelector('${f3}');return [...frame.querySelectorAll('[data-handle],.visual-frame__move')].every(e=>{const b=e.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;if(x<0||x>=innerWidth||y<0||y>=innerHeight)return true;const hit=document.elementFromPoint(x,y);return hit===e||e.contains(hit)})})()`),true,'properties do not cover visible drag/resize controls in a narrow viewport')
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1200,deviceScaleFactor:1,mobile:false})
  for(const [axis,value]of [['X',7],['Y',2],['Z',0]])await input(`[aria-label="3D nöqtə ${axis}"]`,value)
  await textButton('Koordinatla nöqtə yarat');const extra=await evaluate(`document.querySelector('${editor}').dataset.selectedId`);assert.notEqual(extra,id)
  await textButton('3D seçiləni sil');await until(`![...document.querySelector('[aria-label="3D obyekt seç"]').options].some(o=>o.value==='${extra}')`)
  await click('[aria-label="Geri al"]');await until(`[...document.querySelector('[aria-label="3D obyekt seç"]').options].some(o=>o.value==='${extra}')`)
  await click('[aria-label="Yenidən et"]');await until(`![...document.querySelector('[aria-label="3D obyekt seç"]').options].some(o=>o.value==='${extra}')`)
  await choose(id);await textButton('Seçimi təmizlə');await click('.geometry-3d-metadata summary')
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="3D səhnə təsviri"]')&&!!document.querySelector('[aria-label="Sual kamerası X"]')&&!!document.querySelector('[aria-label="3D obyekt seç"]')`),true,'empty selection retains existing scene/camera/creation fields')
  await close();await click(`${f3} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  const saved=await evaluate('structuredClone(savedRevision.blocks[1].payload.source_data)');assert.equal(saved.points[0].id,id);assert.equal(saved.points[0].position[0],4);assert.equal(saved.points[0].label,'P');assert.equal(saved.points.length,original.points.length);assert.deepEqual(saved.print_camera,original.print_camera)
  await evaluate('reloadEditor()');await until('document.querySelectorAll("[data-frame-id]").length===2');assert.deepEqual(await evaluate('savedRevision.blocks[1].payload.source_data'),saved)
  await click(f2);await click('[data-frame-menu-owner="frame-1"] > button');await until(`document.querySelector('${panel}').open&&document.querySelector('${panel}').dataset.geometryPropertiesOwner==='frame-1'`)
  assert.equal(await evaluate(`document.querySelectorAll('${panel} textarea').length`),1);assert.equal(await evaluate(`document.querySelectorAll('${panel} .geometry-3d-inspector').length`),0,'2D panel has only supported 2D fields')
  await input('.geometry-properties-content textarea','Properties 2D draft');await close();await click(`${f2} .visual-frame__actions button:nth-child(2)`);await until(`!document.querySelector('${f2} .geometry-editor')`)
  assert.equal(await evaluate('savedRevision.blocks[0].payload.source_data.description'),'Phase 2 accessible drawing','frame Cancel retains existing rollback')
  console.log('PASS: real Edge separate nonmodal 2D/3D geometry properties, clean document metadata, saved-frame entry, point IDs/coordinates/labels, creation/deletion/Undo/Redo, draft preservation/Escape/close, scene/camera information, unchanged right-click selection, no accidental creation, live canvas drag/resize and mixed persistence (fixture API)')
}
