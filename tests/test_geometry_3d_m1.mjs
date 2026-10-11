import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const model = await loadGeometryModule('geometry3dModel')
const { normalizeGeometryScene3D } = await loadGeometryModule('geometry3d')
const { normalizeGeometrySourceData } = await loadGeometryModule('geometrySourceData')
const { adaptContentBlocksToUniversalDocument } = await loadGeometryModule('universalEditorDocumentAdapter')
const { emptyGeometryV1 } = await loadGeometryModule('geometryV1')
const source = JSON.parse(await fs.readFile(new URL('./geometry_3d_canonical.json', import.meta.url), 'utf8'))
const before = structuredClone(source)
assert.ok(normalizeGeometryScene3D(model.emptyGeometryScene3D()))
assert.deepEqual(model.evaluateGeometryScene3D(source), { status: 'ok', scene: source })
const moved = model.moveGeometryPoint3D(source, 'b', [2, 0, 0])
assert.deepEqual(moved.points.find(p => p.id === 'd').position, [4, 0, 0])
assert.deepEqual(source, before, 'evaluation/transactions immutable')
assert.equal(model.moveGeometryPoint3D(source, 'd', [3, 0, 0]), null, 'derived point cannot be moved freely')
assert.equal(model.moveGeometryPoint3D(source, 'missing', [3, 0, 0]), null)
assert.equal(model.moveGeometryPoint3D(source, 'b', [0, 0, 0]), null, 'invalid atomic rejection')
for (const [kind, fields, expected] of [
  ['midpoint', { a: 'a', b: 'b' }, [0.5, 0, 0]],
  ['point_on_edge', { edge_id: 'edge_ab', t: 0.25 }, [0.25, 0, 0]],
  ['point_on_face', { face_id: 'face_abc', uv: [0.2, 0.3] }, [0.2, 0.3, 0]],
  ['point_on_linear', { linear_id: 'line_ab', t: -3 }, [-3, 0, 0]],
]) {
  const candidate = structuredClone(source)
  candidate.constructions[0] = { id: 'constraint_d', kind, ...fields, output_point_id: 'd' }
  const evaluated = model.evaluateGeometryScene3D(candidate)
  assert.equal(evaluated.status, 'ok', kind)
  assert.deepEqual(evaluated.scene.points.find(p => p.id === 'd').position, expected, kind)
}
const chain = structuredClone(source)
chain.points.push({ id: 'e', position: [1, 0, 0], label: null })
chain.constructions.push({ id: 'before_parent_lexically', kind: 'midpoint', a: 'a', b: 'd', output_point_id: 'e' })
chain.linear_objects.push({ id: 'line_cd', kind: 'segment', a: 'c', b: 'd' })
assert.deepEqual(model.moveGeometryPoint3D(chain, 'b', [3, 0, 0]).points.find(p => p.id === 'e').position, [3, 0, 0])
const cycle = structuredClone(source); cycle.linear_objects[0].a = 'd'
assert.equal(model.evaluateGeometryScene3D(cycle).status, 'invalid')
const invalid = structuredClone(source); invalid.constructions[0].linear_id = 'missing'
assert.equal(model.evaluateGeometryScene3D(invalid).status, 'invalid')
let applied = source, applies = 0
const history = model.createGeometryHistory3D(source, next => { applied = next; applies++ })
assert.equal(history.commit(source), false)
assert.equal(history.commit(invalid), false)
assert.equal(history.provider.getSnapshot(), 0)
assert.ok(history.navigate({ ...source.print_camera, position: [7, 5, 3] }))
assert.equal(history.provider.getSnapshot(), 0, 'session camera has no history')
assert.deepEqual(history.getScene().print_camera, source.print_camera)
assert.ok(history.commit(moved)); assert.equal(applies, 1)
assert.ok(history.provider.undo()); assert.deepEqual(applied, source)
assert.ok(history.provider.redo()); assert.deepEqual(applied, moved)
const cameraEdit = { ...moved, print_camera: { ...moved.print_camera, position: [6, 4, 2] } }
assert.ok(history.commit(cameraEdit)); assert.ok(history.provider.undo()); assert.deepEqual(applied, moved)
const deletion = model.deleteGeometryTarget3D(moved, 'line_ab')
assert.ok(deletion)
assert.deepEqual(deletion.losses, [{ subject_id: 'd', parent_id: 'line_ab', reason: 'parent_deleted', preserved_world_position: [4, 0, 0] }])
assert.deepEqual(deletion.scene.points.find(p => p.id === 'd').position, [4, 0, 0])
assert.equal(deletion.scene.annotations[0].anchor.point_id, 'd')
assert.ok(history.commit(deletion.scene)); assert.ok(history.provider.undo())
assert.ok(applied.constructions.some(c => c.output_point_id === 'd'))
const attached = structuredClone(source); attached.annotations[0].anchor = { kind: 'edge', edge_id: 'edge_ab', t: 0.5 }
const lost = model.deleteGeometryTarget3D(attached, 'edge_ab')
assert.deepEqual(lost.scene.annotations[0].anchor, { kind: 'world', position: [0.5, 0, 0] })
assert.equal(lost.losses[0].subject_id, 'label_d')
const detachedChain = model.deleteGeometryTarget3D(chain, 'line_ab')
assert.equal(detachedChain.scene.constructions.length, 1, 'downstream recipe remains valid')
assert.ok(detachedChain.scene.linear_objects.some(l => l.id === 'line_cd'), 'valid downstream geometry retained')
const faceAttachment = structuredClone(source)
faceAttachment.constructions[0] = { id: 'constraint_d', kind: 'point_on_face', face_id: 'face_abc', uv: [0.2, 0.3], output_point_id: 'd' }
faceAttachment.annotations[0].anchor = { kind: 'face', face_id: 'face_abc', uv: [0.2, 0.3] }
const removedFace = model.deleteGeometryTarget3D(faceAttachment, 'face_abc')
assert.equal(removedFace.losses.length, 2)
assert.deepEqual(removedFace.scene.points.find(p => p.id === 'd').position, [0.2, 0.3, 0])
assert.deepEqual(removedFace.scene.annotations[0].anchor, { kind: 'world', position: [0.2, 0.3, 0] })
const solid = structuredClone(source)
solid.solids = [{ id: 'cube', kind: 'cube', mode: 'parametric', frame: { origin: [0, 0, 0], x_axis: [1, 0, 0], y_axis: [0, 1, 0] }, parameters: { side: 1 }, features: [{ slot: 'v_0', entity_id: 'a' }] }]
assert.deepEqual(model.evaluateGeometryScene3D(solid).capabilities, ['solid:cube'])
assert.equal(model.moveGeometryPoint3D(solid, 'a', [1, 0, 0]), null)
assert.equal(model.deleteGeometryTarget3D(solid, 'line_ab'), null)
const unavailableHistory = model.createGeometryHistory3D(solid, () => {})
assert.ok(unavailableHistory.commit({ ...solid, description: 'Metadata edit' }))
assert.equal(unavailableHistory.commit({ ...solid, points: moved.points }), false)
assert.equal(unavailableHistory.commit({ ...solid, solids: [] }), false, 'cannot release unverified solid snapshots through a history mutation')
assert.equal(model.transactGeometryScene3D(solid, draft => { draft.solids = [] }), null)
const v1 = { ...emptyGeometryV1(), description: 'Existing 2D' }, v1Before = structuredClone(v1)
const blocks = [v1, source].map((source_data, i) => ({ id: 'block_' + i, block_type: 'geometry', sort_order: i, payload: { source_data, format_version: 1 } }))
const document = adaptContentBlocksToUniversalDocument(blocks)
assert.ok(document.nodes[0].geometryV1); assert.equal(document.nodes[0].geometryV2, null)
assert.ok(document.nodes[1].geometryV2); assert.equal(document.nodes[1].geometryV1, null)
assert.deepEqual(v1, v1Before, 'V1 untouched by V2 transactions')
const reloaded = adaptContentBlocksToUniversalDocument(JSON.parse(JSON.stringify(blocks)))
assert.deepEqual(reloaded, document, 'mixed document save/reload')
assert.deepEqual(normalizeGeometrySourceData(reloaded.nodes[1].sourceData), source)
assert.equal(normalizeGeometrySourceData({ schema_version: 99 }), null)
console.log('PASS: M1 empty/mixed document lifecycle, deterministic recipes/chains, atomic edits, history/cameras, stable IDs, safe deletion and unavailable capabilities')
