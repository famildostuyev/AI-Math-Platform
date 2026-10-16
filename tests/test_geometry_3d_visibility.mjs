import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
import {blockedAt} from './geometry_3d_visibility_oracle.mjs'
const a=await loadGeometryModule('geometry3dAuthoring'),m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring'),p=await loadGeometryModule('geometry3dProjection')
// Independent convex-solid oracle: an edge is visible if any incident outward face faces the camera.
function visibleEdge(scene,edge,camera){
  const points=new Map(scene.points.map(p=>[p.id,p.position])),solid=scene.solids[0],owned=solid.features.filter(f=>f.slot.startsWith('v_')).map(f=>points.get(f.entity_id)),center=owned.reduce((v,q)=>p.add(v,p.scale(q,1/owned.length)),[0,0,0])
  const facing=scene.faces.filter(f=>f.boundary.includes(edge.start)&&f.boundary.includes(edge.end)).map(f=>{
    const v=f.boundary.map(id=>points.get(id)),fc=v.reduce((sum,q)=>p.add(sum,p.scale(q,1/v.length)),[0,0,0]);let n=p.cross(p.sub(v[1],v[0]),p.sub(v[2],v[0]));if(p.dot(n,p.sub(fc,center))<0)n=p.scale(n,-1)
    return p.dot(p.unit(n),p.unit(p.sub(camera.position,camera.projection==='perspective'?fc:camera.target)))
  })
  return facing.some(v=>v>1e-9)?true:facing.some(v=>Math.abs(v)<=1e-9)?null:false
}
let checked=0
for(const plane of ['XY','XZ','YZ'])for(const mode of ['orthographic','perspective']){
  const rotate=([x,y,z])=>plane==='XY'?[x,y,z]:plane==='XZ'?[x,-z,y]:[z,x,y]
  const base=a.createPlanarPath3D(m.emptyGeometryScene3D(),[[-2,-2],[2,-2],[2,2],[-2,2]].map(([x,y],i)=>({id:'p'+i,position:rotate([x,y,0])})),true,'base').scene
  const scene=s.createPyramidFromPolygon3D(base,'base','py').scene,seen=new Map()
  for(const position of [[4,3,3+1e-12],[4,3,3-1e-10],[4,3,1],[-4,-3,1],[4,-3,2],[-3,4,2],[4,3,5],[0,-5,2]]){
    const camera={...scene.print_camera,projection:mode,position:rotate(position)},projected=p.projectScene3D(scene,camera,700,500,true),strokes=p.projectedEdgeStrokes3D(projected,mode),svg=p.geometrySceneSVG3D({...scene,print_camera:camera},700,500)
    assert.equal((svg.match(/stroke-dasharray=/g)??[]).length,strokes.filter(s=>s.hidden).length)
    assert.deepEqual(scene.solids[0].parameters.base.vertices,base.faces[0].boundary.map(id=>base.points.find(p=>p.id===id).position))
    for(const edge of scene.edges){
      const line=projected.lines.find(l=>l.id===edge.id),dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],len=dx*dx+dy*dy;if(len<1e-8)continue
      const pieces=strokes.filter(s=>s.id===edge.id),ranges=pieces.map(s=>({lo:((s.a[0]-line.a[0])*dx+(s.a[1]-line.a[1])*dy)/len,hi:((s.b[0]-line.a[0])*dx+(s.b[1]-line.a[1])*dy)/len,hidden:s.hidden})).sort((a,b)=>a.lo-b.lo)
      assert.ok(Math.abs(ranges.reduce((sum,r)=>sum+r.hi-r.lo,0)-1)<1e-7,'partition has no duplicate strokes or gaps')
      for(const t of [.2,.5,.8]){const visible=visibleEdge(scene,edge,camera);if(visible===null)continue;const actual=ranges.find(r=>t>r.lo&&t<r.hi)?.hidden??false,expected=!visible;assert.equal(actual,expected,`${plane} ${mode} ${position} ${edge.id} @${t}`);checked++
        if(position[2]===1){const u=mode==='perspective'?t*line.a[2]/((1-t)*line.b[2]+t*line.a[2]):t,world=projected.projection.world(p.add(line.viewA,p.scale(p.sub(line.viewB,line.viewA),u)));assert.equal(blockedAt(world,scene,camera,p),actual,`ray ${plane} ${mode} ${position} ${edge.id} @${t}: ${world}`)}
      }
      seen.set(edge.id,new Set([...(seen.get(edge.id)??[]),ranges.some(r=>r.hidden)]))
    }
  }
  assert.ok([...seen.values()].some(set=>set.size===2),'orbit changes classification without index rules')
}
for(const kind of ['cube','prism'])for(const projection of ['orthographic','perspective']){
  const scene=s.createSolid3D(m.emptyGeometryScene3D(),s.defaultSolid3D(kind,kind)).scene
  const camera={...scene.print_camera,projection,position:[5,4,3]},q=p.projectScene3D(scene,camera,700,500,true),strokes=p.projectedEdgeStrokes3D(q,projection)
  for(const edge of scene.edges){const line=q.lines.find(l=>l.id===edge.id),mid=p.scale(p.add(line.a,line.b),.5),dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1];if(dx*dx+dy*dy<1e-8)continue;const hidden=strokes.filter(s=>s.id===edge.id).some(s=>s.hidden&&(mid[0]-s.a[0])*(mid[0]-s.b[0])+(mid[1]-s.a[1])*(mid[1]-s.b[1])<0);assert.equal(hidden,!visibleEdge(scene,edge,camera))}
}
const face={id:'concave',kind:'face',vertices:[[0,0,5],[4,0,5],[4,4,5],[3,4,5],[3,1,5],[1,1,5],[1,4,5],[0,4,5]]},line={id:'behind',kind:'segment',a:[-1,2,10],b:[5,2,10]}
for(const projection of ['orthographic','perspective']){const h=p.hiddenIntervals3D(line,face,projection);assert.equal(h.length,2);assert.ok(Math.abs(h[0][0]-1/6)<1e-9);assert.ok(Math.abs(h[0][1]-2/6)<1e-9);assert.ok(Math.abs(h[1][0]-4/6)<1e-9);assert.ok(Math.abs(h[1][1]-5/6)<1e-9)}
assert.deepEqual(p.hiddenIntervals3D(line,{...face,vertices:[[0,0,5],[1,0,5],[2,0,5]]}),[])
assert.deepEqual(p.hiddenIntervals3D({...line,a:[NaN,2,10]},face),[])
assert.equal(a.createPlanarPath3D(m.emptyGeometryScene3D(),[[0,0],[2,2],[0,2],[2,0]].map(([x,y],i)=>({id:'p'+i,position:[x,y,0]})),true),null)
console.log(`PASS: ${checked} independent face-facing comparisons, near-edge-on self-occlusion regression, both projections, XY/XZ/YZ, orbit, cube/prism, concave intervals, degenerate rejection, dedup and SVG parity`)
