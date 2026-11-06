import assert from 'node:assert/strict'
export async function runRegularPrismAcceptance({evaluate,until,textButton,click,send}) {
  const ribbon='.universal-editor-geometry-ribbon', panel='.geometry-3d-solid-properties'
  const enter=async(name,value)=>{await click(`[aria-label="${name}"]`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:String(value)})}
  console.log('Regular prism browser: opening fixture')
  await textButton('H\u0259nd\u0259s\u0259')
  await textButton('3D s\u0259hn\u0259 \u0259lav\u0259 et')
  await until('document.querySelector(".geometry-3d-viewport canvas")')
  for(const sides of [3,6]) {
    await evaluate(`(()=>{const d=[...document.querySelectorAll('${ribbon}>details')].find(d=>d.querySelector('summary').textContent.includes('3D'));d.open=true})()`)
    await click(`${ribbon} [data-geometry-action="regular_prism"]`)
    await until(`document.querySelector('${panel} [aria-label="Cisim sides"]')`)
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('${panel} input')].map(e=>e.getAttribute('aria-label'))`),['Cisim sides'])
    assert.equal(await evaluate(`document.querySelectorAll('${panel} select').length`),0)
    assert.equal(await evaluate(`document.querySelector('${panel}').textContent.includes('S\u0259rb\u0259st redakt\u0259y\u0259 ke\u00e7')`),false)
    console.log('Regular prism browser: n-only form',sides)
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
  console.log('PASS: real Edge fixture regular prism n-only creation 3/6, locked n, radius/height editing and Apply/reopen serialization; no database')
}
