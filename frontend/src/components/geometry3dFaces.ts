import type { GeometryScene3D, Vec2, Vec3 } from './geometry3dContract'
import { polygonBaseGeometry3D } from './geometry3dSolids'

const sub=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v-b[i]) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((v,x,i)=>v+x*b[i],0)
const turn=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

/** V2 UV is measured distance, with the original boundary's first vertex as origin. */
export function faceFrame3D(vertices:Vec3[]){
  const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
  const unit=(a:Vec3):Vec3=>{const n=Math.hypot(...a);if(n<=1e-9)throw Error('Degenerate face frame');return a.map(v=>v/n) as Vec3}
  const origin=vertices[0],x=unit(sub(vertices[1],origin)),normal=unit(cross(x,sub(vertices[2],origin))),y=cross(normal,x)
  const local=(p:Vec3):Vec2=>[dot(sub(p,origin),x),dot(sub(p,origin),y)]
  const world=(uv:Vec2):Vec3=>origin.map((v,i)=>v+uv[0]*x[i]+uv[1]*y[i]) as Vec3
  return {origin,x,y,normal,local,world,polygon:vertices.map(local)}
}
export function faceBasis3D(vertices:Vec3[]){
  polygonBaseGeometry3D(vertices)
  return faceFrame3D(vertices)
}

/** Boundary-inclusive containment, using the existing V2 validation tolerance. */
export function insideFace3D(uv:number[],polygon:number[][]){
  if(uv.length!==2||uv.some(v=>!Number.isFinite(v)))return false
  let inside=false
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=turn(a,b,uv)
    if(Math.abs(cross)<=1e-9&&uv[0]>=Math.min(a[0],b[0])-1e-9&&uv[0]<=Math.max(a[0],b[0])+1e-9&&uv[1]>=Math.min(a[1],b[1])-1e-9&&uv[1]<=Math.max(a[1],b[1])+1e-9)return true
    if((a[1]>uv[1])!==(b[1]>uv[1])&&uv[0]<(b[0]-a[0])*(uv[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside
  }
  return inside
}

const area=(polygon:Vec2[])=>polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1]},0)
function weights(p:Vec2,a:Vec2,b:Vec2,c:Vec2):[number,number,number]{
  const den=turn(a,b,c)
  if(Math.abs(den)<=1e-12)throw Error('Degenerate attachment triangle')
  return [turn(p,b,c)/den,turn(a,p,c)/den,turn(a,b,p)/den]
}

/** Ear clipping uses semantic vertex IDs for every tie, never render mesh ordering. */
export function triangulateFace3D(ids:string[],vertices:Vec3[]){
  if(ids.length!==vertices.length||new Set(ids).size!==ids.length)throw Error('Invalid boundary identities')
  const polygon=faceBasis3D(vertices).polygon,sign=Math.sign(area(polygon)),remaining=ids.map((_,i)=>i),triangles:[number,number,number][]=[]
  while(remaining.length>3){
    const ears=remaining.filter((b,k)=>{
      const a=remaining[(k+remaining.length-1)%remaining.length],c=remaining[(k+1)%remaining.length]
      if(sign*turn(polygon[a],polygon[b],polygon[c])<=1e-12)return false
      return !remaining.some(i=>i!==a&&i!==b&&i!==c&&weights(polygon[i],polygon[a],polygon[b],polygon[c]).every(w=>w>=-1e-10))
    }).sort((a,b)=>ids[a]<ids[b]?-1:ids[a]>ids[b]?1:0)
    if(!ears.length)throw Error('Cannot triangulate face safely')
    const k=remaining.indexOf(ears[0]),a=remaining[(k+remaining.length-1)%remaining.length],b=remaining[k],c=remaining[(k+1)%remaining.length]
    triangles.push([a,b,c]);remaining.splice(k,1)
  }
  triangles.push(remaining as [number,number,number])
  return triangles
}

/** Reject folded/invalid old diagonals instead of silently choosing a different attachment. */
export function transportFacePoint3D(ids:string[],before:Vec3[],after:Vec3[],uv:Vec2,triangles=triangulateFace3D(ids,before)):Vec2{
  const old=faceBasis3D(before),next=faceBasis3D(after),sign=Math.sign(area(next.polygon))
  if(after.length!==before.length||!insideFace3D(uv,old.polygon))throw Error('Invalid attachment source')
  let sum=0
  for(const [a,b,c] of triangles){
    const triangleArea=turn(next.polygon[a],next.polygon[b],next.polygon[c])*sign
    if(triangleArea<=1e-12)throw Error('Attachment triangulation folded')
    sum+=triangleArea
    for(const [i,j] of [[a,b],[b,c],[c,a]]){
      const midpoint:Vec2=[(next.polygon[i][0]+next.polygon[j][0])/2,(next.polygon[i][1]+next.polygon[j][1])/2]
      if(!insideFace3D(midpoint,next.polygon))throw Error('Attachment diagonal left face')
    }
  }
  if(Math.abs(sum-Math.abs(area(next.polygon)))>1e-9*Math.max(1,sum))throw Error('Invalid transported partition')
  for(const [a,b,c] of triangles){
    const w=weights(uv,old.polygon[a],old.polygon[b],old.polygon[c])
    if(w.some(v=>v < -1e-10))continue
    const world=after[a].map((_,i)=>w[0]*after[a][i]+w[1]*after[b][i]+w[2]*after[c][i]) as Vec3,result=next.local(world)
    if(!insideFace3D(result,next.polygon)||result.some(v=>!Number.isFinite(v)))throw Error('Attachment left face')
    return result
  }
  throw Error('Attachment has no containing triangle')
}

/** Called only by explicit semantic solid edits, before strict candidate validation. */
export function transportFaceAttachments3D(before:GeometryScene3D,after:GeometryScene3D,faceIds:ReadonlySet<string>){
  const oldPoints=new Map(before.points.map(p=>[p.id,p.position])),points=new Map(after.points.map(p=>[p.id,p]))
  for(const face of before.faces){
    if(!faceIds.has(face.id))continue
    const recipes=after.constructions.filter(c=>c.kind==='point_on_face'&&c.face_id===face.id)
    if(!recipes.length)continue
    const next=after.faces.find(f=>f.id===face.id)
    if(!next||JSON.stringify(face.boundary)!==JSON.stringify(next.boundary))throw Error('Face topology changed')
    const old=face.boundary.map(id=>oldPoints.get(id)!),vertices=next.boundary.map(id=>points.get(id)!.position)
    if(JSON.stringify(old)===JSON.stringify(vertices))continue
    const triangles=triangulateFace3D(face.boundary,old),basis=faceBasis3D(vertices)
    for(const c of recipes)if(c.kind==='point_on_face'){
      c.uv=transportFacePoint3D(face.boundary,old,vertices,c.uv,triangles)
      points.get(c.output_point_id)!.position=basis.world(c.uv)
    }
  }
}
