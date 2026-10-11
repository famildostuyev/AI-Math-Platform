import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { createProjection3D, projectScene3D, add, sub, scale, dot, unit } from './geometry3dProjection'
import { deleteGeometryTarget3D, evaluateGeometryScene3D, moveGeometryPoint3D, transactGeometryScene3D } from './geometry3dModel'

export type GeometryTool3D = 'select' | 'camera' | 'point' | 'line' | 'ray' | 'segment' | 'vector' | 'plane'
export type WorkingPlane3D = 'XY' | 'XZ' | 'YZ'
export const GEOMETRY_TOOLS_3D: { tool: GeometryTool3D; label: string }[] = [
  {tool:'select',label:'3D seç'}, {tool:'camera',label:'Kamera'}, {tool:'point',label:'3D nöqtə'},
  {tool:'line',label:'3D düz xətt'}, {tool:'ray',label:'3D şüa'}, {tool:'segment',label:'3D parça'},
  {tool:'vector',label:'3D vektor'}, {tool:'plane',label:'3D müstəvi'},
]
export type Pointer3D = { pointerId:number; button:number; x:number; y:number; width:number; height:number; altKey:boolean }
export type PointerPhase3D = 'down' | 'move' | 'up' | 'cancel' | 'wheel'
export const planeNormal3D = (plane: WorkingPlane3D): Vec3 => plane==='XY' ? [0,0,1] : plane==='XZ' ? [0,1,0] : [1,0,0]
const validPosition = (position: Vec3) => position.length===3&&position.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12)
export function parseCoordinates3D(values: string[]): Vec3 | null {
  if(values.length!==3||values.some(v=>!v.trim()))return null
  const position=values.map(Number) as Vec3
  return validPosition(position) ? position : null
}
export function workingPlanePoint3D(camera: GeometryCamera3D, pointer: Pick<Pointer3D,'x'|'y'|'width'|'height'>, plane: WorkingPlane3D, through: Vec3=[0,0,0]): Vec3 | null {
  try {
    const projection=createProjection3D(camera,pointer.width,pointer.height), nx=2*pointer.x/pointer.width-1, ny=1-2*pointer.y/pointer.height
    const slope=Math.tan(camera.fov_degrees*Math.PI/360), aspect=pointer.width/pointer.height
    const origin=camera.projection==='orthographic' ? projection.world([nx*camera.vertical_span*aspect/2,ny*camera.vertical_span/2,0]) : camera.position
    const direction=camera.projection==='orthographic' ? unit(sub(camera.target,camera.position)) : unit(sub(projection.world([nx*slope*aspect,ny*slope,1]),origin))
    const normal=planeNormal3D(plane), denominator=dot(direction,normal)
    if(Math.abs(denominator)<1e-6)return null
    const t=dot(sub(through,origin),normal)/denominator, position=add(origin,scale(direction,t))
    const depth=projection.view(position)[2]
    if(t<0||depth<camera.near||depth>camera.far||!validPosition(position))return null
    // Keep the working plane's fixed coordinate exact, without rounding authored coordinates.
    const axis=plane==='XY'?2:plane==='XZ'?1:0;position[axis]=through[axis]
    return position
  } catch {return null}
}
const newId = (prefix:string) => `${prefix}_${crypto.randomUUID().replace(/-/g,'')}`
export function createPoint3D(source: GeometryScene3D, position: Vec3, id=newId('p')): {scene:GeometryScene3D;id:string;reused:boolean}|null {
  const evaluated=evaluateGeometryScene3D(source)
  if(!validPosition(position)||evaluated.status!=='ok')return null
  const existing=evaluated.scene.points.find(p=>Math.hypot(...sub(p.position,position))<=1e-9)
  if(existing)return {scene:evaluated.scene,id:existing.id,reused:true}
  const scene=transactGeometryScene3D(evaluated.scene,draft=>draft.points.push({id,position:[...position],label:null}))
  return scene ? {scene,id,reused:false} : null
}
export function createPrimitive3D(source: GeometryScene3D, kind: Exclude<GeometryTool3D,'select'|'camera'|'point'>, pointIds: string[], id=newId(kind)): {scene:GeometryScene3D;id:string;reused:boolean}|null {
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
  if(source.linear_objects.some(l=>l.id===id)||source.planes.some(p=>p.id===id))return deleteGeometryTarget3D(source,id)
  if(!isFreePoint3D(source,id))return null
  // Validation rejects any remaining reference. No implicit cascading deletion or detachment.
  const scene=transactGeometryScene3D(source,draft=>{draft.points=draft.points.filter(p=>p.id!==id)})
  return scene ? {scene,losses:[]} : null
}
export type Pick3D = {id:string;kind:'point'|'linear'|'plane';distance:number;depth:number}
export function pickGeometry3D(source:GeometryScene3D,camera:GeometryCamera3D,pointer:Pick<Pointer3D,'x'|'y'|'width'|'height'>,pointsOnly=false):Pick3D|null {
  try {
    const projected=projectScene3D(source,camera,pointer.width,pointer.height), candidates:Pick3D[]=[]
    for(const point of projected.points){const distance=Math.hypot(pointer.x-point.position[0],pointer.y-point.position[1]);if(distance<=10)candidates.push({id:point.id,kind:'point',distance,depth:point.position[2]})}
    if(!pointsOnly){
      for(const line of projected.lines.filter(l=>source.linear_objects.some(s=>s.id===l.id))){
        const dx=line.b[0]-line.a[0],dy=line.b[1]-line.a[1],length=dx*dx+dy*dy
        const t=length ? Math.max(0,Math.min(1,((pointer.x-line.a[0])*dx+(pointer.y-line.a[1])*dy)/length)) : 0
        const distance=Math.hypot(pointer.x-line.a[0]-dx*t,pointer.y-line.a[1]-dy*t)
        if(distance<=7)candidates.push({id:line.id,kind:'linear',distance,depth:line.a[2]+t*(line.b[2]-line.a[2])})
      }
      for(const face of projected.faces.filter(f=>f.kind==='plane')){
        let inside=false
        for(let i=0,j=face.vertices.length-1;i<face.vertices.length;j=i++){
          const a=face.vertices[i],b=face.vertices[j]
          if((a[1]>pointer.y)!==(b[1]>pointer.y)&&pointer.x<(b[0]-a[0])*(pointer.y-a[1])/(b[1]-a[1])+a[0])inside=!inside
        }
        if(inside)candidates.push({id:face.id,kind:'plane',distance:0,depth:face.vertices.reduce((s,p)=>s+p[2],0)/face.vertices.length})
      }
    }
    const rank={point:0,linear:1,plane:2}
    candidates.sort((a,b)=>rank[a.kind]-rank[b.kind]||a.distance-b.distance||a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0))
    return candidates[0]??null
  } catch {return null}
}

/** Semantic gesture state; drafts never enter the document until a valid completed gesture. */
export function createAuthoringInteraction3D(options:{getScene:()=>GeometryScene3D;getCamera:()=>GeometryCamera3D;commit:(scene:GeometryScene3D)=>boolean;notify:()=>void}) {
  let tool:GeometryTool3D='select',plane:WorkingPlane3D='XY',selected:string|null=null,hover:string|null=null,pending:string[]=[],draft:GeometryScene3D|null=null,message=''
  type Gesture={pointerId:number;start:Pointer3D;pointId:string|null;source:GeometryScene3D;worldStart:Vec3|null;position:Vec3|null;changed:boolean;invalid:boolean}
  let gesture:Gesture|null=null
  const cancel=()=>{gesture=null;draft=null;pending=[];message='';options.notify()}
  const publish=(next:GeometryScene3D|null)=>{
    if(!next){message='Əməliyyat etibarsızdır; səhnə dəyişdirilmədi.';return false}
    if(JSON.stringify(next)===JSON.stringify(options.getScene()))return true
    if(!options.commit(next)){message='Əməliyyat tətbiq edilmədi.';return false}return true
  }
  function choose(id:string){
    if(!['line','ray','segment','vector','plane'].includes(tool))return
    if(!options.getScene().points.some(p=>p.id===id)){message='Mövcud nöqtə seçin.';options.notify();return}
    if(pending.includes(id)){message='Fərqli nöqtələr seçin.';options.notify();return}
    const candidate=[...pending,id],count=tool==='plane'?3:2
    if(candidate.length===count){const result=createPrimitive3D(options.getScene(),tool as 'line'|'ray'|'segment'|'vector'|'plane',candidate)
      if(result&&publish(result.scene)){selected=result.id;pending=[];message=result.reused?'Mövcud obyekt seçildi.':'Obyekt yaradıldı.'}
      else message='Nöqtələr degenerativdir və ya istinad etibarsızdır. Başqa nöqtə seçin.'
    }else{pending=candidate;message=''}options.notify()
  }
  return {
    snapshot:()=>({tool,plane,selected,hover,pending:[...pending],draft,message,dragging:gesture?.pointId!==null&&!!gesture}),
    cancel,
    setTool(next:GeometryTool3D){cancel();tool=next;options.notify()},
    setPlane(next:WorkingPlane3D){cancel();plane=next;options.notify()},
    select(id:string|null){cancel();selected=id;options.notify()},
    choose,
    sync(){if(selected&&!(['points','linear_objects','planes'] as const).some(k=>options.getScene()[k].some(p=>p.id===selected)))selected=null;cancel()},
    pointer(phase:PointerPhase3D,p:Pointer3D):boolean {
      if(phase==='wheel')return !!gesture
      if(phase==='cancel'){if(!gesture)return false;cancel();return true}
      if(phase==='move'&&!gesture){const hit=pickGeometry3D(options.getScene(),options.getCamera(),p,tool!=='select'&&tool!=='camera');const next=hit?.id??null;if(next!==hover){hover=next;options.notify()}return false}
      if(phase==='down'){
        if(gesture)return true
        if(p.button!==0||p.altKey||tool==='camera')return false
        const source=options.getScene(),hit=pickGeometry3D(source,options.getCamera(),p,tool!=='select')
        if(tool==='select'&&!hit){selected=null;options.notify();return false}
        const pointId=tool==='select'&&hit?.kind==='point'&&isFreePoint3D(source,hit.id)?hit.id:null
        const position=pointId?source.points.find(v=>v.id===pointId)!.position:null
        const worldStart=position?workingPlanePoint3D(options.getCamera(),p,plane,position):null
        selected=tool==='select'?hit?.id??null:selected
        gesture={pointerId:p.pointerId,start:p,pointId,source,worldStart,position,changed:false,invalid:false};message='';options.notify();return true
      }
      if(!gesture||gesture.pointerId!==p.pointerId)return false
      if(phase==='move'){
        const changed=Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>3
        gesture.changed ||= changed
        if(gesture.pointId&&gesture.changed){
          const world=gesture.position?workingPlanePoint3D(options.getCamera(),p,plane,gesture.position):null
          const position=world&&gesture.worldStart?add(gesture.position!,sub(world,gesture.worldStart)):null
          const hit=pickGeometry3D(gesture.source,options.getCamera(),p,true),other=hit&&hit.id!==gesture.pointId?gesture.source.points.find(point=>point.id===hit.id):null
          const collision=other&&Math.abs(dot(sub(other.position,gesture.position!),planeNormal3D(plane)))<=1e-9
          const next=position&&!collision?moveGeometryPoint3D(gesture.source,gesture.pointId,position):null
          gesture.invalid=!next;draft=next;message=next?'':'Sürükləmə etibarsızdır və tətbiq edilməyəcək.';options.notify()
        }return true
      }
      if(phase==='up'){
        const finished=gesture;gesture=null
        if(finished.pointId&&finished.changed){if(!finished.invalid&&draft)publish(draft);else message='Sürükləmə tətbiq edilmədi.';draft=null}
        else if(!finished.changed){
          if(tool==='point'){
            const hit=pickGeometry3D(options.getScene(),options.getCamera(),p,true),position=workingPlanePoint3D(options.getCamera(),p,plane)
            const result=hit?{scene:options.getScene(),id:hit.id,reused:true}:position?createPoint3D(options.getScene(),position):null
            if(result&&publish(result.scene)){selected=result.id;message=result.reused?'Mövcud nöqtə seçildi.':'Nöqtə yaradıldı.'}else message='İş müstəvisi görünüşə paraleldir və ya koordinatlar etibarsızdır.'
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
