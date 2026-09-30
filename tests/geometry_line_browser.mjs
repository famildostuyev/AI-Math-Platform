import assert from 'node:assert/strict'

export async function runGeometryLineAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag }) {
  const frame = '[data-frame-id="frame-1"]'
  const board = '.geometry-authoring-board'
  const tool = async label => {
    await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()==='Xətt ▾');if(!d.open)d.querySelector('summary').click()})()`)
    await delay(60)
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`)
    await delay(80)
  }
  const at = async (x, y, press = true) => {
    await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`)
    const r = await box(board)
    await pointer('mouseMoved', r.x + x, r.y + y)
    if (press) {
      await pointer('mousePressed', r.x + x, r.y + y, { button: 'left', clickCount: 1 })
      await pointer('mouseReleased', r.x + x, r.y + y, { button: 'left', clickCount: 1 })
    }
    await delay(100)
  }
  const key = async (key, code) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code }); await delay(100)
  }
  await until('document.querySelector("math-field")')
  const textBefore = await evaluate('JSON.stringify(savedRevision.blocks[0])')
  const formula = await evaluate('document.querySelector("math-field").value')
  await textButton('Həndəsə'); await textButton('Çərçivə əlavə et')
  await until(`document.querySelector('${board} svg')`)
  for (const [label, kind, y] of [['Düz xətt', 'line', 90], ['İstiqamətlənmiş düz xətt', 'directed_line', 140], ['Vektor', 'vector', 190]]) {
    await tool(label); await at(90, y); await at(230, y + 20, false)
    assert.ok(await evaluate('document.querySelector("[data-geometry-preview]")'), `${kind} live preview`)
    const preview = await box('[data-geometry-preview]')
    assert.ok(kind === 'vector' ? preview.width < 150 : preview.width > 250, 'Finite/infinite preview distinction')
    assert.equal(await evaluate('requests.filter(r=>r.method==="PATCH" && r.body.source_data).length'), 0)
    await at(230, y + 20)
    assert.equal(await evaluate('document.querySelectorAll("[data-geometry-preview]").length'), 0, kind + ' completion: ' + await evaluate('document.querySelector(".geometry-editor").innerText'))
    assert.ok(await evaluate(`document.querySelector('[data-geometry-kind="${kind}"]')`))
  }
  // Existing segment uses the first two already committed points.
  await tool('Parça'); await click(`${board} svg ellipse:nth-of-type(1)`); await click(`${board} svg ellipse:nth-of-type(2)`)
  await tool('Sınıq xətt')
  for (const [x, y] of [[70, 270], [150, 290], [220, 260], [290, 300]]) {
    await at(x, y); await at(x + 20, y + 15, false)
    assert.ok(await evaluate('document.querySelector("[data-geometry-preview]")'))
  }
  await key('Enter', 13)
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-preview]").length'), 0)
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-kind=polyline]").length'), 3)
  // Closing within 2 local units succeeds without pixel-perfect overlap.
  for (const [x, y] of [[290, 80], [360, 100], [330, 180]]) await at(x, y)
  await at(298, 80, false)
  assert.ok(await evaluate('document.querySelector("[data-geometry-closure=true]")'), 'Start highlighted inside closure tolerance')
  await at(298, 80)
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-preview]").length'), 0)
  // Cancel leaves all committed objects untouched and does not create draft points.
  const pointCount = await evaluate(`document.querySelectorAll('${board} svg ellipse').length`)
  await tool('Vektor'); await at(340, 330); await at(380, 360, false); await key('Escape', 27)
  assert.equal(await evaluate(`document.querySelectorAll('${board} svg ellipse').length`), pointCount)
  await tool('Sınıq xətt'); await at(340, 330); await at(380, 360); await key('Escape', 27)
  assert.equal(await evaluate(`document.querySelectorAll('${board} svg ellipse').length`), pointCount)
  // Save during another live preview must persist only completed objects.
  await tool('Düz xətt'); await at(340, 330); await at(380, 360, false)
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  assert.equal(await evaluate('[...document.querySelectorAll("[data-geometry-transient]")].every(e=>getComputedStyle(e).display==="none")'), true)
  await send('Emulation.setEmulatedMedia', { media: '' })
  await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${frame} .geometry-lines')`)
  const source = await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)')
  assert.deepEqual(source.lines.map(l => l.kind), ['line', 'directed_line', 'vector'])
  assert.equal(source.segments.length, 1); assert.equal(source.polylines.length, 1); assert.equal(source.polylines[0].point_ids.length, 4)
  assert.equal(source.polygons.length, 1); assert.equal(source.polygons[0].point_ids.length, 3)
  assert.equal(new Set(source.polygons[0].point_ids).size, 3); assert.equal(source.points.length, 13)
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-transient]").length'), 0)
  const line = await box(`${frame} [data-geometry-kind=line]`), vector = await box(`${frame} [data-geometry-kind=vector]`)
  assert.ok(line.width > vector.width * 2)
  assert.equal(await evaluate(`document.querySelector('${frame} [data-geometry-kind=vector]').hasAttribute('marker-end')`), true)
  assert.equal(await evaluate(`document.querySelector('${frame} [data-geometry-kind=directed_line]').hasAttribute('marker-end')`), true)
  assert.equal(await evaluate(`document.querySelector('${frame} [data-geometry-kind=line]').hasAttribute('marker-end')`), false)
  await drag(`${frame} [data-handle=se]`, 100, 80)
  const resized = await box(`${frame} [data-geometry-kind=vector]`)
  assert.equal(resized.width, vector.width); assert.equal(resized.height, vector.height)
  await drag(`${frame} .visual-frame__move`, 30, 30)
  await click(`${frame} .visual-frame__actions button:nth-child(2)`)
  await until('requests.at(-1).url.endsWith("/visual-placement")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'), source)
  await textButton('Çərçivə əlavə et'); await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await tool('Vektor'); await at(80, 80); await at(180, 140)
  await click('[data-frame-id=frame-2] .visual-frame__actions button')
  await until('!document.querySelector(".geometry-authoring-board")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'), source)
  assert.equal(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2").payload.source_data.lines.length'), 1)
  await evaluate('reloadEditor()'); await until('document.querySelectorAll("[data-frame-id]").length===2 && document.querySelector("math-field")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'), source)
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'), textBefore)
  assert.equal(await evaluate('document.querySelector("math-field").value'), formula)
  // New objects use the existing select/delete route, preserving unrelated content.
  await click(frame); await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${board}')`)
  await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon > button')].find(b=>b.textContent==='Seç').click()")
  await delay(100)
  for (const kind of ['line', 'directed_line', 'vector', 'polyline']) {
    await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`)
    const rect = await box(`${board} [data-geometry-kind="${kind}"]`)
    const fraction = kind === 'line' || kind === 'directed_line' ? .85 : .5
    await pointer('mousePressed', rect.x + rect.width * fraction, rect.y + rect.height * fraction, { button: 'left', clickCount: 1 })
    await pointer('mouseReleased', rect.x + rect.width * fraction, rect.y + rect.height * fraction, { button: 'left', clickCount: 1 }); await delay(120)
    await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon summary')].find(s=>s.textContent.trim()==='Daha çox ▾').click()")
    await delay(60)
    await evaluate("(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent==='Seçiləni sil');if(b.disabled)throw Error('Delete unavailable');b.click()})()")
    await delay(100)
    assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-kind="${kind}"]').length`), 0, `${kind} deleted`)
  }
  await click(`${frame} .visual-frame__actions button`)
  await until('!document.querySelector(".geometry-authoring-board")')
  const remaining = await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data')
  assert.deepEqual(remaining.points, source.points); assert.deepEqual(remaining.segments, source.segments); assert.deepEqual(remaining.polygons, source.polygons)
  assert.equal(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2").payload.source_data.lines.length'), 1)
  console.log('PASS: real Edge all line tools, free pointer previews, Enter open completion, tolerant polygon closure, Escape, transient print/save exclusion, SVG distinctions, frame scale/move/resize, two frames and mixed document')
  return source
}
