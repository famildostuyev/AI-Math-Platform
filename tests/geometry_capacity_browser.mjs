import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { emptyGeometryV1, normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
const { defaultGeometryPlacement } = await loadGeometryModule('geometryFrameModel')

export async function runGeometryCapacityAcceptance({ evaluate, until, click, box, pointer, delay }) {
  const source = { ...emptyGeometryV1(), description: 'Capacity browser', texts: Array.from({ length: 499 }, (_, i) => ({ id: `note_${i}`, x: 5, y: 5, content: 'Note' })) }
  const other = { ...emptyGeometryV1(), description: 'Independent block' }
  const frame = id => `[data-frame-id="${id}"]`
  const board = '.geometry-authoring-board'
  await until('document.querySelector("math-field")')
  const text = await evaluate('JSON.stringify(savedRevision.blocks[0])')
  const formula = await evaluate('document.querySelector("math-field").value')
  const blocks = [source, other].map((g, i) => ({ id: `frame-${i + 1}`, block_type: 'geometry', sort_order: (i + 1) * 1000, payload: { source_data: g, format_version: 1 }, visual_placement: defaultGeometryPlacement(g, i * 600) }))
  await evaluate(`savedRevision.blocks.push(...${JSON.stringify(blocks)});reloadEditor()`)
  await until(`document.querySelector('${frame('frame-1')}')`)
  const edit = async id => { await click(frame(id)); await until(`document.querySelector('${frame(id)} .visual-frame__actions button')`); await click(`${frame(id)} .visual-frame__actions button`); await until(`document.querySelector('${board}')`) }
  const action = async label => {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`)
    await delay(100)
  }
  const at = async (x, y) => {
    await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`)
    const r = await box(board)
    await pointer('mousePressed', r.x + x, r.y + y, { button: 'left', clickCount: 1 })
    await pointer('mouseReleased', r.x + x, r.y + y, { button: 'left', clickCount: 1 })
    await delay(200)
  }
  const save = async id => {
    await click(`${frame(id)} .visual-frame__actions button`)
    await until('!document.querySelector(".geometry-authoring-board")')
    const g = await evaluate(`structuredClone(savedRevision.blocks.find(b=>b.id===${JSON.stringify(id)}).payload.source_data)`)
    assert.ok(normalize(g)); return g
  }
  await edit('frame-1'); await action('Mətn'); await at(120, 120)
  let g = await save('frame-1'); assert.equal(g.texts.length, 500)
  await evaluate('reloadEditor()'); await until(`document.querySelector('${frame('frame-1')}')`)
  await edit('frame-1'); await action('Mətn'); await at(180, 180)
  assert.equal(await evaluate('document.querySelector(".geometry-editor__annotation")===null'), true, 'Rejected text must not select the previous annotation')
  assert.deepEqual(await save('frame-1'), g)
  const full = structuredClone(g)
  await edit('frame-2'); await action('Mətn'); await at(100, 100)
  assert.equal((await save('frame-2')).texts.length, 1)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'), full)
  // Two new endpoints cannot fit in one remaining point slot.
  g = { ...g, points: Array.from({ length: 499 }, (_, i) => ({ id: `point_${i}`, x: 10, y: 10, label: null })) }
  await evaluate(`savedRevision.blocks.find(b=>b.id==='frame-1').payload.source_data=${JSON.stringify(g)};reloadEditor()`)
  await until(`document.querySelector('${frame('frame-1')}')`); await edit('frame-1')
  await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.startsWith('Xətt'));if(!d.open)d.querySelector('summary').click()})()`)
  await action('Düz xətt'); await at(100, 100); await at(200, 200)
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`), 499)
  assert.deepEqual(await save('frame-1'), g, 'Rejected line must not publish one endpoint or bind an unrelated point')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'), text)
  assert.equal(await evaluate('document.querySelector("math-field").value'), formula)
  console.log('PASS: Edge capacity acceptance: exact text boundary/reload, rejected text selection, compound rollback, geometry and text/formula isolation')
}
