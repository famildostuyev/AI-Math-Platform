import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dAuthoring'),s=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),p=await loadGeometryModule('geometry3dProjection')
for(const plane of ['XY','XZ','YZ']){
  const vertices=[[1.3,-2.1],[3.7,-1.4],[4.1,1.2],[.8,.6]].map(([x,y],i)=>({id:'p'+i,position:plane==='XY'?[x,y,0]:plane==='XZ'?[x,0,y]:[0,x,y]}))
  const source=a.createPlanarPath3D(m.emptyGeometryScene3D(),vertices,true,'source').scene
  let scene=s.createPyramidOnFace3D(source,'source','pyramid').scene
  for(let i=0;i<4;i++)assert.deepEqual(scene.points.find(p=>p.id===`pyramid_v_${i}`).position,vertices[i].position,`${plane} exact authoritative source vertex ${i}`)
  for(const view of ['front','top','isometric']){
    const camera=p.standardView3D(scene.print_camera,view),project=p.createProjection3D(camera,800,600)
    for(let i=0;i<4;i++)assert.deepEqual(project.screen(project.view(scene.points.find(p=>p.id===`pyramid_v_${i}`).position)),project.screen(project.view(vertices[i].position)))
  }
  const history=m.createGeometryHistory3D(source,next=>scene=next),saved=structuredClone(scene)
  assert.ok(history.commit(saved));assert.ok(history.provider.undo());assert.deepEqual(scene,source);assert.ok(history.provider.redo());assert.deepEqual(scene,saved)
  assert.deepEqual(m.evaluateGeometryScene3D(JSON.parse(JSON.stringify(saved))).scene,saved)
  const raw=p.scenePrimitives3D(saved).primitives,plan=p.displayPrimitives3D(raw),display=plan.primitives
  assert.equal(raw.filter(p=>p.kind==='segment').length,12)
  assert.equal(display.filter(p=>p.kind==='segment').length,8,'one stroke per unique source/solid edge')
  assert.equal(display.filter(p=>p.kind==='face').length,6,'source face and solid semantic faces remain')
  assert.ok([...plan.aliases.values()].some(ids=>ids.includes('pyramid_e_0')&&ids.includes('source_e0')),'highlight aliases retain both semantic edge IDs')
  const apex=s.pyramidApexDrag3D(saved,'pyramid_v_4'),higher=s.changePyramidHeight3D(saved,'pyramid_v_4',.5)
  assert.ok(higher);for(let i=0;i<4;i++)assert.deepEqual(higher.points.find(p=>p.id===`pyramid_v_${i}`).position,vertices[i].position)
  const base=s.pyramidBaseDrag3D(saved,'pyramid_v_1'),edited=s.movePyramidBaseVertex3D(saved,'pyramid_v_1',base.position.map((v,i)=>v+(base.base[0][i]-v)*.1))
  assert.ok(edited);assert.equal(edited.solids[0].parameters.base.kind,'polygon');assert.deepEqual(edited.solids[0].features,saved.solids[0].features)
  assert.deepEqual(edited.faces.find(f=>f.id==='source'),source.faces[0]);for(const point of source.points)assert.deepEqual(edited.points.find(p=>p.id===point.id),point)
  assert.ok(apex)
}
console.log('PASS: exact asymmetric source/base pairs, three planes, camera projection, history/reload, deduplicated display strokes, preserved semantic faces and M5 detachment')
