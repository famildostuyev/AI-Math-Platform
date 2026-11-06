import assert from 'node:assert/strict'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
const math=await load('geometry3dConstructedPlane'),display=await load('geometry3dPlaneDisplay'),clip=await load('geometry3dGuidedPlane')
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0)
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`)
const ref={kind:'plane',id:'alpha'}
function fixture({shape='rectangle',width=2,height=2,skew=0,offset=0,u=0,v=0,transformed=false}={}){
 const o=transformed?[4,-3,7]:[0,0,0],x=transformed?[.6,.8,0]:[1,0,0],y=transformed?[-.48,.36,.8]:[0,1,0],n=transformed?[.64,-.48,.6]:[0,0,1]
 const world=(u,v,d=0)=>add(o,add(scale(x,u),add(scale(y,v),scale(n,d))))
 const scene={points:[{id:'o',position:o},{id:'x',position:add(o,x)},{id:'y',position:add(o,y)},{id:'P',position:world(u,v,offset)}],planes:[{id:'alpha',point_ids:['o','x','y'],display:{width,height,shape,skew}}],faces:[],constructions:[{id:'untouched',kind:'test-sentinel'}]}
 return {scene,world,n}
}
function check(scene,angle=0){
 const before=structuredClone(scene),result=math.perpendicularPlaneSurface3D(scene,'P',ref,angle)
 const f=display.planeDisplay3D(scene.planes[0],scene),line=math.perpendicularPlaneIntersection3D(scene,'P',ref,angle)
 assert.deepEqual(result.segments,clip.clipLineToPlaneContour3D(...line,f.contour,f.x,f.y))
 assert.equal(result.polygons.length,2*result.segments.length)
 assert.ok(result.bounds[0]<0&&result.bounds[1]>0)
 assert.ok(result.bounds[0]<=result.signedOffset&&result.bounds[1]>=result.signedOffset)
 const t=sub(line[1],line[0])
 for(let i=0;i<result.segments.length;i++){
  const [a,b]=result.segments[i],[positive,negative]=result.polygons.slice(2*i,2*i+2)
  assert.deepEqual(positive.slice(0,2),[a,b]);assert.deepEqual(negative.slice(0,2),[b,a])
  // Both halves meet without a gap, remain on the semantic plane, and retain
  // the exact longitudinal endpoints rather than symmetric or bridged bounds.
  for(const [polygon,bound] of [[positive,result.bounds[1]],[negative,result.bounds[0]]]){
   for(let j=0;j<4;j++){
    const q=polygon[j],d=dot(sub(q,a),f.normal)
    near(d,j<2?0:bound)
    const along=dot(sub(q,a),t),length=dot(sub(b,a),t)
    assert.ok(along>=-1e-9&&along<=length+1e-9)
    const perpendicular=sub(sub(q,a),add(scale(t,along),scale(f.normal,d)))
    near(Math.hypot(...perpendicular),0)
   }
  }
 }
 // Explicit cross remains byte-for-byte identical to the legacy default, and
 // one-sided output consists of the corresponding unchanged half of each strip.
 assert.deepEqual(math.perpendicularPlaneSurface3D(scene,'P',ref,angle,1.5,'cross'),result)
 const semantic=math.constructedPlaneGeometry3D(scene,'P',ref,{kind:'plane_local_angle',angle_radians:angle})
 assert.deepEqual(semantic.positions[0],scene.points.find(p=>p.id==='P').position)
 for(const mode of ['first','opposite']){
  const sided=math.perpendicularPlaneSurface3D(scene,'P',ref,angle,1.5,mode),positive=mode==='first'
  assert.deepEqual(sided.segments,result.segments);assert.deepEqual(sided.normal,result.normal)
  assert.equal(sided.signedOffset,result.signedOffset)
  assert.deepEqual(sided.bounds,positive?[0,result.bounds[1]]:[result.bounds[0],0])
  assert.deepEqual(sided.polygons,result.polygons.filter((_,i)=>i%2===(positive?0:1)))
  assert.equal(sided.polygons.length,result.segments.length)
  for(let i=0;i<sided.polygons.length;i++){
   const polygon=sided.polygons[i],[a,b]=sided.segments[i]
   assert.deepEqual(polygon.slice(0,2),positive?[a,b]:[b,a])
   for(const q of polygon){
    const signed=dot(sub(q,f.o),f.normal)
    assert.ok(positive?signed>=-1e-9:signed<=1e-9)
    assert.ok(signed>=sided.bounds[0]-1e-9&&signed<=sided.bounds[1]+1e-9)
   }
  }
  if(positive?result.signedOffset>0:result.signedOffset<0)assert.ok(sided.bounds[0]<=result.signedOffset&&sided.bounds[1]>=result.signedOffset)
  else if(Math.abs(result.signedOffset)>1e-9)assert.ok(result.signedOffset<sided.bounds[0]||result.signedOffset>sided.bounds[1])
  assert.deepEqual(math.perpendicularPlaneSurface3D(scene,'P',ref,angle,1.5,mode),sided)
  assert.deepEqual(math.perpendicularPlaneSurface3D({...scene,print_camera:{position:[100,-100,-100],up:[0,0,-1]}},'P',ref,angle,1.5,mode),sided)
  assert.deepEqual(math.constructedPlaneGeometry3D(scene,'P',ref,{kind:'plane_local_angle',angle_radians:angle}),semantic)
 }
 assert.deepEqual(scene,before)
 return result
}
let cases=0
for(const shape of ['rectangle','parallelogram','cloud'])for(const transformed of [false,true])for(const offset of [-100,-2,0,2,100])for(const size of [.2,4]){
 const {scene}=fixture({shape,transformed,offset,width:size,height:size*.7,skew:.6})
 const result=check(scene,.4);assert.ok(result.segments.length);near(result.signedOffset,offset)
 near(result.bounds[0],Math.min(-1.5,offset));near(result.bounds[1],Math.max(1.5,offset));cases++
}
// An asymmetric chord still uses its actual endpoints; lateral P may be outside.
check(fixture({shape:'parallelogram',skew:.8,u:4,v:.3,offset:-8}).scene)
assert.deepEqual(check(fixture({v:3,offset:5}).scene).polygons,[])
assert.deepEqual(check(fixture({u:1,v:1}).scene,-Math.PI/4).polygons,[])
// Scalloped clouds can yield multiple disconnected intervals near their rim.
let disjoint=false
for(let v=.7;v<1;v+=.005){
 const {scene}=fixture({shape:'cloud',v,offset:12,transformed:true}),result=check(scene)
 if(result.segments.length>1){
  disjoint=true
  for(let i=1;i<result.segments.length;i++)assert.ok(Math.hypot(...sub(result.segments[i][0],result.segments[i-1][1]))>1e-9)
  break
 }
}
assert.ok(disjoint,'cloud fixture must exercise disconnected surface strips')
for(const invalid of [0,-1,NaN,Infinity])assert.throws(()=>math.perpendicularPlaneSurface3D(fixture().scene,'P',ref,0,invalid))
for(const invalid of ['',null,true,0,'upper','FIRST'])assert.throws(()=>math.perpendicularPlaneSurface3D(fixture().scene,'P',ref,0,1.5,invalid))
for(const mode of ['cross','first','opposite']){
 const result=math.perpendicularPlaneSurface3D(fixture({offset:-10}).scene,'P',ref,0,3,mode)
 assert.deepEqual(result.bounds,mode==='first'?[0,3]:mode==='opposite'?[-10,0]:[-10,3])
}
console.log(`PASS: ${cases} surface cases in all modes; exact shared edges, signed half-spaces, unchanged cross, camera independence, disjoint/empty/tangent intervals, deterministic output and immutable semantics`)
