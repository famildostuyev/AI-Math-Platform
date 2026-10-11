import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
let input='';for await(const chunk of process.stdin)input+=chunk
const source=JSON.parse(input)
const {createPoint3D,createPrimitive3D,editPoint3D,editReferences3D,deletePrimitive3D}=await loadGeometryModule('geometry3dAuthoring')
const {createGeometryHistory3D}=await loadGeometryModule('geometry3dModel')
let edited=source
const history=createGeometryHistory3D(source,next=>edited=next)
let candidate=createPoint3D(source,[1,2,3],'new_point').scene
candidate=createPrimitive3D(candidate,'vector',['c','new_point'],'new_vector').scene
candidate=editPoint3D(candidate,'a',[.5,0,0],'A')
candidate=editReferences3D(candidate,'segment_ab',['c','new_point'])
assert.ok(candidate);assert.ok(history.commit(candidate));assert.ok(history.provider.undo());assert.deepEqual(edited,source);assert.ok(history.provider.redo())
assert.equal(edited.points.find(p=>p.id==='d').position[0],5.5)
const detached=deletePrimitive3D(edited,'line_ab')
assert.ok(detached);assert.equal(detached.losses[0].subject_id,'d');assert.equal(detached.scene.points.find(p=>p.id==='d').position[0],5.5)
assert.ok(detached.scene.linear_objects.some(p=>p.id==='new_vector'))
process.stdout.write(JSON.stringify({edited,detached:detached.scene}))
