import {clipLineToPlaneContour3D,guidedPlaneGeometry3D,guidedPlaneDisplaySize3D,guidedIntersectionSegments3D,planeGuidePointIds3D,type PlaneGuide3D} from './geometry3dGuidedPlane'
import {constructionOutputPointIds3D} from './geometry3dConstructedPlane'
import {constructedPlaneGeometry3D,perpendicularPlaneDisplay3D,perpendicularPlaneSurface3D} from './geometry3dConstructedPlane'
import {createGuidedPerpendicularPlane3D,createParallelPlaneThroughPoint3D,createPerpendicularPlaneThroughPoint3D,editPerpendicularPlaneOrientation3D} from './geometry3dConstructedPlaneAuthoring'
import {createPlanePerpendicular3D,createPyramidAltitudeFromApex3D} from './geometry3dPlanePerpendicularAuthoring'
import {createParallel3D,createPlaneParallel3D} from './geometry3dParallelAuthoring'
import {alignParallelPlaneDirection3D,type ParallelPlaneReference3D} from './geometry3dParallel'
import {planeReference3D} from './geometry3dPlanePerpendicular'
import {createPerpendicular3D} from './geometry3dPerpendicularAuthoring'
import {createPlaneAt3D,transformPlane3D,resizePlaneDisplay3D} from './geometry3dPlaneAuthoring'
import {planeDisplay3D} from './geometry3dPlaneDisplay'
import {createDihedral3D,editDihedral3D,deleteDihedral3D,transformDihedral3D} from './geometry3dDihedralAuthoring'
import {dihedralGeometry3D,dihedralDisplay3D} from './geometry3dDihedral'
import { pickSolidFace3D, visiblePointForCreation3D, createPointOnFace3D, editPointOnFace3D, facePlanePointer3D } from './geometry3dFacePoints'
import { faceBasis3D } from './geometry3dFaces'
import { pickSolidEdge3D, createPointOnEdge3D, editPointOnEdge3D } from './geometry3dEdgePoints'
import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { createProjection3D, projectScene3D, add, sub, scale, dot, unit, cross } from './geometry3dProjection'
import { faceDepth3D, pointHiddenByAnalytic3D } from './geometry3dRenderVisibility'
import { pickAnalyticSolid3D, pickAnalyticSurface3D } from './geometry3dCylinderPicking'
import { createPointOnSurface3D, editPointOnSurface3D } from './geometry3dSurfacePoints'
import { deleteGeometryTarget3D, evaluateGeometryScene3D, moveGeometryPoint3D, transactGeometryScene3D } from './geometry3dModel'
import { deleteSolid3D, pyramidApexDrag3D, movePyramidApexParallel3D, changePyramidHeight3D, pyramidBaseDrag3D, movePyramidBaseVertex3D, createPyramidFromPolygon3D, createCylinderAt3D, createConeAt3D, createSphereAt3D, createSphereSurfaceAt3D, createFrustumAt3D, rotateSolid3D, solidPivot3D, translateSolid3D } from './geometry3dSolidAuthoring'
import { polygonBaseGeometry3D } from './geometry3dSolids'
import { scaleSolid3D, resizeCylinder3D, resizeCone3D, resizeSphereRadius3D, resizeRegularSolid3D, resizeFrustum3D } from './geometry3dSolidAuthoring'
import { projectedSolidBounds3D } from './geometry3dSolidBounds'

export type GeometryTool3D = 'select' | 'altitude' | 'parallel' | 'perpendicular' | 'rotate_solid' | 'translate_solid' | 'camera' | 'point' | 'line' | 'ray' | 'segment' | 'vector' | 'plane' | 'polyline' | 'triangle' | 'polygon' | 'pyramid' | 'cylinder' | 'cone' | 'sphere' | 'sphere_surface' | 'frustum' | 'dihedral'
export type WorkingPlane3D = 'XY' | 'XZ' | 'YZ'
export const POINT_SNAP_TOLERANCE_3D=10
export const GEOMETRY_TOOLS_3D: { tool: GeometryTool3D; label: string }[] = [
  {tool:'select',label:'3D seç'}, {tool:'camera',label:'Kamera'}, {tool:'rotate_solid',label:'Fiquru fırlat'}, {tool:'translate_solid',label:'Fiquru hərəkət etdir'}, {tool:'point',label:'3D nöqtə'},
  {tool:'line',label:'3D düz xətt'}, {tool:'ray',label:'3D şüa'}, {tool:'segment',label:'3D parça'},
  {tool:'vector',label:'3D vektor'}, {tool:'plane',label:'3D müstəvi'}, {tool:'perpendicular',label:'Perpendikulyar'}, {tool:'parallel',label:'Paralel'}, {tool:'altitude',label:'Hündürlük'},
  {tool:'polyline',label:'Sınıq xətt'}, {tool:'triangle',label:'Üçbucaq'}, {tool:'polygon',label:'Poliqon'},
  {tool:'cylinder',label:'Silindr'},
  {tool:'cone',label:'Konus'},
  {tool:'dihedral',label:'\u0130ki\u00fczl\u00fc bucaq'},
  {tool:'sphere_surface',label:'Sfera'},
  {tool:'frustum',label:'K\u0259sik konus'},
  {tool:'sphere',label:'Kürə'},
]
export type Pointer3D = { pointerId:number; button:number; x:number; y:number; width:number; height:number; altKey:boolean; shiftKey?:boolean }
export type PointerPhase3D = 'down' | 'move' | 'up' | 'cancel' | 'wheel'
export const planeNormal3D = (plane: WorkingPlane3D): Vec3 => plane==='XY' ? [0,0,1] : plane==='XZ' ? [0,1,0] : [1,0,0]
const validPosition = (position: Vec3) => position.length===3&&position.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12)
export function parseCoordinates3D(values: string[]): Vec3 | null {
  if(values.length!==3||values.some(v=>!v.trim()))return null
  const position=values.map(Number) as Vec3
  return validPosition(position) ? position : null
}
export function planePoint3D(camera: GeometryCamera3D, pointer: Pick<Pointer3D,'x'|'y'|'width'|'height'>, normal:Vec3, through:Vec3):Vec3|null {
  try {
    const projection=createProjection3D(camera,pointer.width,pointer.height), nx=2*pointer.x/pointer.width-1, ny=1-2*pointer.y/pointer.height
    const slope=Math.tan(camera.fov_degrees*Math.PI/360), aspect=pointer.width/pointer.height
    const origin=camera.projection==='orthographic' ? projection.world([nx*camera.vertical_span*aspect/2,ny*camera.vertical_span/2,0]) : camera.position
    const direction=camera.projection==='orthographic' ? unit(sub(camera.target,camera.position)) : unit(sub(projection.world([nx*slope*aspect,ny*slope,1]),origin))
    const denominator=dot(direction,normal)
    if(Math.abs(denominator)<1e-6)return null
    const t=dot(sub(through,origin),normal)/denominator, position=add(origin,scale(direction,t))
    const depth=projection.view(position)[2]
    if(t<0||depth<camera.near||depth>camera.far||!validPosition(position))return null
    return position
  } catch {return null}
}
export function workingPlanePoint3D(camera: GeometryCamera3D, pointer: Pick<Pointer3D,'x'|'y'|'width'|'height'>, plane: WorkingPlane3D, through: Vec3=[0,0,0]): Vec3 | null {
  const position=planePoint3D(camera,pointer,planeNormal3D(plane),through)
  if(position){const axis=plane==='XY'?2:plane==='XZ'?1:0;position[axis]=through[axis]}
  return position
}
/** Invert the projected normal line, retaining the initial screen grab offset.
 * The camera and mapping are fixed for the gesture; perspective foreshortening is exact.
 */
export function apexHeightMapping3D(camera:GeometryCamera3D,start:Pick<Pointer3D,'x'|'y'|'width'|'height'>,position:Vec3,normal:Vec3,height:number){
  try{
    const projection=createProjection3D(camera,start.width,start.height),a=projection.view(position),b=projection.view(add(position,normal)),n=sub(b,a)
    const perspective=camera.projection==='perspective',sy=perspective?start.height/(2*Math.tan(camera.fov_degrees*Math.PI/360)):start.height/camera.vertical_span
    const v=perspective?[sy*(n[0]*a[2]-a[0]*n[2])/(a[2]*a[2]),-sy*(n[1]*a[2]-a[1]*n[2])/(a[2]*a[2])]:[sy*n[0],-sy*n[1]]
    const length2=v[0]*v[0]+v[1]*v[1]
    if(!Number.isFinite(length2)||length2*height*height<4||a[2]<camera.near||a[2]>camera.far)return null
    return (pointer:Pick<Pointer3D,'x'|'y'>):number|null=>{
      const k=((pointer.x-start.x)*v[0]+(pointer.y-start.y)*v[1])/length2,denominator=perspective?1-k*n[2]/a[2]:1
      if(denominator<=1e-6)return null
      const delta=k/denominator,depth=a[2]+delta*n[2]
      return Number.isFinite(delta)&&depth>=camera.near&&depth<=camera.far?delta:null
    }
  }catch{return null}
}
const newId = (prefix:string) => `${prefix}_${crypto.randomUUID().replace(/-/g,'')}`
export type PlanarVertex3D = {id:string;position:Vec3}
/** Commit the entire chain/face atomically through the existing scene validator. */
export function createPlanarPath3D(source:GeometryScene3D, vertices:PlanarVertex3D[], face:boolean, id=newId(face?'face':'chain')):{scene:GeometryScene3D;id:string}|null {
  if(vertices.length<(face?3:2)||vertices.length>128||new Set(vertices.map(p=>p.id)).size!==vertices.length||vertices.some(p=>!validPosition(p.position)))return null
  try{if(face)polygonBaseGeometry3D(vertices.map(p=>p.position))}catch{return null}
  let selected=id
  const scene=transactGeometryScene3D(source,draft=>{
    const ids=vertices.map(p=>p.id)
    for(const vertex of vertices){
      const existing=draft.points.find(p=>p.id===vertex.id)
      if(existing){if(Math.hypot(...sub(existing.position,vertex.position))>1e-9)throw Error('Stale vertex')}
      else draft.points.push({id:vertex.id,position:[...vertex.position],label:null})
    }
    for(let i=0;i<ids.length-(face?0:1);i++){
      const a=ids[i],b=ids[(i+1)%ids.length]
      if(Math.hypot(...sub(vertices[i].position,vertices[(i+1)%ids.length].position))<=1e-9)throw Error('Degenerate edge')
      const existing=draft.linear_objects.find(e=>e.kind==='segment'&&(e.a===a&&e.b===b||e.a===b&&e.b===a))??draft.edges.find(e=>e.start===a&&e.end===b||e.start===b&&e.end===a)
      if(!existing){const edgeId=`${id}_e${i}`;draft.linear_objects.push({id:edgeId,kind:'segment',a,b});if(!face&&i===0)selected=edgeId}
      else if(!face&&i===0)selected=existing.id
    }
    if(face){
      const existing=draft.faces.find(f=>f.boundary.length===ids.length&&f.boundary.some((_,start)=>ids.every((v,i)=>f.boundary[(start+i)%ids.length]===v)||ids.every((v,i)=>f.boundary[(start-i+ids.length)%ids.length]===v)))
      if(existing)selected=existing.id
      else draft.faces.push({id,boundary:ids})
    }
  })
  return scene?{scene,id:selected}:null
}
export function createPoint3D(source: GeometryScene3D, position: Vec3, id=newId('p')): {scene:GeometryScene3D;id:string;reused:boolean}|null {
  const evaluated=evaluateGeometryScene3D(source)
  if(!validPosition(position)||evaluated.status!=='ok')return null
  const existing=evaluated.scene.points.find(p=>Math.hypot(...sub(p.position,position))<=1e-9)
  if(existing)return {scene:evaluated.scene,id:existing.id,reused:true}
  const scene=transactGeometryScene3D(evaluated.scene,draft=>draft.points.push({id,position:[...position],label:null}))
  return scene ? {scene,id,reused:false} : null
}
export function createPrimitive3D(source: GeometryScene3D, kind: 'line'|'ray'|'segment'|'vector'|'plane', pointIds: string[], id=newId(kind)): {scene:GeometryScene3D;id:string;reused:boolean}|null {
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  source=evaluated.scene
  if(pointIds.length!==(kind==='plane'?3:2)||new Set(pointIds).size!==pointIds.length)return null
  const existing=kind==='plane' ? source.planes.find(p=>p.point_ids.every(p=>pointIds.includes(p))) : source.linear_objects.find(l=>l.kind===kind&&(l.a===pointIds[0]&&l.b===pointIds[1]|| (kind==='line'||kind==='segment')&&l.a===pointIds[1]&&l.b===pointIds[0]))
  if(existing)return {scene:source,id:existing.id,reused:true}
  const scene=transactGeometryScene3D(source,draft=>{
    if(kind==='plane')draft.planes.push({id,point_ids:[...pointIds] as [string,string,string]})
    else draft.linear_objects.push({id,kind,a:pointIds[0],b:pointIds[1]})
  })
  return scene ? {scene,id,reused:false} : null
}
export function isFreePoint3D(scene:GeometryScene3D,id:string) {
  return !(scene.dihedrals??[]).some(d=>d.features.some(f=>f.entity_id===id))&&scene.points.some(p=>p.id===id)&&!scene.constructions.some(c=>constructionOutputPointIds3D(c).includes(id))&&!scene.solids.some(s=>s.mode==='parametric' ? s.features.some(f=>f.entity_id===id) : s.point_ids.includes(id))
}
export function editPoint3D(source:GeometryScene3D,id:string,position:Vec3,label:string|null):GeometryScene3D|null {
  if(!isFreePoint3D(source,id)||!validPosition(position))return null
  const moved=moveGeometryPoint3D(source,id,position)
  return moved ? transactGeometryScene3D(moved,draft=>{draft.points.find(p=>p.id===id)!.label=label}) : null
}
export function editConeCenterLabel3D(source:GeometryScene3D,id:string,label:string|null){
  if(label!==null&&typeof label!=='string')return null
  if(!(source.dihedrals??[]).some(d=>d.features.some(f=>f.entity_id===id&&f.slot.startsWith('v_')))&&!source.solids.some(s=>s.mode==='parametric'&&(s.kind==='cone'||s.kind==='sphere'||s.kind==='frustum')&&s.features.some(f=>['v_0','v_1','v_2','v_3'].includes(f.slot)&&f.entity_id===id)))return null
  return transactGeometryScene3D(source,d=>{d.points.find(p=>p.id===id)!.label=label===''?null:label})
}
export function editReferences3D(source:GeometryScene3D,id:string,pointIds:string[]):GeometryScene3D|null {
  return transactGeometryScene3D(source,draft=>{
    const line=draft.linear_objects.find(l=>l.id===id),plane=draft.planes.find(p=>p.id===id)
    if(line&&pointIds.length===2){line.a=pointIds[0];line.b=pointIds[1]}
    else if(plane&&pointIds.length===3)plane.point_ids=[...pointIds] as [string,string,string]
    else throw Error('Unsupported edit')
  })
}
export function deletePrimitive3D(source:GeometryScene3D,id:string) {
  if((source.dihedrals??[]).some(d=>d.id===id))return deleteDihedral3D(source,id)
  if(source.solids.some(s=>s.id===id))return deleteSolid3D(source,id)
  if(source.linear_objects.some(l=>l.id===id)||source.planes.some(p=>p.id===id)||source.faces.some(p=>p.id===id))return deleteGeometryTarget3D(source,id)
  if(!isFreePoint3D(source,id))return null
  // Validation rejects any remaining reference. No implicit cascading deletion or detachment.
  const evaluated=evaluateGeometryScene3D(source);if(evaluated.status!=='ok')return null
  const losses=evaluated.scene.constructions.flatMap(c=>(c.kind==='constructed_plane'&&c.through.id===id||c.kind==='perpendicular_plane_on_line'&&planeGuidePointIds3D(evaluated.scene,c.guide).includes(id))?c.output_point_ids.map(output=>({subject_id:output,parent_id:id,reason:'parent_deleted' as const,preserved_world_position:[...evaluated.scene.points.find(p=>p.id===output)!.position] as Vec3})):[])
  const scene=transactGeometryScene3D(evaluated.scene,draft=>{draft.constructions=draft.constructions.filter(c=>!(c.kind==='constructed_plane'&&c.through.id===id||c.kind==='perpendicular_plane_on_line'&&planeGuidePointIds3D(evaluated.scene,c.guide).includes(id)));draft.points=draft.points.filter(p=>p.id!==id)})
  return scene ? {scene,losses} : null
}
export type Pick3D = {id:string;kind:'point'|'linear'|'plane'|'solid'|'face';distance:number;depth:number}
export function pickGeometry3D(source:GeometryScene3D,camera:GeometryCamera3D,pointer:Pick<Pointer3D,'x'|'y'|'width'|'height'>,pointsOnly=false,pointFilter?:(id:string)=>boolean,facesOnly=false):Pick3D|null {
  try {
    const projected=projectScene3D(source,camera,pointer.width,pointer.height), candidates:Pick3D[]=[]
    if(projected.status!=='ok')return null
    const constructedPlanes=new Set(source.constructions.filter(c=>c.kind==='constructed_plane'&&c.relation==='perpendicular').map(c=>c.output_plane_id))
    const cylinder=pointsOnly?null:pickAnalyticSolid3D(source,camera,pointer),surfaces=new Set<Pick3D>()
    const owner=(id:string)=>source.solids.find(s=>s.mode==='parametric'&&s.features.some(f=>f.entity_id===id))?.id??(source.dihedrals??[]).find(d=>d.id===id||d.features.some(f=>f.entity_id===id))?.id
    for(const point of facesOnly?[]:projected.points){if(!point.markerVisible||pointFilter&&!pointFilter(point.id))continue;const distance=Math.hypot(pointer.x-point.position[0],pointer.y-point.position[1]);if(distance<=POINT_SNAP_TOLERANCE_3D)candidates.push({id:point.id,kind:'point',distance,depth:point.position[2]})}
    if(!pointsOnly){
      for(const line of facesOnly?[]:projected.lines.filter(l=>source.linear_objects.some(s=>s.id===l.id)||owner(l.id))){
        const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],length=dx*dx+dy*dy
        const t=length ? Math.max(0,Math.min(1,((pointer.x-line.a[0])*dx+(pointer.y-line.a[1])*dy)/length)) : 0
        const distance=Math.hypot(pointer.x-line.a[0]-dx*t,pointer.y-line.a[1]-dy*t)
        if(distance<=7){
          if(projected.analyticSolids.length&&line.viewA&&line.viewB){
            const u=camera.projection==='perspective'?t*line.a[2]/((1-t)*line.b[2]+t*line.a[2]):t
            const world=projected.projection.world(add(line.viewA,scale(sub(line.viewB,line.viewA),u)))
            if(pointHiddenByAnalytic3D(world,camera,projected.analyticSolids))continue
          }
          candidates.push({id:owner(line.id)??line.id,kind:owner(line.id)?'solid':'linear',distance,depth:line.a[2]+t*(line.b[2]-line.a[2])})
        }
      }
      for(const face of projected.faces){
        if(facesOnly&&!source.faces.some(f=>f.id===face.id))continue
        let inside=false
        for(let i=0,j=face.vertices.length-1;i<face.vertices.length;j=i++){
          const a=face.vertices[i],b=face.vertices[j]
          if((a[1]>pointer.y)!==(b[1]>pointer.y)&&pointer.x<(b[0]-a[0])*(pointer.y-a[1])/(b[1]-a[1])+a[0])inside=!inside
        }
        if(inside){
          const plane=cylinder||constructedPlanes.has(face.id)?faceDepth3D(face,camera.projection):null,metric=plane?plane.x*pointer.x+plane.y*pointer.y+plane.c:null
          const depth=metric===null?face.vertices.reduce((s,p)=>s+p[2],0)/face.vertices.length:camera.projection==='perspective'?-1/metric:metric
          const candidate:Pick3D={id:facesOnly?face.id:owner(face.id)??face.id,kind:facesOnly?'face':owner(face.id)?'solid':face.kind==='plane'?'plane':'face',distance:0,depth}
          candidates.push(candidate);if(face.kind==='face')surfaces.add(candidate)
        }
      }
      if(cylinder){
        if(!facesOnly){candidates.push(cylinder);surfaces.add(cylinder)}
        const front=Math.min(cylinder.depth,...[...surfaces].map(c=>c.depth))
        for(let i=candidates.length-1;i>=0;i--)if(surfaces.has(candidates[i])&&candidates[i].depth>front+1e-8*Math.max(1,Math.abs(front)))candidates.splice(i,1)
      }
    }
    const rank={point:0,linear:1,solid:2,plane:3,face:3}
    // Prefer an editable pyramid at exactly coincident source/generated points,
    // including after source detachment. Construction tools keep their point ordering.
    const shadowedPoints=new Set<string>()
    if(!pointsOnly){
      const hits=new Set(candidates.filter(c=>c.kind==='point').map(c=>c.id)),positions=new Map(source.points.map(p=>[p.id,p.position]))
      const pyramidPoints=new Set(source.solids.flatMap(s=>s.mode==='parametric'&&s.kind==='pyramid'?s.features.filter(f=>/^v_\d+$/.test(f.slot)).map(f=>f.entity_id):[]))
      const preferred=[...hits].filter(id=>pyramidPoints.has(id))
      for(const id of hits)if(!pyramidPoints.has(id)){const a=positions.get(id);if(a&&preferred.some(owned=>{const b=positions.get(owned);return b&&Math.hypot(...sub(a,b))<=1e-9}))shadowedPoints.add(id)}
    }
    candidates.sort((a,b)=>rank[a.kind]-rank[b.kind]||Number(shadowedPoints.has(a.id))-Number(shadowedPoints.has(b.id))||a.distance-b.distance||a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0))
    return candidates[0]??null
  } catch {return null}
}

/** Semantic gesture state; drafts never enter the document until a valid completed gesture. */
export function dihedralEditTarget3D(scene:GeometryScene3D,camera:GeometryCamera3D,p:Pick<Pointer3D,'x'|'y'|'width'|'height'>,id:string){
 const d=scene.dihedrals.find(d=>d.id===id);if(!d)return null
 const visible=pickGeometry3D(scene,camera,p);if(visible&&visible.id!==id)return null
 const geo=dihedralGeometry3D(d),display=dihedralDisplay3D(d),view=createProjection3D(camera,p.width,p.height)
 for(const h of display.handles){const q=view.screen(view.view(h.position));if(view.visible(h.position)&&Math.hypot(q[0]-p.x,q[1]-p.y)<=9)return {kind:h.kind,world:h.position,direction:h.direction,length:h.length}}
 const hits=[geo.a,geo.b].flatMap((direction,i)=>{
  const world=planePoint3D(camera,p,cross(geo.e,direction),d.frame.origin);if(!world)return []
  const v=sub(world,d.frame.origin),s=dot(v,geo.e),t=dot(v,direction)
  if(Math.abs(s)>display.size.edge_length/2+1e-8||t<0||t>display.size.widths[i]+1e-8)return []
  const outer=add(add(d.frame.origin,scale(geo.e,s)),scale(direction,display.size.widths[i])),screen=view.screen(view.view(outer))
  return [{i,world,direction,s,depth:view.view(world)[2],widthHit:Math.hypot(screen[0]-p.x,screen[1]-p.y)<=7}]
 }).filter(h=>view.visible(h.world)).sort((a,b)=>a.depth-b.depth||b.i-a.i)
 const hit=hits[0];if(!hit)return null
 if(hit.widthHit)return {kind:hit.i===0?'width0' as const:'width1' as const,world:hit.world,direction:hit.direction,length:display.size.widths[hit.i]}
 return hit.i===1?{kind:'angle' as const,world:add(d.frame.origin,scale(geo.e,hit.s)),direction:geo.e,length:0}:null
}
export function planeResizeTarget3D(scene:GeometryScene3D,camera:GeometryCamera3D,p:Pick<Pointer3D,'x'|'y'|'width'|'height'>,id:string){
 // The old P-centered sizing patch does not bound these derived surfaces.
 if(scene.constructions.some(c=>c.kind==='constructed_plane'&&c.relation==='perpendicular'&&c.output_plane_id===id))return null
 const plane=scene.planes.find(f=>f.id===id),display=plane&&planeDisplay3D(plane,scene);if(!display)return null
 const hit=pickGeometry3D(scene,camera,p);if(hit&&hit.id!==id)return null
 const projection=createProjection3D(camera,p.width,p.height)
 for(const grip of display.grips){const q=projection.screen(projection.view(grip.position));if(projection.visible(grip.position)&&Math.hypot(q[0]-p.x,q[1]-p.y)<=9)return {u:grip.u,v:grip.v}}
 let nearest:{distance:number;u:number;v:number}|null=null
 for(let i=0;i<display.contour.length;i++){
  const clipped=projection.line(display.contour[i],display.contour[(i+1)%display.contour.length],'segment');if(!clipped)continue
  const a=projection.screen(clipped[0]),b=projection.screen(clipped[1]),dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/length)):0,distance=Math.hypot(p.x-a[0]-t*dx,p.y-a[1]-t*dy)
  let u=0,v=0
  if(plane!.display!.shape==='cloud'){const angle=2*Math.PI*(i+.5)/display.contour.length;if(Math.abs(Math.cos(angle))>Math.abs(Math.sin(angle)))u=Math.sign(Math.cos(angle));else v=Math.sign(Math.sin(angle))}
  else if(i===0)v=-1;else if(i===1)u=1;else if(i===2)v=1;else u=-1
  if(distance<=7&&(!nearest||distance<nearest.distance))nearest={distance,u,v}
 }
 return nearest?{u:nearest.u,v:nearest.v}:null
}
export function createAuthoringInteraction3D(options:{getScene:()=>GeometryScene3D;getCamera:()=>GeometryCamera3D;commit:(scene:GeometryScene3D)=>boolean;notify:()=>void}) {
  let tool:GeometryTool3D='select',plane:WorkingPlane3D='XY',selected:string|null=null,hover:string|null=null,pending:string[]=[],draft:GeometryScene3D|null=null,message=''
  let vertices:PlanarVertex3D[]=[],preview:Vec3|null=null
  let parallelOutput:'line'|'plane'='line',planeConstruction:{reference:{kind:'plane'|'face';id:string}}|null=null
  let guidedReference:string|null=null,guidedGuide:PlaneGuide3D|null=null
  let perpendicularOutput:'segment'|'plane'|'guided_plane'='segment',perpendicularPlane:{reference:{kind:'plane'|'face';id:string};angle:number|null;planeId?:string;pointerId:number|null;start?:Pointer3D}|null=null
  let perpendicularPlaneReference:{kind:'plane'|'face';id:string}|null=null
  function perpendicularPlaneHandle():Vec3[]{
    if(!perpendicularPlane)return []
    try{return perpendicularPlaneDisplay3D(options.getScene(),pending[0],perpendicularPlane.reference,perpendicularPlane.angle??0).indicator}catch{return []}
  }
  function guidedPreview(){
    if(!guidedReference||!guidedGuide)return {patch:[] as Vec3[],segments:[] as [Vec3,Vec3][]}
    try{const scene=options.getScene(),positions=guidedPlaneGeometry3D(scene,{kind:'plane',id:guidedReference},guidedGuide).positions,reference=scene.planes.find(p=>p.id===guidedReference)!,output={id:'preview',point_ids:['preview_o','preview_x','preview_y'] as [string,string,string],display:{...reference.display!,...guidedPlaneDisplaySize3D(scene,{kind:'plane',id:guidedReference},guidedGuide),shape:'rectangle' as const,skew:0,lower_portion:'both' as const}},scratch={...scene,points:output.point_ids.map((id,i)=>({id,position:positions[i],label:null}))},contour=planeDisplay3D(output,scratch)!.contour;return {patch:[...contour,contour[0]],segments:guidedIntersectionSegments3D(scene,{kind:'plane',id:guidedReference},guidedGuide)}}catch{return {patch:[] as Vec3[],segments:[] as [Vec3,Vec3][]}}
  }
  function perpendicularPlaneIntersectionPreview():[Vec3,Vec3][]{
    if(!perpendicularPlane)return []
    try{return perpendicularPlaneDisplay3D(options.getScene(),pending[0],perpendicularPlane.reference,perpendicularPlane.angle??0).segments}catch{return []}
  }
  function perpendicularPlanePatches():Vec3[][]{
    if(!perpendicularPlane)return []
    try{
      const state=perpendicularPlane,scene=options.getScene(),mode=scene.planes.find(p=>p.id===state.planeId)?.display?.intersection_mode??'cross'
      return perpendicularPlaneSurface3D(scene,pending[0],state.reference,state.angle??0,undefined,mode).polygons
    }catch{return []}
  }
  function planeConstructionPreview():Vec3[]{
    if(!planeConstruction)return []
    try{const positions=constructedPlaneGeometry3D(options.getScene(),pending[0],planeConstruction.reference).positions,o=positions[0],x=sub(positions[1],o),y=sub(positions[2],o),corner=(u:number,v:number)=>add(o,add(scale(x,u),scale(y,v)));return [corner(-2,-1.5),corner(2,-1.5),corner(2,1.5),corner(-2,1.5),corner(-2,-1.5)]}catch{return []}
  }
  let planeParallel:{reference:ParallelPlaneReference3D;angle:number|null;pointerId:number|null;rotating:boolean}|null=null
  function directionPreview():Vec3[]{
    if(!planeParallel)return []
    try{const scene=options.getScene(),f=planeReference3D(scene,planeParallel.reference).frame,P=scene.points.find(p=>p.id===pending[0])!.position,angle=planeParallel.angle??0,d=add(scale(f.x,Math.cos(angle)),scale(f.y,Math.sin(angle)));return [P,add(P,scale(d,2))]}catch{return []}
  }
  const planar=()=>['segment','polyline','triangle','polygon'].includes(tool)
  type Gesture={pointerId:number;start:Pointer3D;pointId:string|null;source:GeometryScene3D;worldStart:Vec3|null;position:Vec3|null;apexNormal:Vec3|null;base:ReturnType<typeof pyramidBaseDrag3D>;heightMode:boolean;heightMapping:ReturnType<typeof apexHeightMapping3D>;edgeDrag?:{t:number;length:number;mapping:ReturnType<typeof apexHeightMapping3D>};edgeHit?:ReturnType<typeof pickSolidEdge3D>;faceHit?:ReturnType<typeof pickSolidFace3D>;faceDrag?:{vertices:Vec3[];camera:GeometryCamera3D;worldStart:Vec3|null};surfaceDrag?:{surfaceId:string;camera:GeometryCamera3D;offset:{x:number;y:number}};pointHit?:string;changed:boolean;invalid:boolean}
  let rotation:{pointerId:number;start:Pointer3D;source:GeometryScene3D;camera:GeometryCamera3D;id:string;changed:boolean;translation?:{plane:WorkingPlane3D;pivot:Vec3;worldStart:Vec3};resize?:{kind:'uniform'|'radius'|'height'|'bottom_radius'|'top_radius';length:number;mapping:NonNullable<ReturnType<typeof apexHeightMapping3D>>}}|null=null
  let gesture:Gesture|null=null
  let planeResize:{id:string;pointerId:number;source:GeometryScene3D;camera:GeometryCamera3D;start:Pointer3D;world:Vec3;u:number;v:number}|null=null
  let angleDrag:{id:string;pointerId:number;source:GeometryScene3D;camera:GeometryCamera3D;start:Pointer3D;center?:Vec3;resize?:{kind:'width0'|'width1'|'edge';length:number;mapping:NonNullable<ReturnType<typeof apexHeightMapping3D>>}}|null=null
  const cancel=()=>{perpendicularPlaneReference=null;guidedReference=null;guidedGuide=null;perpendicularPlane=null;planeConstruction=null;planeParallel=null;planeResize=null;angleDrag=null;rotation=null;gesture=null;draft=null;pending=[];vertices=[];preview=null;message='';options.notify()}
  const publish=(next:GeometryScene3D|null)=>{
    if(!next){message='Əməliyyat etibarsızdır; səhnə dəyişdirilmədi.';return false}
    if(JSON.stringify(next)===JSON.stringify(options.getScene()))return true
    if(!options.commit(next)){message='Əməliyyat tətbiq edilmədi.';return false}return true
  }
  function choose(id:string){
    if(tool==='segment'){
      const point=options.getScene().points.find(p=>p.id===id)
      if(point)appendPlanarVertex({id:point.id,position:[...point.position]})
      else message='Mövcud nöqtə seçin.'
      options.notify();return
    }
    if(!['line','ray','segment','vector','plane'].includes(tool))return
    if(!options.getScene().points.some(p=>p.id===id)){message='Mövcud nöqtə seçin.';options.notify();return}
    if(pending.includes(id)){message='Fərqli nöqtələr seçin.';options.notify();return}
    const candidate=[...pending,id],count=tool==='plane'?3:2
    if(candidate.length===count){const result=createPrimitive3D(options.getScene(),tool as 'line'|'ray'|'segment'|'vector'|'plane',candidate)
      if(result&&publish(result.scene)){selected=result.id;pending=[];message=result.reused?'Mövcud obyekt seçildi.':'Obyekt yaradıldı.'}
      else message='Nöqtələr degenerativdir və ya istinad etibarsızdır. Başqa nöqtə seçin.'
    }else{pending=candidate;message=''}options.notify()
  }
  function finish(){
    if(guidedReference&&guidedGuide){
      const result=createGuidedPerpendicularPlane3D(options.getScene(),{kind:'plane',id:guidedReference},guidedGuide)
      if(result.scene&&publish(result.scene)){selected=result.id;const outside=guidedIntersectionSegments3D(result.scene,{kind:'plane',id:guidedReference},guidedGuide).length===0;guidedReference=null;guidedGuide=null;pending=[];tool='select';message=outside?'Kəsişmə xətti istinad müstəvisinin görünən sərhədlərindən kənardadır.':'Perpendikulyar müstəvi yaradıldı.';options.notify();return true}
      message=result.error??'Construction rejected';options.notify();return false
    }
    if(perpendicularPlane){
      const state=perpendicularPlane
      if(state.angle===null){message='Drag the orientation handle to choose an orientation before confirming.';options.notify();return false}
      const result=state.planeId?{scene:editPerpendicularPlaneOrientation3D(options.getScene(),state.planeId,state.angle),id:state.planeId,error:'Orientation edit rejected'}:createPerpendicularPlaneThroughPoint3D(options.getScene(),pending[0],state.reference,state.angle)
      if(result.scene&&publish(result.scene)){selected=result.id;perpendicularPlane=null;pending=[];tool='select';message='Perpendicular plane orientation confirmed.';options.notify();return true}
      message=result.error??'Construction rejected';options.notify();return false
    }
    if(planeConstruction){
      const result=createParallelPlaneThroughPoint3D(options.getScene(),pending[0],planeConstruction.reference)
      if(result.scene&&publish(result.scene)){selected=result.id;planeConstruction=null;pending=[];tool='select';message=result.coincident?'The constructed plane is coincident with the reference plane.':'Parallel plane created.';options.notify();return true}
      message=result.error??'Construction rejected';options.notify();return false
    }
    if(planeParallel){
      if(planeParallel.angle===null){message='Choose a direction explicitly before confirming.';options.notify();return false}
      const result=createPlaneParallel3D(options.getScene(),pending[0],{...planeParallel.reference,angle_radians:planeParallel.angle})
      if(result.scene&&publish(result.scene)){selected=result.id;planeParallel=null;pending=[];tool='select';message=result.coincident?'The constructed line is contained in the reference plane.':'Parallel to plane created.';options.notify();return true}
      message=result.error??'Construction rejected';options.notify();return false
    }
    if(!planar())return false
    const result=createPlanarPath3D(options.getScene(),vertices,tool==='triangle'||tool==='polygon')
    if(result&&publish(result.scene)){selected=result.id;vertices=[];pending=[];preview=null;message='Fiqur yaradıldı.';options.notify();return true}
    message='Fiqur etibarsızdır: fərqli nöqtələr və kəsişməyən, sıfır olmayan sahə tələb olunur.';options.notify();return false
  }
  function planarTarget(p:Pointer3D):{id:string|null;position:Vec3}|null {
    if(![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0)return null
    const camera=options.getCamera(),projection=createProjection3D(camera,p.width,p.height)
    // Pending start has priority for explicit closure, using the shared 10 px tolerance.
    for(const v of vertices){if(!projection.visible(v.position))continue;const s=projection.screen(projection.view(v.position));if(Math.hypot(p.x-s[0],p.y-s[1])<=POINT_SNAP_TOLERANCE_3D)return v}
    const scene=options.getScene(),normal=planeNormal3D(plane)
    const hit=pickGeometry3D(scene,camera,p,true,id=>{const v=scene.points.find(v=>v.id===id);return !!v&&Math.abs(dot(v.position,normal))<=1e-9})
    const existing=hit?scene.points.find(v=>v.id===hit.id):null
    if(existing)return {id:existing.id,position:[...existing.position]}
    const position=workingPlanePoint3D(camera,p,plane)
    return position?{id:null,position}:null
  }
  function planarClick(p:Pointer3D){
    const target=planarTarget(p)
    if(!target){message='İş müstəvisi bu görünüşdə əlçatan deyil.';return}
    appendPlanarVertex({id:target.id??newId('p'),position:target.position})
  }
  function appendPlanarVertex(target:PlanarVertex3D){
    if(vertices.some(v=>v.id===target.id)){
      if(target.id===vertices[0]?.id&&tool==='polygon'&&vertices.length>=3)finish()
      else message='Fərqli nöqtə seçin. Sınıq xətti Enter ilə bitirin.'
      return
    }
    if(vertices.length>=128){message='Ən çox 128 təpə dəstəklənir.';return}
    vertices.push(target);pending=vertices.map(v=>v.id);preview=null
    if(tool==='triangle'&&vertices.length===3||tool==='segment'&&vertices.length===2){
      if(!finish()){vertices.pop();pending=vertices.map(v=>v.id)}
    }else message=tool==='segment'?'Son nöqtəni seçin.':tool==='polyline'?'Enter — bitir · Esc — ləğv et':'Başlanğıc nöqtəyə klik — bağla · Esc — ləğv et'
  }
  return {
    snapshot:()=>({tool,plane,selected,hover,pending:[...pending],draft,message,parallelOutput,perpendicularOutput,planeOrientationSelection:!!perpendicularPlane,planeOrientationChosen:!!perpendicularPlane&&perpendicularPlane.angle!==null,intersectionLinePreview:perpendicularPlaneIntersectionPreview(),orientationHandlePreview:perpendicularPlaneHandle(),orientationHandleContour:perpendicularPlane?perpendicularPlaneDisplay3D(options.getScene(),pending[0],perpendicularPlane.reference,perpendicularPlane.angle??0).contour:[],guidedPlanePreview:!!guidedGuide,guidedIntersectionPreview:guidedPreview().segments,planeConstructionPreview:!!planeConstruction,directionSelection:!!planeParallel,directionChosen:planeParallel?.angle!==null&&!!planeParallel,previewSurfacePolygons:perpendicularPlanePatches(),preview:guidedGuide?guidedPreview().patch:planeConstruction?planeConstructionPreview():planeParallel?directionPreview():vertices.length?[...vertices.map(v=>v.position),...(preview?[preview]:[])]:[],dragging:!!perpendicularPlane&&perpendicularPlane.pointerId!==null||planeParallel?.pointerId!==null&&!!planeParallel||!!planeResize||!!angleDrag||!!rotation||gesture?.pointId!==null&&!!gesture}),
    setPerpendicularOutput(next:'segment'|'plane'|'guided_plane'){cancel();perpendicularOutput=next;if(next==='segment'&&selected&&options.getScene().points.some(p=>p.id===selected))pending=[selected];message=next==='guided_plane'?'Əvvəlcə istinad müstəvisini, sonra iki nöqtə, düz xətt və ya parça seçin.':next==='plane'?'Select the reference plane first, then point P.':'Select a source point and reference geometry.';options.notify()},
    editPlaneOrientation(id:string){
      cancel();const c=options.getScene().constructions.find(c=>c.kind==='constructed_plane'&&c.output_plane_id===id)
      if(!c||c.kind!=='constructed_plane'||c.relation!=='perpendicular'){message='Select a constructed perpendicular plane.';options.notify();return false}
      selected=id;tool='perpendicular';perpendicularOutput='plane';pending=[c.through.id];perpendicularPlane={reference:c.reference,angle:c.orientation.angle_radians,planeId:id,pointerId:null};message='Drag the orientation axis, then confirm or cancel.';options.notify();return true
    },
    setParallelOutput(next:'line'|'plane'){cancel();parallelOutput=next;if(selected&&options.getScene().points.some(p=>p.id===selected))pending=[selected];message=next==='plane'?'Select a source point and reference plane/face.':'Select a source point and reference geometry.';options.notify()},
    finish,
    cancel,
    setTool(next:GeometryTool3D){cancel();tool=next;if(next==='perpendicular'&&perpendicularOutput==='guided_plane'){message='\u0130stinad m\u00fcst\u0259visini se\u00e7in.'}else if(next==='perpendicular'&&perpendicularOutput==='plane'){message='Select the reference plane first, then point P.'}else if(next==='perpendicular'||next==='parallel'){if(selected&&options.getScene().points.some(p=>p.id===selected))pending=[selected];message=pending.length?'Select a reference line, edge, plane or face.':'Select the source point, then its reference geometry.'}if(next==='altitude')message='Select the pyramid apex; its base is resolved automatically.';if(next==='rotate_solid')message='Fiquru fırlat · Sürükləyin · Esc — ləğv et';if(next==='translate_solid')message='Fiquru hərəkət etdir · Sürükləyin · Esc — ləğv et';options.notify()},
    setPlane(next:WorkingPlane3D){cancel();plane=next;options.notify()},
    select(id:string|null){cancel();selected=id;options.notify()},
    choose,
    sync(){if(selected&&!(['points','linear_objects','planes','solids','faces','dihedrals'] as const).some(k=>(options.getScene()[k]??[]).some(p=>p.id===selected)))selected=null;cancel()},
    pointer(phase:PointerPhase3D,p:Pointer3D):boolean {
      if(perpendicularPlane){
        const state=perpendicularPlane
        if(phase==='cancel'){if(state.pointerId!==null)cancel();return true}
        if(phase==='wheel'||p.altKey||phase==='down'&&p.button!==0)return false
        if(phase==='down'){
          const handle=perpendicularPlaneHandle(),view=createProjection3D(options.getCamera(),p.width,p.height),screen=handle.length?view.screen(view.view(handle[1])):null
          const scene=options.getScene(),f=planeReference3D(scene,state.reference).frame,P=scene.points.find(q=>q.id===pending[0])!.position,world=planePoint3D(options.getCamera(),p,f.normal,P)
          const bounds=perpendicularPlaneDisplay3D(scene,pending[0],state.reference,state.angle??0)
          const inside=world&&clipLineToPlaneContour3D(world,add(world,f.x),bounds.contour,f.x,f.y).some(([a,b])=>dot(sub(a,world),f.x)<=1e-9&&dot(sub(b,world),f.x)>=-1e-9)
          if(!screen||!inside||Math.hypot(screen[0]-p.x,screen[1]-p.y)>7){message='Drag the orange orientation handle; it is an in-plane axis, not the plane normal.';options.notify();return true}
          state.pointerId=p.pointerId;state.start=p;return true
        }
        if(state.pointerId!==p.pointerId)return false
        if(phase==='move'&&state.start&&Math.hypot(p.x-state.start.x,p.y-state.start.y)>3){
          const scene=options.getScene(),P=scene.points.find(p=>p.id===pending[0])!.position,f=planeReference3D(scene,state.reference).frame,world=planePoint3D(options.getCamera(),p,f.normal,P)
          if(world&&Math.hypot(...sub(world,P))>1e-9){const d=sub(world,P),angle=Math.atan2(dot(d,f.y),dot(d,f.x));try{constructedPlaneGeometry3D(scene,pending[0],state.reference,{kind:'plane_local_angle',angle_radians:angle});state.angle=angle;message='Orientation preview. Confirm to apply.'}catch{message='Orientation cannot be represented safely; retaining the last valid preview.'}}
          else message='Orientation unavailable. Orbit away from an edge-on view; the last valid orientation is retained.'
          options.notify();return true
        }
        if(phase==='up'){state.pointerId=null;state.start=undefined;options.notify();return true}
        return true
      }
      if(planeConstruction){if(phase==='wheel'||p.altKey||p.button>0)return false;return true}
      if(planeParallel){
        // Normal release also emits lostpointercapture; retain the chosen preview.
        if(phase==='cancel'){if(planeParallel.pointerId!==null)cancel();return true}
        if(phase==='wheel'||p.altKey||phase==='down'&&p.button!==0)return false
        const state=planeParallel,scene=options.getScene(),camera=options.getCamera()
        if(phase!=='down'&&state.pointerId===null)return false
        if(phase==='down'){
          const edge=pickSolidEdge3D(scene,camera,p),hit=pickGeometry3D(scene,camera,p),linear=scene.linear_objects.find(l=>l.id===hit?.id&&['line','ray','segment'].includes(l.kind))
          const reference=edge?{kind:'edge' as const,id:edge.edge_id}:linear?{kind:'linear' as const,id:linear.id}:null
          if(reference){state.pointerId=p.pointerId;state.rotating=false;try{state.angle=alignParallelPlaneDirection3D(scene,state.reference,reference);message='Aligned direction preview. Confirm to create.'}catch(error){message=error instanceof Error?error.message:'Invalid alignment'}options.notify();return true}
          state.pointerId=p.pointerId;state.rotating=true
        }
        if((phase==='down'||phase==='move')&&state.rotating&&state.pointerId===p.pointerId){
          const f=planeReference3D(scene,state.reference).frame,P=scene.points.find(p=>p.id===pending[0])!.position,world=planePoint3D(camera,p,f.normal,P)
          if(world&&Math.hypot(...sub(world,P))>1e-9){const d=sub(world,P);state.angle=Math.atan2(dot(d,f.y),dot(d,f.x));message='Direction preview. Drag to rotate, then confirm.'}
          else message='Direction unavailable here. Move away from the source or orbit away from an edge-on view.'
          options.notify();return true
        }
        if(phase==='up'&&state.pointerId===p.pointerId){state.pointerId=null;options.notify()}
        return true
      }
      if(phase==='wheel')return !!gesture||!!rotation||!!angleDrag||!!planeResize
      if(planeResize){
        if(p.pointerId!==planeResize.pointerId)return true
        if(phase==='cancel'){cancel();return true}
        if(phase==='move'){
          const r=planeResize,plane=r.source.planes.find(p=>p.id===r.id)!,display=planeDisplay3D(plane,r.source)!,world=planePoint3D(r.camera,p,display.normal,display.o)
          if(Math.hypot(p.x-r.start.x,p.y-r.start.y)<=3)draft=null
          else if(world){const delta=sub(world,r.world),vertical=plane.display!.lower_portion==='upper'?(r.v+1)/2:r.v,width=r.u&&Math.abs(r.u+display.skew*r.v)>1e-6?plane.display!.width+2*dot(delta,display.x)/(r.u+display.skew*r.v):plane.display!.width,height=vertical?plane.display!.height+2*dot(delta,display.y)/vertical:plane.display!.height;draft=resizePlaneDisplay3D(r.source,r.id,width,height)}
          options.notify();return true
        }
        if(phase==='up'){const next=draft;planeResize=null;draft=null;if(next)publish(next);options.notify();return true}
        return true
      }
      if(angleDrag){
        if(p.pointerId!==angleDrag.pointerId)return true
        if(phase==='cancel'){cancel();return true}
        if(phase==='move'){
          const d=(angleDrag.source.dihedrals??[]).find(d=>d.id===angleDrag!.id)!,geo=dihedralGeometry3D(d),center=angleDrag.center??d.frame.origin,world=planePoint3D(angleDrag.camera,p,geo.e,center)
          if(Math.hypot(p.x-angleDrag.start.x,p.y-angleDrag.start.y)<=3)draft=null
          else if(angleDrag.resize){
            const r=angleDrag.resize,delta=r.mapping(p)
            if(delta!==null){const display=structuredClone(d.display),length=r.length+delta;if(r.kind==='edge')display.edge_length=2*length;else display.widths[r.kind==='width0'?0:1]=length;draft=Math.abs(delta)>1e-10?editDihedral3D(angleDrag.source,d.id,{display}):null}
          }else if(world){const v=sub(world,center),theta=Math.atan2(Math.max(0,dot(v,geo.c)),dot(v,geo.a));draft=Math.abs(theta-d.angle_radians)>1e-10?editDihedral3D(angleDrag.source,d.id,{angle_radians:theta}):null}
          options.notify();return true
        }
        if(phase==='up'){const next=draft;angleDrag=null;draft=null;if(next)publish(next);options.notify();return true}
        return true
      }
      if(rotation){
        if(p.pointerId!==rotation.pointerId)return true
        if(phase==='cancel'){cancel();return true}
        if(phase==='move'){
          const dx=p.x-rotation.start.x,dy=p.y-rotation.start.y
          if(![dx,dy].every(Number.isFinite)){draft=null;return true}
          rotation.changed=Math.hypot(dx,dy)>3
          if(!rotation.changed){draft=null;options.notify();return true}
          if(rotation.resize){
            const delta=rotation.resize.mapping(p),factor=delta===null?NaN:1+delta/rotation.resize.length
            const solid=rotation.source.solids.find(s=>s.id===rotation!.id)
            draft=rotation.resize.kind==='uniform'?scaleSolid3D(rotation.source,rotation.id,factor):solid?.mode==='parametric'&&(solid.kind==='truncated_pyramid'||solid.kind==='frustum')&&rotation.resize.kind!=='radius'&&delta!==null?resizeFrustum3D(rotation.source,rotation.id,rotation.resize.kind,solid.parameters[rotation.resize.kind]+delta):rotation.resize.kind==='bottom_radius'||rotation.resize.kind==='top_radius'?null:solid?.mode==='parametric'&&(solid.kind==='prism'||solid.kind==='pyramid')&&'constraint'in solid.parameters&&solid.parameters.constraint==='regular'&&'radius'in solid.parameters&&delta!==null?resizeRegularSolid3D(rotation.source,rotation.id,rotation.resize.kind,solid.parameters[rotation.resize.kind]+delta):solid?.mode==='parametric'&&solid.kind==='sphere'&&rotation.resize.kind==='radius'&&delta!==null?resizeSphereRadius3D(rotation.source,rotation.id,solid.parameters.radius+delta):solid?.mode==='parametric'&&(solid.kind==='cylinder'||solid.kind==='cone')&&delta!==null?(solid.kind==='cone'?resizeCone3D:resizeCylinder3D)(rotation.source,rotation.id,rotation.resize.kind,solid.parameters[rotation.resize.kind]+delta*(solid.kind==='cylinder'&&rotation.resize.kind==='height'?2:1)):null
            message=draft?(rotation.resize.kind==='radius'?'Radius · Esc — ləğv et':rotation.resize.kind==='height'?'Hündürlük · Esc — ləğv et':'Mütənasib ölçü · Esc — ləğv et'):'Ölçü etibarsızdır və ya həndəsə paylaşılır; tətbiq edilməyəcək.';options.notify();return true
          }
          if(rotation.translation){
            const t=rotation.translation,world=workingPlanePoint3D(rotation.camera,{...p,width:rotation.start.width,height:rotation.start.height},t.plane,t.pivot)
            draft=world?((rotation.source.dihedrals??[]).some(d=>d.id===rotation!.id)?transformDihedral3D(rotation.source,rotation.id,sub(world,t.worldStart)):rotation.source.planes.some(p=>p.id===rotation!.id&&p.display)?transformPlane3D(rotation.source,rotation.id,sub(world,t.worldStart)):translateSolid3D(rotation.source,rotation.id,sub(world,t.worldStart))):null
            message=draft?'Fiquru hərəkət etdir · Esc — ləğv et':'Hərəkət etibarsızdır və ya paylaşılmış həndəsəni dəyişir; tətbiq edilməyəcək.';options.notify();return true
          }
          const projection=createProjection3D(rotation.camera,rotation.start.width,rotation.start.height)
          const right=sub(projection.world([1,0,0]),projection.world([0,0,0])),up=sub(projection.world([0,1,0]),projection.world([0,0,0]))
          const axis=add(scale(up,dx),scale(right,dy)),angle=Math.hypot(dx,dy)*Math.PI/Math.max(1,rotation.start.height)
          draft=(rotation.source.dihedrals??[]).some(d=>d.id===rotation!.id)?transformDihedral3D(rotation.source,rotation.id,[0,0,0],axis,angle):rotation.source.planes.some(p=>p.id===rotation!.id&&p.display)?transformPlane3D(rotation.source,rotation.id,[0,0,0],axis,angle):rotateSolid3D(rotation.source,rotation.id,axis,angle)
          message=draft?'Fiquru fırlat · Esc — ləğv et':'Bu fiqurun müstəqil fırlanması təhlükəsiz deyil.';options.notify();return true
        }
        if(phase==='up'){const next=draft,changed=rotation.changed;rotation=null;draft=null;if(changed&&next)publish(next);options.notify();return true}
        return true
      }
      if(tool==='rotate_solid'||tool==='translate_solid'){
        if(phase==='down'&&p.button===0){
          if(selected&&((options.getScene().dihedrals??[]).some(d=>d.id===selected)||options.getScene().solids.some(s=>s.id===selected&&s.mode==='parametric')||options.getScene().planes.some(p=>p.id===selected&&p.display))&&[p.x,p.y,p.width,p.height].every(Number.isFinite)&&p.width>0&&p.height>0){
            rotation={pointerId:p.pointerId,start:p,source:structuredClone(options.getScene()),camera:structuredClone(options.getCamera()),id:selected,changed:false};message='Fiquru fırlat · Esc — ləğv et';options.notify()
            if(tool==='translate_solid'){
              const pivot=(rotation.source.dihedrals??[]).find(d=>d.id===selected)?.frame.origin??rotation.source.points.find(p=>p.id===rotation!.source.planes.find(f=>f.id===selected&&f.display)?.point_ids[0])?.position??solidPivot3D(rotation.source,selected),worldStart=pivot?workingPlanePoint3D(rotation.camera,p,plane,pivot):null
              if(!pivot||!worldStart){rotation=null;message='İş müstəvisi bu görünüşdə əlçatan deyil; görünüşü dəyişin.'}
              else{rotation.translation={plane,pivot,worldStart};message='Fiquru hərəkət etdir · Esc — ləğv et'}
              options.notify()
            }
          }else{message='Əvvəlcə bir fiqur seçin.';options.notify()}
          return true
        }
        return false
      }
      if(phase==='cancel'){if(!gesture)return false;if(gesture.pointerId!==p.pointerId)return true;cancel();return true}
      if(phase==='move'&&!gesture){
        if(planar()&&vertices.length){preview=planarTarget(p)?.position??null;options.notify();return false}
        const hit=pickGeometry3D(options.getScene(),options.getCamera(),p,tool==='pyramid'?false:tool!=='select'&&tool!=='camera',undefined,tool==='pyramid');const next=hit?.id??null;if(next!==hover){hover=next;options.notify()}return false
      }
      if(phase==='down'){
        if(gesture)return true
        if(p.button!==0||p.altKey||tool==='camera')return false
        if(tool==='select'&&selected){
          const target=planeResizeTarget3D(options.getScene(),options.getCamera(),p,selected),planeObject=options.getScene().planes.find(f=>f.id===selected),display=planeObject&&planeDisplay3D(planeObject,options.getScene())
          if(target&&display){const world=planePoint3D(options.getCamera(),p,display.normal,display.o);if(world){planeResize={id:selected,pointerId:p.pointerId,source:structuredClone(options.getScene()),camera:structuredClone(options.getCamera()),start:p,world,...target};options.notify();return true}}
          const d=(options.getScene().dihedrals??[]).find(d=>d.id===selected)
          if(d){
            const target=dihedralEditTarget3D(options.getScene(),options.getCamera(),p,d.id)
            if(target){
              const mapping=target.kind==='angle'?null:apexHeightMapping3D(options.getCamera(),p,target.world,target.direction,target.length)
              if(target.kind!=='angle'&&!mapping)return true
              angleDrag={id:d.id,pointerId:p.pointerId,source:structuredClone(options.getScene()),camera:structuredClone(options.getCamera()),start:p,...(target.kind==='angle'?{center:target.world}:{resize:{kind:target.kind,length:target.length,mapping:mapping!}})};options.notify();return true
            }
          }

          const scene=options.getScene(),surfacePoint=scene.constructions.some(c=>c.kind==='point_on_surface')?pickGeometry3D(scene,options.getCamera(),p,true,id=>scene.constructions.some(c=>c.kind==='point_on_surface'&&c.output_point_id===id)):null
          const bounds=projectedSolidBounds3D(options.getScene(),options.getCamera(),p.width,p.height,selected)
          const handle=surfacePoint?undefined:bounds?.handles.filter(h=>Math.hypot(h.x-p.x,h.y-p.y)<=9).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.index-b.index)[0]
          if(handle&&bounds){
            const source=structuredClone(options.getScene()),solid=source.solids.find(s=>s.id===selected)!,length=handle.length
            const mapping=apexHeightMapping3D(options.getCamera(),p,handle.world,handle.direction,length)
            if(!mapping||solid.mode!=='parametric'||'base'in solid.parameters&&solid.parameters.base.kind==='face')message='Bu əsas paylaşılmış üzə bağlıdır və ya tutacaq bu görünüşdə əlçatan deyil; ölçü dəyişdirilmədi.'
            else{rotation={pointerId:p.pointerId,start:p,source,camera:structuredClone(options.getCamera()),id:selected,changed:false,resize:{kind:handle.kind,length,mapping}};message=handle.kind==='radius'?'Radius · Esc — ləğv et':handle.kind==='height'?'Hündürlük · Esc — ləğv et':'Mütənasib ölçü · Esc — ləğv et'}
            options.notify();return true
          }
        }
        let source=options.getScene()
        let hit=pickGeometry3D(source,options.getCamera(),p,tool!=='select',tool==='point'?id=>visiblePointForCreation3D(source,options.getCamera(),p,id):undefined)
        // A clamped attachment may coincide with its endpoint. Keep the already
        // selected attachment draggable without changing ordinary vertex picking.
        if(tool==='select'&&hit?.kind==='point'&&selected&&source.constructions.some(c=>(c.kind==='point_on_edge'||c.kind==='point_on_face'||c.kind==='point_on_surface')&&c.output_point_id===selected)){
          const a=source.points.find(v=>v.id===selected),b=source.points.find(v=>v.id===hit!.id)
          if(a&&b&&Math.hypot(...sub(a.position,b.position))<=1e-9)hit=pickGeometry3D(source,options.getCamera(),p,true,id=>id===selected)??hit
        }
        if(tool==='select'&&!hit){selected=null;options.notify();return true}
        const apex=tool==='select'&&hit?.kind==='point'?pyramidApexDrag3D(source,hit.id):null
        let base=tool==='select'&&hit?.kind==='point'?pyramidBaseDrag3D(source,hit.id):null
        if(base){const evaluated=evaluateGeometryScene3D(source);if(evaluated.status!=='ok')return true;source=evaluated.scene;base=pyramidBaseDrag3D(source,hit!.id)}
        const attachment=tool==='select'&&hit?.kind==='point'?source.constructions.find(c=>(c.kind==='point_on_edge'||c.kind==='point_on_face'||c.kind==='point_on_surface')&&c.output_point_id===hit.id):null
        const pointId=tool==='select'&&hit?.kind==='point'&&(apex||base||attachment||isFreePoint3D(source,hit.id))?hit.id:null
        const position=base?.position??apex?.position??(pointId?source.points.find(v=>v.id===pointId)!.position:null)
        const normal=base?.normal??apex?.normal
        const worldStart=normal?planePoint3D(options.getCamera(),p,normal,position!):position?workingPlanePoint3D(options.getCamera(),p,plane,position):null
        const heightMode=!!apex&&!!p.shiftKey,solid=apex?source.solids.find(s=>s.id===apex.solidId):null
        const heightMapping=heightMode&&solid?.mode==='parametric'&&'height'in solid.parameters?apexHeightMapping3D(options.getCamera(),p,apex!.position,apex!.normal,solid.parameters.height):null
        let faceDrag:Gesture['faceDrag']
        if(attachment?.kind==='point_on_face'){
          const face=source.faces.find(f=>f.id===attachment.face_id)!,vertices=face.boundary.map(id=>source.points.find(p=>p.id===id)!.position),camera=structuredClone(options.getCamera())
          faceDrag={vertices,camera,worldStart:facePlanePointer3D(vertices,camera,p)?.position??null}
        }
        let edgeDrag:Gesture['edgeDrag']
        if(attachment?.kind==='point_on_edge'&&position){
          const edge=source.edges.find(e=>e.id===attachment.edge_id)!,a=source.points.find(v=>v.id===edge.start)!.position,b=source.points.find(v=>v.id===edge.end)!.position,length=Math.hypot(...sub(b,a))
          edgeDrag={t:attachment.t,length,mapping:length>1e-9?apexHeightMapping3D(options.getCamera(),p,position,unit(sub(b,a)),length):null}
        }
        let surfaceDrag:Gesture['surfaceDrag']
        if(attachment?.kind==='point_on_surface'&&position){
          const camera=structuredClone(options.getCamera()),projection=createProjection3D(camera,p.width,p.height),screen=projection.screen(projection.view(position))
          surfaceDrag={surfaceId:attachment.surface_id,camera,offset:{x:screen[0]-p.x,y:screen[1]-p.y}}
        }
        selected=tool==='select'?hit?.id??null:selected
        const edgeHit=tool==='point'&&!hit?pickSolidEdge3D(source,options.getCamera(),p):null
        gesture={pointerId:p.pointerId,start:p,pointId,source,worldStart,position,apexNormal:apex?.normal??null,base,heightMode,heightMapping,edgeDrag,faceDrag,surfaceDrag,edgeHit,faceHit:tool==='point'&&!hit&&!edgeHit?pickSolidFace3D(source,options.getCamera(),p):null,pointHit:hit?.id,changed:false,invalid:false};message='';options.notify();return true
      }
      if(!gesture)return false
      if(gesture.pointerId!==p.pointerId)return true
      if(phase==='move'){
        const changed=Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>3
        gesture.changed ||= changed
        if(gesture.pointId&&gesture.changed){
          if(gesture.surfaceDrag){
            const s=gesture.surfaceDrag
            if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)<1e-7)draft=gesture.source
            else{
              const hit=pickAnalyticSurface3D(gesture.source,s.camera,{...p,x:p.x+s.offset.x,y:p.y+s.offset.y,width:gesture.start.width,height:gesture.start.height},s.surfaceId)
              const next=hit?editPointOnSurface3D(gesture.source,gesture.pointId,hit.uv):null
              if(next)draft=next // Hold the last valid position on caps, occlusion or a missed ray.
            }
            options.notify();return true
          }
          if(gesture.faceDrag){
            const f=gesture.faceDrag,hit=facePlanePointer3D(f.vertices,f.camera,{...p,width:gesture.start.width,height:gesture.start.height})
            if(hit&&f.worldStart){
              const position=add(gesture.position!,sub(hit.position,f.worldStart)),uv=faceBasis3D(f.vertices).local(position),next=editPointOnFace3D(gesture.source,gesture.pointId,uv)
              if(next){draft=next;gesture.invalid=false}
            }
            options.notify();return true
          }
          if(gesture.edgeDrag){
            const e=gesture.edgeDrag,delta=e.mapping?.(p)??null
            draft=delta===null?null:editPointOnEdge3D(gesture.source,gesture.pointId,Math.max(0,Math.min(1,e.t+delta/e.length)))
            gesture.invalid=!draft;options.notify();return true
          }
          const normal=gesture.base?.normal??gesture.apexNormal
          const world=normal?planePoint3D(options.getCamera(),p,normal,gesture.position!):gesture.position?workingPlanePoint3D(options.getCamera(),p,plane,gesture.position):null
          const position=world&&gesture.worldStart?add(gesture.position!,sub(world,gesture.worldStart)):null
          const hit=pickGeometry3D(gesture.source,options.getCamera(),p,true),other=hit&&hit.id!==gesture.pointId?gesture.source.points.find(point=>point.id===hit.id):null
          const collision=other&&Math.abs(dot(sub(other.position,gesture.position!),planeNormal3D(plane)))<=1e-9
          const heightDelta=gesture.heightMapping?.(p)??null
          const next=gesture.base?(position?movePyramidBaseVertex3D(gesture.source,gesture.pointId,position):null):gesture.heightMode?(heightDelta!==null?changePyramidHeight3D(gesture.source,gesture.pointId,heightDelta):null):gesture.apexNormal?(position?movePyramidApexParallel3D(gesture.source,gesture.pointId,position):null):position&&!collision?moveGeometryPoint3D(gesture.source,gesture.pointId,position):null
          gesture.invalid=!next;draft=next;message=next?'':'Sürükləmə etibarsızdır və tətbiq edilməyəcək.';options.notify()
        }return true
      }
      if(phase==='up'){
        const finished=gesture;gesture=null
        if(finished.pointId&&finished.changed){
          if(!finished.invalid&&draft){
            const old=finished.base?finished.source.solids.find(s=>s.id===finished.base!.solidId):null
            const converted=draft.solids.find(s=>s.id===old?.id)
            if(publish(draft)&&old?.mode==='parametric'&&'base'in old.parameters&&old.parameters.base.kind==='face'&&converted?.mode==='parametric'&&'base'in converted.parameters&&converted.parameters.base.kind==='polygon')message='Piramida mənbə poliqondan ayrıldı. Mənbə poliqon dəyişdirilmədi.'
          }else message='Sürükləmə tətbiq edilmədi.'
          draft=null
        }
        else if(!finished.changed){
          if(tool==='altitude'){
            const hit=pickGeometry3D(finished.source,options.getCamera(),finished.start,true)
            const result=hit?createPyramidAltitudeFromApex3D(finished.source,hit.id):null
            if(result?.scene&&publish(result.scene)){selected=result.id;message='Altitude created from the apex to its own base.';tool='select';pending=[]}
            else message=result?.error??'Select a semantic pyramid apex.'
          }else if(tool==='perpendicular'&&perpendicularOutput==='guided_plane'){
            const scene=finished.source,hit=pickGeometry3D(scene,options.getCamera(),finished.start)
            if(!guidedReference){const plane=scene.planes.find(p=>p.id===hit?.id&&p.display&&p.kind!=='half_plane');if(plane){guidedReference=plane.id;pending=[];message='İki nöqtə, düz xətt və ya parça seçin.'}else message='Görünüş ölçüləri olan istinad müstəvisi seçin.'}
            else if(!guidedGuide){
              const point=pickGeometry3D(scene,options.getCamera(),finished.start,true),line=scene.linear_objects.find(l=>l.id===hit?.id&&['line','segment'].includes(l.kind))
              const guide:PlaneGuide3D|null=point?(pending.length?{kind:'points',a:pending[0],b:point.id}:null):line?{kind:'linear',id:line.id}:null
              if(point&&!pending.length){pending=[point.id];message='İkinci fərqli nöqtəni seçin.'}
              else if(guide){try{const r=guidedPlaneGeometry3D(scene,{kind:'plane',id:guidedReference},guide);guidedGuide=guide;message=r.ambiguous?'İstinad müstəvisinin lokal istiqaməti seçildi. Müstəvini təsdiq edin.':'Perpendikulyar müstəvini təsdiq edin.'}catch(error){message=error instanceof Error?error.message:'Etibarsız istiqamət.'}}
              else message='İki nöqtə, düz xətt və ya parça seçin; üz istiqamətverici ola bilməz.'
            }
          }else if(tool==='perpendicular'&&perpendicularOutput==='plane'){
            const scene=finished.source,camera=options.getCamera(),pointer=finished.start
            if(!perpendicularPlaneReference){
              const hit=pickGeometry3D(scene,camera,pointer),face=pickSolidFace3D(scene,camera,pointer)
              const plane=scene.planes.find(p=>p.id===hit?.id&&p.kind!=='half_plane')
              const faceVisible=face&&scene.solids.some(s=>s.id===hit?.id&&(s.mode==='parametric'?s.features.some(f=>f.entity_id===face.face_id):s.face_ids.includes(face.face_id)))
              const reference=plane?{kind:'plane' as const,id:plane.id}:faceVisible?{kind:'face' as const,id:face.face_id}:null
              if(reference){try{planeReference3D(scene,reference);perpendicularPlaneReference=reference;selected=reference.id;message='Select point P second.'}catch(error){message=error instanceof Error?error.message:'Invalid plane reference'}}
              else message='Select the reference plane first, then point P.'
            }else{
              const point=pickGeometry3D(scene,camera,pointer,true)
              if(point){pending=[point.id];selected=point.id;perpendicularPlane={reference:perpendicularPlaneReference,angle:null,pointerId:null};perpendicularPlaneReference=null;message='Drag the direction indicator in the reference plane local coordinate system, then confirm.'}
              else message='Select an existing point P second.'
            }
          }else if(tool==='perpendicular'||tool==='parallel'){
            if(!pending.length){const hit=pickGeometry3D(finished.source,options.getCamera(),finished.start,true);if(hit){pending=[hit.id];selected=hit.id;message='Select a reference line, edge, plane or face.'}else message='Select an existing source point.'}
            else{
              const camera=options.getCamera(),pointer=finished.start,scene=finished.source
              const edge=pickSolidEdge3D(scene,camera,pointer),hit=pickGeometry3D(scene,camera,pointer),face=pickSolidFace3D(scene,camera,pointer)
              const linear=hit?scene.linear_objects.find(l=>l.id===hit.id&&(tool==='parallel'?['line','ray','segment']:['line','segment']).includes(l.kind)):null
              const plane=hit?scene.planes.find(p=>p.id===hit.id&&p.kind!=='half_plane'):null
              const reference=edge?{kind:'edge' as const,id:edge.edge_id}:linear?{kind:'linear' as const,id:linear.id}:null
              const faceVisible=face&&scene.solids.some(s=>s.id===hit?.id&&(s.mode==='parametric'?s.features.some(f=>f.entity_id===face.face_id):s.face_ids.includes(face.face_id)))
              if(tool==='parallel'&&parallelOutput==='plane'){
                if(plane||faceVisible){const ref=plane?{kind:'plane' as const,id:plane.id}:{kind:'face' as const,id:face!.face_id};try{const geometry=constructedPlaneGeometry3D(scene,pending[0],ref);planeConstruction={reference:ref};message=geometry.coincident?'Coincident plane preview. Confirm to create.':'Parallel plane preview. Confirm to create.'}catch(error){message=error instanceof Error?error.message:'Invalid reference'}}
                else message='Select a standalone plane or a polyhedron face.'
                options.notify();return true
              }
              if(tool==='parallel'&&!reference&&(plane||faceVisible)){
                const ref:ParallelPlaneReference3D=plane?{kind:'plane',id:plane.id,angle_radians:0}:{kind:'face',id:face!.face_id,angle_radians:0}
                try{planeReference3D(scene,ref);planeParallel={reference:ref,angle:null,pointerId:null,rotating:false};message='Drag the direction endpoint or click a parallel line/edge, then confirm.'}catch{message='Invalid supporting plane'}
                options.notify();return true
              }
              const result=tool==='parallel'?(reference?createParallel3D(scene,pending[0],reference):null)
                :reference?createPerpendicular3D(scene,pending[0],reference)
                :plane?createPlanePerpendicular3D(scene,pending[0],{kind:'plane',id:plane.id})
                :faceVisible?createPlanePerpendicular3D(scene,pending[0],{kind:'face',id:face.face_id}):null
              if(result){
                if(result.scene&&publish(result.scene)){selected=result.id;message='Construction created.'}
                else message=result.error??'Construction rejected'
                pending=[];tool='select'
              }else message='Select a visible reference line, edge, plane or face.'
            }
          }else if(tool==='plane'||tool==='cylinder'||tool==='cone'||tool==='sphere'||tool==='sphere_surface'||tool==='frustum'||tool==='dihedral'){
            const p=finished.start,inside=p.x>=0&&p.y>=0&&p.x<=p.width&&p.y<=p.height
            const position=inside?workingPlanePoint3D(options.getCamera(),p,plane):null,result=position?(tool==='plane'?createPlaneAt3D:tool==='dihedral'?createDihedral3D:tool==='frustum'?createFrustumAt3D:tool==='sphere'?createSphereAt3D:tool==='sphere_surface'?createSphereSurfaceAt3D:tool==='cone'?createConeAt3D:createCylinderAt3D)(finished.source,position,plane):null
            if(result&&publish(result.scene)){selected=result.id;hover=null;message=tool==='plane'?'Plane created.':tool==='dihedral'?'\u0130ki\u00fczl\u00fc bucaq yarad\u0131ld\u0131.':tool==='frustum'?'K\u0259sik konus yarad\u0131ld\u0131.':tool==='sphere_surface'?'Sfera yaradıldı.':tool==='sphere'?'Kürə yaradıldı.':tool==='cone'?'Konus yaradıldı.':'Silindr yaradıldı.';tool='select'}
            else message='İş müstəvisi bu görünüşdə əlçatan deyil; görünüşü dəyişin.'
          }else if(tool==='pyramid'){
            const hit=pickGeometry3D(finished.source,options.getCamera(),finished.start,false,undefined,true)
            const result=hit?createPyramidFromPolygon3D(finished.source,hit.id):null
            if(result&&publish(result.scene)){selected=result.id;hover=null;tool='select';message=result.sourceConsumed?'Piramida yaradıldı.':'Piramida yaradıldı. Mənbə poliqon paylaşılır və ya təhlükəsiz ayrıla bilmir; saxlanıldı.'}
            else message='Etibarlı qapalı poliqonun daxilinə klikləyin.'
          }else if(tool==='point'){
            const position=workingPlanePoint3D(options.getCamera(),finished.start,plane),edge=finished.edgeHit,face=finished.faceHit
            const cylinder=pickAnalyticSolid3D(finished.source,options.getCamera(),finished.start)
            const surface=pickAnalyticSurface3D(finished.source,options.getCamera(),finished.start)
            const cylinderFirst=cylinder&&(!face||cylinder.depth<face.depth-1e-8*Math.max(1,Math.abs(cylinder.depth)))
            if(cylinderFirst&&!finished.pointHit&&!edge&&!surface){message='Nöqtə üçün cismin görünən yan səthinə klikləyin.';options.notify();return true}
            let result:ReturnType<typeof createPoint3D>=null
            if(finished.pointHit)result={scene:options.getScene(),id:finished.pointHit,reused:true}
            else if(edge)result=createPointOnEdge3D(options.getScene(),edge.edge_id,edge.t)
            else if(surface){
              const id=newId('p'),scene=createPointOnSurface3D(options.getScene(),surface.surface_id,surface.uv,id)
              if(scene)result={scene,id,reused:false}
            }else if(face)result=createPointOnFace3D(options.getScene(),face.face_id,face.uv)
            else if(position)result=createPoint3D(options.getScene(),position)
            if(result&&publish(result.scene)){selected=result.id;message=result.reused?'Mövcud nöqtə seçildi.':'Nöqtə yaradıldı.'}else message='İş müstəvisi görünüşə paraleldir və ya koordinatlar etibarsızdır.'
          }else if(planar()){
            planarClick(finished.start)
          }else if(tool!=='select'&&tool!=='camera'){
            const hit=pickGeometry3D(options.getScene(),options.getCamera(),p,true)
            if(hit)choose(hit.id);else message='Mövcud nöqtə seçin.'
          }
        }
        options.notify();return true
      }return false
    },
  }
}
