import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
let input='';for await(const chunk of process.stdin)input+=chunk
const source=JSON.parse(input)
const { createGeometryHistory3D, deleteGeometryTarget3D }=await loadGeometryModule('geometry3dModel')
const { standardView3D, geometrySceneSVG3D }=await loadGeometryModule('geometry3dProjection')
let edited=source
const history=createGeometryHistory3D(source,next=>edited=next)
assert.ok(history.navigate(standardView3D(source.print_camera,'top')))
assert.ok(history.commit({...source,print_camera:history.getEditingCamera()}))
assert.ok(history.provider.undo());assert.deepEqual(edited,source)
assert.ok(history.provider.redo())
const detached=deleteGeometryTarget3D(edited,'line_ab')
assert.ok(detached)
const svg=geometrySceneSVG3D(edited)
assert.equal(svg,geometrySceneSVG3D(JSON.parse(JSON.stringify(edited))))
assert.ok(svg.includes('data-id="d"'))
process.stdout.write(JSON.stringify({edited,detached:detached.scene}))
