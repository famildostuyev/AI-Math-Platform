import type { GeometryCamera3D, GeometryScene3D } from './geometry3dContract'
import { analyticPointerRay3D, intersectClosedCylinder3D, intersectClosedAnalytic3D, isClosedAnalyticSolid3D } from './geometry3dAnalytic'
import { evaluateGeometryScene3D } from './geometry3dModel'
import { nearestFaceHit3D } from './geometry3dFacePoints'

/** Analytic semantic-solid picking. Caps/rims never pretend to be polygon faces. */
export function pickCylinder3D(scene:GeometryScene3D,camera:GeometryCamera3D,p:{x:number;y:number;width:number;height:number}){
  try{
    const ray=analyticPointerRay3D(camera,p.width,p.height,p.x,p.y),hits=[]
    for(const solid of scene.solids)if(solid.mode==='parametric'&&solid.kind==='cylinder'){
      const hit=intersectClosedCylinder3D(solid,ray)[0]
      if(hit)hits.push({id:solid.id,kind:'solid' as const,distance:0,depth:hit.depth,region:hit.region,position:hit.position,uv:hit.region==='lateral'?hit.uv:null})
    }
    return hits.sort((a,b)=>a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0))[0]??null
  }catch{return null}
}
export function pickAnalyticSolid3D(scene:GeometryScene3D,camera:GeometryCamera3D,p:{x:number;y:number;width:number;height:number}){
  try{
    const ray=analyticPointerRay3D(camera,p.width,p.height,p.x,p.y)
    const hits=scene.solids.flatMap(s=>{if(!isClosedAnalyticSolid3D(s))return [];const hit=intersectClosedAnalytic3D(s,ray)[0];return hit?[{id:s.id,kind:'solid' as const,distance:0,depth:hit.depth,region:hit.region,position:hit.position,uv:hit.uv}]:[]})
    return hits.sort((a,b)=>a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0))[0]??null
  }catch{return null}
}

/** The nearest closed-cylinder hit must itself be lateral, with no closer face.
 * Never search through a cap or a foreground cylinder for an attachment target. */
export function pickCylinderSurface3D(source:GeometryScene3D,camera:GeometryCamera3D,p:{x:number;y:number;width:number;height:number},surfaceId?:string){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,hit=pickCylinder3D(scene,camera,p)
  if(!hit||hit.region!=='lateral'||!hit.uv)return null
  const nearest=pickAnalyticSolid3D(scene,camera,p)
  if(nearest&&nearest.id!==hit.id&&nearest.depth<hit.depth-1e-8*Math.max(1,Math.abs(hit.depth)))return null
  const surface=scene.surfaces.find(s=>s.kind==='cylinder'&&s.solid_id===hit.id&&s.slot==='surface')
  if(!surface||surfaceId!==undefined&&surface.id!==surfaceId)return null
  const face=nearestFaceHit3D(scene,camera,p)
  if(face&&face.depth<hit.depth-1e-8*Math.max(1,Math.abs(hit.depth)))return null
  return {...hit,surface_id:surface.id,uv:hit.uv}
}

/** Shared cylinder/cone lateral authoring: the nearest closed hit must be lateral. */
export function pickAnalyticSurface3D(source:GeometryScene3D,camera:GeometryCamera3D,p:{x:number;y:number;width:number;height:number},surfaceId?:string){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,hit=pickAnalyticSolid3D(scene,camera,p)
  if(!hit||hit.region!=='lateral'&&hit.region!=='sphere'||!hit.uv)return null
  const solid=scene.solids.find(s=>s.id===hit.id)
  const surface=scene.surfaces.find(s=>s.solid_id===hit.id&&s.slot==='surface'&&s.kind===solid?.kind)
  if(!surface||surfaceId!==undefined&&surface.id!==surfaceId)return null
  const face=nearestFaceHit3D(scene,camera,p)
  if(face&&face.depth<hit.depth-1e-8*Math.max(1,Math.abs(hit.depth)))return null
  return {...hit,surface_id:surface.id,uv:hit.uv}
}
