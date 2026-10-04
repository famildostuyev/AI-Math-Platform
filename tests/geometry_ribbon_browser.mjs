// Run through: node tests/geometry_frame_browser.mjs --ribbon
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'

const source = await fs.readFile(new URL('../frontend/src/components/geometryRibbonMenu.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { GEOMETRY_RIBBON: catalogue } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
assert.deepEqual(catalogue.map(x => x.label), ['Çərçivə əlavə et', 'Seç', 'Nöqtə', 'Xətt', '2D fiqurlar', 'Çevrə', 'Konstruksiya', 'Ölçü', '3D', 'Mətn', 'Düstur', 'Qələm', 'Daha çox'])
assert.deepEqual(catalogue.find(x => x.label === 'Xətt').groups[0].items.map(x => x.label), ['Düz xətt', 'İstiqamətlənmiş düz xətt', 'Parça', 'Vektor', 'Sınıq xətt'])
assert.deepEqual(catalogue.filter(x => x.groups).map(x => x.groups.reduce((n, g) => n + g.items.length, 0)), [5, 11, 14, 5, 5, 15, 3, 13])
assert.deepEqual(catalogue.flatMap(x => x.groups ? x.groups.flatMap(g => g.items) : [x]).filter(x => x.action).map(x => x.action), ['select', 'point', 'line', 'directed_line', 'segment', 'vector', 'polyline', 'triangle', 'right_triangle', 'rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid', 'regular_pentagon', 'regular_hexagon', 'regular_polygon', 'polygon', 'circle', 'disk', 'arc', 'sector', 'midpoint', 'parallel', 'perpendicular', 'intersection', 'angle_bisector', 'text', 'delete'])
assert.equal(catalogue.find(x => x.label === '3D').groups.flatMap(x => x.items).filter(x => x.title === 'Oturacağın tərəflərinin sayı (n)').length, 3)

export async function runGeometryRibbonAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send }) {
  const ribbon = '.universal-editor-geometry-ribbon'
  const frame = '[data-frame-id="frame-1"]'
  const domButton = async (label) => {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('${ribbon} button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click()})()`)
    await delay(100)
  }
  const menu = async label => {
    await evaluate(`(()=>{const s=[...document.querySelectorAll('${ribbon} > details > summary')].find(s=>s.textContent.trim().replace(/\\s*▾$/,'')===${JSON.stringify(label)});s.click()})()`)
    await delay(80)
  }
  await until('document.querySelector("math-field")')
  const original = await evaluate('JSON.stringify(savedRevision.blocks[0])')
  const formula = await evaluate('document.querySelector("math-field").value')
  await textButton('Həndəsə')
  assert.deepEqual(await evaluate(`[...document.querySelector('${ribbon}').children].map(x=>(x.tagName==='DETAILS'?x.querySelector('summary'):x).textContent.trim().replace(/\\s*▾$/,''))`), catalogue.map(x => x.label))
  assert.equal(await evaluate(`[...document.querySelectorAll('${ribbon} > button')].filter(b=>b.textContent==='Çərçivə əlavə et'&&!b.disabled).length`), 1)
  assert.equal(await evaluate(`[...document.querySelectorAll('${ribbon} > button')].find(b=>b.textContent==='Seç').disabled`), false)
  assert.equal(await evaluate(`[...document.querySelectorAll('${ribbon} > button')].find(b=>b.textContent==='Nöqtə').disabled`), true)
  const layout = async () => evaluate(`(()=>{const r=document.querySelector('${ribbon}').getBoundingClientRect(),c=document.querySelector('.universal-question-canvas').getBoundingClientRect();return [r.height,c.x,c.y]})()`)
  const before = await layout()
  for (const entry of catalogue.filter(x => x.groups)) {
    await menu(entry.label)
    assert.equal(await evaluate(`document.querySelectorAll('${ribbon} > details[open]').length`), 1)
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('${ribbon} > details[open] section')].map(s=>({label:s.querySelector('h3')?.textContent||'',items:[...s.querySelectorAll('button')].map(b=>b.textContent)}))`), entry.groups.map(g => ({ label: g.label, items: g.items.map(i => i.label) })))
    assert.equal(await evaluate(`[...document.querySelectorAll('${ribbon} > details[open] button')].every(b=>b.disabled)`), true)
    await evaluate(`document.querySelectorAll('${ribbon} > details[open] button').forEach(b=>b.click())`)
    assert.deepEqual(await layout(), before, 'Menu does not move ribbon/canvas')
  }
  assert.equal(await evaluate('requests.length'), 0, 'Future actions do not write')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  assert.equal(await evaluate(`document.querySelectorAll('${ribbon} details[open]').length`), 0)
  await menu('Xətt'); await click('.universal-question-canvas')
  assert.equal(await evaluate(`document.querySelectorAll('${ribbon} details[open]').length`), 0)
  await domButton('Çərçivə əlavə et'); await until(`document.querySelector('${frame} .geometry-authoring-board svg')`)
  await domButton('Nöqtə')
  await evaluate(`document.querySelector('${frame}').scrollIntoView({block:'center'})`)
  const board = await box('.geometry-authoring-board')
  for (const [dx, dy] of [[80, 80], [220, 80], [140, 200]]) {
    await pointer('mousePressed', board.x + dx, board.y + dy, { button: 'left', clickCount: 1 })
    await pointer('mouseReleased', board.x + dx, board.y + dy, { button: 'left', clickCount: 1 }); await delay(160)
  }
  await until('document.querySelectorAll(".geometry-authoring-board svg ellipse").length===3')
  const activeLayout = await layout()
  for (const entry of catalogue.filter(x => x.groups)) {
    await menu(entry.label)
    await evaluate(`document.querySelectorAll('${ribbon} > details[open] button:disabled').forEach(b=>b.click())`)
    assert.deepEqual(await layout(), activeLayout)
  }
  assert.equal(await evaluate('requests.length'), 1, 'Future actions with an active frame do not persist anything')
  assert.equal(await evaluate('document.querySelectorAll(".geometry-authoring-board svg ellipse").length'), 3)
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  const point = async index => click(`.geometry-authoring-board svg ellipse:nth-of-type(${index})`)
  await menu('Xətt'); await domButton('Parça'); await point(1); await point(2)
  await menu('2D fiqurlar'); await domButton('Sərbəst fiqur'); await point(1); await point(2); await point(3)
  await textButton('Çoxbucaqlını tamamla')
  await domButton('Mətn')
  await evaluate(`document.querySelector('${frame}').scrollIntoView({block:'center'})`)
  const textBoard = await box('.geometry-authoring-board')
  await pointer('mousePressed', textBoard.x + 250, textBoard.y + 250, { button: 'left', clickCount: 1 })
  await pointer('mouseReleased', textBoard.x + 250, textBoard.y + 250, { button: 'left', clickCount: 1 })
  await until('document.querySelector(".geometry-editor__annotation input")')
  await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${frame} .geometry-renderer') || !document.querySelector('${frame} .geometry-authoring-board')`)
  const geometry = await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)')
  assert.equal(geometry.points.length, 3); assert.equal(geometry.segments.length, 1); assert.equal(geometry.polygons.length, 1); assert.equal(geometry.texts.length, 1)
  assert.deepEqual(geometry.polygons[0].point_ids, geometry.points.map(p => p.id))
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'), original)
  assert.equal(await evaluate('document.querySelector("math-field").value'), formula)
  await domButton('Çərçivə əlavə et'); await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await domButton('Nöqtə')
  await evaluate('document.querySelector("[data-frame-id=frame-2]").scrollIntoView({block:"center"})')
  const second = await box('[data-frame-id="frame-2"] .geometry-authoring-board')
  await pointer('mousePressed', second.x + 80, second.y + 80, { button: 'left', clickCount: 1 })
  await pointer('mouseReleased', second.x + 80, second.y + 80, { button: 'left', clickCount: 1 }); await delay(150)
  await click('[data-frame-id="frame-2"] .visual-frame__actions button')
  await until('!document.querySelector(".geometry-authoring-board")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'), geometry)
  assert.equal(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2").payload.source_data.points.length'), 1)
  await evaluate('reloadEditor()'); await until('document.querySelector("math-field") && document.querySelectorAll("[data-frame-id]").length===2')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'), original)
  assert.equal(await evaluate('document.querySelector("math-field").value'), formula)
  assert.equal(await evaluate('document.body.innerText.includes("Çərçivə xassələri")'), false)
  // Delete the segment at its midpoint, avoiding overlapping endpoint hit targets.
  await click(frame); await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${frame} .geometry-authoring-board')`)
  await domButton('Seç')
  await evaluate(`document.querySelector('${frame}').scrollIntoView({block:'center'})`)
  const midpoint = await evaluate(`(()=>{const p=[...document.querySelectorAll('.geometry-authoring-board svg ellipse')].slice(0,2).map(e=>e.getBoundingClientRect());return {x:(p[0].x+p[0].width/2+p[1].x+p[1].width/2)/2,y:(p[0].y+p[0].height/2+p[1].y+p[1].height/2)/2}})()`)
  await pointer('mousePressed', midpoint.x, midpoint.y, { button: 'left', clickCount: 1 })
  await pointer('mouseReleased', midpoint.x, midpoint.y, { button: 'left', clickCount: 1 }); await delay(100)
  await menu('Daha çox'); await domButton('Seçiləni sil')
  await click(`${frame} .visual-frame__actions button`)
  await until('!document.querySelector(".geometry-authoring-board")')
  const deleted = await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data')
  assert.deepEqual(deleted.points, geometry.points); assert.equal(deleted.segments.length, 0); assert.deepEqual(deleted.polygons, geometry.polygons); assert.deepEqual(deleted.texts, geometry.texts)
  assert.equal(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2").payload.source_data.points.length'), 1)
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'), original)
  console.log('PASS: real Edge Geometry ribbon order, every menu/group, disabled nonmutation, Escape/outside close, stable layout, creation, point/segment/polygon/text, two-frame targeting and mixed text/formula/Geometry document')
}
