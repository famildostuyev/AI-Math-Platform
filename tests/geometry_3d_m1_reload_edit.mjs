import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
let input = ''; for await (const chunk of process.stdin) input += chunk
const source = JSON.parse(input)
const { moveGeometryPoint3D, deleteGeometryTarget3D } = await loadGeometryModule('geometry3dModel')
const edited = moveGeometryPoint3D(source, 'b', [2, 0, 0])
assert.ok(edited)
assert.deepEqual(edited.points.find(p => p.id === 'd').position, [4, 0, 0])
edited.print_camera.position = [6, 4, 3]
const detached = deleteGeometryTarget3D(edited, 'line_ab')
assert.ok(detached); assert.equal(detached.losses.length, 1)
process.stdout.write(JSON.stringify({ edited, detached: detached.scene }))
