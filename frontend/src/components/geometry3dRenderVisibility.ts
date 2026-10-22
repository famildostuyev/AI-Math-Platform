/** Shared display visibility. No semantic mutation and no mesh IDs in attachments. */
import type { GeometryCamera3D, Vec3 } from './geometry3dContract'
import type { ProjectedFace3D, ProjectedLine3D, Projection3D } from './geometry3dProjection'
import type { RenderAnalyticSolid3D } from './geometry3dRenderGeometry'
import { analyticFrame3D, intersectClosedAnalytic3D } from './geometry3dAnalytic'
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0)
const metric=(z:number,mode:GeometryCamera3D['projection'])=>mode==='perspective'?-1/z:z
type DepthPlane={x:number;y:number;c:number}
const depthCache=new WeakMap<ProjectedFace3D,Partial<Record<GeometryCamera3D['projection'],DepthPlane|null>>>()
const boundsCache=new WeakMap<ProjectedFace3D,number[]>()
function bounds(face:ProjectedFace3D){
  let result=boundsCache.get(face)
  if(!result){const v=face.vertices;result=[Math.min(...v.map(p=>p[0])),Math.min(...v.map(p=>p[1])),Math.max(...v.map(p=>p[0])),Math.max(...v.map(p=>p[1]))];boundsCache.set(face,result)}
  return result
}

/** Affine screen depth (reciprocal depth for perspective), for arbitrary planar
 * patches including clipped caps and the existing polygon faces. */
export function faceDepth3D(face:ProjectedFace3D,mode:GeometryCamera3D['projection']):DepthPlane|null{
  const cached=depthCache.get(face)
  if(cached&&mode in cached)return cached[mode]!
  const v=face.vertices,a=v[0];if(!a||v.length<3)return null
  let best=0,result:{x:number;y:number;c:number}|null=null
  for(let i=1;i<v.length-1;i++){
    const b=v[i],c=v[i+1],ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-a[0],vy=c[1]-a[1],det=ux*vy-uy*vx
    if(Math.abs(det)<=Math.max(best,1e-12))continue
    best=Math.abs(det)
    const du=metric(b[2],mode)-metric(a[2],mode),dv=metric(c[2],mode)-metric(a[2],mode),x=(du*vy-dv*uy)/det,y=(ux*dv-vx*du)/det
    result={x,y,c:metric(a[2],mode)-x*a[0]-y*a[1]}
  }
  depthCache.set(face,{...cached,[mode]:result});return result
}
function inside(point:Vec3,vertices:Vec3[]){
  let hit=false
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[i],b=vertices[j]
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit
  }
  return hit
}
export function pointHiddenByFaces3D(point:Vec3,faces:ProjectedFace3D[],mode:GeometryCamera3D['projection']){
  return faces.some(face=>{
    if(face.kind!=='face'||!inside(point,face.vertices))return false
    const depth=faceDepth3D(face,mode);if(!depth)return false
    const q=metric(point[2],mode),front=depth.x*point[0]+depth.y*point[1]+depth.c
    return q-front>1e-9*Math.max(1,Math.abs(q),Math.abs(front))
  })
}
/** Exact closed-solid ray test, independent of display tessellation. */
export function pointHiddenByAnalytic3D(world:Vec3,camera:GeometryCamera3D,solids:RenderAnalyticSolid3D[]){
  const delta=sub(camera.target,camera.position),length=Math.hypot(...delta),forward=delta.map(v=>v/length) as Vec3
  const depth=dot(sub(world,camera.position),forward)
  const origin=camera.projection==='perspective'?camera.position:world.map((v,i)=>v-forward[i]*depth) as Vec3
  const direction=camera.projection==='perspective'?sub(world,origin):forward
  if(Math.hypot(...direction)===0)return false
  return solids.some(s=>intersectClosedAnalytic3D(s,{origin,direction,clip:{origin:camera.position,forward,near:camera.near,far:camera.far}}).some(hit=>hit.depth<depth-1e-8*Math.max(1,Math.abs(depth))))
}

/** Mask polygons use true planar depth order, not average-depth painter order.
 * Only analytic-involved fill overlaps are changed; polyhedron-only conventions
 * remain untouched. Bounding-box rejection keeps unrelated patches inexpensive. */
export function faceOcclusionMasks3D(target:ProjectedFace3D,faces:ProjectedFace3D[],mode:GeometryCamera3D['projection']):Vec3[][]{
  const t=faceDepth3D(target,mode);if(!t)return []
  const box=bounds(target),output:Vec3[][]=[]
  for(const face of faces){
    if(face===target||face.kind!=='face'||!target.analytic&&!face.analytic||target.ownerId&&target.ownerId===face.ownerId)continue
    const b=bounds(face)
    if(b[2]<=box[0]||b[0]>=box[2]||b[3]<=box[1]||b[1]>=box[3])continue
    const o=faceDepth3D(face,mode);if(!o)continue
    const error=1e-9*Math.max(1,...target.vertices.map(v=>Math.abs(metric(v[2],mode))),...face.vertices.map(v=>Math.abs(metric(v[2],mode))))
    const value=(p:Vec3)=>(t.x-o.x)*p[0]+(t.y-o.y)*p[1]+t.c-o.c-error
    const polygon:Vec3[]=[]
    for(let i=0;i<face.vertices.length;i++){
      const a=face.vertices[i],b=face.vertices[(i+1)%face.vertices.length],fa=value(a),fb=value(b)
      if(fa>=0)polygon.push(a)
      if((fa>=0)!==(fb>=0)){const u=fa/(fa-fb);polygon.push(a.map((v,j)=>v+(b[j]-v)*u) as Vec3)}
    }
    if(polygon.length>=3)output.push(polygon)
  }
  return output
}

/** Screen-space transition refinement shared by viewport/SVG line strokes.
 * Proxy patch crossings seed small occluders; exact analytic rays classify the
 * samples. Transitions converge to .01 px, with a 4 px maximum sampling step. */
export function analyticLineIntervals3D(line:ProjectedLine3D,projection:Projection3D,solids:RenderAnalyticSolid3D[],seeds:number[]):[number,number][]{
  if(!solids.length||!line.viewA||!line.viewB)return []
  const length=Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1]),steps=Math.max(1,Math.min(4096,Math.ceil(length/4)))
  const cuts=[...new Set([0,1,...seeds,...Array.from({length:steps-1},(_,i)=>(i+1)/steps)])].sort((a,b)=>a-b)
  const frame=line.arc?analyticFrame3D(line.arc.solid.frame):null
  const hidden=(t:number)=>{
    const u=projection.camera.projection==='perspective'?t*line.a[2]/((1-t)*line.b[2]+t*line.a[2]):t
    let world:Vec3
    if(line.arc&&frame){
      const angle=line.arc.from+(line.arc.to-line.arc.from)*u,r=line.arc.solid.parameters.radius
      world=frame.toWorld([r*Math.cos(angle),r*Math.sin(angle),line.arc.z])
    }else world=projection.world(line.viewA!.map((v,i)=>v+(line.viewB![i]-v)*u) as Vec3)
    return pointHiddenByAnalytic3D(world,projection.camera,solids)
  }
  const samples=cuts.flatMap((t,i)=>i?[{t:(cuts[i-1]+t)/2,h:false},{t,h:false}]:[{t,h:false}])
  samples.forEach(s=>{s.h=hidden(s.t)})
  const intervals:[number,number][]=[],boundaries=[0]
  for(let i=1;i<samples.length;i++)if(samples[i-1].h!==samples[i].h){
    let a=samples[i-1].t,b=samples[i].t
    for(let j=0;j<24&&(b-a)*length>.01;j++){const mid=(a+b)/2;if(hidden(mid)===samples[i-1].h)a=mid;else b=mid}
    boundaries.push((a+b)/2)
  }
  boundaries.push(1)
  for(let i=1;i<boundaries.length;i++){const a=boundaries[i-1],b=boundaries[i];if(hidden((a+b)/2))intervals.push([a,b])}
  return intervals
}
