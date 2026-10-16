import assert from 'node:assert/strict'
import {runGeometryFrameControlsAcceptance} from './geometry_frame_controls_browser.mjs'

export async function runGeometryFrameContextAcceptance(api){
  const {evaluate,until,click,box,pointer,send}=api
  await runGeometryFrameControlsAcceptance(api)
  const menu='.geometry-frame-context-menu:not([hidden])'
  const key=async(key,code,vk,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk})}
  const right=async(id,selector)=>{
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
    const b=await box(selector),x=b.x+40,y=b.y+45
    await pointer('mouseMoved',x,y);await pointer('mousePressed',x,y,{button:'right',buttons:2,clickCount:1});await pointer('mouseReleased',x,y,{button:'right',clickCount:1})
    await until(`document.querySelector('${menu}')?.dataset.frameMenuOwner==='${id}'`)
    assert.equal(await evaluate(`document.querySelector('${menu}').contains(document.activeElement)`),true,'keyboard focus moves into popup')
    assert.equal(await evaluate(`(()=>{const b=document.querySelector('${menu}').getBoundingClientRect();return b.left>=8&&b.top>=8&&b.right<=innerWidth-8&&b.bottom<=innerHeight-8})()`),true,'popup fits visible viewport')
  }
  const globalSave=()=>evaluate(`[...document.querySelectorAll('.admin-editor-header button')].filter(b=>b.textContent.trim()==='Yadda saxla').length`)
  assert.equal(await globalSave(),1)
  await right('frame-1','[data-frame-id="frame-1"]');await click('[data-frame-menu-owner="frame-1"] .visual-frame__actions button')
  await until('document.querySelector("[data-frame-id=frame-1] .geometry-authoring-board")')
  await click('[data-geometry-action="point"]')
  const count=await evaluate('document.querySelectorAll("[data-frame-id=frame-1] svg ellipse").length')
  await right('frame-1','[data-frame-id="frame-1"] .geometry-authoring-board')
  assert.equal(await evaluate('document.querySelectorAll("[data-frame-id=frame-1] svg ellipse").length'),count,'right click creates no 2D point')
  await evaluate(`document.querySelector('${menu} .geometry-frame-menu__items button').focus()`)
  await key('Escape','Escape',27);await until(`!document.querySelector('${menu}')`)
  assert.equal(await evaluate('!!document.querySelector("[data-frame-id=frame-1] .geometry-editor")'),true,'Escape dismisses without cancelling frame edit')
  await right('frame-1','[data-frame-id="frame-1"] .geometry-authoring-board')
  await pointer('mousePressed',10,10,{button:'left',clickCount:1});await pointer('mouseReleased',10,10,{button:'left',clickCount:1});await until(`!document.querySelector('${menu}')`)
  await evaluate('document.querySelector("[data-frame-id=frame-1]").focus()');await key('ContextMenu','ContextMenu',93);await until(`document.querySelector('${menu}')`)
  await key('Tab','Tab',9);assert.equal(await evaluate(`document.querySelector('${menu}').contains(document.activeElement)`),true)
  await key('Escape','Escape',27)
  // Clamp both edges deterministically; physical right-click opening is checked above and below.
  await evaluate(`document.querySelector('[data-frame-id="frame-1"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:innerWidth-1,clientY:innerHeight-1}))`)
  await until(`(()=>{const b=document.querySelector('${menu}')?.getBoundingClientRect();return b&&b.right<=innerWidth-8&&b.bottom<=innerHeight-8})()`)
  await click('[data-frame-menu-owner="frame-1"] .visual-frame__actions button:nth-child(2)');await until('!document.querySelector("[data-frame-id=frame-1] .geometry-editor")')
  await right('frame-2','[data-frame-id="frame-2"]');await click('[data-frame-menu-owner="frame-2"] .visual-frame__actions button');await until('document.querySelector("[data-frame-id=frame-2] canvas")')
  await click('[data-geometry-action="point"]')
  const before=await evaluate('document.querySelector("[data-frame-id=frame-2] .geometry-3d-viewport").dataset.editingCamera')
  const options=await evaluate(`document.querySelector('[aria-label="3D obyekt seç"]').options.length`)
  await right('frame-2','[data-frame-id="frame-2"] .geometry-3d-viewport')
  assert.equal(await evaluate(`document.querySelector('[aria-label="3D obyekt seç"]').options.length`),options,'right click creates no 3D point')
  assert.equal(await evaluate('document.querySelector("[data-frame-id=frame-2] .geometry-3d-viewport").dataset.editingCamera'),before,'opening the menu does not pan/orbit')
  assert.equal(await evaluate(`document.querySelector('${menu} .visual-frame__actions button').textContent.trim()`),'Tətbiq et')
  assert.equal(await globalSave(),1,'document Save remains separately labeled')
  await key('Escape','Escape',27);await until(`!document.querySelector('${menu}')`)
  const saved=await evaluate('structuredClone(savedRevision.blocks[1].payload.source_data)')
  await evaluate(`([...document.querySelectorAll('.admin-editor-header button')].find(b=>b.textContent.trim()==='Yadda saxla')).dataset.documentSaveTest='yes'`)
  await click('[data-document-save-test="yes"]');await until('!document.querySelector("[data-frame-id=frame-2] .geometry-3d-editor")')
  assert.deepEqual(await evaluate('savedRevision.blocks[1].payload.source_data'),saved,'existing global Save still confirms the active editor')
  console.log('PASS: real Edge 2D/3D physical right click, keyboard equivalent/focus, viewport clamping, Escape/outside dismissal, no accidental point/camera changes, removed old controls and unchanged document Save label/action; existing Apply/Cancel, properties/camera/plane and save/reload acceptance reused')
}
