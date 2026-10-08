import type { GeometrySourceDataV1, GeometryPointParent } from '../api/questionEditor'

export function pointParentEndpoints(g: Pick<GeometrySourceDataV1,'segments'> & Partial<Pick<GeometrySourceDataV1,'polygons'>>, parent: GeometryPointParent): [string,string] | null {
  if(parent.kind==='segment') {
    const s=g.segments.find(s=>s.id===parent.segment_id)
    return s ? [s.start_point_id,s.end_point_id] : null
  }
  const p=g.polygons?.find(p=>p.id===parent.polygon_id), a=parent.start_point_id,b=parent.end_point_id
  if(!p||a===b)return null
  const i=p.point_ids.indexOf(a),j=p.point_ids.indexOf(b)
  return i>=0&&j>=0&&((i+1)%p.point_ids.length===j||(j+1)%p.point_ids.length===i)?[a,b]:null
}

export function parameterCoordinates(a:{x:number;y:number},b:{x:number;y:number},t:number) {
  if(![a.x,a.y,b.x,b.y,t].every(Number.isFinite)||t<0||t>1||a.x===b.x&&a.y===b.y)return null
  if(!Number.isFinite(Math.hypot(b.x-a.x,b.y-a.y)))return null
  const x=(1-t)*a.x+t*b.x,y=(1-t)*a.y+t*b.y
  return [x,y].every(Number.isFinite)?{x,y}:null
}

export function projectPointParameter(a:{x:number;y:number},b:{x:number;y:number},p:{x:number;y:number}) {
  if(![a.x,a.y,b.x,b.y,p.x,p.y].every(Number.isFinite))return null
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
  if(!Number.isFinite(length)||length===0)return null
  const t=((p.x-a.x)*(dx/length)+(p.y-a.y)*(dy/length))/length
  return Number.isFinite(t)?Math.max(0,Math.min(1,t)):null
}
