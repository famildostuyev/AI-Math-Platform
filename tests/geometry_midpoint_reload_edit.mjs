// Uses the actual frontend edit boundary on a freshly reloaded API document.
import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { moveGeometryPoint } = await loadGeometryModule('geometryAuthoringModel')
const { normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')
let input='';for await (const chunk of process.stdin)input+=chunk
const source=JSON.parse(input),id=source.constructions.find(c=>c.kind==='midpoint').source_point_ids[0],p=source.points.find(p=>p.id===id)
const next=moveGeometryPoint(source,id,p.x+3,p.y+2)
assert.ok(normalize(next));assert.notDeepEqual(next.points,source.points)
assert.deepEqual(next.constructions,source.constructions)
const outputs=new Set(source.constructions.map(c=>c.kind==='midpoint'?c.output_point_id:c.support_point_id))
assert.ok(next.points.some(p=>outputs.has(p.id)&&JSON.stringify(p)!==JSON.stringify(source.points.find(q=>q.id===p.id))))
process.stdout.write(JSON.stringify(next))
