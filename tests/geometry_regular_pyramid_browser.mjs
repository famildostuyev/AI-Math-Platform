import {loadGeometryModule} from './geometry_test_modules.mjs'
﻿import assert from 'node:assert/strict'
export async function runRegularPyramidAcceptance({evaluate,until,textButton,click,send}) {
  const ribbon='.universal-editor-geometry-ribbon', panel='.geometry-3d-solid-properties'
  const enter=async(name,value)=>{await click(`[aria-label="${name}"]`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:String(value)})}
  console.log('Regular pyramid browser: opening fixture')
  await textButton('H\u0259nd\u0259s\u0259')
  await textButton('3D s\u0259hn\u0259 \u0259lav\u0259 et')
  await until('document.querySelector(".geometry-3d-viewport canvas")')
  for(const sides of [3,6]) {
    await evaluate(`(()=>{const d=[...document.querySelectorAll('${ribbon}>details')].find(d=>d.querySelector('summary').textContent.includes('3D'));d.open=true})()`)
    await click(`${ribbon} [data-geometry-action="regular_pyramid"]`)
    await until(`document.querySelector('${panel} [aria-label="Cisim sides"]')`)
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('${panel} input')].map(e=>e.getAttribute('aria-label'))`),['Cisim sides'])
    assert.equal(await evaluate(`document.querySelectorAll('${panel} select').length`),0)
    assert.equal(await evaluate(`document.querySelector('${panel}').textContent.includes('S\u0259rb\u0259st redakt\u0259y\u0259 ke\u00e7')`),false)
    console.log('Regular pyramid browser: n-only form',sides)
    if(sides===3){await enter('Cisim sides',2);await textButton('Cisim yarat');await until(`document.querySelector('${panel} [role="alert"]')`);assert.equal(await evaluate(`document.querySelector('${panel} [aria-label="Cisim sides"]').disabled`),false)}
    await enter('Cisim sides', sides)
    await textButton('Cisim yarat')
    await until(`document.querySelector('${panel} [aria-label="Cisim sides"]').disabled`)
    assert.equal(await evaluate(`document.querySelector('${panel} [aria-label="Cisim sides"]').value`),String(sides))
    assert.equal(await evaluate(`document.querySelector('${panel} [aria-label="Cisim direction0"]')!==null`),false)
    assert.equal(await evaluate(`document.querySelector('${panel} [aria-label="Cisim radius"]').value`),'2')
    assert.equal(await evaluate(`document.querySelector('${panel} [aria-label="Cisim height"]').value`),'2')
    assert.ok(await evaluate(`!!document.querySelector('[data-resize-kind="radius"]')`))
    assert.ok(await evaluate(`!!document.querySelector('[data-resize-kind="height"]')`))
    const b=await loadGeometryModule('geometry3dSolidBounds'),p=await loadGeometryModule('geometry3dProjection')
    for(const dimension of ['radius','height']){
      const source=await evaluate('structuredClone(prismVisibilityScene)'),id=source.solids.at(-1).id
      const view=await evaluate(`(()=>{const e=document.querySelector('.geometry-3d-viewport'),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,camera:JSON.parse(e.dataset.editingCamera)}})()`)
      const handle=b.projectedSolidBounds3D(source,view.camera,view.width,view.height,id).handles.find(h=>h.kind===dimension);assert.ok(handle)
      const projection=p.createProjection3D(view.camera,view.width,view.height),target=projection.screen(projection.view(p.add(handle.world,p.scale(handle.direction,handle.length*.25)))),x=target[0]+handle.x-handle.screen[0],y=target[1]+handle.y-handle.screen[1]
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:view.x+handle.x,y:view.y+handle.y,button:'left',buttons:1,clickCount:1})
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:view.x+x,y:view.y+y,button:'left',buttons:1})
      await until(`prismVisibilityScene.solids.find(s=>s.id==='${id}').parameters.${dimension}>2`)
      if(dimension==='radius'){
        await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
        await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
      }
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:view.x+x,y:view.y+y,button:'left',buttons:0,clickCount:1})
      await until(`prismVisibilityScene.solids.find(s=>s.id==='${id}').parameters.radius===2`)
      assert.equal(await evaluate(`prismVisibilityScene.solids.find(s=>s.id==='${id}').parameters.constraint`),'regular')
    }
    await enter('Cisim height',4)
    await textButton('Cism\u0259 t\u0259tbiq et')
    assert.equal(await evaluate(`document.querySelector('${panel} [aria-label="Cisim radius"]').value`),'2')
    await enter('Cisim radius',3)
    await textButton('Cism\u0259 t\u0259tbiq et')
    assert.equal(await evaluate(`document.querySelector('${panel} [aria-label="Cisim height"]').value`),'4')
    await textButton('Cisim panelini ba\u011fla')
  }
  await click('[data-frame-id="frame-1"] .visual-frame__actions button')
  await until('!document.querySelector(".geometry-3d-editor")')
  const saved=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)')
  assert.deepEqual(saved.solids.map(s=>s.parameters.sides).sort((a,b)=>a-b),[3,6])
  for(const s of saved.solids)assert.deepEqual(s.parameters,{sides:s.parameters.sides,radius:3,height:4,constraint:'regular'})
  await evaluate('reloadEditor()')
  await until('document.querySelector("[data-frame-id]")')
  assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved)
  console.log('PASS: real Edge fixture regular pyramid n-only creation 3/6, locked n, radius/height editing and Apply/reopen serialization; no database')
}
