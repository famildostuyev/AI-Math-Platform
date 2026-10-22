import type { GeometryScene3D, Vec2 } from './geometry3dContract'
import { evaluateAnalyticSurface3D, wrapSurfaceAzimuth3D } from './geometry3dAnalytic'
import { transactGeometryScene3D } from './geometry3dModel'

/** Foundation API only: no pointer handling or tool registration. Stored UV stays strict. */
export function createPointOnSurface3D(source:GeometryScene3D,surfaceId:string,uv:Vec2,id:string,label:string|null=null){
  try{
    if(!Array.isArray(uv)||uv.length!==2||uv.some(v=>typeof v!=='number'||!Number.isFinite(v)))return null
    const canonical:Vec2=[wrapSurfaceAzimuth3D(uv[0]),uv[1]]
    return transactGeometryScene3D(source,draft=>{
      const surface=draft.surfaces.find(s=>s.id===surfaceId)
      const solid=draft.solids.find(s=>s.id===surface?.solid_id)
      if(!surface||!['cylinder','cone','sphere'].includes(surface.kind)||surface.slot!=='surface'||!solid||solid.mode!=='parametric'||solid.kind!=='cylinder'&&solid.kind!=='cone'&&solid.kind!=='sphere'||solid.kind!==surface.kind)throw Error('Invalid analytic surface')
      if(solid.kind==='cone'&&canonical[1]===1)throw Error('Reuse the semantic apex')
      if(solid.kind==='sphere'&&(canonical[1]===0||canonical[1]===1)){
        canonical[0]=0
        if(draft.constructions.some(c=>c.kind==='point_on_surface'&&c.surface_id===surfaceId&&c.uv[1]===canonical[1]))throw Error('Reuse the existing pole point')
      }
      draft.points.push({id,label,position:evaluateAnalyticSurface3D(solid,canonical)})
      draft.constructions.push({id:`${id}_attachment`,kind:'point_on_surface',surface_id:surfaceId,uv:canonical,output_point_id:id})
    })
  }catch{return null}
}

/** Edit only UV; derived XYZ and downstream constructions are reevaluated atomically. */
export function editPointOnSurface3D(source:GeometryScene3D,id:string,uv:Vec2){
  try{
    if(!Array.isArray(uv)||uv.length!==2||uv.some(v=>typeof v!=='number'||!Number.isFinite(v))||uv[1]<0||uv[1]>1)return null
    const canonical:Vec2=[wrapSurfaceAzimuth3D(uv[0]),uv[1]]
    return transactGeometryScene3D(source,draft=>{
      const recipe=draft.constructions.find(c=>c.kind==='point_on_surface'&&c.output_point_id===id)
      if(!recipe||recipe.kind!=='point_on_surface')throw Error('Missing surface attachment')
      const surface=draft.surfaces.find(s=>s.id===recipe.surface_id)
      if(!surface||!['cylinder','cone','sphere'].includes(surface.kind))throw Error('Unsupported surface')
      if(surface.kind==='cone'&&canonical[1]===1)canonical[0]=0
      if(surface.kind==='sphere'&&(canonical[1]===0||canonical[1]===1)){
        canonical[0]=0
        if(draft.constructions.some(c=>c.kind==='point_on_surface'&&c.output_point_id!==id&&c.surface_id===surface.id&&c.uv[1]===canonical[1]))throw Error('Pole already occupied')
      }
      const delta=Math.abs(recipe.uv[0]-canonical[0])
      if(Math.min(delta,1-delta)>1e-12||Math.abs(recipe.uv[1]-canonical[1])>1e-12)recipe.uv=canonical
    })
  }catch{return null}
}

/** Teacher-controlled metadata edit; attachment UV and derived XYZ stay authoritative. */
export function editSurfacePointLabel3D(source:GeometryScene3D,id:string,label:string|null){
  if(label!==null&&typeof label!=='string')return null
  return transactGeometryScene3D(source,draft=>{
    const recipe=draft.constructions.find(c=>c.kind==='point_on_surface'&&c.output_point_id===id)
    if(!recipe||recipe.kind!=='point_on_surface'||!draft.surfaces.some(s=>s.id===recipe.surface_id&&['cylinder','cone','sphere'].includes(s.kind)))throw Error('Missing analytic attachment')
    const point=draft.points.find(p=>p.id===id)
    if(!point)throw Error('Missing point')
    point.label=label===''?null:label
  })
}

// Retain the cylinder-only public entry points for existing callers.
export const createPointOnCylinderSurface3D=(source:GeometryScene3D,surfaceId:string,uv:Vec2,id:string,label:string|null=null)=>source.surfaces.some(s=>s.id===surfaceId&&s.kind==='cylinder')?createPointOnSurface3D(source,surfaceId,uv,id,label):null
const cylinderPoint=(source:GeometryScene3D,id:string)=>source.constructions.some(c=>c.kind==='point_on_surface'&&c.output_point_id===id&&source.surfaces.some(s=>s.id===c.surface_id&&s.kind==='cylinder'))
export const editPointOnCylinderSurface3D=(source:GeometryScene3D,id:string,uv:Vec2)=>cylinderPoint(source,id)?editPointOnSurface3D(source,id,uv):null
export const editCylinderSurfacePointLabel3D=(source:GeometryScene3D,id:string,label:string|null)=>cylinderPoint(source,id)?editSurfacePointLabel3D(source,id,label):null
