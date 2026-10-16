import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { createProjection3D, projectScene3D, add, sub, scale, dot, unit } from './geometry3dProjection'
import { deleteGeometryTarget3D, evaluateGeometryScene3D, moveGeometryPoint3D, transactGeometryScene3D } from './geometry3dModel'
import { deleteSolid3D, pyramidApexDrag3D, movePyramidApexParallel3D, changePyramidHeight3D, pyramidBaseDrag3D, movePyramidBaseVertex3D, createPyramidFromPolygon3D, rotateSolid3D, solidPivot3D, translateSolid3D } from './geometry3dSolidAuthoring'
import { polygonBaseGeometry3D } from './geometry3dSolids'
import { scaleSolid3D } from './geometry3dSolidAuthoring'
import { projectedSolidBounds3D } from './geometry3dSolidBounds'

export type GeometryTool3D = 'select' | 'rotate_solid' | 'translate_solid' | 'camera' | 'point' | 'line' | 'ray' | 'segment' | 'vector' | 'plane' | 'polyline' | 'triangle' | 'polygon' | 'pyramid'
export type WorkingPlane3D = 'XY' | 'XZ' | 'YZ'
export const POINT_SNAP_TOLERANCE_3D=10
export const GEOMETRY_TOOLS_3D: { tool: GeometryTool3D; label: string }[] = [
  {tool:'select',label:'3D seç'}, {tool:'camera',label:'Kamera'}, {tool:'rotate_solid',label:'Fiquru fırlat'}, {tool:'translate_solid',label:'Fiquru hərəkət etdir'}, {tool:'point',label:'3D nöqtə'},
  {tool:'line',label:'3D düz xətt'}, {tool:'ray',label:'3D şüa'}, {tool:'segment',label:'3D parça'},
  {tool:'vector',label:'3D vektor'}, {tool:'plane',label:'3D müstəvi'},
  {tool:'polyline',label:'Sınıq xətt'}, {tool:'triangle',label:'Üçbucaq'}, {tool:'polygon',label:'Poliqon'},
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
  return scene.points.some(p=>p.id===id)&&!scene.constructions.some(c=>c.output_point_id===id)&&!scene.solids.some(s=>s.mode==='parametric' ? s.features.some(f=>f.entity_id===id) : s.point_ids.includes(id))
}
export function editPoint3D(source:GeometryScene3D,id:string,position:Vec3,label:string|null):GeometryScene3D|null {
  if(!isFreePoint3D(source,id)||!validPosition(position))return null
  const moved=moveGeometryPoint3D(source,id,position)
  return moved ? transactGeometryScene3D(moved,draft=>{draft.points.find(p=>p.id===id)!.label=label}) : null
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
  if(source.solids.some(s=>s.id===id))return deleteSolid3D(source,id)
  if(source.linear_objects.some(l=>l.id===id)||source.planes.some(p=>p.id===id)||source.faces.some(p=>p.id===id))return deleteGeometryTarget3D(source,id)
  if(!isFreePoint3D(source,id))return null
  // Validation rejects any remaining reference. No implicit cascading deletion or detachment.
  const scene=transactGeometryScene3D(source,draft=>{draft.points=draft.points.filter(p=>p.id!==id)})
  return scene ? {scene,losses:[]} : null
}
export type Pick3D = {id:string;kind:'point'|'linear'|'plane'|'solid'|'face';distance:number;depth:number}
export function pickGeometry3D(source:GeometryScene3D,camera:GeometryCamera3D,pointer:Pick<Pointer3D,'x'|'y'|'width'|'height'>,pointsOnly=false,pointFilter?:(id:string)=>boolean,facesOnly=false):Pick3D|null {
  try {
    const projected=projectScene3D(source,camera,pointer.width,pointer.height), candidates:Pick3D[]=[]
    const owner=(id:string)=>source.solids.find(s=>s.mode==='parametric'&&s.features.some(f=>f.entity_id===id))?.id
    for(const point of facesOnly?[]:projected.points){if(pointFilter&&!pointFilter(point.id))continue;const distance=Math.hypot(pointer.x-point.position[0],pointer.y-point.position[1]);if(distance<=POINT_SNAP_TOLERANCE_3D)candidates.push({id:point.id,kind:'point',distance,depth:point.position[2]})}
    if(!pointsOnly){
      for(const line of facesOnly?[]:projected.lines.filter(l=>source.linear_objects.some(s=>s.id===l.id)||owner(l.id))){
        const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],length=dx*dx+dy*dy
        const t=length ? Math.max(0,Math.min(1,((pointer.x-line.a[0])*dx+(pointer.y-line.a[1])*dy)/length)) : 0
        const distance=Math.hypot(pointer.x-line.a[0]-dx*t,pointer.y-line.a[1]-dy*t)
        if(distance<=7)candidates.push({id:owner(line.id)??line.id,kind:owner(line.id)?'solid':'linear',distance,depth:line.a[2]+t*(line.b[2]-line.a[2])})
      }
      for(const face of projected.faces){
        if(facesOnly&&!source.faces.some(f=>f.id===face.id))continue
        let inside=false
        for(let i=0,j=face.vertices.length-1;i<face.vertices.length;j=i++){
          const a=face.vertices[i],b=face.vertices[j]
          if((a[1]>pointer.y)!==(b[1]>pointer.y)&&pointer.x<(b[0]-a[0])*(pointer.y-a[1])/(b[1]-a[1])+a[0])inside=!inside
        }
        if(inside)candidates.push({id:facesOnly?face.id:owner(face.id)??face.id,kind:facesOnly?'face':owner(face.id)?'solid':face.kind==='plane'?'plane':'face',distance:0,depth:face.vertices.reduce((s,p)=>s+p[2],0)/face.vertices.length})
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
export function createAuthoringInteraction3D(options:{getScene:()=>GeometryScene3D;getCamera:()=>GeometryCamera3D;commit:(scene:GeometryScene3D)=>boolean;notify:()=>void}) {
  let tool:GeometryTool3D='select',plane:WorkingPlane3D='XY',selected:string|null=null,hover:string|null=null,pending:string[]=[],draft:GeometryScene3D|null=null,message=''
  let vertices:PlanarVertex3D[]=[],preview:Vec3|null=null
  const planar=()=>['segment','polyline','triangle','polygon'].includes(tool)
  type Gesture={pointerId:number;start:Pointer3D;pointId:string|null;source:GeometryScene3D;worldStart:Vec3|null;position:Vec3|null;apexNormal:Vec3|null;base:ReturnType<typeof pyramidBaseDrag3D>;heightMode:boolean;heightMapping:ReturnType<typeof apexHeightMapping3D>;changed:boolean;invalid:boolean}
  let rotation:{pointerId:number;start:Pointer3D;source:GeometryScene3D;camera:GeometryCamera3D;id:string;changed:boolean;translation?:{plane:WorkingPlane3D;pivot:Vec3;worldStart:Vec3};resize?:{length:number;mapping:NonNullable<ReturnType<typeof apexHeightMapping3D>>}}|null=null
  let gesture:Gesture|null=null
  const cancel=()=>{rotation=null;gesture=null;draft=null;pending=[];vertices=[];preview=null;message='';options.notify()}
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
    snapshot:()=>({tool,plane,selected,hover,pending:[...pending],draft,message,preview:vertices.length?[...vertices.map(v=>v.position),...(preview?[preview]:[])]:[],dragging:!!rotation||gesture?.pointId!==null&&!!gesture}),
    finish,
    cancel,
    setTool(next:GeometryTool3D){cancel();tool=next;if(next==='rotate_solid')message='Fiquru fırlat · Sürükləyin · Esc — ləğv et';if(next==='translate_solid')message='Fiquru hərəkət etdir · Sürükləyin · Esc — ləğv et';options.notify()},
    setPlane(next:WorkingPlane3D){cancel();plane=next;options.notify()},
    select(id:string|null){cancel();selected=id;options.notify()},
    choose,
    sync(){if(selected&&!(['points','linear_objects','planes','solids','faces'] as const).some(k=>options.getScene()[k].some(p=>p.id===selected)))selected=null;cancel()},
    pointer(phase:PointerPhase3D,p:Pointer3D):boolean {
      if(phase==='wheel')return !!gesture||!!rotation
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
            draft=scaleSolid3D(rotation.source,rotation.id,factor)
            message=draft?'Ölçünü dəyiş · Esc — ləğv et':'Ölçü etibarsızdır və ya həndəsə paylaşılır; tətbiq edilməyəcək.';options.notify();return true
          }
          if(rotation.translation){
            const t=rotation.translation,world=workingPlanePoint3D(rotation.camera,{...p,width:rotation.start.width,height:rotation.start.height},t.plane,t.pivot)
            draft=world?translateSolid3D(rotation.source,rotation.id,sub(world,t.worldStart)):null
            message=draft?'Fiquru hərəkət etdir · Esc — ləğv et':'Hərəkət etibarsızdır və ya paylaşılmış həndəsəni dəyişir; tətbiq edilməyəcək.';options.notify();return true
          }
          const projection=createProjection3D(rotation.camera,rotation.start.width,rotation.start.height)
          const right=sub(projection.world([1,0,0]),projection.world([0,0,0])),up=sub(projection.world([0,1,0]),projection.world([0,0,0]))
          const axis=add(scale(up,dx),scale(right,dy)),angle=Math.hypot(dx,dy)*Math.PI/Math.max(1,rotation.start.height)
          draft=rotateSolid3D(rotation.source,rotation.id,axis,angle)
          message=draft?'Fiquru fırlat · Esc — ləğv et':'Bu fiqurun müstəqil fırlanması təhlükəsiz deyil.';options.notify();return true
        }
        if(phase==='up'){const next=draft,changed=rotation.changed;rotation=null;draft=null;if(changed&&next)publish(next);options.notify();return true}
        return true
      }
      if(tool==='rotate_solid'||tool==='translate_solid'){
        if(phase==='down'&&p.button===0){
          if(selected&&options.getScene().solids.some(s=>s.id===selected&&s.mode==='parametric')&&[p.x,p.y,p.width,p.height].every(Number.isFinite)&&p.width>0&&p.height>0){
            rotation={pointerId:p.pointerId,start:p,source:structuredClone(options.getScene()),camera:structuredClone(options.getCamera()),id:selected,changed:false};message='Fiquru fırlat · Esc — ləğv et';options.notify()
            if(tool==='translate_solid'){
              const pivot=solidPivot3D(rotation.source,selected),worldStart=pivot?workingPlanePoint3D(rotation.camera,p,plane,pivot):null
              if(!pivot||!worldStart){rotation=null;message='İş müstəvisi bu görünüşdə əlçatan deyil; görünüşü dəyişin.'}
              else{rotation.translation={plane,pivot,worldStart};message='Fiquru hərəkət etdir · Esc — ləğv et'}
              options.notify()
            }
          }else{message='Əvvəlcə bir fiqur seçin.';options.notify()}
          return true
        }
        return false
      }
      if(phase==='cancel'){if(!gesture)return false;cancel();return true}
      if(phase==='move'&&!gesture){
        if(planar()&&vertices.length){preview=planarTarget(p)?.position??null;options.notify();return false}
        const hit=pickGeometry3D(options.getScene(),options.getCamera(),p,tool==='pyramid'?false:tool!=='select'&&tool!=='camera',undefined,tool==='pyramid');const next=hit?.id??null;if(next!==hover){hover=next;options.notify()}return false
      }
      if(phase==='down'){
        if(gesture)return true
        if(p.button!==0||p.altKey||tool==='camera')return false
        if(tool==='select'&&selected){
          const bounds=projectedSolidBounds3D(options.getScene(),options.getCamera(),p.width,p.height,selected)
          const handle=bounds?.handles.filter(h=>Math.hypot(h.x-p.x,h.y-p.y)<=9).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.index-b.index)[0]
          if(handle&&bounds){
            const source=structuredClone(options.getScene()),solid=source.solids.find(s=>s.id===selected)!,length=Math.hypot(...sub(handle.world,bounds.pivot))
            const mapping=apexHeightMapping3D(options.getCamera(),p,handle.world,unit(sub(handle.world,bounds.pivot)),length)
            if(!mapping||solid.mode!=='parametric'||'base'in solid.parameters&&solid.parameters.base.kind==='face')message='Bu əsas paylaşılmış üzə bağlıdır və ya tutacaq bu görünüşdə əlçatan deyil; ölçü dəyişdirilmədi.'
            else{rotation={pointerId:p.pointerId,start:p,source,camera:structuredClone(options.getCamera()),id:selected,changed:false,resize:{length,mapping}};message='Ölçünü dəyiş · Esc — ləğv et'}
            options.notify();return true
          }
        }
        let source=options.getScene()
        const hit=pickGeometry3D(source,options.getCamera(),p,tool!=='select')
        if(tool==='select'&&!hit){selected=null;options.notify();return true}
        const apex=tool==='select'&&hit?.kind==='point'?pyramidApexDrag3D(source,hit.id):null
        let base=tool==='select'&&hit?.kind==='point'?pyramidBaseDrag3D(source,hit.id):null
        if(base){const evaluated=evaluateGeometryScene3D(source);if(evaluated.status!=='ok')return true;source=evaluated.scene;base=pyramidBaseDrag3D(source,hit!.id)}
        const pointId=tool==='select'&&hit?.kind==='point'&&(apex||base||isFreePoint3D(source,hit.id))?hit.id:null
        const position=base?.position??apex?.position??(pointId?source.points.find(v=>v.id===pointId)!.position:null)
        const normal=base?.normal??apex?.normal
        const worldStart=normal?planePoint3D(options.getCamera(),p,normal,position!):position?workingPlanePoint3D(options.getCamera(),p,plane,position):null
        const heightMode=!!apex&&!!p.shiftKey,solid=apex?source.solids.find(s=>s.id===apex.solidId):null
        const heightMapping=heightMode&&solid?.mode==='parametric'&&'height'in solid.parameters?apexHeightMapping3D(options.getCamera(),p,apex!.position,apex!.normal,solid.parameters.height):null
        selected=tool==='select'?hit?.id??null:selected
        gesture={pointerId:p.pointerId,start:p,pointId,source,worldStart,position,apexNormal:apex?.normal??null,base,heightMode,heightMapping,changed:false,invalid:false};message='';options.notify();return true
      }
      if(!gesture||gesture.pointerId!==p.pointerId)return false
      if(phase==='move'){
        const changed=Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>3
        gesture.changed ||= changed
        if(gesture.pointId&&gesture.changed){
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
          if(tool==='pyramid'){
            const hit=pickGeometry3D(finished.source,options.getCamera(),finished.start,false,undefined,true)
            const result=hit?createPyramidFromPolygon3D(finished.source,hit.id):null
            if(result&&publish(result.scene)){selected=result.id;hover=null;tool='select';message=result.sourceConsumed?'Piramida yaradıldı.':'Piramida yaradıldı. Mənbə poliqon paylaşılır və ya təhlükəsiz ayrıla bilmir; saxlanıldı.'}
            else message='Etibarlı qapalı poliqonun daxilinə klikləyin.'
          }else if(tool==='point'){
            const hit=pickGeometry3D(options.getScene(),options.getCamera(),p,true),position=workingPlanePoint3D(options.getCamera(),p,plane)
            const result=hit?{scene:options.getScene(),id:hit.id,reused:true}:position?createPoint3D(options.getScene(),position):null
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
