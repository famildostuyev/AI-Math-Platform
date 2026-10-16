import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
let raw='';for await(const c of process.stdin)raw+=c
const scene=JSON.parse(raw),a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),p=await loadGeometryModule('geometry3dProjection')
const def=structuredClone(scene.solids.find(s=>s.id==='cube'));def.parameters.side=4;def.frame=a.solidFrame3D([1,2,0],[0,0,30])
let edited=a.editSolid3D(scene,def);assert.ok(edited);const ids=scene.solids.find(s=>s.id==='cube').features;assert.deepEqual(edited.solids.find(s=>s.id==='cube').features,ids)
// Keep both the concave prism and its concave pyramid valid (apex must remain in the kernel).
edited=m.moveGeometryPoint3D(edited,'b1',[3,-.2,0]);assert.ok(edited);assert.deepEqual(edited.points.find(p=>p.id==='concave_v_1').position,[3,-.2,0])
let document=scene;const h=m.createGeometryHistory3D(scene,x=>document=x);assert.ok(h.commit(edited));assert.ok(h.provider.undo());assert.deepEqual(document,scene);assert.ok(h.provider.redo());assert.deepEqual(document,edited)
assert.equal(p.geometrySceneSVG3D(edited),p.geometrySceneSVG3D(JSON.parse(JSON.stringify(edited))))
const detached=a.deleteSolid3D(edited,'cube');assert.ok(detached);assert.ok(detached.scene.points.some(p=>p.id==='cube_v_0'))
process.stdout.write(JSON.stringify({edited,detached:detached.scene}))
