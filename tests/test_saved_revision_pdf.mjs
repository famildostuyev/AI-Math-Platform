import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { printableComponent as component, requireFrontend } from './printable_test_modules.mjs'
const { validateSavedRevisionPdf, savedRevisionPdfPages, printSavedRevisionPdf, waitForSavedRevisionPrint, validateSavedRevisionLayout } = component('savedRevisionPdfModel')
const { createPrintableSnapshot } = component('printableRevisionSnapshot')
const Pages = component('SavedRevisionPrintPages').default
const React = requireFrontend('react'), { renderToStaticMarkup } = requireFrontend('react-dom/server')
const model = component('geometry3dModel'), author = component('geometry3dSolidAuthoring'), surface = component('geometry3dSurfacePoints')
const id = '11111111-1111-4111-8111-111111111111', secondId = '22222222-2222-4222-8222-222222222222'
let scene = author.createCylinderAt3D(model.emptyGeometryScene3D(), [0, 0, 0], 'XY', 'C').scene
scene = surface.createPointOnCylinderSurface3D(scene, 'C_surface', [0, .5], 'attached')
scene = surface.editCylinderSurfacePointLabel3D(scene, 'attached', 'M₁ α')
scene.print_camera = { ...scene.print_camera, position: [10, 0, 3], target: [0, 0, 1] }
function revision(revision_id = id) {
  return { revision_id, revision_number: 2, updated_at: '2026-10-18T10:00:00Z', blocks: [
    { id: 'text', block_type: 'text', sort_order: 0, payload: { document: { type: 'document', content: [{ type: 'paragraph', attrs: null, content: [{ type: 'text', text: 'REAL_QUESTION', marks: [] }, { type: 'inline_math', latex: 'x^2' }] }] } } },
    { id: 'geometry', block_type: 'geometry', sort_order: 1, payload: { source_data: scene } },
    { id: 'geometry2d', block_type: 'geometry', sort_order: 2, payload: { source_data: { schema_version: 1, description: '2D fixture', viewport: { min_x: 0, min_y: 0, width: 100, height: 100 }, points: [], segments: [], polygons: [], texts: [] } } },
  ], answer_options: [{ text: 'SECRET_KEY' }], solution: { text: 'SECRET_SOLUTION' } }
}
const snapshot = createPrintableSnapshot([secondId, id], [revision(), revision(secondId)])
const ready = { status: 'ready', snapshot }
const render = instanceId => renderToStaticMarkup(React.createElement(Pages, { snapshot, pageCount: 2, instanceId }))
test('real selection order and original immutable revision references reach both page views', () => {
  const questions = savedRevisionPdfPages(snapshot, 2).flatMap(page => [...page.left, ...page.right])
  assert.deepEqual(questions.map(q => q.snapshot.revisions[0].revision_id), [secondId, id])
  questions.forEach((question, index) => assert.equal(question.snapshot.revisions[0], snapshot.revisions[index]))
  assert.deepEqual(questions.map(q => q.number), [1, 2]); assert.equal(questions.reduce((sum, q) => sum + q.score, 0), 100)
})
test('preview and export have identical real content except deliberately distinct SVG namespaces', () => {
  const preview = render('saved-preview'), exported = render('saved-export')
  const scrub = html => html.replace(/print_[0-9a-f_]+_r\d+_b\d+/g, 'SCOPE')
  assert.equal(scrub(preview), scrub(exported)); assert.notEqual(preview, exported)
  for (const html of [preview, exported]) {
    assert.ok(html.includes('REAL_QUESTION')); assert.ok(html.includes('M₁ α')); assert.ok(html.includes('class="katex"'))
    assert.ok(html.includes('data-render-surface="lateral"')); assert.ok(!html.includes('SECRET_')); assert.ok(!html.includes('placeholder')); assert.ok(!html.includes('geo-a'))
    assert.deepEqual([...html.matchAll(/data-revision-id="([^"]+)"/g)].map(m => m[1]), [secondId, id])
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length)
  }
})
test('missing/loading/error/empty snapshots cannot become a real export', () => {
  for (const state of [{ status: 'idle', snapshot: null }, { status: 'loading', snapshot: null }, { status: 'error', snapshot: null, message: 'deleted' }, { status: 'ready', snapshot: { version: 1, revisions: [] } }]) {
    const result = validateSavedRevisionPdf(state); assert.equal(result.snapshot, null); assert.ok(result.issues.length)
  }
})
function fakeRoot({ fontFailure = false, fontReady = Promise.resolve(), renderError = false, widthOverflow = false, heightOverflow = false } = {}) {
  const events = [], fonts = { ready: fontReady, async load() { events.push('font-load'); if (fontFailure) throw new Error('font failed') }, check() { events.push('font-check'); return true } }
  const document = { fonts, defaultView: { requestAnimationFrame: callback => setTimeout(callback, 0), getComputedStyle: () => ({ fontStyle: 'normal', fontWeight: '400', fontSize: '16px', fontFamily: 'Arial' }) } }
  return { events, isConnected: true, ownerDocument: document,
    querySelector(selector) { return selector.includes('render-error') ? renderError ? {} : null : {} },
    querySelectorAll(selector) {
      if (selector.includes('p, span')) return [{ textContent: 'M₁ α' }]
      if (selector === '[data-saved-question]' && widthOverflow) return [{ scrollWidth: 520, clientWidth: 320, dataset: { savedQuestion: '1' } }]
      if (selector === '.ksq-column' && heightOverflow) return [{ scrollHeight: 1200, clientHeight: 1000, querySelectorAll: () => [], style: {} }]
      return []
    },
  }
}
test('print gate waits for actual readiness before authorize and print', async () => {
  const root = fakeRoot()
  await printSavedRevisionPdf(ready, root, { isCurrent: () => true, authorize: () => root.events.push('authorize'), print: () => root.events.push('print') })
  assert.deepEqual(root.events, ['font-load', 'font-check', 'authorize', 'print'])
})
test('unsupported content blocks export with actionable block identity', async () => {
  const unsupported = createPrintableSnapshot([id], [{ ...revision(), blocks: [{ id: 'image-block', block_type: 'image', sort_order: 0, payload: { media_asset_id: id, alt_text: null } }] }])
  const state = { status: 'ready', snapshot: unsupported }, result = validateSavedRevisionPdf(state)
  assert.ok(result.issues[0].includes('image-block')); assert.ok(result.issues[0].includes('yenidən'))
  let printed = false
  await assert.rejects(printSavedRevisionPdf(state, fakeRoot(), { isCurrent: () => true, authorize() {}, print() { printed = true } }), /image-block/)
  assert.equal(printed, false)
})
test('font and renderer failures do not print', async () => {
  for (const config of [{ fontFailure: true }, { renderError: true }]) {
    let printed = false
    await assert.rejects(printSavedRevisionPdf(ready, fakeRoot(config), { isCurrent: () => true, authorize() {}, print() { printed = true } }))
    assert.equal(printed, false)
  }
})
test('stale selection during font loading cannot print an old snapshot', async () => {
  let resolve, current = true, printed = false
  const fontReady = new Promise(r => { resolve = r }), root = fakeRoot({ fontReady })
  const request = printSavedRevisionPdf(ready, root, { isCurrent: () => current, authorize() {}, print() { printed = true } })
  await new Promise(r => setTimeout(r, 15)); current = false; resolve()
  await assert.rejects(request, /dəyişdi/); assert.equal(printed, false)
})
test('font timeout and detached roots fail explicitly', async () => {
  await assert.rejects(waitForSavedRevisionPrint(fakeRoot({ fontReady: new Promise(() => {}) }), { isCurrent: () => true, timeoutMs: 20 }), /vaxt həddini/)
  const root = fakeRoot(); root.isConnected = false
  await assert.rejects(waitForSavedRevisionPrint(root, { isCurrent: () => true }), /dəyişdi/)
})
test('oversized content is blocked instead of clipped; page-count allocation remains unchanged', async () => {
  for (const config of [{ widthOverflow: true }, { heightOverflow: true }]) {
    const root = fakeRoot(config); assert.ok(validateSavedRevisionLayout(root).length)
    await assert.rejects(printSavedRevisionPdf(ready, root, { isCurrent: () => true, authorize() { assert.fail('must not authorize') }, print() { assert.fail('must not print') } }))
  }
  assert.throws(() => savedRevisionPdfPages(snapshot, 0), /1–8/)
})
test('production TestBuilder routes admins to the real workflow; demo is explicitly marked', () => {
  const app = fs.readFileSync(new URL('../frontend/src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /if \(canPrepareSavedRevisions\) return <SavedRevisionPdfPreparation/)
  assert.match(app, /canPrepareSavedRevisions=\{isAdmin\}/); assert.match(app, /DEMO — nümunə suallar/)
  const workflow = fs.readFileSync(new URL('../frontend/src/components/SavedRevisionPdfPreparation.tsx', import.meta.url), 'utf8')
  assert.ok(!workflow.includes('mockQuestions')); assert.ok(workflow.includes('snapshot={validation.snapshot}'))
})
