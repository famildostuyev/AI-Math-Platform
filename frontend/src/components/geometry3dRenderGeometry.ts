/** Display geometry only. No generated vertices, patches or curves enter a scene. */
import type { GeometryCamera3D, GeometryParametricSolid3D, Vec3 } from './geometry3dContract'
import { analyticFrame3D, analyticBounds3D } from './geometry3dAnalytic'

export type RenderPatch3D={ownerId:string;region:string;vertices:Vec3[]}
export type RenderCurve3D={ownerId:string;role:'rim'|'silhouette'|'equator';vertices:Vec3[];angles?:number[]}
export type AnalyticRenderGeometry3D={patches:RenderPatch3D[];curves:RenderCurve3D[];resolution:number}
export type RenderCylinder3D=Extract<GeometryParametricSolid3D,{kind:'cylinder'}>
export type RenderAnalyticSolid3D=Extract<GeometryParametricSolid3D,{kind:'cylinder'|'cone'|'sphere'}>
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3

/** Convex analytic display adapter. The patch/curve interface can be extended to
 * other analytic kinds without changing the projection/visibility compositor.
 * Fixed resolution is an export quality parameter, never semantic topology. */
export function cylinderRenderGeometry3D(solid:RenderCylinder3D,camera:GeometryCamera3D,resolution=128):AnalyticRenderGeometry3D{
  if(!Number.isInteger(resolution)||resolution<16||resolution>1024)throw Error('Invalid render resolution')
  analyticBounds3D(solid) // Same dimension/frame/representability guards as analytic evaluation.
  const frame=analyticFrame3D(solid.frame),r=solid.parameters.radius,h=solid.parameters.height
  const eye=frame.toLocal(camera.position),toward=frame.vectorToLocal(sub(camera.position,camera.target)),perspective=camera.projection==='perspective'
  const inside=perspective&&Math.hypot(eye[0],eye[1])<r&&eye[2]>0&&eye[2]<h
  const point=(angle:number,z:number)=>frame.toWorld([r*Math.cos(angle),r*Math.sin(angle),z])
  const angles=Array.from({length:resolution},(_,i)=>2*Math.PI*i/resolution)
  const bottom=angles.map(a=>point(a,0)),top=angles.map(a=>point(a,h)),patches:RenderPatch3D[]=[],curves:RenderCurve3D[]=[]
  const add=(region:string,vertices:Vec3[])=>patches.push({ownerId:solid.id,region,vertices})
  for(let i=0;i<resolution;i++){
    const j=(i+1)%resolution,mid=2*Math.PI*(i+.5)/resolution
    const facing=perspective?eye[0]*Math.cos(mid)+eye[1]*Math.sin(mid)-r*Math.cos(Math.PI/resolution):toward[0]*Math.cos(mid)+toward[1]*Math.sin(mid)
    if(inside||facing>=0)add('lateral',[bottom[i],bottom[j],top[j],top[i]])
  }
  if(inside||(perspective?eye[2]<0:toward[2]<0))add('bottom_cap',[...bottom].reverse())
  if(inside||(perspective?eye[2]>h:toward[2]>0))add('top_cap',top)
  curves.push({ownerId:solid.id,role:'rim',vertices:[...bottom,bottom[0]]},{ownerId:solid.id,role:'rim',vertices:[...top,top[0]]})
  const radial=perspective?Math.hypot(eye[0],eye[1]):Math.hypot(toward[0],toward[1])
  if(perspective?radial>r:radial>1e-12*Math.hypot(...toward)){
    const azimuth=Math.atan2(perspective?eye[1]:toward[1],perspective?eye[0]:toward[0]),offset=perspective?Math.acos(r/radial):Math.PI/2
    for(const angle of [azimuth-offset,azimuth+offset])curves.push({ownerId:solid.id,role:'silhouette',vertices:[point(angle,0),point(angle,h)]})
  }
  return {patches,curves,resolution}
}

export function coneRenderGeometry3D(solid:Extract<RenderAnalyticSolid3D,{kind:'cone'}>,camera:GeometryCamera3D,resolution=128):AnalyticRenderGeometry3D{
  if(!Number.isInteger(resolution)||resolution<16||resolution>1024)throw Error('Invalid render resolution')
  analyticBounds3D(solid)
  const frame=analyticFrame3D(solid.frame),r=solid.parameters.radius,h=solid.parameters.height,k=r/h
  const eye=frame.toLocal(camera.position),toward=frame.vectorToLocal(sub(camera.position,camera.target)),perspective=camera.projection==='perspective'
  const inside=perspective&&eye[2]>0&&eye[2]<h&&Math.hypot(eye[0],eye[1])<r*(1-eye[2]/h)
  const point=(angle:number)=>frame.toWorld([r*Math.cos(angle),r*Math.sin(angle),0]),tip=frame.toWorld([0,0,h])
  const v=perspective?eye:toward,radial=Math.hypot(v[0],v[1]),ratio=radial?(perspective?r-k*eye[2]:-k*toward[2])/radial:Infinity
  const contacts:number[]=[]
  if(Math.abs(ratio)<1){
    const azimuth=Math.atan2(v[1],v[0]),offset=Math.acos(ratio)
    for(const angle of [azimuth-offset,azimuth+offset])contacts.push((angle%(2*Math.PI)+2*Math.PI)%(2*Math.PI))
  }
  // Exact tangent generators and the sampled circumference share vertices.
  // These are display samples, never semantic diameter endpoints or scene points.
  const angles=[...new Set([...Array.from({length:resolution},(_,i)=>2*Math.PI*i/resolution),...contacts])].sort((a,b)=>a-b)
  const bottom=angles.map(point),patches:RenderPatch3D[]=[],curves:RenderCurve3D[]=[]
  for(let i=0;i<angles.length;i++){
    const next=i+1<angles.length?angles[i+1]:2*Math.PI,mid=(angles[i]+next)/2,half=Math.cos((next-angles[i])/2)
    const facing=v[0]*Math.cos(mid)+v[1]*Math.sin(mid)+k*half*v[2]-(perspective?r*half:0)
    if(inside||facing>=0)patches.push({ownerId:solid.id,region:'lateral',vertices:[bottom[i],bottom[(i+1)%angles.length],tip]})
  }
  if(inside||(perspective?eye[2]<0:toward[2]<0))patches.push({ownerId:solid.id,region:'bottom_cap',vertices:[...bottom].reverse()})
  curves.push({ownerId:solid.id,role:'rim',vertices:[...bottom,bottom[0]],angles:[...angles,2*Math.PI]})
  for(const angle of contacts)curves.push({ownerId:solid.id,role:'silhouette',vertices:[bottom[angles.indexOf(angle)],tip]})
  return {patches,curves,resolution}
}
/** Camera-dependent tangent circle is display geometry only. The fill samples
 * the actual near spherical surface, so overlapping solids retain real depth. */
export function sphereRenderGeometry3D(solid:Extract<RenderAnalyticSolid3D,{kind:'sphere'}>,camera:GeometryCamera3D,resolution=128):AnalyticRenderGeometry3D{
  if(!Number.isInteger(resolution)||resolution<16||resolution>1024)throw Error('Invalid render resolution')
  analyticBounds3D(solid)
  const center=solid.frame.origin,r=solid.parameters.radius
  const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
  const unit=(v:Vec3)=>{const n=Math.hypot(...v);if(!n)throw Error('Invalid sphere view');return v.map(x=>x/n) as Vec3}
  const eye=sub(camera.position,center),distance=Math.hypot(...eye),perspective=camera.projection==='perspective'
  const n=unit(perspective&&distance?eye:sub(camera.position,camera.target)),x=unit(cross(n,Math.abs(n[2])<.9?[0,0,1]:[0,1,0])),y=cross(n,x)
  const inside=perspective&&distance<=r,limit=inside?Math.PI:perspective?Math.acos(r/distance):Math.PI/2
  const point=(theta:number,angle:number)=>center.map((v,i)=>v+r*(n[i]*Math.cos(theta)+(x[i]*Math.cos(angle)+y[i]*Math.sin(angle))*Math.sin(theta))) as Vec3
  const patches:RenderPatch3D[]=[],curves:RenderCurve3D[]=[],rings=8
  for(let j=0;j<rings;j++)for(let i=0;i<resolution;i++){
    const a=2*Math.PI*i/resolution,b=2*Math.PI*(i+1)/resolution,t=limit*j/rings,u=limit*(j+1)/rings
    patches.push({ownerId:solid.id,region:'sphere',vertices:j?[point(t,a),point(u,a),point(u,b),point(t,b)]:[point(0,0),point(u,a),point(u,b)]})
  }
  if(!inside)curves.push({ownerId:solid.id,role:'silhouette',vertices:Array.from({length:resolution+1},(_,i)=>point(limit,2*Math.PI*i/resolution))})
  if(solid.parameters.equator==='visible'){
    const frame=analyticFrame3D(solid.frame),v=perspective?frame.toLocal(camera.position):frame.vectorToLocal(sub(camera.position,camera.target)),radial=Math.hypot(v[0],v[1])
    // Exactly edge-on, the rear arc projects onto the front arc. Draw the
    // nearer representative once; the full semantic circle remains implicit.
    const edgeOn=Math.abs(v[2])<=1e-12*Math.hypot(...v)&&radial>(perspective?r:0)
    const azimuth=Math.atan2(v[1],v[0]),offset=perspective?Math.acos(Math.min(1,r/radial)):Math.PI/2
    const angles=Array.from({length:resolution+1},(_,i)=>edgeOn?azimuth-offset+2*offset*i/resolution:2*Math.PI*i/resolution)
    curves.push({ownerId:solid.id,role:'equator',angles,vertices:angles.map(a=>frame.toWorld([r*Math.cos(a),r*Math.sin(a),0]))})
  }
  return {patches,curves,resolution}
}
export const analyticRenderGeometry3D=(solid:RenderAnalyticSolid3D,camera:GeometryCamera3D,resolution=128)=>solid.kind==='sphere'?sphereRenderGeometry3D(solid,camera,resolution):solid.kind==='cone'?coneRenderGeometry3D(solid,camera,resolution):cylinderRenderGeometry3D(solid,camera,resolution)
