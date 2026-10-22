import type { GeometryCamera3D, GeometryScene3D, Vec2, Vec3 } from './geometry3dContract'
import { evaluateGeometryScene3D, transactGeometryScene3D } from './geometry3dModel'
import { faceBasis3D, insideFace3D } from './geometry3dFaces'
import { createProjection3D, add, sub, scale, dot, unit } from './geometry3dProjection'

type Pointer={x:number;y:number;width:number;height:number}
export function facePlanePointer3D(vertices:Vec3[],camera:GeometryCamera3D,p:Pointer){
  try{
    if(![p.x,p.y,p.width,p.height].every(Number.isFinite))return null
    const basis=faceBasis3D(vertices),projection=createProjection3D(camera,p.width,p.height),nx=2*p.x/p.width-1,ny=1-2*p.y/p.height,aspect=p.width/p.height,slope=Math.tan(camera.fov_degrees*Math.PI/360)
    const origin=camera.projection==='orthographic'?projection.world([nx*camera.vertical_span*aspect/2,ny*camera.vertical_span/2,0]):camera.position
    const direction=camera.projection==='orthographic'?unit(sub(camera.target,camera.position)):unit(sub(projection.world([nx*slope*aspect,ny*slope,1]),origin))
    const den=dot(direction,basis.normal)
    if(Math.abs(den)<1e-6)return null
    const distance=dot(sub(basis.origin,origin),basis.normal)/den,position=add(origin,scale(direction,distance))
    if(distance<0||!projection.visible(position))return null
    return {position,uv:basis.local(position),depth:projection.view(position)[2]}
  }catch{return null}
}

/** All semantic faces occlude, irrespective of their translucent display material. */
export function nearestFaceHit3D(scene:GeometryScene3D,camera:GeometryCamera3D,p:Pointer){
  const hits=[]
  for(const face of scene.faces){
    try{
      const vertices=face.boundary.map(id=>scene.points.find(p=>p.id===id)!.position),hit=facePlanePointer3D(vertices,camera,p)
      if(hit&&insideFace3D(hit.uv,faceBasis3D(vertices).polygon))hits.push({...hit,face_id:face.id})
    }catch{/* Invalid candidate is never a selectable attachment. */}
  }
  return hits.sort((a,b)=>a.depth-b.depth||a.face_id.localeCompare(b.face_id))[0]??null
}
export function pickSolidFace3D(source:GeometryScene3D,camera:GeometryCamera3D,p:Pointer){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,hit=nearestFaceHit3D(scene,camera,p)
  if(!hit||!scene.solids.some(s=>s.mode==='parametric'?s.features.some(f=>f.entity_id===hit.face_id):s.face_ids.includes(hit.face_id)))return null
  return hit
}
/** Used only by Point-tool snapping; ordinary Select/context picking stays unchanged. */
export function visiblePointForCreation3D(scene:GeometryScene3D,camera:GeometryCamera3D,p:Pointer,id:string){
  try{
    const point=scene.points.find(v=>v.id===id),projection=createProjection3D(camera,p.width,p.height)
    if(!point||!projection.visible(point.position))return false
    const screen=projection.screen(projection.view(point.position))
    if(Math.hypot(screen[0]-p.x,screen[1]-p.y)>10)return false
    const front=nearestFaceHit3D(scene,camera,{...p,x:screen[0],y:screen[1]})
    return !front||screen[2]<=front.depth+1e-8*Math.max(1,screen[2])
  }catch{return false}
}
export function createPointOnFace3D(source:GeometryScene3D,faceId:string,uv:Vec2,id=`p_${crypto.randomUUID().replace(/-/g,'')}`){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  try{
    const scene=evaluated.scene,face=scene.faces.find(f=>f.id===faceId)
    if(!face)return null
    const basis=faceBasis3D(face.boundary.map(id=>scene.points.find(p=>p.id===id)!.position))
    if(!insideFace3D(uv,basis.polygon))return null
    const existing=scene.constructions.find(c=>c.kind==='point_on_face'&&c.face_id===faceId&&Math.hypot(c.uv[0]-uv[0],c.uv[1]-uv[1])<=1e-9)
    if(existing)return {scene,id:existing.output_point_id,reused:true}
    const next=transactGeometryScene3D(scene,d=>{
      d.points.push({id,position:basis.world(uv),label:null})
      d.constructions.push({id:`${id}_attachment`,kind:'point_on_face',face_id:faceId,uv:[...uv],output_point_id:id})
    })
    return next?{scene:next,id,reused:false}:null
  }catch{return null}
}
export function editPointOnFace3D(source:GeometryScene3D,id:string,uv:Vec2){
  return transactGeometryScene3D(source,d=>{
    const c=d.constructions.find(c=>c.kind==='point_on_face'&&c.output_point_id===id)
    if(!c||c.kind!=='point_on_face'||uv.some(v=>!Number.isFinite(v)))throw Error('Invalid face attachment')
    const face=d.faces.find(f=>f.id===c.face_id)!,basis=faceBasis3D(face.boundary.map(id=>d.points.find(p=>p.id===id)!.position))
    if(!insideFace3D(uv,basis.polygon))throw Error('Outside parent face')
    if(Math.hypot(c.uv[0]-uv[0],c.uv[1]-uv[1])>Number.EPSILON*8)c.uv=[...uv]
  })
}
