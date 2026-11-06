import type {GeometryScene3D} from './geometry3dContract'
import {evaluateGeometryScene3D,transactGeometryScene3D} from './geometry3dModel'
import {constructedPlaneGeometry3D,normalizePlaneAngle3D} from './geometry3dConstructedPlane'
import {guidedPlaneGeometry3D,guidedPlaneDisplaySize3D,type PlaneGuide3D} from './geometry3dGuidedPlane'
export function createGuidedPerpendicularPlane3D(source:GeometryScene3D,reference:{kind:'plane';id:string},guide:PlaneGuide3D,id=`guided_plane_${crypto.randomUUID().replace(/-/g,'')}`){
 try{
  const evaluated=evaluateGeometryScene3D(source);if(evaluated.status!=='ok')throw Error('Etibarsız səhnə.')
  const display=guidedPlaneDisplaySize3D(evaluated.scene,reference,guide);if(!display)throw Error('Görünüş ölçüləri olan istinad müstəvisi seçin.')
  const geometry=guidedPlaneGeometry3D(evaluated.scene,reference,guide),ids=[id+'_origin',id+'_x',id+'_y'] as [string,string,string]
  const scene=transactGeometryScene3D(evaluated.scene,s=>{
   ids.forEach((id,i)=>s.points.push({id,position:geometry.positions[i],label:null}))
   s.planes.push({id,point_ids:ids,display:{width:display.width,height:display.height,shape:'rectangle',skew:0,lower_portion:'both',intersection_visibility:'visible'}})
   s.constructions.push({id:id+'_recipe',kind:'perpendicular_plane_on_line',reference,guide,output_plane_id:id,output_point_ids:ids,display_link:{width_ratio:1,height_ratio:1,extent_mode:'intersection'}})
  });if(!scene)throw Error('Konstruksiya qəbul edilmədi.')
  return {scene,id,ambiguous:geometry.ambiguous,error:null}
 }catch(error){return {scene:null,id:null,ambiguous:false,error:error instanceof Error?error.message:'Konstruksiya qəbul edilmədi.'}}
}
export function createParallelPlaneThroughPoint3D(source:GeometryScene3D,pointId:string,reference:{kind:'plane'|'face';id:string},id=`constructed_plane_${crypto.randomUUID().replace(/-/g,'')}`){
 return createConstructedPlaneThroughPoint3D(source,pointId,reference,id)
}
export function createPerpendicularPlaneThroughPoint3D(source:GeometryScene3D,pointId:string,reference:{kind:'plane'|'face';id:string},angle:number,id=`constructed_plane_${crypto.randomUUID().replace(/-/g,'')}`){
 if(!Number.isFinite(angle))return {scene:null,id:null,coincident:false,error:'Orientation angle must be finite'}
 return createConstructedPlaneThroughPoint3D(source,pointId,reference,id,angle)
}
function createConstructedPlaneThroughPoint3D(source:GeometryScene3D,pointId:string,reference:{kind:'plane'|'face';id:string},id:string,angle?:number){
 try{
  const e=evaluateGeometryScene3D(source);if(e.status!=='ok')throw Error('Invalid scene')
  const orientation=angle===undefined?undefined:{kind:'plane_local_angle' as const,angle_radians:normalizePlaneAngle3D(angle)}
  const geometry=constructedPlaneGeometry3D(e.scene,pointId,reference,orientation),ids=[id+'_origin',id+'_x',id+'_y'] as [string,string,string]
  const scene=transactGeometryScene3D(e.scene,s=>{
   ids.forEach((id,i)=>s.points.push({id,position:geometry.positions[i],label:null}))
   s.planes.push({id,point_ids:ids,display:{width:4,height:3,shape:'rectangle',skew:.35}})
   const common={id:id+'_recipe',kind:'constructed_plane' as const,through:{kind:'point' as const,id:pointId},reference,output_plane_id:id,output_point_ids:ids}
   s.constructions.push(orientation?{...common,relation:'perpendicular',orientation}:{...common,relation:'parallel',orientation:{kind:'unique'}})
  })
  if(!scene)throw Error('Construction rejected');return {scene,id,coincident:geometry.coincident,error:null}
 }catch(error){return {scene:null,id:null,coincident:false,error:error instanceof Error?error.message:'Construction rejected'}}
}
export function editPerpendicularPlaneOrientation3D(source:GeometryScene3D,planeId:string,angle:number){
 try{const normalized=normalizePlaneAngle3D(angle);return transactGeometryScene3D(source,s=>{const c=s.constructions.find(c=>c.kind==='constructed_plane'&&c.output_plane_id===planeId);if(!c||c.kind!=='constructed_plane'||c.relation!=='perpendicular')throw Error('Select a constructed perpendicular plane');c.orientation.angle_radians=normalized})}catch{return null}
}
