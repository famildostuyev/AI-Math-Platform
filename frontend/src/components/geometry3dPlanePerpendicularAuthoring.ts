import type {GeometryScene3D} from './geometry3dContract'
import {evaluateGeometryScene3D,transactGeometryScene3D} from './geometry3dModel'
import {planeReference3D,planePerpendicularFoot3D,pyramidAltitudeOwner3D,type PlaneReference3D} from './geometry3dPlanePerpendicular'
export function createPlanePerpendicular3D(source:GeometryScene3D,pointId:string,reference:PlaneReference3D,id=`plane_perp_${crypto.randomUUID().replace(/-/g,'')}`,pyramidId?:string){
 try{
  const evaluated=evaluateGeometryScene3D(source);if(evaluated.status!=='ok')throw Error('Invalid scene')
  const scene=evaluated.scene,point=scene.points.find(p=>p.id===pointId);if(!point)throw Error('Missing source point')
  if(pyramidId){if(reference.kind!=='face')throw Error('Altitude requires a pyramid base face');pyramidAltitudeOwner3D(scene,pointId,reference.id,pyramidId)}
  const r=planeReference3D(scene,reference),foot=planePerpendicularFoot3D(point.position,r.positions),output=id+'_H',segment=id+(pyramidId?'_SH':'_PH')
  const next=transactGeometryScene3D(scene,s=>{
   s.points.push({id:output,position:foot.position,label:'H'});s.linear_objects.push({id:segment,kind:'segment',a:pointId,b:output})
   const recipe={id,source_point_id:pointId,output_point_id:output,segment_id:segment,marker_visibility:'visible' as const,label_visibility:'hidden' as const}
   if(pyramidId)s.constructions.push({...recipe,kind:'pyramid_altitude',pyramid_id:pyramidId,reference:{kind:'face',id:reference.id}})
   else s.constructions.push({...recipe,kind:'perpendicular_foot',reference})
  })
  if(!next)throw Error('Construction rejected');return {scene:next,id:segment,error:null}
 }catch(error){return {scene:null,id:null,error:error instanceof Error?error.message:'Construction rejected'}}
}
export function createPyramidAltitude3D(source:GeometryScene3D,pointId:string,faceId:string,id?:string){
 try{const pyramidId=pyramidAltitudeOwner3D(source,pointId,faceId);return createPlanePerpendicular3D(source,pointId,{kind:'face',id:faceId},id,pyramidId)}
 catch(error){return {scene:null,id:null,error:error instanceof Error?error.message:'Invalid pyramid altitude'}}
}
/** Resolve only an authoritative, unambiguous semantic apex/base relationship. */
export function createPyramidAltitudeFromApex3D(source:GeometryScene3D,pointId:string,id?:string){
 try{
  const candidates=source.solids.flatMap(s=>{
   if(s.mode!=='parametric'||s.kind!=='pyramid')return []
   const base=s.features.filter(f=>f.slot==='f_0'),face=source.faces.find(f=>f.id===base[0]?.entity_id)
   if(base.length!==1||!face)return []
   const apex=s.features.filter(f=>f.slot===`v_${face.boundary.length}`)
   return apex.length===1&&apex[0].entity_id===pointId?[face.id]:[]
  })
  if(candidates.length!==1)throw Error('Select one unambiguous semantic pyramid apex; its own base will be resolved automatically.')
  return createPyramidAltitude3D(source,pointId,candidates[0],id)
 }catch(error){return {scene:null,id:null,error:error instanceof Error?error.message:'Invalid pyramid altitude'}}
}
