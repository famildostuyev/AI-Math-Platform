/** Pure analytic foundation. This module does not enable runtime/editor capabilities. */
import type { GeometryCamera3D, GeometryParametricSolid3D, GeometryScene3D, Vec2, Vec3 } from './geometry3dContract'

export type AnalyticSolid3D=Extract<GeometryParametricSolid3D,{kind:'cylinder'|'cone'|'sphere'}>
export type ClosedAnalyticSolid3D=AnalyticSolid3D
export const isClosedAnalyticSolid3D=(solid:GeometryScene3D['solids'][number]):solid is ClosedAnalyticSolid3D=>solid.mode==='parametric'&&(solid.kind==='cylinder'||solid.kind==='cone'||solid.kind==='sphere')
export type AnalyticRay3D={origin:Vec3;direction:Vec3;clip?:{origin:Vec3;forward:Vec3;near:number;far:number}}
export type AnalyticHit3D={position:Vec3;uv:Vec2;distance:number;depth:number}
/** Transient intersection result, not a persisted surface/face attachment. */
export type ClosedCylinderHit3D={position:Vec3;distance:number;depth:number}&(
  |{region:'lateral';uv:Vec2}
  |{region:'bottom_cap'|'top_cap';uv:null}
)
const EPS=Number.EPSILON,TAU=2*Math.PI
const number=(v:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e12)throw Error('Invalid analytic number');return v}
const positive=(v:number)=>{number(v);if(v<=0)throw Error('Expected positive dimension');return v}
const vector=(v:Vec3)=>{if(!Array.isArray(v)||v.length!==3)throw Error('Invalid vector');v.forEach(number);return [...v] as Vec3}
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v-b[i]) as Vec3
const scale=(a:Vec3,t:number):Vec3=>a.map(v=>v*t) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const unit=(v:Vec3):Vec3=>{const length=Math.hypot(...v);if(!Number.isFinite(length)||length===0)throw Error('Zero direction');return v.map(x=>x/length) as Vec3}
const finiteVector=(v:Vec3)=>{if(!Array.isArray(v)||v.length!==3||v.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('Nonfinite vector');return v}

export function analyticFrame3D(frame:GeometryParametricSolid3D['frame']){
  const origin=vector(frame.origin),x=vector(frame.x_axis),y=vector(frame.y_axis),z=cross(x,y)
  if(Math.abs(dot(x,x)-1)>1e-9||Math.abs(dot(y,y)-1)>1e-9||Math.abs(dot(x,y))>1e-9)throw Error('Non-orthonormal frame')
  // Dual axes give an accurate inverse even at the contract's orthonormal tolerance.
  const det=dot(x,cross(y,z)),dual=[scale(cross(y,z),1/det),scale(cross(z,x),1/det),scale(cross(x,y),1/det)]
  const vectorToWorld=(v:Vec3):Vec3=>{finiteVector(v);return finiteVector(add(scale(x,v[0]),add(scale(y,v[1]),scale(z,v[2]))))}
  const vectorToLocal=(v:Vec3):Vec3=>{finiteVector(v);return finiteVector(dual.map(axis=>dot(v,axis)) as Vec3)}
  return {origin,x,y,z,vectorToWorld,vectorToLocal,toWorld:(v:Vec3)=>vector(add(origin,vectorToWorld(vector(v)))),toLocal:(v:Vec3)=>vectorToLocal(sub(vector(v),origin))}
}
function geometry(solid:AnalyticSolid3D){
  if(solid.mode!=='parametric'||!['cylinder','cone','sphere'].includes(solid.kind))throw Error('Unsupported analytic kind')
  const radius=positive(solid.parameters.radius),height=solid.kind==='sphere'?0:positive(solid.parameters.height),frame=analyticFrame3D(solid.frame)
  const resolution=16*EPS*Math.max(...frame.origin.map(Math.abs))
  if(radius<resolution||height&&height<resolution)throw Error('Dimensions below world-space resolution')
  if(solid.kind==='cone'&&!Number.isFinite(radius/height))throw Error('Ill-conditioned cone')
  return {radius,height,frame}
}
/** Authoring-only wrapping. Evaluation/validation never repairs out-of-domain stored UV. */
export function wrapSurfaceAzimuth3D(u:number){number(u);const result=u-Math.floor(u);return result===0||result>=1?0:result}
function uvDomain(uv:Vec2){
  if(!Array.isArray(uv)||uv.length!==2)throw Error('Invalid surface UV')
  uv.forEach(number);if(uv[0]<0||uv[0]>=1||uv[1]<0||uv[1]>1)throw Error('Surface UV outside domain')
}
export function evaluateAnalyticSurface3D(solid:AnalyticSolid3D,uv:Vec2):Vec3{
  uvDomain(uv)
  const {radius:r,height:h,frame}=geometry(solid),[u,v]=uv,theta=TAU*u
  let radial:number,z:number
  if(solid.kind==='sphere'){
    const phi=Math.PI*(v-.5);radial=v===0||v===1?0:r*Math.cos(phi);z=v===0?-r:v===1?r:r*Math.sin(phi)
  }else{radial=solid.kind==='cone'?r*(1-v):r;z=h*v}
  return frame.toWorld([radial*Math.cos(theta),radial*Math.sin(theta),z])
}
export function inverseAnalyticSurface3D(solid:AnalyticSolid3D,world:Vec3,previousU=0):Vec2|null{
  uvDomain([previousU,0])
  const {radius:r,height:h,frame}=geometry(solid),local=frame.toLocal(world),[x,y,z]=local,radial=Math.hypot(x,y)
  const precision=4*EPS*Math.max(...world.map(Math.abs),...frame.origin.map(Math.abs)),tolerance=1e-9*r+precision,axialTolerance=1e-9*h+precision
  let v:number
  if(solid.kind==='sphere'){
    if(Math.abs(Math.hypot(...local)-r)>tolerance)return null
    v=Math.atan2(z,radial)/Math.PI+.5
  }else{
    if(z < -axialTolerance||z>h+axialTolerance)return null
    v=Math.max(0,Math.min(1,z/h))
    if(Math.abs(radial-(solid.kind==='cone'?r*(1-v):r))>tolerance)return null
  }
  if(radial<=64*EPS*r){
    if(solid.kind==='sphere'&&Math.abs(Math.abs(z)-r)<=64*EPS*r+precision)v=z<0?0:1
    if(solid.kind==='cone'&&Math.abs(z-h)<=64*EPS*h+precision)v=1
  }
  const singular=radial<=64*EPS*r&&(solid.kind==='sphere'||solid.kind==='cone'&&v===1)
  return [singular?previousU:wrapSurfaceAzimuth3D(Math.atan2(y,x)/TAU),Math.max(0,Math.min(1,v))]
}

export function analyticBounds3D(solid:AnalyticSolid3D){
  const {radius:r,height:h,frame}=geometry(solid),sphere=solid.kind==='sphere',tip=frame.toWorld([0,0,h])
  const min:Vec3=[-r,-r,sphere?-r:0],max:Vec3=[r,r,sphere?r:h]
  const worldMin=frame.origin.map((o,i)=>{
    const extent=r*Math.hypot(frame.x[i],frame.y[i])
    return sphere?o-r*Math.hypot(frame.x[i],frame.y[i],frame.z[i]):solid.kind==='cone'?Math.min(o-extent,tip[i]):Math.min(o,tip[i])-extent
  }) as Vec3
  const worldMax=frame.origin.map((o,i)=>{
    const extent=r*Math.hypot(frame.x[i],frame.y[i])
    return sphere?o+r*Math.hypot(frame.x[i],frame.y[i],frame.z[i]):solid.kind==='cone'?Math.max(o+extent,tip[i]):Math.max(o,tip[i])+extent
  }) as Vec3
  vector(worldMin);vector(worldMax)
  const corners=Array.from({length:8},(_,i)=>frame.toWorld([i&1?max[0]:min[0],i&2?max[1]:min[1],i&4?max[2]:min[2]]))
  return {localMin:min,localMax:max,worldMin,worldMax,corners,pivot:frame.toWorld([0,0,sphere?0:h/2])}
}
/** Only materialized semantic reference points are returned; no ID allocation or mesh vertices. */
export function analyticFeaturePositions3D(solid:AnalyticSolid3D):Record<string,Vec3>{
  const {height:h,radius:r,frame}=geometry(solid),slots=new Set<string>(),ids=new Set<string>(),output:Record<string,Vec3>={}
  for(const f of solid.features){
    if(!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(f.entity_id)||slots.has(f.slot)||ids.has(f.entity_id)||!['v_0',...(solid.kind==='sphere'?[]:['v_1']),...(solid.kind==='cone'?['v_2','v_3']:[]),'surface'].includes(f.slot))throw Error('Invalid analytic feature map')
    slots.add(f.slot);ids.add(f.entity_id)
    if(f.slot!=='surface')output[f.entity_id]=frame.toWorld(f.slot==='v_2'?[-.6*r,.8*r,0]:f.slot==='v_3'?[.6*r,-.8*r,0]:[0,0,f.slot==='v_1'?h:0])
  }
  return output
}

/** Camera depth clipping is distinct from ray distance for off-axis perspective rays. */
export function analyticPointerRay3D(camera:GeometryCamera3D,width:number,height:number,x:number,y:number):AnalyticRay3D{
  [width,height,x,y].forEach(number);positive(width);positive(height)
  if(x<0||x>width||y<0||y>height)throw Error('Pointer outside viewport')
  const position=vector(camera.position),target=vector(camera.target),up=vector(camera.up)
  if(!['perspective','orthographic'].includes(camera.projection)||Math.abs(dot(up,up)-1)>1e-9)throw Error('Invalid camera')
  positive(camera.near);positive(camera.far);positive(camera.vertical_span);number(camera.fov_degrees)
  if(camera.near>=camera.far||camera.fov_degrees<1||camera.fov_degrees>179)throw Error('Invalid camera range')
  const forward=unit(sub(target,position)),right=unit(cross(forward,up)),vertical=cross(right,forward),nx=2*x/width-1,ny=1-2*y/height,aspect=width/height,slope=Math.tan(camera.fov_degrees*Math.PI/360)
  const origin=camera.projection==='orthographic'?vector(add(position,add(scale(right,nx*camera.vertical_span*aspect/2),scale(vertical,ny*camera.vertical_span/2)))):position
  const direction=camera.projection==='orthographic'?forward:unit(add(forward,add(scale(right,nx*slope*aspect),scale(vertical,ny*slope))))
  return {origin,direction,clip:{origin:position,forward,near:camera.near,far:camera.far}}
}
function quadratic(a:number,b:number,c:number,linear:boolean):number[]{
  if(![a,b,c].every(Number.isFinite))throw Error('Unsafe intersection coefficients')
  if(linear)return b===0?[]:[-c/b]
  const norm=Math.max(Math.abs(a),Math.abs(b),Math.abs(c))
  if(norm===0)return [] // Coincident generator has no isolated surface intersection.
  a/=norm;b/=norm;c/=norm
  if(a===0)return []
  const discriminant=b*b-4*a*c,tolerance=64*EPS*(b*b+Math.abs(4*a*c))
  if(discriminant < -tolerance)return []
  if(Math.abs(discriminant)<=tolerance)return [-b/(2*a)]
  const q=-.5*(b+(b<0?-1:1)*Math.sqrt(discriminant))
  return [q/a,c/q]
}
/** Lateral surfaces only for cylinder/cone. Caps and silhouettes are not semantic edges. */
export function intersectAnalyticSurface3D(solid:AnalyticSolid3D,ray:AnalyticRay3D):AnalyticHit3D[]{
  const {radius:r,height:h,frame}=geometry(solid),origin=vector(ray.origin),direction=unit(vector(ray.direction)),o=frame.toLocal(origin),d=frame.vectorToLocal(direction)
  const clip=ray.clip
  if(clip){vector(clip.origin);vector(clip.forward);positive(clip.near);positive(clip.far);if(clip.near>=clip.far||Math.abs(Math.hypot(...clip.forward)-1)>1e-9)throw Error('Invalid ray clip')}
  let roots:{distance:number;local:Vec3}[]=[]
  if(solid.kind==='cone'){
    // Shift near the solid before forming a quadratic; avoid far-origin cancellation.
    const t0=-dot(sub(o,[0,0,h/2]),d)/dot(d,d),q=add(o,scale(d,t0)),k=r/h,k2=k*k,w=h-q[2]
    const radial=d[0]*d[0]+d[1]*d[1],axial=k2*d[2]*d[2],a=radial-axial,b=2*(q[0]*d[0]+q[1]*d[1]+k2*w*d[2]),c=q[0]*q[0]+q[1]*q[1]-k2*w*w
    const linear=Math.abs(a)<=64*EPS*(radial+axial),bError=64*EPS*2*(Math.abs(q[0]*d[0])+Math.abs(q[1]*d[1])+Math.abs(k2*w*d[2]))
    roots=linear&&Math.abs(b)<=bError?[]:quadratic(a,b,c,linear).map(t=>({distance:t+t0,local:add(q,scale(d,t))}))
  }else{
    const radialO:Vec3=[o[0],o[1],solid.kind==='sphere'?o[2]:0],radialD:Vec3=[d[0],d[1],solid.kind==='sphere'?d[2]:0],a=dot(radialD,radialD)
    if(a===0)return []
    const center=-dot(radialO,radialD)/a,closest=add(radialO,scale(radialD,center)),distance=Math.hypot(...closest),tolerance=64*EPS*Math.max(r,Math.hypot(...radialO))
    if(distance>r+tolerance)return []
    const half=Math.abs(distance-r)<=tolerance?0:Math.sqrt(Math.max(0,(r-distance)*(r+distance)/a))
    roots=[-half,half].map(t=>{
      const local=add(closest,scale(radialD,t));if(solid.kind==='cylinder')local[2]=o[2]+d[2]*(center+t)
      return {distance:center+t,local}
    })
  }
  const hits:AnalyticHit3D[]=[]
  for(const {distance,local} of roots.sort((a,b)=>a.distance-b.distance)){
    if(!Number.isFinite(distance)||distance<0)continue
    let position:Vec3
    try{position=frame.toWorld(local)}catch{continue}
    const uv=inverseAnalyticSurface3D(solid,position),depth=clip?dot(sub(position,clip.origin),clip.forward):distance
    if(!uv||clip&&(depth<clip.near||depth>clip.far))continue
    if(hits.some(hit=>Math.abs(hit.distance-distance)<=64*EPS*Math.max(r,h,distance)))continue
    hits.push({position,uv,distance,depth})
  }
  return hits
}

/** Closed finite cylinder. Only strictly positive world-ray distances are returned.
 * Rim ties belong to the cap. For a ray coincident with a boundary patch we return
 * the finite endpoints of that patch, not an arbitrary point on its continuum.
 * This is separate from lateral-only UV evaluation and does not enable runtime tools.
 */
export function intersectClosedCylinder3D(solid:Extract<AnalyticSolid3D,{kind:'cylinder'}>,ray:AnalyticRay3D):ClosedCylinderHit3D[]{
  if(solid.kind!=='cylinder')throw Error('Expected cylinder')
  const {radius:r,height:h,frame}=geometry(solid),origin=vector(ray.origin),direction=unit(vector(ray.direction))
  const o=frame.toLocal(origin),d=frame.vectorToLocal(direction),clip=ray.clip
  // A rotated coplanar ray can acquire round-off axial velocity. Only cancel
  // values within the dot product's error bound, not a fixed angular epsilon.
  if(Math.abs(d[2])<=8*EPS*direction.reduce((s,v,i)=>s+Math.abs(v*frame.z[i]),0))d[2]=0
  if(clip){vector(clip.origin);vector(clip.forward);positive(clip.near);positive(clip.far);if(clip.near>=clip.far||Math.abs(Math.hypot(...clip.forward)-1)>1e-9)throw Error('Invalid ray clip')}
  // Shift near the cylinder before solving, retaining local hit coordinates even
  // when adding a small root to a large ray distance loses precision.
  const anchor=-dot(sub(o,[0,0,h/2]),d)/dot(d,d),q=add(o,scale(d,anchor))
  const radialTolerance=64*EPS*r,axialTolerance=64*EPS*h
  if(d[2]===0){if(Math.abs(q[2])<=axialTolerance)q[2]=0;else if(Math.abs(q[2]-h)<=axialTolerance)q[2]=h}
  type Candidate={local:Vec3;offset:number;region:ClosedCylinderHit3D['region']}
  const candidates:Candidate[]=[]
  const speed=Math.hypot(d[0],d[1])
  if(speed>0){
    const ex=d[0]/speed,ey=d[1]/speed,along=q[0]*ex+q[1]*ey,perp=q[0]*ey-q[1]*ex
    const error=16*EPS*Math.max(r,Math.abs(q[0]*ey)+Math.abs(q[1]*ex))
    if(Math.abs(perp)<=r+error){
      const tangent=Math.abs(Math.abs(perp)-r)<=error,p=tangent?(perp<0?-r:r):perp,ratio=Math.abs(p)/r,half=tangent?0:r*Math.sqrt(Math.max(0,(1-ratio)*(1+ratio)))
      for(const radial of half===0?[0]:[-half,half]){
        const offset=(radial-along)/speed,z=q[2]+d[2]*offset
        if(Number.isFinite(offset)&&z>=0&&z<=h){
          candidates.push({offset,local:[p*ey+radial*ex,-p*ex+radial*ey,z],region:'lateral'})
        }
      }
    }
  }
  if(d[2]!==0)for(const z of [0,h]){
    const offset=(z-q[2])/d[2],x=q[0]+d[0]*offset,y=q[1]+d[1]*offset
    if(Number.isFinite(offset)&&Number.isFinite(x)&&Number.isFinite(y)&&Math.hypot(x,y)<=r+radialTolerance){
      candidates.push({offset,local:[x,y,z],region:z===0?'bottom_cap':'top_cap'})
    }
  }
  // Include rim endpoints when the ray lies in a cap plane (no isolated plane hit).
  for(const c of candidates)if(c.region==='lateral'){
    if(c.local[2]===0)c.region='bottom_cap'
    else if(c.local[2]===h)c.region='top_cap'
  }
  const priority=(c:Candidate)=>c.region==='lateral'?1:0
  candidates.sort((a,b)=>a.offset-b.offset||priority(a)-priority(b))
  const unique:Candidate[]=[]
  for(const c of candidates){
    const duplicate=unique.findIndex(v=>Math.hypot(v.local[0]-c.local[0],v.local[1]-c.local[1])<=radialTolerance&&Math.abs(v.local[2]-c.local[2])<=axialTolerance)
    if(duplicate<0)unique.push(c)
    else if(priority(c)<priority(unique[duplicate]))unique[duplicate]=c
  }
  const hits:ClosedCylinderHit3D[]=[]
  for(const c of unique){
    const distance=anchor+c.offset
    if(!Number.isFinite(distance)||distance<=0)continue
    // Exclude a numerical t=0 self-hit after world/local round trips. Separate
    // radial/axial budgets keep a wide cylinder from swallowing a thin height.
    const worldError=4*EPS*Math.max(...origin.map(Math.abs),...frame.origin.map(Math.abs))
    if(c.local.every((v,i)=>Math.abs(v-o[i])<=worldError+8*EPS*Math.max(Math.abs(o[i]),i===2?h:r)))continue
    let position:Vec3
    try{position=frame.toWorld(c.local)}catch{continue}
    const depth=clip?dot(sub(position,clip.origin),clip.forward):distance
    if(!Number.isFinite(depth)||clip&&(depth<clip.near||depth>clip.far))continue
    if(c.region==='lateral')hits.push({position,distance,depth,region:'lateral',uv:[wrapSurfaceAzimuth3D(Math.atan2(c.local[1],c.local[0])/TAU),c.local[2]/h]})
    else hits.push({position,distance,depth,region:c.region,uv:null})
  }
  return hits.sort((a,b)=>a.distance-b.distance)
}

/** Finite closed cone picking/occlusion. Reuses the established lateral solver;
 * its base disk and singular apex remain display hits, not polygon entities. */
export function intersectClosedCone3D(solid:Extract<AnalyticSolid3D,{kind:'cone'}>,ray:AnalyticRay3D){
  const {radius:r,height:h,frame}=geometry(solid),origin=vector(ray.origin),direction=unit(vector(ray.direction))
  const o=frame.toLocal(origin),d=frame.vectorToLocal(direction),clip=ray.clip
  type Hit={position:Vec3;distance:number;depth:number;region:'lateral'|'bottom_cap'|'apex';uv:Vec2|null}
  const hits:Hit[]=intersectAnalyticSurface3D(solid,ray).map(hit=>({...hit,region:hit.uv[1]===0?'bottom_cap':hit.uv[1]===1?'apex':'lateral',uv:hit.uv[1]===0||hit.uv[1]===1?null:hit.uv}))
  const append=(local:Vec3,t:number,region:Hit['region'])=>{
    const position=frame.toWorld(local),depth=clip?dot(sub(position,clip.origin),clip.forward):t
    if(t>0&&Number.isFinite(t)&&(!clip||depth>=clip.near&&depth<=clip.far))hits.push({position,distance:t,depth,region,uv:null})
  }
  if(d[2]!==0){const t=-o[2]/d[2],x=o[0]+d[0]*t,y=o[1]+d[1]*t;if(Math.hypot(x,y)<=r*(1+64*EPS))append([x,y,0],t,'bottom_cap')}
  // A ray along a generator can have an identically zero lateral equation.
  const t=dot(sub([0,0,h],o),d)/dot(d,d),tip=add(o,scale(d,t)),error=64*EPS*Math.max(r,h,...o.map(Math.abs))
  if(Math.hypot(tip[0],tip[1],tip[2]-h)<=error)append([0,0,h],t,'apex')
  const selfError=8*EPS*Math.max(r,h,...origin.map(Math.abs),...frame.origin.map(Math.abs))
  return hits.filter(hit=>hit.distance>selfError).sort((a,b)=>a.distance-b.distance||(a.region==='lateral'?1:0)-(b.region==='lateral'?1:0))
    .filter((hit,index,all)=>!all.slice(0,index).some(other=>Math.abs(other.distance-hit.distance)<=selfError))
}
export function intersectClosedAnalytic3D(solid:ClosedAnalyticSolid3D,ray:AnalyticRay3D){
  if(solid.kind==='sphere')return intersectAnalyticSurface3D(solid,ray).filter(hit=>hit.distance>8*EPS*Math.max(solid.parameters.radius,...ray.origin.map(Math.abs))).map(hit=>({...hit,region:'sphere' as const,uv:hit.uv[1]===0||hit.uv[1]===1?[0,hit.uv[1]] as Vec2:hit.uv}))
  return solid.kind==='cylinder'?intersectClosedCylinder3D(solid,ray):intersectClosedCone3D(solid,ray)
}
