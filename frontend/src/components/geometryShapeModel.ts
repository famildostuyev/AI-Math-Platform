import type { GeometrySourceDataV1 } from '../api/questionEditor'
import { geometryShapes, type GeometryShape } from './geometryTopologyModel'
import { isDerivedPoint, recomputeConstructions } from './geometryConstructionModel'
import { normalizeGeometrySourceDataV1 } from './geometryV1'
import { deleteGeometrySelection } from './geometryAuthoringModel'
import { referencedPointIds } from './geometryReferenceModel'
import { preserveAnnotationsOnDeletion, synchronizeAnnotationPositions } from './geometryAnnotationModel'

export type ShapeTransform = { kind:'translate'; dx:number; dy:number } | { kind:'rotate'; radians:number } | { kind:'scale'; factor:number }
export function transformGeometryShape(g:GeometrySourceDataV1,shape:GeometryShape,operation:ShapeTransform):GeometrySourceDataV1 {
  const current=geometryShapes(g).find(s=>s.id===shape.id)
  if(!current || current.pointIds.some(id=>isDerivedPoint(g,id)))return g
  const ids=new Set(current.pointIds),vertices=g.points.filter(p=>ids.has(p.id))
  // Arithmetic mean of boundary vertices: deterministic, independent of winding.
  const center={x:vertices.reduce((sum,p)=>sum+p.x/vertices.length,0),y:vertices.reduce((sum,p)=>sum+p.y/vertices.length,0)}
  if(operation.kind==='scale'&&(!Number.isFinite(operation.factor)||operation.factor<=0))return g
  const candidate={...g,points:g.points.map(p=>{
    if(!ids.has(p.id))return p
    if(operation.kind==='translate')return {...p,x:p.x+operation.dx,y:p.y+operation.dy}
    const x=p.x-center.x,y=p.y-center.y
    if(operation.kind==='scale')return {...p,x:center.x+x*operation.factor,y:center.y+y*operation.factor}
    const c=Math.cos(operation.radians),s=Math.sin(operation.radians)
    return {...p,x:center.x+x*c-y*s,y:center.y+x*s+y*c}
  })}
  const next=recomputeConstructions(candidate)
  if(!next || !normalizeGeometrySourceDataV1(next) || !geometryShapes(next).some(s=>s.id===shape.id))return g
  return synchronizeAnnotationPositions(next)
}

export function deleteGeometryShape(g:GeometrySourceDataV1,shape:GeometryShape):GeometrySourceDataV1 {
  const current=geometryShapes(g).find(s=>s.id===shape.id)
  if(!current)return g
  let next=g
  for(const edge of current.boundary)next=deleteGeometrySelection(next,{kind:edge.kind,id:edge.id})
  if(current.boundary.every(e=>e.kind==='segment')) {
    const referenced=referencedPointIds(next)
    next={...next,points:next.points.filter(p=>!current.pointIds.includes(p.id)||referenced.has(p.id))}
  }
  next=preserveAnnotationsOnDeletion(g,next)
  return normalizeGeometrySourceDataV1(next)?next:g
}
