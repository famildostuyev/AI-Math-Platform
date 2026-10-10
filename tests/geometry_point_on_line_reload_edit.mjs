// Apply production frontend edits to a document freshly loaded from the real API.
import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {moveGeometryPoint,deleteGeometrySelection}=await loadGeometryModule('geometryAuthoringModel')
const {normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
let input='';for await(const chunk of process.stdin)input+=chunk
const source=JSON.parse(input),constraint=source.constructions.find(c=>c.kind==='point_on_line'),d=source.points.find(p=>p.id===constraint.output_point_id)
const moved=moveGeometryPoint(source,d.id,d.x+5,d.y+2)
assert.ok(normalize(moved));assert.notDeepEqual(moved.points,source.points)
assert.notEqual(moved.constructions.find(c=>c.id===constraint.id).t,constraint.t)
const detached=deleteGeometrySelection(moved,{kind:'line',id:constraint.parent.line_id})
assert.ok(normalize(detached));assert.deepEqual(detached.points.find(p=>p.id===d.id),moved.points.find(p=>p.id===d.id))
assert.deepEqual(detached.segments,moved.segments);assert.deepEqual(detached.texts,moved.texts)
assert.ok(!detached.constructions.some(c=>c.id===constraint.id))
process.stdout.write(JSON.stringify({moved,detached}))
