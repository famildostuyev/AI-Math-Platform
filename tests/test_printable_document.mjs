import assert from 'node:assert/strict'
import test from 'node:test'
import { printableComponent as component, requireFrontend } from './printable_test_modules.mjs'
const React = requireFrontend('react')
const { renderToStaticMarkup } = requireFrontend('react-dom/server')
const PrintableDocument = component('PrintableDocument').default
const { preparePrintableDocument: prepare, namespacePrintableSVG } = component('printableDocumentModel')
const { createPrintableSnapshot } = component('printableRevisionSnapshot')
const model = component('geometry3dModel'), author = component('geometry3dSolidAuthoring'), surface = component('geometry3dSurfacePoints')
const projection = component('geometry3dProjection')
const revisionId = '11111111-1111-4111-8111-111111111111'
const paragraph = content => ({ type: 'paragraph', attrs: { alignment: 'center' }, content })
const text = (value, marks = []) => ({ type: 'text', text: value, marks })
const textBlock = (id = 'text', order = 0, document = { type: 'document', content: [paragraph([text('Sual α')])] }) => ({
  id, sort_order: order, block_type: 'text', payload: { format_version: 1, source_text: 'not the canonical formatted content', document },
})
const geometryBlock = (scene, id = 'geometry', order = 1, visual_placement) => ({ id, block_type: 'geometry', sort_order: order, visual_placement, payload: { format_version: 1, source_data: scene } })
const geometry2D = { schema_version: 1, description: '2D şəkil', viewport: { min_x: 0, min_y: 0, width: 100, height: 100 },
  points: [{ id: 'P', x: 10, y: 20, label: 'Ə₁' }, { id: 'Q', x: 70, y: 70, label: null }], segments: [], polygons: [], texts: [],
  lines: [{ id: 'v', kind: 'vector', start_point_id: 'P', end_point_id: 'Q' }] }
function cylinder(projectionType = 'orthographic') {
  let scene = author.createCylinderAt3D(model.emptyGeometryScene3D(), [0, 0, 0], 'XY', 'C').scene
  scene = surface.createPointOnCylinderSurface3D(scene, 'C_surface', [0, .5], 'attached')
  scene = surface.editCylinderSurfacePointLabel3D(scene, 'attached', 'M₁ α & <β>')
  scene.print_camera = { ...scene.print_camera, projection: projectionType, position: [10, 0, 3], target: [0, 0, 1], up: [0, 0, 1] }
  return scene
}
function snapshot(blocks) {
  return createPrintableSnapshot([revisionId], [{ revision_id: revisionId, revision_number: 2, updated_at: '2026-10-18T10:00:00Z',
    question_family_id: revisionId, question_form_id: revisionId, status: 'draft', question_type_id: revisionId,
    source_id: null, source_detail: null, source_display_name: null, primary_topic_id: null, related_topic_ids: [], purpose_ids: [], difficulty: null,
    blocks, answer_policy: 'accepted_answer', accepted_answers: [{ text: 'SECRET_ANSWER' }], answer_options: [], solution: { text: 'SECRET_SOLUTION' },
  }])
}
const render = (data, instanceId = 'test') => renderToStaticMarkup(React.createElement(PrintableDocument, { snapshot: data, instanceId }))
test('canonical paragraphs, all formatting, hard breaks and lists render statically', () => {
  const marks = [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }, { type: 'font_family', value: 'times-new-roman' },
    { type: 'font_size', value: 18 }, { type: 'foreground_color', value: '#123456' }, { type: 'background_color', value: '#abcdef' }]
  const document = { type: 'document', content: [paragraph([text('Mətn <&>', marks), { type: 'hard_break' }, text('son')]),
    ...['bullet_list', 'ordered_list'].map(type => ({ type, content: [{ type: 'list_item', content: [paragraph([text('Bənd')]), paragraph([text('ikinci')])] }] }))] }
  const data = snapshot([textBlock('formatted', 0, document)])
  const html = render(data)
  for (const fragment of ['<strong>', '<em>', '<u>', '18pt', '#123456', '#abcdef', 'Times New Roman', 'text-align:center', '<br/>', '<ul>', '<ol>', '<li>', 'Mətn &lt;&amp;&gt;']) assert.ok(html.includes(fragment), fragment)
  assert.ok(!html.includes('not the canonical')); assert.equal(prepare(data, 'test').exportable, true)
})
test('inline and display math use actual KaTeX HTML and MathML', () => {
  const data = snapshot([textBlock('inline', 0, { type: 'document', content: [paragraph([text('x = '), { type: 'inline_math', latex: '\\frac{1}{2}' }])] }),
    { id: 'formula', block_type: 'formula', sort_order: 1, payload: { source_latex: '\\sum_{i=1}^n i', format_version: 1 } }])
  const html = render(data)
  assert.ok(html.includes('class="katex"')); assert.ok(html.includes('<math')); assert.ok(html.includes('katex-display'))
  assert.equal(prepare(data, 'math').issues.length, 0)
})
test('mixed content preserves canonical order and renders real 2D and 3D SVG', () => {
  const data = snapshot([geometryBlock(cylinder(), 'three', 3), geometryBlock(geometry2D, 'two', 2), textBlock('first', 0),
    { id: 'formula', block_type: 'formula', sort_order: 1, payload: { source_latex: 'x^2' } }])
  const html = render(data)
  assert.deepEqual([...html.matchAll(/data-block-id="([^"]+)"/g)].map(m => m[1]), ['first', 'formula', 'two', 'three'])
  assert.ok(html.includes('data-geometry-kind="vector"')); assert.ok(html.includes('data-render-surface="lateral"'))
  assert.ok(html.includes('Ə₁')); assert.ok(html.includes('M₁ α &amp; &lt;β&gt;'))
  assert.equal(prepare(data, 'mixed').exportable, true)
})
test('null/empty labels keep semantic markers without generated names', () => {
  for (const label of [null, '']) {
    const scene = surface.editCylinderSurfacePointLabel3D(cylinder(), 'attached', label)
    const html = render(snapshot([geometryBlock(scene)]))
    assert.ok(html.includes('data-id="attached"')); assert.ok(!html.includes('M₁'))
    assert.ok(!html.includes('>A</text>'))
    const centers = prepare(snapshot([geometryBlock(scene)]), 'centers').revisions[0].blocks[0].node.geometryV2.points.filter(point => /^C_v_/.test(point.id))
    assert.deepEqual(centers.map(point => point.label), ['O1', 'O2']) // Visibility still follows normal occlusion.
  }
})
for (const camera of ['orthographic', 'perspective']) test(`saved ${camera} camera drives SVG independently of editor session`, () => {
  const scene = cylinder(camera), data = snapshot([geometryBlock(scene)])
  const block = prepare(data, 'camera').revisions[0].blocks[0]
  const expected = namespacePrintableSVG(projection.geometrySceneSVG3D(scene, 520, 400), block.scope)
  assert.equal(block.svg, expected)
  const changed = { ...scene, print_camera: { ...scene.print_camera, position: [-10, 0, 3] } }
  assert.notEqual(block.svg, namespacePrintableSVG(projection.geometrySceneSVG3D(changed, 520, 400), block.scope))
  // A real editor provider cannot influence this component: it never consumes session context.
  const { UniversalEditorSessionContext } = component('universalEditorSession')
  const session = { geometry3DCameras: { current: new Map([['geometry', changed.print_camera]]) } }
  const withinSession = renderToStaticMarkup(React.createElement(UniversalEditorSessionContext.Provider, { value: session }, React.createElement(PrintableDocument, { snapshot: data, instanceId: 'test' })))
  assert.equal(withinSession, render(data))
})
test('multiple scenes and repeated documents namespace mask/marker/title identifiers', () => {
  let scene = cylinder()
  scene = author.createSolid3D(scene, author.defaultSolid3D('cube', 'cube')).scene
  const data = snapshot([geometryBlock(scene, 'one'), geometryBlock(scene, 'two', 2), geometryBlock(geometry2D, 'flat', 3)])
  const html = render(data, 'left') + render(data, 'right')
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
  assert.ok(ids.some(id => id.includes('g3d')), 'fixture must exercise actual mask definitions')
  assert.equal(ids.length, new Set(ids).size)
  for (const match of html.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(match[1]), match[1])
  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(match[1]))
  assert.ok(html.includes('data-render-surface="lateral"'))
  const scoped = namespacePrintableSVG('<svg><mask id="m"/><circle data-id="point" mask="url(#m)"/></svg>', 'instance')
  assert.ok(scoped.includes('id="instance_m"')); assert.ok(scoped.includes('data-id="point"')); assert.ok(scoped.includes('url(#instance_m)'))
})
test('saved floating coordinates, dimensions, reference camera aspect and document bounds preserved', () => {
  const placement = { version: 1, layoutMode: 'floating', anchor: { kind: 'document' }, position: { x: 23, y: 75, unit: 'px' }, size: { width: 640, height: 360, unit: 'px' } }
  const data = snapshot([textBlock(), geometryBlock(cylinder(), 'placed', 1, placement)])
  const plan = prepare(data, 'placement'), html = render(data)
  assert.equal(plan.revisions[0].minWidth, 663); assert.equal(plan.revisions[0].minHeight, 435)
  assert.ok(html.includes('position:absolute;left:23px;top:75px;width:640px;height:360px'))
  assert.ok(html.includes('viewBox="0 0 640 360"')); assert.deepEqual(plan.revisions[0].blocks[1].placement, placement)
})
test('unplaced geometry remains in normal flow; no invented floating origin', () => {
  const html = render(snapshot([textBlock(), geometryBlock(cylinder())]))
  assert.ok(html.includes('position:relative;width:520px;height:400px')); assert.ok(!html.includes('position:absolute'))
})
test('images, reserved and future block types are visible export-blocking issues', () => {
  for (const type of ['image', 'graph', 'table', 'diagram', 'future_block']) {
    const data = snapshot([{ id: 'unsupported', block_type: type, sort_order: 0, payload: { media_asset_id: revisionId, alt_text: 'Şəkil' } }, textBlock('kept', 1)])
    const plan = prepare(data, 'unsupported'), html = render(data)
    assert.equal(plan.exportable, false); assert.equal(plan.issues[0].code, 'unsupported_block')
    assert.equal(plan.issues[0].revisionId, revisionId); assert.equal(plan.issues[0].blockId, 'unsupported')
    assert.ok(html.includes('role="alert"')); assert.ok(html.includes('data-printable-valid="false"')); assert.ok(html.includes('Sual α'))
  }
})
test('invalid geometry and unavailable analytic surfaces do not silently render blank SVG', () => {
  const cone = cylinder(); cone.solids[0].kind = 'cone'
  for (const source of [{ schema_version: 999 }, cone]) {
    const data = snapshot([geometryBlock(source)]), plan = prepare(data, 'bad')
    assert.equal(plan.exportable, false); assert.equal(plan.issues[0].code, 'unsupported_geometry')
    assert.ok(!render(data).includes('<svg'))
  }
})
test('unsupported placement is explicit rather than silently repositioned', () => {
  const placement = { version: 1, layoutMode: 'floating', anchor: { kind: 'document' }, position: { x: 0, y: 0, unit: 'px' }, size: { width: 400, height: 300, unit: 'px' } }
  for (const invalid of [{ ...placement, rotationDegrees: 30 }, { ...placement, anchor: { kind: 'node', nodeId: 'text' } }, { ...placement, size: { ...placement.size, unit: 'relative' } }]) {
    const data = snapshot([geometryBlock(cylinder(), 'badframe', 1, invalid)])
    assert.equal(prepare(data, 'placement').issues[0].code, 'unsupported_placement')
    assert.ok(render(data).includes('role="alert"'))
  }
})
test('unknown structured nodes, marks and invalid mathematics are explicit validation failures', () => {
  const documents = [
    { type: 'document', content: [{ type: 'future_node', content: [] }] },
    { type: 'document', content: [paragraph([{ type: 'future_inline' }])] },
    { type: 'document', content: [paragraph([text('text', [{ type: 'link', value: 'https://example.com' }])])] },
    { type: 'document', content: [paragraph([{ type: 'inline_math', latex: '\\notARealCommand{a}' }])] },
  ]
  for (const document of documents) {
    const data = snapshot([textBlock('badtext', 0, document)])
    assert.equal(prepare(data, 'text').issues[0].code, 'invalid_content'); assert.ok(render(data).includes('role="alert"'))
  }
})
test('rendering is deterministic, keeps snapshot frozen and excludes answers/solutions', () => {
  const data = snapshot([textBlock(), geometryBlock(cylinder())]), before = JSON.stringify(data)
  const html = render(data, 'same'); assert.equal(render(data, 'same'), html)
  assert.equal(JSON.stringify(data), before); assert.ok(Object.isFrozen(data.revisions[0].blocks[1].payload.source_data))
  assert.ok(!html.includes('SECRET_')); assert.ok(!html.includes('contenteditable')); assert.ok(!html.includes('<button')); assert.ok(!html.includes('<canvas'))
  assert.throws(() => prepare(data, ''), /instanceId/)
})
test('multiple saved revisions retain separate document coordinate origins and content boundaries', () => {
  const first = snapshot([textBlock('shared-text'), geometryBlock(cylinder(), 'shared-geometry')]).revisions[0]
  const data = { version: 1, revisions: [first, { ...first, revision_id: '22222222-2222-4222-8222-222222222222' }] }
  const html = render(data), plan = prepare(data, 'boundary')
  assert.deepEqual([...html.matchAll(/data-revision-id="([^"]+)"/g)].map(m => m[1]), data.revisions.map(r => r.revision_id))
  assert.notEqual(plan.revisions[0].blocks[1].scope, plan.revisions[1].blocks[1].scope)
  assert.equal((html.match(/data-block-id="shared-geometry"/g) ?? []).length, 2)
})
