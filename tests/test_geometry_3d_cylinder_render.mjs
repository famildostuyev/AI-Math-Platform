import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
import {cylinderRenderFixture} from './geometry_cylinder_render_fixtures.mjs'
const m=await loadGeometryModule('geometry3dModel'),p=await loadGeometryModule('geometry3dProjection'),g=await loadGeometryModule('geometry3dRenderGeometry'),v=await loadGeometryModule('geometry3dRenderVisibility'),a=await loadGeometryModule('geometry3dAnalytic'),s=await loadGeometryModule('geometry3dSolidAuthoring')
const original=await cylinderRenderFixture(),before=structuredClone(original),solid=original.solids[0]
assert.equal(m.evaluateGeometryScene3D(original).status,'ok')
assert.equal(m.evaluateGeometryRenderScene3D(original).status,'ok')
assert.ok(m.transactGeometryScene3D(original,()=>{}))
assert.equal(s.createSolid3D(m.emptyGeometryScene3D(),solid).id,solid.id)
assert.ok(s.rotateSolid3D(original,solid.id,[0,0,1],.2))
assert.ok(!p.projectScene3D(original,original.print_camera,640,400).faces.some(f=>f.analytic),'derived patches are excluded from semantic picking')
const sparse=structuredClone(original)
sparse.solids[0].features=[{slot:'v_0',entity_id:'center'},{slot:'v_1',entity_id:'top'},{slot:'surface',entity_id:'carrier'}]
sparse.points.push({id:'center',position:[99,99,99],label:null},{id:'top',position:[99,99,99],label:null},{id:'mid',position:[99,99,99],label:null})
sparse.surfaces.push({id:'carrier',kind:'cylinder',solid_id:'cylinder',slot:'surface'})
sparse.constructions.push({id:'mid_recipe',kind:'midpoint',a:'center',b:'top',output_point_id:'mid'})
const evaluated=m.evaluateGeometryRenderScene3D(sparse)
assert.equal(evaluated.status,'ok');assert.deepEqual(evaluated.scene.points.find(p=>p.id==='mid').position,[0,0,2])
sparse.constructions.push({id:'surface_recipe',kind:'point_on_surface',surface_id:'carrier',uv:[0,.5],output_point_id:'front'})
const attached=m.evaluateGeometryRenderScene3D(sparse)
assert.equal(attached.status,'ok')
assert.deepEqual(attached.scene.points.find(p=>p.id==='front').position,a.evaluateAnalyticSurface3D(solid,[0,.5]))
assert.equal(m.evaluateGeometryRenderScene3D({...original,solids:[{...solid,kind:'cone'}]}).status,'ok')
assert.equal(m.evaluateGeometryRenderScene3D({...original,solids:[{...solid,parameters:{radius:NaN,height:4}}]}).status,'invalid')

let comparisons=0
for(const projection of ['orthographic','perspective'])for(const position of [[0,-10,2],[6,-7,7],[0,0,10],[0,0,-6],[.001,-.001,10],[1.500001,-10,4.00001]]){
  const camera={...original.print_camera,projection,position,up:Math.abs(position[0])+Math.abs(position[1])<.01?[0,1,0]:[0,0,1]}
  const scene={...original,print_camera:camera},render=g.cylinderRenderGeometry3D(solid,camera),q=p.projectScene3D(scene,camera,640,400,true),strokes=p.projectedEdgeStrokes3D(q,projection),svg=p.geometrySceneSVG3D(scene,640,400)
  assert.ok(render.patches.length&&q.faces.some(f=>f.analytic))
  assert.equal(svg,p.geometrySceneSVG3D(scene,640,400),'saved-camera determinism')
  assert.ok(!svg.includes('NaN')&&!svg.includes('Infinity'))
  assert.equal((svg.match(/data-render-curve=/g)||[]).length,strokes.filter(s=>s.role).length)
  assert.ok(svg.includes('fill-opacity="1"'))
  assert.ok(q.lines.filter(l=>l.role).every(l=>l.id==='cylinder'),'no transient mesh identities')
  assert.ok(q.lines.filter(l=>l.role).every(l=>['rim','silhouette'].includes(l.role)),'no tessellation seams or cap spokes')
  for(const curve of render.curves.filter(c=>c.role==='silhouette')){
    const frame=a.analyticFrame3D(solid.frame),local=frame.toLocal(curve.vertices[0]),toward=frame.toLocal(projection==='perspective'?camera.position:camera.position.map((x,i)=>x-camera.target[i]))
    const dot=local[0]*toward[0]+local[1]*toward[1]
    assert.ok(Math.abs(dot-(projection==='perspective'?solid.parameters.radius**2:0))<1e-7,'analytic tangent generator')
  }
  if(projection==='orthographic'&&position[0]===0&&position[1]===0){
    assert.equal(render.curves.filter(c=>c.role==='silhouette').length,0)
    assert.equal(strokes.filter(s=>s.role==='rim').length,128,'coincident axial rims have one outline')
  }
  for(const line of q.lines.filter(l=>!l.role)){
    const pieces=strokes.filter(s=>s.id===line.id),dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],len=dx*dx+dy*dy
    if(len<1e-8)continue
    for(const t of [.13,.35,.61,.83]){
      const u=projection==='perspective'?t*line.a[2]/((1-t)*line.b[2]+t*line.a[2]):t,world=q.projection.world(line.viewA.map((x,i)=>x+(line.viewB[i]-x)*u))
      const screen=line.a.map((x,i)=>x+(line.b[i]-x)*t)
      const piece=pieces.find(s=>((screen[0]-s.a[0])*dx+(screen[1]-s.a[1])*dy)>=-1e-7&&((screen[0]-s.b[0])*dx+(screen[1]-s.b[1])*dy)<=1e-7)
      assert.ok(piece);assert.equal(piece.hidden,v.pointHiddenByAnalytic3D(world,camera,[solid]));comparisons++
    }
  }
}
const side=p.projectScene3D(original,original.print_camera,640,400,true),sideSvg=p.geometrySceneSVG3D(original,640,400),strokes=p.projectedEdgeStrokes3D(side,'orthographic')
assert.ok(side.points.some(p=>p.id==='front'));assert.ok(!side.points.some(p=>p.id==='back'))
assert.ok(sideSvg.includes('Front annotation')&&!sideSvg.includes('Back annotation'))
assert.ok(strokes.some(s=>s.id==='background'&&s.hidden));assert.ok(strokes.some(s=>s.id==='background'&&!s.hidden))
assert.ok(strokes.filter(s=>s.id==='foreground').every(s=>!s.hidden))
const obliqueCamera={...original.print_camera,position:[6,-7,7]},oblique=p.projectScene3D(original,obliqueCamera,640,400,true)
assert.ok(p.projectedEdgeStrokes3D(oblique,'orthographic').some(s=>s.role==='rim'&&s.hidden&&s.dashOffset>7),'hidden rim dash phase continues across short display chords')
assert.ok(p.geometrySceneSVG3D({...original,print_camera:obliqueCamera},640,400).includes('stroke-dashoffset='),'short hidden arc segments must not each restart with a solid dash')
assert.deepEqual(original,before,'occlusion does not remove semantic objects')
for(const resolution of [16,64,256]){
  const render=g.cylinderRenderGeometry3D(solid,original.print_camera,resolution)
  assert.equal(render.curves.filter(c=>c.role==='rim').length,2)
  assert.deepEqual(original,before);assert.deepEqual(a.analyticBounds3D(solid),a.analyticBounds3D(before.solids[0]))
}
// Exact planar depth masks, including crossing patches rather than painter averages.
const target={id:'target',kind:'face',analytic:true,ownerId:'target',vertices:[[0,0,5],[10,0,5],[10,10,5],[0,10,5]]}
const occluder={id:'occluder',kind:'face',ownerId:'other',vertices:[[0,0,4],[10,0,6],[10,10,6],[0,10,4]]}
const mask=v.faceOcclusionMasks3D(target,[target,occluder],'orthographic')
assert.equal(mask.length,1);assert.ok(mask[0].every(p=>p[0]<=5+1e-6));assert.ok(mask[0].some(p=>p[0]>4.99))
for(const kind of ['cube','cuboid','prism','pyramid',null]){
  const scene=await cylinderRenderFixture(kind)
  scene.solids.push({...structuredClone(solid),id:'second_cylinder',frame:{...structuredClone(solid.frame),origin:[.5,3,.3]}})
  for(const projection of ['orthographic','perspective']){
    scene.print_camera={...scene.print_camera,projection,position:[6,-9,6]}
    const q=p.projectScene3D(scene,scene.print_camera,640,400,true),svg=p.geometrySceneSVG3D(scene,640,400)
    assert.equal(q.status,'ok');assert.ok(svg.includes('<mask'))
    const masked=new Set(q.faces.filter(f=>v.faceOcclusionMasks3D(f,q.faces,projection).length).map(f=>f.ownerId))
    assert.ok(masked.size>0)
    assert.ok(q.faces.filter(f=>f.analytic).every(f=>f.ownerId==='cylinder'||f.ownerId==='second_cylinder'))
  }
}
// Working-plane frames, clipping and sparse maps remain render-only.
for(const frame of [{origin:[3,-2,1],x_axis:[1,0,0],y_axis:[0,0,1]},{origin:[-2,3,1],x_axis:[0,1,0],y_axis:[0,0,1]}]){
  const scene={...original,solids:[{...solid,frame}]}
  assert.equal(p.projectScene3D(scene,original.print_camera,640,400,true).status,'ok')
}
// Existing M6-B points are evaluated by the same graph in a mixed scene; the
// analytic display adapter may change visibility, never their recipes/IDs/UV.
{
  const cube=s.defaultSolid3D('cube','attached_cube');cube.frame.origin=[-1,-1,0]
  const base=s.createSolid3D(m.emptyGeometryScene3D(),cube).scene
  base.points.push({id:'edge_point',position:[0,0,0],label:'E'},{id:'face_point',position:[0,0,0],label:'F'})
  base.constructions.push({id:'edge_recipe',kind:'point_on_edge',edge_id:base.edges[0].id,t:.25,output_point_id:'edge_point'},{id:'face_recipe',kind:'point_on_face',face_id:base.faces[0].id,uv:[.5,.5],output_point_id:'face_point'})
  const reference=m.evaluateGeometryScene3D(base);assert.equal(reference.status,'ok')
  for(const y of [-3,3]){
    const scene=structuredClone(reference.scene);scene.solids.push({...structuredClone(solid),frame:{...solid.frame,origin:[0,y,0]}})
    const result=m.evaluateGeometryRenderScene3D(scene);assert.equal(result.status,'ok')
    assert.deepEqual(result.scene.constructions,reference.scene.constructions)
    for(const id of ['edge_point','face_point'])assert.deepEqual(result.scene.points.find(p=>p.id===id),reference.scene.points.find(p=>p.id===id))
    assert.equal(p.projectScene3D(scene,original.print_camera,640,400,true).status,'ok')
  }
}
assert.deepEqual(original,before)
console.log(`PASS: cylinder closed patches/rims/silhouettes, axial dedup, ${comparisons} analytic line oracle comparisons, both cameras, masks/overlaps/points/text, saved SVG determinism, sparse IDs and transforms supported`)
