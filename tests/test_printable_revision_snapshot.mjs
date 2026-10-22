import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGeometryModule } from './geometry_test_modules.mjs'

const { createPrintableSnapshot: snapshot, createPrintableRevisionLoader: loader } = await loadGeometryModule('printableRevisionSnapshot')
const model = await loadGeometryModule('geometry3dModel')
const solids = await loadGeometryModule('geometry3dSolidAuthoring')
const surfaces = await loadGeometryModule('geometry3dSurfacePoints')
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
let scene = solids.createCylinderAt3D(model.emptyGeometryScene3D(), [1, 2, 3], 'XZ', 'C').scene
scene = surfaces.createPointOnCylinderSurface3D(scene, 'C_surface', [.2, .7], 'attached')
scene = surfaces.editCylinderSurfacePointLabel3D(scene, 'attached', 'M₁ α')
function revision(id = ids[0]) {
  return {
    revision_id: id, question_family_id: ids[0], question_form_id: ids[1], revision_number: 3,
    status: 'draft', question_type_id: ids[1], source_id: null, source_detail: null,
    source_display_name: null, primary_topic_id: null, related_topic_ids: [ids[1]],
    purpose_ids: [], difficulty: 'medium', updated_at: '2026-10-18T10:00:00Z',
    answer_policy: { secret: true }, answer_options: [{ is_correct: true }], accepted_answers: ['secret'], solution: { secret: true },
    blocks: [
      { id: 'c', block_type: 'geometry', sort_order: 2, visual_placement: { version: 1, position: { x: 10, y: 20 } }, payload: { format_version: 1, source_data: structuredClone(scene) } },
      { id: 'b', block_type: 'formula', sort_order: 1, payload: { source_latex: '\\frac{x}{2}' } },
      { id: 'a', block_type: 'text', sort_order: 1, payload: { format_version: 1, source_text: 'α x', document: { type: 'document', content: [{ type: 'paragraph', attrs: { alignment: 'center' }, content: [{ type: 'text', text: 'α', marks: [{ type: 'bold' }] }, { type: 'inline_math', latex: 'x^2' }] }, { type: 'ordered_list', content: [{ type: 'list_item', content: [{ type: 'paragraph', attrs: null, content: [{ type: 'text', text: 'Bənd', marks: [{ type: 'italic' }] }] }] }] }] } } },
    ],
  }
}
test('selection order and deterministic persisted block order; source untouched', () => {
  const source = [revision(ids[1]), revision()]; const before = structuredClone(source)
  const result = snapshot(ids, source)
  assert.deepEqual(result.revisions.map(r => r.revision_id), ids)
  assert.deepEqual(result.revisions[0].blocks.map(b => b.id), ['a', 'b', 'c'])
  assert.deepEqual(source, before)
})
test('canonical structured text, math, geometry, camera, labels, placement and metadata preserved', () => {
  const source = revision(); const result = snapshot([ids[0]], [source]).revisions[0]
  for (const block of source.blocks) assert.deepEqual(result.blocks.find(b => b.id === block.id), block)
  assert.deepEqual(result.blocks[2].payload.source_data.print_camera, scene.print_camera)
  assert.equal(result.blocks[2].payload.source_data.points.find(p => p.id === 'attached').label, 'M₁ α')
  assert.equal(result.updated_at, source.updated_at); assert.equal(result.revision_number, 3)
})
test('snapshot deeply immutable and detached from editor response', () => {
  const source = revision(); const result = snapshot([ids[0]], [source])
  source.blocks[0].payload.source_data.points[0].label = 'changed'
  source.related_topic_ids.push(ids[0])
  assert.notDeepEqual(result.revisions[0].blocks[2], source.blocks[0])
  assert.throws(() => { result.revisions[0].blocks[2].payload.source_data.print_camera.position[0] = 9 }, TypeError)
  assert.throws(() => result.revisions.push(source), TypeError)
  assert.equal(result.revisions[0].related_topic_ids.length, 1)
})
test('answers, solutions and unrecognized aggregate fields excluded', () => {
  const result = snapshot([ids[0]], [revision()]).revisions[0]
  for (const key of ['answer_policy', 'answer_options', 'accepted_answers', 'solution']) assert.ok(!(key in result))
})
test('invalid, numeric mock, duplicate, missing and empty selections rejected', () => {
  for (const selection of [[], ['1'], ['KSQ-1'], [ids[0], ids[0]]]) assert.throws(() => snapshot(selection, [revision()]), /distinct saved revision UUIDs/)
  assert.throws(() => snapshot([ids[1]], [revision()]), /not returned/)
  assert.throws(() => snapshot([ids[0]], [{ ...revision(), blocks: [] }]), /no content blocks/)
})
test('loading publishes null before success; reload does not mutate previous snapshot', async () => {
  const states = []; let response = revision()
  const instance = loader(async () => response, state => states.push(state))
  await instance.load([ids[0]])
  const original = states.at(-1).snapshot
  response = { ...revision(), updated_at: '2026-10-19T10:00:00Z' }
  await instance.load([ids[0]])
  assert.deepEqual(states.map(s => s.status), ['loading', 'ready', 'loading', 'ready'])
  assert.equal(states[2].snapshot, null)
  assert.notEqual(original.revisions[0].updated_at, states.at(-1).snapshot.revisions[0].updated_at)
})
for (const [status, code] of [[401, 'unauthorized'], [403, 'unauthorized'], [404, 'missing'], [410, 'missing'], [500, 'loading_failed']]) {
  test(`HTTP ${status} is ${code}; no fallback snapshot`, async () => {
    const states = []; const instance = loader(async () => { throw Object.assign(new Error('request failed'), { status }) }, s => states.push(s))
    await instance.load([ids[0]])
    assert.equal(states.at(-1).code, code); assert.equal(states.at(-1).snapshot, null)
  })
}
test('network, empty and wrong revision response errors handled', async () => {
  for (const [fetch, code] of [[async () => { throw new TypeError('network') }, 'loading_failed'], [async () => ({ ...revision(), blocks: [] }), 'empty'], [async () => revision(ids[1]), 'missing']]) {
    const states = []; await loader(fetch, s => states.push(s)).load([ids[0]])
    assert.equal(states.at(-1).code, code)
  }
})
test('invalid UUIDs rejected before any API request', async () => {
  let calls = 0; const states = []
  await loader(async () => { calls++; return revision() }, s => states.push(s)).load(['1'])
  assert.equal(calls, 0); assert.equal(states.at(-1).code, 'invalid')
})
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
test('component can supply the current authenticated request at load time', async () => {
  const states = []; const instance = loader(null, s => states.push(s))
  await instance.load([ids[0]], async () => revision())
  assert.equal(states.at(-1).status, 'ready')
  await instance.load([ids[0]], async () => { throw Object.assign(new Error('role changed'), { status: 403 }) })
  assert.equal(states.at(-1).code, 'unauthorized'); assert.equal(states.at(-1).snapshot, null)
})
test('latest request wins over stale success and failure', async () => {
  for (const fail of [false, true]) {
    const old = deferred(); const states = []
    const instance = loader(id => id === ids[0] ? old.promise : Promise.resolve(revision(ids[1])), s => states.push(s))
    const first = instance.load([ids[0]]); await instance.load([ids[1]])
    const count = states.length
    if (fail) old.reject(new Error('stale failure')); else old.resolve(revision())
    await first; assert.equal(states.length, count); assert.equal(states.at(-1).snapshot.revisions[0].revision_id, ids[1])
  }
})
test('selection clear and unmount cancellation discard pending responses', async () => {
  for (const action of ['clear', 'cancel']) {
    const pending = deferred(); const states = []; const instance = loader(() => pending.promise, s => states.push(s))
    const request = instance.load([ids[0]]); instance[action](); const count = states.length
    pending.resolve(revision()); await request; assert.equal(states.length, count)
    if (action === 'clear') assert.deepEqual(states.at(-1), { status: 'idle', snapshot: null })
  }
})
test('partial batch failure is atomic and never publishes partial content', async () => {
  const states = []
  await loader(async id => { if (id === ids[1]) throw Object.assign(new Error('deleted'), { status: 404 }); return revision() }, s => states.push(s)).load(ids)
  assert.deepEqual(states.map(s => s.status), ['loading', 'error']); assert.equal(states.at(-1).snapshot, null)
})
