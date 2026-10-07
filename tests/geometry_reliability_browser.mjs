import assert from 'node:assert/strict'

export async function runGeometryReliabilityAcceptance({ evaluate, until, click, textButton, box, pointer, delay, send }) {
  await textButton('Həndəsə'); await textButton('Çərçivə əlavə et')
  const frame = '[data-frame-id="frame-1"]', board = '.geometry-authoring-board'
  await until(`document.querySelector('${board}')`)
  assert.equal(await evaluate(`document.querySelector('button[aria-label="Geri al"]').disabled`),true)
  const tool = async label => {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Tool unavailable: '+${JSON.stringify(label)});b.click()})()`)
    await delay(100)
  }
  const at = async (x,y) => {
    const r = await box(board)
    await pointer('mousePressed',r.x+x,r.y+y,{button:'left',clickCount:1})
    await pointer('mouseReleased',r.x+x,r.y+y,{button:'left',clickCount:1});await delay(150)
  }
  await tool('Nöqtə'); await at(90,90)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),1)
  await click('button[aria-label="Geri al"]'); await delay(150)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),0)
  await click('button[aria-label="Yenidən et"]'); await delay(150)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),1)
  await click(`${frame} .visual-frame__actions button`)
  await until(`!document.querySelector('${board}')`)
  // No canvas click, movement, or scrolling between Edit and the ribbon command.
  await evaluate(`document.querySelector('${frame} .visual-frame__actions button').click()`)
  await until(`document.querySelector('${board} svg')`)
  await tool('Nöqtə'); await at(160,130)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),2)
  await tool('Seç'); await click(`${board} [data-geometry-point-id]`)
  // A frame click must not deactivate the newly registered history provider.
  await evaluate(`document.querySelector('${frame}').click()`)
  await click('button[aria-label="Geri al"]'); await delay(150)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),1)
  await click('button[aria-label="Yenidən et"]'); await delay(150)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),2)
  // Tool/draft changes never add history; history navigation cancels a pending line.
  await tool('Vektor'); await at(220,170)
  await click('button[aria-label="Geri al"]'); await delay(150)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-transient]').length`),0)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),1)
  await click('button[aria-label="Yenidən et"]'); await delay(150)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),2)
  await tool('Üçbucaq'); await at(220,170); await at(300,170)
  assert.equal(await evaluate(`Number(getComputedStyle(document.querySelector('${board} polygon')).fillOpacity)`),0)
  await click('button[aria-label="Geri al"]'); await delay(150)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),2,'Compound triangle undo is one operation')
  await click('button[aria-label="Yenidən et"]'); await delay(150)
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`)
  assert.ok(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data.points.every(p=>p.label===null)'))
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame} polygon')).fill`),'none')
  // Shared history routes a real text transaction to text, without changing geometry.
  await textButton('Mətn'); await click('.ProseMirror')
  await send('Input.insertText',{text:'History text '});await delay(150)
  const editedText=await evaluate('document.querySelector(".ProseMirror").textContent')
  assert.ok(editedText.includes('History text '))
  await click('button[aria-label="Geri al"]');await delay(150)
  assert.ok(!(await evaluate('document.querySelector(".ProseMirror").textContent')).includes('History text '))
  await click('button[aria-label="Yenidən et"]');await delay(150)
  assert.equal(await evaluate('document.querySelector(".ProseMirror").textContent'),editedText)
  assert.equal(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data.points.length'),5)
  console.log('PASS: saved geometry Edit immediately accepts ribbon point creation without frame movement')
}
