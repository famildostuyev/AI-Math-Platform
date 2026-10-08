import { useRef, useState } from 'react'
import type { GeometrySourceDataV1 } from '../api/questionEditor'
import { annotationLayout, annotationPose, moveAnnotation } from './geometryAnnotationModel'
import { geometryFrameMetrics, GEOMETRY_FRAME_SCALE } from './geometryFrameModel'
import { normalizeGeometrySourceDataV1 } from './geometryV1'
import GeometryAnnotationContent from './GeometryAnnotationContent'

type Props={geometry:GeometrySourceDataV1;frameSize?:{width:number;height:number};selectedId?:string;disabled:boolean;onSelect:(id:string)=>void;onEdit:(id:string)=>void;onChange:(g:GeometrySourceDataV1)=>void}
export default function GeometryAnnotationLayer({geometry,frameSize,selectedId,disabled,onSelect,onEdit,onChange}:Props){
  const [preview,setPreview]=useState<GeometrySourceDataV1|null>(null)
  const gesture=useRef<{pointer:number;id:string;kind:string;x:number;y:number;base:GeometrySourceDataV1;last:GeometrySourceDataV1}|null>(null)
  const metrics=geometryFrameMetrics(geometry),origin=frameSize?{x:metrics.originX,y:metrics.originY}:{x:geometry.viewport.min_x,y:geometry.viewport.min_y}
  const width=frameSize?frameSize.width/GEOMETRY_FRAME_SCALE:geometry.viewport.width,height=frameSize?frameSize.height/GEOMETRY_FRAME_SCALE:geometry.viewport.height
  const current=preview??geometry
  const position=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:origin.x+(e.clientX-r.left)*width/r.width,y:origin.y+(e.clientY-r.top)*height/r.height}}
  return <svg data-geometry-annotation-layer="" viewBox={`${origin.x} ${origin.y} ${width} ${height}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible',touchAction:'none'}}
    onPointerDown={e=>{
      if(disabled||e.button!==0||gesture.current)return
      const target=e.target instanceof Element?e.target.closest('[data-annotation-id]'):null,id=target?.getAttribute('data-annotation-id')
      if(!id)return
      e.stopPropagation();e.preventDefault();onSelect(id)
      const kind=e.target instanceof Element?e.target.closest('[data-annotation-transform]')?.getAttribute('data-annotation-transform')??'move':'move'
      const p=position(e);gesture.current={pointer:e.pointerId,id,kind,...p,base:geometry,last:geometry};e.currentTarget.setPointerCapture(e.pointerId)
    }}
    onPointerMove={e=>{
      const g=gesture.current;if(!g||g.pointer!==e.pointerId)return
      const p=position(e),text=g.base.texts.find(t=>t.id===g.id)!,pose=annotationPose(g.base,text)
      if(p.x===g.x&&p.y===g.y){g.last=g.base;setPreview(null);return}
      let next=g.base
      if(g.kind==='move')next=moveAnnotation(g.base,g.id,pose.x+p.x-g.x,pose.y+p.y-g.y)
      else {
        const dx=p.x-g.x,dy=p.y-g.y,layout=annotationLayout(text)
        const patch=g.kind==='resize'?{layout_width:layout.width+(dx*Math.cos(pose.rotation)+dy*Math.sin(pose.rotation))/(text.scale??1)}
          :g.kind==='scale'?{scale:(text.scale??1)*Math.hypot(p.x-pose.x,p.y-pose.y)/Math.hypot(g.x-pose.x,g.y-pose.y)}
          :{rotation:(text.rotation??0)+Math.atan2(p.y-pose.y,p.x-pose.x)-Math.atan2(g.y-pose.y,g.x-pose.x)}
        next={...g.base,texts:g.base.texts.map(t=>t.id===g.id?{...t,...patch}:t)}
      }
      g.last=normalizeGeometrySourceDataV1(next)?next:g.base;setPreview(g.last)
    }}
    onPointerUp={e=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;setPreview(null);e.currentTarget.releasePointerCapture(e.pointerId);if(g.last!==g.base)onChange(g.last)}}
    onPointerCancel={()=>{gesture.current=null;setPreview(null)}}
    onDoubleClick={e=>{const id=e.target instanceof Element?e.target.closest('[data-annotation-id]')?.getAttribute('data-annotation-id'):null;if(id&&!disabled){e.stopPropagation();onEdit(id)}}}>
    {current.texts.filter(t=>t.runs||t.layout_width!==undefined||t.scale!==undefined||t.rotation!==undefined||t.attachment).map(t=>{
      const pose=annotationPose(current,t),layout=annotationLayout(t),selected=t.id===selectedId
      return <g key={t.id} data-annotation-id={t.id} transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rotation*180/Math.PI}) scale(${t.scale??1})`}>
        <foreignObject width={layout.width} height={layout.height} style={{pointerEvents:'all',cursor:'move',overflow:'visible'}}><GeometryAnnotationContent text={t}/></foreignObject>
        {selected&&!disabled&&<g data-frame-chrome="">
          <rect width={layout.width} height={layout.height} fill="none" stroke="#6d4bd1" strokeWidth=".3"/>
          <rect x={layout.width-1} y={layout.height/2-1} width="2" height="2" fill="white" stroke="#6d4bd1" strokeWidth=".3" data-annotation-transform="resize" style={{pointerEvents:'all',cursor:'ew-resize'}}/>
          <rect x={layout.width-1} y={layout.height-1} width="2" height="2" fill="white" stroke="#6d4bd1" strokeWidth=".3" data-annotation-transform="scale" style={{pointerEvents:'all',cursor:'nwse-resize'}}/>
          <circle cx={layout.width/2} cy={-3} r="1" fill="white" stroke="#6d4bd1" strokeWidth=".3" data-annotation-transform="rotate" style={{pointerEvents:'all',cursor:'grab'}}/>
        </g>}
      </g>
    })}
  </svg>
}
