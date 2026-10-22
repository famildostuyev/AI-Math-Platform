import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const g=await loadGeometryModule('geometry3dAnalytic')
const fixtures=JSON.parse(fs.readFileSync(new URL('./geometry_3d_closed_cylinder_fixtures.json',import.meta.url),'utf8'))
const frames=JSON.parse(fs.readFileSync(new URL('./geometry_3d_analytic_fixtures.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')).frames
const records=[]
const close=(a,b,t=1e-8)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<=t,`${a} != ${b}`)
const cylinder=(frame=frames[0],radius=2,height=4)=>({id:'cylinder',kind:'cylinder',mode:'parametric',frame:structuredClone(frame),parameters:{radius,height},features:[]})
function check(solid,ray){
  const before=structuredClone({solid,ray}),hits=g.intersectClosedCylinder3D(solid,ray)
  assert.deepEqual({solid,ray},before)
  assert.deepEqual(g.intersectClosedCylinder3D(solid,ray),hits,'determinism')
  const frame=g.analyticFrame3D(solid.frame),{radius:r,height:h}=solid.parameters,length=Math.hypot(...ray.direction)
  assert.ok(hits.length<=2,`closed convex cylinder boundary hits: ${JSON.stringify({ray,hits})}`)
  hits.forEach((hit,i)=>{
    assert.ok(Number.isFinite(hit.distance)&&hit.distance>0)
    if(i)assert.ok(hit.distance>=hits[i-1].distance)
    close(hit.position,ray.origin.map((x,j)=>x+ray.direction[j]/length*hit.distance),1e-6)
    const local=frame.toLocal(hit.position),radial=Math.hypot(local[0],local[1])
    assert.ok(radial<=r+1e-8&&local[2]>=-1e-8&&local[2]<=h+1e-8)
    if(hit.region==='lateral'){
      assert.ok(Math.abs(radial-r)<1e-8);assert.ok(hit.uv[0]>=0&&hit.uv[0]<1&&hit.uv[1]>=0&&hit.uv[1]<=1)
      close(g.evaluateAnalyticSurface3D(solid,hit.uv),hit.position)
    }else{assert.equal(hit.uv,null);assert.ok(Math.abs(local[2]-(hit.region==='top_cap'?h:0))<1e-8)}
    if(ray.clip)assert.ok(hit.depth>=ray.clip.near&&hit.depth<=ray.clip.far)
    else assert.equal(hit.depth,hit.distance)
  })
  records.push({solid,ray,hits});return hits
}
for(const frame of frames){
  const solid=cylinder(frame),transform=g.analyticFrame3D(frame)
  for(const example of fixtures.rays){
    const ray={origin:transform.toWorld(example.origin),direction:transform.vectorToWorld(example.direction)}
    const hits=check(solid,ray)
    assert.equal(hits.length,example.positions.length,example.name)
    assert.deepEqual(hits.map(h=>h.region),example.regions,example.name)
    hits.forEach((hit,i)=>close(transform.toLocal(hit.position),example.positions[i],example.name==='far lateral'?1e-6:1e-8))
  }
}
for(const projection of ['perspective','orthographic']){
  const camera={projection,position:[6,-7,8],target:[0,0,2],up:[0,0,1],vertical_span:9,fov_degrees:50,near:.01,far:100}
  for(const [x,y] of [[400,300],[450,280],[320,340]]){
    const ray=g.analyticPointerRay3D(camera,800,600,x,y),hits=check(cylinder(),ray)
    for(const [near,far] of [[.01,10],[10,100],[.01,100],[40,50]]){
      const clipped=check(cylinder(),{...ray,clip:{...ray.clip,near,far}})
      assert.deepEqual(clipped,hits.filter(h=>h.depth>=near&&h.depth<=far))
    }
    if(projection==='perspective'&&x!==400)for(const hit of hits)assert.ok(hit.distance>hit.depth)
  }
}
// Independent known crossings across circular chords, with cap entry/exit too.
for(let i=0;i<80;i++){
  const angle=i*.73,y=1.9*Math.sin(i*.31),half=Math.sqrt(4-y*y),c=Math.cos(angle),s=Math.sin(angle)
  const transform=([x,y,z])=>[x*c-y*s,x*s+y*c,z]
  const hits=check(cylinder(),{origin:transform([-5,y,2]),direction:transform([1,0,0])})
  assert.equal(hits.length,2);close(hits[0].position,transform([-half,y,2]));close(hits[1].position,transform([half,y,2]))
}
// A near-parallel cap crossing must not become three hits through a broad
// finite-height epsilon, or mislabel the nearby lateral entry as a cap hit.
for(const dz of [1e-15,1e-14,1e-13]){
  const hits=check(cylinder(),{origin:[-5,0,4-5*dz],direction:[1,0,dz]})
  assert.equal(hits.length,2);assert.deepEqual(hits.map(h=>h.region),['lateral','top_cap'])
}
for(const features of [[],[{slot:'surface',entity_id:'carrier'}],[{slot:'v_0',entity_id:'center'}],[{slot:'v_1',entity_id:'top'}]]){
  const solid={...cylinder(),features},ray={origin:[0,0,-2],direction:[0,0,1]}
  assert.deepEqual(check(solid,ray),g.intersectClosedCylinder3D(cylinder(),ray))
}
// Thin/wide dimensions must not merge opposite caps or inflate the radial disk.
for(const [radius,height] of [[1e9,1e-6],[1e-6,1e9],[1e-9,2e-9]]){
  const solid=cylinder(frames[0],radius,height)
  const hits=check(solid,{origin:[0,0,-height],direction:[0,0,1]})
  assert.equal(hits.length,2);assert.deepEqual(hits.map(h=>h.region),['bottom_cap','top_cap'])
  assert.equal(check(solid,{origin:[radius*1.00001,0,-height],direction:[0,0,1]}).length,0)
}
// Avoid squaring a tiny radius: a valid chord must not underflow to a tangent.
{
  const tiny=1e-180,solid=cylinder(frames[0],2*tiny,4*tiny)
  const lateral=check(solid,{origin:[-5*tiny,0,2*tiny],direction:[1,0,0]})
  assert.deepEqual(lateral.map(h=>h.position),[[-2*tiny,0,2*tiny],[2*tiny,0,2*tiny]])
  assert.equal(check(solid,{origin:[0,0,-tiny],direction:[0,0,1]}).length,2)
}
for(const ray of [{origin:[0,0,0],direction:[0,0,0]},{origin:[NaN,0,0],direction:[1,0,0]},{origin:[0,0,0],direction:[Infinity,0,0]},{origin:[0,0,-2],direction:[0,0,1],clip:{origin:[0,0,-2],forward:[0,0,2],near:.1,far:10}}])assert.throws(()=>g.intersectClosedCylinder3D(cylinder(),ray))
for(const radius of [0,-1,NaN,Infinity,true])assert.throws(()=>g.intersectClosedCylinder3D(cylinder(frames[0],radius),{origin:[0,0,-2],direction:[0,0,1]}))
for(const height of [0,-1,NaN,Infinity,true])assert.throws(()=>g.intersectClosedCylinder3D(cylinder(frames[0],2,height),{origin:[0,0,-2],direction:[0,0,1]}))
assert.throws(()=>g.intersectClosedCylinder3D(cylinder({...frames[0],x_axis:[2,0,0]}),{origin:[0,0,-2],direction:[0,0,1]}))
assert.throws(()=>g.intersectClosedCylinder3D({...cylinder(),kind:'cone'},{origin:[0,0,-2],direction:[0,0,1]}))
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: closed cylinder caps/lateral/rims/tangents/boundary/frames/clipping; ${records.length} immutable parity records`)
