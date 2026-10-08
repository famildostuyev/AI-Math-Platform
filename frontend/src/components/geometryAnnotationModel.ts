import type { GeometrySourceDataV1, GeometryTextV1, GeometryAnnotationAttachment, InlineNode } from '../api/questionEditor'
import { geometryShapes } from './geometryTopologyModel'
import { parameterCoordinates, pointParentEndpoints, projectPointParameter } from './geometryPointConstraintModel'

export type AnnotationTarget = Pick<GeometryAnnotationAttachment,'target_kind'|'target_id'|'start_point_id'|'end_point_id'>

export const annotationSource = (runs: InlineNode[]) => runs.map(r => r.type === 'text' ? r.text : r.type === 'inline_math' ? r.latex : '\n').join('')
export const annotationRuns = (text: GeometryTextV1): InlineNode[] => text.runs ?? [{ type:'text', text:text.content, marks:[] }]
export function annotationAnchor(g: GeometrySourceDataV1, a: GeometryAnnotationAttachment) {
  const point = (id: string) => g.points.find(p=>p.id===id)
  if (a.target_kind==='point') { const p=point(a.target_id); return p?{x:p.x,y:p.y,angle:0}:null }
  if (a.target_kind==='segment') {
    const edge=g.segments.find(s=>s.id===a.target_id),start=edge&&point(edge.start_point_id),end=edge&&point(edge.end_point_id)
    // Retain Slice-3 arithmetic and fallback semantics for legacy attachments.
    return start&&end?{x:start.x+(end.x-start.x)*a.parameter!,y:start.y+(end.y-start.y)*a.parameter!,angle:Math.atan2(end.y-start.y,end.x-start.x)}:null
  }
  if (a.target_kind==='polygon_edge') {
    const ends=pointParentEndpoints(g,{kind:'polygon_edge',polygon_id:a.target_id,start_point_id:a.start_point_id!,end_point_id:a.end_point_id!})
    const start=ends&&point(ends[0]),end=ends&&point(ends[1]),position=start&&end&&parameterCoordinates(start,end,a.parameter!)
    return position&&start&&end?{...position,angle:Math.atan2(end.y-start.y,end.x-start.x)}:null
  }
  if (a.target_kind==='shape') {
    const shape=geometryShapes(g).find(s=>s.id===a.target_id)
    if(!shape)return null
    const points=shape.pointIds.map(id=>point(id)!)
    return {x:points.reduce((sum,p)=>sum+p.x/points.length,0),y:points.reduce((sum,p)=>sum+p.y/points.length,0),angle:Math.atan2(points[1].y-points[0].y,points[1].x-points[0].x)}
  }
  const object=(a.target_kind==='circle'?g.circles:g.arcs)?.find(c=>c.id===a.target_id), center=object&&point(object.center_point_id)
  return center?{x:center.x,y:center.y,angle:object&&'start_angle' in object?object.start_angle:0}:null
}
export function annotationPose(g: GeometrySourceDataV1, text: GeometryTextV1) {
  const a=text.attachment, anchor=a&&annotationAnchor(g,a)
  if(!a||!anchor)return {x:text.x,y:text.y,rotation:text.rotation??0}
  const angle=a.orientation==='follow_target'?anchor.angle:0, c=Math.cos(angle),s=Math.sin(angle)
  let rotation=(text.rotation??0)+angle
  if(a.orientation==='follow_target'&&a.auto_upright)rotation=uprightRotation(rotation)
  const pose={x:anchor.x+a.offset.x*c-a.offset.y*s,y:anchor.y+a.offset.x*s+a.offset.y*c,rotation}
  return Object.values(pose).every(Number.isFinite)?pose:{x:text.x,y:text.y,rotation:text.rotation??0}
}
// Modulo pi keeps the visible baseline upright. Legacy rotations are untouched.
export function uprightRotation(rotation:number) {
  if(rotation>=-Math.PI/2&&rotation<Math.PI/2)return rotation
  return ((rotation+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2
}

function preservePose(g:GeometrySourceDataV1,text:GeometryTextV1,attachment:GeometryAnnotationAttachment) {
  const pose=annotationPose(g,text),anchor=annotationAnchor(g,attachment)
  if(!anchor)return null
  const angle=attachment.orientation==='follow_target'?anchor.angle:0,dx=pose.x-anchor.x,dy=pose.y-anchor.y
  const offset={x:dx*Math.cos(angle)+dy*Math.sin(angle),y:-dx*Math.sin(angle)+dy*Math.cos(angle)}
  const rotation=pose.rotation-angle
  return [offset.x,offset.y,rotation].every(Number.isFinite)?{...text,x:pose.x,y:pose.y,rotation,attachment:{...attachment,offset}}:null
}

export function attachAnnotation(g:GeometrySourceDataV1,id:string,target:AnnotationTarget):GeometrySourceDataV1 {
  if(!['point','segment','polygon_edge','shape','circle','arc'].includes(target.target_kind))return g
  const text=g.texts.find(t=>t.id===id)
  if(!text)return g
  const old=text.attachment
  if(old&&old.target_kind===target.target_kind&&old.target_id===target.target_id&&old.start_point_id===target.start_point_id&&old.end_point_id===target.end_point_id)return g
  const attachment:GeometryAnnotationAttachment={...target,anchor:target.target_kind==='point'?'point':target.target_kind==='segment'||target.target_kind==='polygon_edge'?'parameter':'center',offset:{x:0,y:0},orientation:old?.orientation??'keep_page',...(old?.auto_upright!==undefined?{auto_upright:old.auto_upright}:{})}
  if(attachment.anchor==='parameter') {
    const ends=pointParentEndpoints(g,target.target_kind==='segment'?{kind:'segment',segment_id:target.target_id}:{kind:'polygon_edge',polygon_id:target.target_id,start_point_id:target.start_point_id!,end_point_id:target.end_point_id!})
    const a=ends&&g.points.find(p=>p.id===ends[0]),b=ends&&g.points.find(p=>p.id===ends[1]),t=a&&b&&projectPointParameter(a,b,annotationPose(g,text))
    if(t===null||t===undefined)return g
    attachment.parameter=t
  }
  const next=preservePose(g,text,attachment)
  return next?{...g,texts:g.texts.map(t=>t.id===id?next:t)}:g
}

export function setAnnotationOrientation(g:GeometrySourceDataV1,id:string,orientation:GeometryAnnotationAttachment['orientation']):GeometrySourceDataV1 {
  if(orientation!=='keep_page'&&orientation!=='follow_target')return g
  const text=g.texts.find(t=>t.id===id)
  if(!text?.attachment||text.attachment.orientation===orientation)return g
  const attachment={...text.attachment,orientation,auto_upright:orientation==='follow_target'}
  const next=preservePose(g,text,attachment)
  return next?{...g,texts:g.texts.map(t=>t.id===id?next:t)}:g
}

export function annotationTargetLabel(g:GeometrySourceDataV1,target:AnnotationTarget):string {
  const label=(id:string)=>g.points.find(p=>p.id===id)?.label
  if(target.target_kind==='point')return label(target.target_id)?`${label(target.target_id)} nöqtəsi`:'Nöqtə'
  if(target.target_kind==='segment'||target.target_kind==='polygon_edge') {
    const edge=target.target_kind==='segment'?g.segments.find(s=>s.id===target.target_id):target
    const a=edge?.start_point_id&&label(edge.start_point_id),b=edge?.end_point_id&&label(edge.end_point_id)
    return a&&b?`${a}${b} ${target.target_kind==='polygon_edge'?'tərəfi':'parçası'}`:target.target_kind==='polygon_edge'?'Çoxbucaqlının tərəfi':'Parça'
  }
  return target.target_kind==='shape'?'Fiqur':target.target_kind==='circle'?'Çevrə / dairə':'Qövs / sektor'
}
export function moveAnnotation(g: GeometrySourceDataV1, id: string, x: number, y: number): GeometrySourceDataV1 {
  if(![x,y].every(Number.isFinite))return g
  const original=g.texts.find(t=>t.id===id)
  if(!original)return g
  const current=annotationPose(g,original)
  if(current.x===x&&current.y===y)return g
  return {...g,texts:g.texts.map(text=>{
    if(text.id!==id)return text
    const a=text.attachment, anchor=a&&annotationAnchor(g,a)
    if(!a||!anchor)return {...text,x,y}
    const angle=a.orientation==='follow_target'?anchor.angle:0,dx=x-anchor.x,dy=y-anchor.y
    return {...text,x,y,attachment:{...a,offset:{x:dx*Math.cos(angle)+dy*Math.sin(angle),y:-dx*Math.sin(angle)+dy*Math.cos(angle)}}}
  })}
}
// Resolve against the old graph before deleting references; content is never discarded.
export function preserveAnnotationsOnDeletion(before:GeometrySourceDataV1, after:GeometrySourceDataV1):GeometrySourceDataV1 {
  return {...after,texts:after.texts.map(text=>{
    if(!text.attachment||annotationAnchor(after,text.attachment))return text
    const old=before.texts.find(t=>t.id===text.id)??text,pose=annotationPose(before,old)
    const {attachment: _attachment,...free}=text
    return {...free,x:pose.x,y:pose.y,...(pose.rotation!==0||text.rotation!==undefined?{rotation:pose.rotation}:{})}
  })}
}
export function detachAnnotation(g:GeometrySourceDataV1,id:string):GeometrySourceDataV1 {
  return {...g,texts:g.texts.map(t=>{if(t.id!==id||!t.attachment)return t;const p=annotationPose(g,t),{attachment:_a,...free}=t;return {...free,x:p.x,y:p.y,rotation:p.rotation}})}
}
export function synchronizeAnnotationPositions(g:GeometrySourceDataV1):GeometrySourceDataV1 {
  return {...g,texts:g.texts.map(t=>{
    if(!t.attachment||!annotationAnchor(g,t.attachment))return t
    const p=annotationPose(g,t)
    return p.x===t.x&&p.y===t.y?t:{...t,x:p.x,y:p.y}
  })}
}
export function annotationLayout(text:GeometryTextV1) {
  const width=text.layout_width??Math.max(8,Math.min(100,Array.from(text.content).length*2.2))
  // Conservative content-driven line height; math fractions need more than a text line.
  const lines=Math.max(1,text.content.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(Array.from(line).length*2.2/width)),0))
  return {width,height:lines*10}
}
