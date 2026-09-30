import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { REGULAR_POLYGON_LIMITS } = await loadGeometryModule('geometryTemplateContract')

export async function runGeometryTriangleAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag }, quadrilaterals = false, regular = false) {
  const cases = regular ? [['Düzgün 5-bucaqlı', 110, 110, 50, 10, 5], ['Düzgün 6-bucaqlı', 300, 110, 50, 10, 6], ['Düzgün n-bucaqlı', 110, 290, 50, 10, 3], ['Düzgün n-bucaqlı', 300, 290, 50, 10, 7]] : quadrilaterals
    ? [['Düzbucaqlı', 60, 65, 70, 14], ['Kvadrat', 240, 65, 65, 13], ['Paraleloqram', 60, 190, 65, 13], ['Romb', 230, 190, 65, 13], ['Trapesiya', 80, 310, 65, 13]]
    : [['Üçbucaq', 60, 80, 100, 20], ['Düzbucaqlı üçbucaq', 220, 230, 100, 20]]
  const kinds = regular ? cases.map(() => 'regular_polygon') : quadrilaterals ? ['rectangle', 'square', 'parallelogram', 'rhombus', 'trapezoid'] : ['triangle', 'right_triangle']
  const vertexCount = quadrilaterals ? 4 : 3
  const frame = '[data-frame-id="frame-1"]', board = '.geometry-authoring-board'
  const menu = async label => {
    await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()===${JSON.stringify(label + ' ▾')});if(!d.open)d.querySelector('summary').click()})()`)
    await delay(60)
  }
  const action = async label => {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click()})()`)
    await delay(100)
  }
  const tool = async label => { await menu('2D fiqurlar'); await action(label) }
  const setN = async text => {
    await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Tərəflərin sayı (n)"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(text))});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await delay(100)
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
  const escape = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await delay(100)
  }
  const layout = () => evaluate("(()=>{const r=document.querySelector('.universal-editor-geometry-ribbon').getBoundingClientRect(),c=document.querySelector('.universal-question-canvas').getBoundingClientRect();return [r.height,c.x,c.y+scrollY]})()")
  const assertFigure = (geometry, polygon) => {
    if (regular) {
      const n = polygon.template.n, p = polygon.point_ids.map(id => geometry.points.find(p => p.id === id))
      assert.equal(p.length, n); assert.equal(new Set(polygon.point_ids).size, n)
      assert.ok(p.every(v => v.label === null))
      const center = { x: p.reduce((s,v)=>s+v.x,0)/n, y: p.reduce((s,v)=>s+v.y,0)/n }
      const radius = Math.hypot(p[0].x-center.x,p[0].y-center.y), side = Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)
      p.forEach((v,i)=>{const q=p[(i+1)%n],a={x:v.x-center.x,y:v.y-center.y},b={x:q.x-center.x,y:q.y-center.y};assert.ok(Math.abs(Math.hypot(a.x,a.y)-radius)<1e-7);assert.ok(Math.abs(Math.hypot(q.x-v.x,q.y-v.y)-side)<1e-7);assert.ok(Math.abs(Math.atan2(a.x*b.y-a.y*b.x,a.x*b.x+a.y*b.y)-2*Math.PI/n)<1e-7)})
      return
    }
    assert.equal(polygon.point_ids.length, vertexCount); assert.equal(new Set(polygon.point_ids).size, vertexCount)
    const p = polygon.point_ids.map(id => geometry.points.find(p => p.id === id))
    const edges = p.map((v, i) => ({ x: p[(i + 1) % vertexCount].x - v.x, y: p[(i + 1) % vertexCount].y - v.y }))
    assert.ok(Math.abs(edges[0].x * edges[1].y - edges[0].y * edges[1].x) > 1)
    const rightAngles = edges.filter((e, i) => Math.abs(e.x * edges[(i + 1) % vertexCount].x + e.y * edges[(i + 1) % vertexCount].y) < 1e-7).length
    const kind = polygon.template.kind
    assert.equal(rightAngles, kind === 'right_triangle' ? 1 : ['rectangle', 'square'].includes(kind) ? 4 : 0)
    if (quadrilaterals) {
      const cross = (a, b) => a.x * b.y - a.y * b.x
      const length = e => Math.hypot(e.x, e.y)
      assert.ok(Math.abs(cross(edges[0], edges[2])) < 1e-7)
      if (kind !== 'trapezoid') {
        assert.ok(Math.abs(cross(edges[1], edges[3])) < 1e-7)
        assert.ok(Math.abs(length(edges[0]) - length(edges[2])) < 1e-7)
        assert.ok(Math.abs(length(edges[1]) - length(edges[3])) < 1e-7)
      } else {
        assert.ok(Math.abs(cross(edges[1], edges[3])) > 1)
        assert.ok(Math.abs(length(edges[1]) - length(edges[3])) > .01)
      }
      if (['square', 'rhombus'].includes(kind)) assert.ok(edges.every(e => Math.abs(length(e) - length(edges[0])) < 1e-7))
    }
    assert.ok(p.every(p => p.label === null))
  }
  await until('document.querySelector("math-field")')
  const textBefore = await evaluate('JSON.stringify(savedRevision.blocks[0])'), formula = await evaluate('document.querySelector("math-field").value')
  await textButton('Həndəsə'); await textButton('Çərçivə əlavə et'); await until(`document.querySelector('${board} svg')`)
  const beforeLayout = await layout()
  await menu('2D fiqurlar')
  assert.deepEqual(await layout(), beforeLayout)
  assert.equal(await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].filter(b=>!b.disabled).map(b=>b.textContent).join('|')"), 'Üçbucaq|Düzbucaqlı üçbucaq|Düzbucaqlı|Kvadrat|Paraleloqram|Romb|Trapesiya|Düzgün 5-bucaqlı|Düzgün 6-bucaqlı|Düzgün n-bucaqlı|Sərbəst fiqur')
  if (regular) {
    await action('Düzgün n-bucaqlı')
    assert.deepEqual(await layout(), beforeLayout)
    assert.ok((await box('.geometry-editor__regular-parameter')).height < 80)
    for (const invalid of ['2', '4.5', 'NaN', 'Infinity', 'abc', String(REGULAR_POLYGON_LIMITS.maxSides + 1)]) {
      await setN(invalid); await at(100,100); await at(160,120)
      assert.equal(await evaluate(`document.querySelector('input[aria-label="Tərəflərin sayı (n)"]').getAttribute('aria-invalid')`), 'true')
      assert.equal(await evaluate(`document.querySelectorAll('${board} svg ellipse, ${board} polygon').length`), 0)
    }
    await setN(7)
  }
  // Cancel both via Escape and explicit cancel; degenerate clicks never commit.
  await action(cases[0][0]); await at(80, 80); await at(81, 80)
  assert.equal(await evaluate(`document.querySelectorAll('${board} polygon:not([data-geometry-transient])').length`), 0)
  await escape()
  await tool(cases[1][0]); await at(80, 80); await at(180, 100, false)
  assert.ok(await evaluate('document.querySelector("[data-geometry-template-preview]")'))
  await textButton('Çəkilişi ləğv et')
  assert.equal(await evaluate(`document.querySelectorAll('${board} svg ellipse').length`), 0)
  if (quadrilaterals) for (const [label] of cases) {
    await tool(label); await at(80, 80); await at(180, 100, false); await escape()
    assert.equal(await evaluate(`document.querySelectorAll('${board} svg ellipse').length`), 0)
  }
  for (const [label, x, y, dx, dy, n] of cases) {
    await tool(label); if (regular && label === 'Düzgün n-bucaqlı') await setN(n)
    await at(x, y); await at(x + dx, y + dy, false)
    assert.ok(await evaluate('document.querySelector("[data-geometry-template-preview]")'))
    await send('Emulation.setEmulatedMedia', { media: 'print' })
    assert.equal(await evaluate('[...document.querySelectorAll("[data-geometry-transient]")].every(e=>getComputedStyle(e).display==="none")'), true)
    await send('Emulation.setEmulatedMedia', { media: '' })
    await at(x + dx, y + dy)
    assert.equal(await evaluate('document.querySelectorAll("[data-geometry-transient]").length'), 0)
    assert.equal(await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon > button')].find(b=>b.textContent==='Seç').getAttribute('aria-pressed')"), 'true')
  }
  // Save while a new draft is visible: only the completed two triangles survive.
  await tool(cases[0][0]); await at(300, 80); await at(380, 100, false)
  await click(`${frame} .visual-frame__actions button`); await until(`document.querySelector('${frame} .geometry-polygons')`)
  const source = await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)')
  assert.equal(source.polygons.length, cases.length); assert.equal(source.points.length, regular ? cases.reduce((sum,c)=>sum+c[5],0) : cases.length * vertexCount)
  if (regular) assert.deepEqual(source.polygons.map(p=>p.template.n), cases.map(c=>c[5]))
  assert.deepEqual(source.polygons.map(p => p.template.kind), kinds)
  source.polygons.forEach(p => assertFigure(source, p))
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-transient]").length'), 0)
  const shape = `${frame} .geometry-polygons polygon`, shapeBefore = await box(shape)
  await drag(`${frame} [data-handle=se]`, 100, 80)
  const resized = await box(shape)
  assert.ok(Math.abs(resized.width - shapeBefore.width) < .01); assert.ok(Math.abs(resized.height - shapeBefore.height) < .01, 'Scale stable within browser subpixel precision')
  await drag(`${frame} .visual-frame__move`, 30, 30)
  await click(`${frame} .visual-frame__actions button:nth-child(2)`); await until('requests.at(-1).url.endsWith("/visual-placement")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'), source)
  await textButton('Çərçivə əlavə et'); await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await tool(cases[1][0]); await at(80, 80); await at(220, 80)
  await click('[data-frame-id=frame-2] .visual-frame__actions button'); await until('!document.querySelector(".geometry-authoring-board")')
  const sourceB = await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-2").payload.source_data)')
  assert.equal(sourceB.polygons.length, 1); assertFigure(sourceB, sourceB.polygons[0])
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'), source)
  await evaluate('reloadEditor()'); await until('document.querySelectorAll("[data-frame-id]").length===2 && document.querySelector("math-field")')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'), textBefore)
  assert.equal(await evaluate('document.querySelector("math-field").value'), formula)
  // Select each triangle in the existing board and remove via the existing menu.
  await click(frame); await click(`${frame} .visual-frame__actions button`); await until(`document.querySelector('${board}')`)
  for (let i = 0; i < cases.length; i++) {
    await action('Seç')
    await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`)
    const r = await box(`${board} polygon:not([data-geometry-transient])`)
    await pointer('mousePressed', r.x + r.width / 3, r.y + r.height / 3, { button: 'left', clickCount: 1 })
    await pointer('mouseReleased', r.x + r.width / 3, r.y + r.height / 3, { button: 'left', clickCount: 1 }); await delay(100)
    await menu('Daha çox'); await action('Seçiləni sil')
    assert.equal(await evaluate(`document.querySelectorAll('${board} polygon:not([data-geometry-transient])').length`), cases.length - 1 - i)
  }
  await click(`${frame} .visual-frame__actions button`); await until('!document.querySelector(".geometry-authoring-board")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2").payload.source_data'), sourceB)
  console.log(`PASS: real Edge ${regular ? 'regular 5/6/3/7-gons, compact n UI and invalid input' : quadrilaterals ? 'all five quadrilateral templates' : 'both triangle templates'}, pointer preview/commit, mathematical properties, no labels, degeneration/cancel, print/save exclusion, selection/delete, frame scale/placement, independent frames and mixed document`)
  return source
}
