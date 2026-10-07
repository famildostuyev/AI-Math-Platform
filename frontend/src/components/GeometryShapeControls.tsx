import { useRef, useState } from 'react'
import type { GeometrySourceDataV1 } from '../api/questionEditor'
import type { GeometryShape } from './geometryTopologyModel'
import { transformGeometryShape, type ShapeTransform } from './geometryShapeModel'
import { geometryFrameMetrics, GEOMETRY_FRAME_SCALE } from './geometryFrameModel'

type Props={geometry:GeometrySourceDataV1;shape:GeometryShape;frameSize?:{width:number;height:number};disabled:boolean;onChange:(g:GeometrySourceDataV1)=>void}
export default function GeometryShapeControls({geometry,shape,frameSize,disabled,onChange}:Props){
  const [preview,setPreview]=useState<GeometrySourceDataV1|null>(null)
  const gesture=useRef<{kind:ShapeTransform['kind'];x:number;y:number;center:{x:number;y:number};base:GeometrySourceDataV1;last:GeometrySourceDataV1}|null>(null)
  const metrics=geometryFrameMetrics(geometry)
  const origin=frameSize?{x:metrics.originX,y:metrics.originY}:{x:geometry.viewport.min_x,y:geometry.viewport.min_y}
  const width=frameSize?frameSize.width/GEOMETRY_FRAME_SCALE:geometry.viewport.width,height=frameSize?frameSize.height/GEOMETRY_FRAME_SCALE:geometry.viewport.height
  const points=shape.pointIds.map(id=>(preview??geometry).points.find(p=>p.id===id)!)
  const center={x:points.reduce((n,p)=>n+p.x/points.length,0),y:points.reduce((n,p)=>n+p.y/points.length,0)}
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y))
  const eventPoint=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:origin.x+(e.clientX-r.left)*width/r.width,y:origin.y+(e.clientY-r.top)*height/r.height}}
  return <svg className="geometry-shape-controls" data-frame-chrome="" data-geometry-shape={shape.id} viewBox={`${origin.x} ${origin.y} ${width} ${height}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible',touchAction:'none'}}
    onPointerDown={e=>{
      if(disabled || e.button!==0 || gesture.current)return
      const target=e.target
      if(!(target instanceof SVGElement))return
      const kind=target.getAttribute('data-transform') as ShapeTransform['kind']|null
      if(!kind)return
      e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId)
      const p=eventPoint(e);gesture.current={kind,...p,center,base:geometry,last:geometry}
    }}
    onPointerMove={e=>{
      const g=gesture.current;if(!g)return
      const p=eventPoint(e),dx=p.x-g.x,dy=p.y-g.y
      const operation:ShapeTransform=g.kind==='translate'?{kind:'translate',dx,dy}:g.kind==='rotate'?{kind:'rotate',radians:Math.atan2(p.y-g.center.y,p.x-g.center.x)-Math.atan2(g.y-g.center.y,g.x-g.center.x)}:{kind:'scale',factor:Math.hypot(p.x-g.center.x,p.y-g.center.y)/Math.hypot(g.x-g.center.x,g.y-g.center.y)}
      g.last=transformGeometryShape(g.base,shape,operation);setPreview(g.last)
    }}
    onPointerUp={e=>{const g=gesture.current;if(!g)return;gesture.current=null;setPreview(null);e.currentTarget.releasePointerCapture(e.pointerId);if(g.last!==g.base)onChange(g.last)}}
    onPointerCancel={()=>{gesture.current=null;setPreview(null)}}>
    <polygon points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#6d4bd1" strokeWidth="1" vectorEffect="non-scaling-stroke" data-transform="translate" style={{pointerEvents:'stroke',cursor:'move'}} />
    <rect x={left} y={top} width={right-left} height={bottom-top} fill="none" stroke="#6d4bd1" strokeDasharray="2 2" strokeWidth=".4" />
    {[[left,top],[right,top],[right,bottom],[left,bottom]].map(([x,y],i)=><rect key={i} x={x-1.5} y={y-1.5} width="3" height="3" fill="white" stroke="#6d4bd1" strokeWidth=".4" data-transform="scale" style={{pointerEvents:'all',cursor:'nwse-resize'}} />)}
    <circle cx={center.x} cy={top-6} r="1.8" fill="white" stroke="#6d4bd1" strokeWidth=".4" data-transform="rotate" style={{pointerEvents:'all',cursor:'grab'}} />
  </svg>
}
