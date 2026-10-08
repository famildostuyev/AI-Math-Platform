import type { GeometrySourceDataV1, GeometryTextV1, GeometryAnnotationAttachment, InlineNode } from '../api/questionEditor'
import { geometryShapes } from './geometryTopologyModel'

export const annotationSource = (runs: InlineNode[]) => runs.map(r => r.type === 'text' ? r.text : r.type === 'inline_math' ? r.latex : '\n').join('')
export const annotationRuns = (text: GeometryTextV1): InlineNode[] => text.runs ?? [{ type:'text', text:text.content, marks:[] }]
export function annotationAnchor(g: GeometrySourceDataV1, a: GeometryAnnotationAttachment) {
  const point = (id: string) => g.points.find(p=>p.id===id)
  if (a.target_kind==='point') { const p=point(a.target_id); return p?{x:p.x,y:p.y,angle:0}:null }
  if (a.target_kind==='segment') {
    const edge=g.segments.find(s=>s.id===a.target_id), start=edge&&point(edge.start_point_id), end=edge&&point(edge.end_point_id)
    return start&&end?{x:start.x+(end.x-start.x)*a.parameter!,y:start.y+(end.y-start.y)*a.parameter!,angle:Math.atan2(end.y-start.y,end.x-start.x)}:null
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
  const pose={x:anchor.x+a.offset.x*c-a.offset.y*s,y:anchor.y+a.offset.x*s+a.offset.y*c,rotation:(text.rotation??0)+angle}
  return Object.values(pose).every(Number.isFinite)?pose:{x:text.x,y:text.y,rotation:text.rotation??0}
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
