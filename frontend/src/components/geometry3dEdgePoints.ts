import type { GeometryCamera3D, GeometryScene3D } from './geometry3dContract'
import { evaluateGeometryScene3D, transactGeometryScene3D } from './geometry3dModel'
import { projectScene3D, projectedEdgeStrokes3D, sub, dot, add, scale } from './geometry3dProjection'

type Pointer = {x:number;y:number;width:number;height:number}
/** Visible stroke picking retains the original semantic edge and full-edge parameter. */
export function pickSolidEdge3D(source:GeometryScene3D,camera:GeometryCamera3D,p:Pointer){
  if(![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.width<=0||p.height<=0)return null
  try{
    const evaluated=evaluateGeometryScene3D(source)
    if(evaluated.status!=='ok')return null
    const scene=evaluated.scene,projected=projectScene3D(scene,camera,p.width,p.height)
    const edges=new Set(scene.solids.flatMap(s=>s.mode==='parametric'?s.features.filter(f=>f.slot.startsWith('e_')).map(f=>f.entity_id):s.edge_ids))
    const hits=[]
    for(const stroke of projectedEdgeStrokes3D(projected,camera.projection)){
      if(stroke.hidden||!edges.has(stroke.id)||!stroke.viewA||!stroke.viewB)continue
      const dx=stroke.b[0]-stroke.a[0],dy=stroke.b[1]-stroke.a[1],length=dx*dx+dy*dy
      if(length<4)continue
      const u=Math.max(0,Math.min(1,((p.x-stroke.a[0])*dx+(p.y-stroke.a[1])*dy)/length))
      const distance=Math.hypot(p.x-stroke.a[0]-u*dx,p.y-stroke.a[1]-u*dy)
      if(distance>7)continue
      const v=camera.projection==='perspective'?u*stroke.a[2]/((1-u)*stroke.b[2]+u*stroke.a[2]):u
      const view=add(stroke.viewA,scale(sub(stroke.viewB,stroke.viewA),v))
      const edge=scene.edges.find(e=>e.id===stroke.id)!,a=projected.projection.view(scene.points.find(p=>p.id===edge.start)!.position),b=projected.projection.view(scene.points.find(p=>p.id===edge.end)!.position),d=sub(b,a),den=dot(d,d)
      if(den<=1e-18)continue
      const t=Math.max(0,Math.min(1,dot(sub(view,a),d)/den))
      hits.push({edge_id:edge.id,t,distance,depth:view[2]})
    }
    return hits.sort((a,b)=>a.distance-b.distance||a.depth-b.depth||a.edge_id.localeCompare(b.edge_id))[0]??null
  }catch{return null}
}

export function createPointOnEdge3D(source:GeometryScene3D,edgeId:string,t:number,id=`p_${crypto.randomUUID().replace(/-/g,'')}`){
  if(!Number.isFinite(t)||t<0||t>1)return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,edge=scene.edges.find(e=>e.id===edgeId)
  if(!edge)return null
  const a=scene.points.find(p=>p.id===edge.start)!.position,b=scene.points.find(p=>p.id===edge.end)!.position
  const length=Math.hypot(...sub(b,a))
  if(length<=1e-9)return null
  const existing=scene.constructions.find(c=>c.kind==='point_on_edge'&&c.edge_id===edgeId&&Math.abs(c.t-t)*length<=1e-9)
  if(existing)return {scene,id:existing.output_point_id,reused:true}
  const next=transactGeometryScene3D(scene,draft=>{
    draft.points.push({id,position:add(a,scale(sub(b,a),t)),label:null})
    draft.constructions.push({id:`${id}_attachment`,kind:'point_on_edge',edge_id:edgeId,t,output_point_id:id})
  })
  return next?{scene:next,id,reused:false}:null
}

export function editPointOnEdge3D(source:GeometryScene3D,id:string,t:number){
  if(!Number.isFinite(t)||t<0||t>1)return null
  return transactGeometryScene3D(source,draft=>{
    const c=draft.constructions.find(c=>c.kind==='point_on_edge'&&c.output_point_id===id)
    if(!c||c.kind!=='point_on_edge')throw Error('Missing edge attachment')
    // Returning to the grab position must not introduce a rounding-only Undo step.
    if(Math.abs(c.t-t)>Number.EPSILON*8)c.t=t
  })
}
