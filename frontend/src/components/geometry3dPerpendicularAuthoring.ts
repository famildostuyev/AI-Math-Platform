import type {GeometryScene3D} from './geometry3dContract'
import {evaluateGeometryScene3D,transactGeometryScene3D} from './geometry3dModel'
import {perpendicularFoot3D,perpendicularReference3D,type PerpendicularReference3D} from './geometry3dPerpendicular'
import {pointLabelVisibilitySetting3D} from './geometry3dPointVisibility'
// Keep the semantic name, initially hidden. Future altitude authoring should reuse this foot default.
export function createPerpendicular3D(source:GeometryScene3D,pointId:string,reference:PerpendicularReference3D,id=`perp_${crypto.randomUUID().replace(/-/g,'')}`){
 try{
  const evaluated=evaluateGeometryScene3D(source);if(evaluated.status!=='ok')throw Error('Invalid scene')
  const scene=evaluated.scene,r=perpendicularReference3D(scene,reference),point=(id:string)=>{const p=scene.points.find(p=>p.id===id);if(!p)throw Error('Missing point');return p.position},foot=perpendicularFoot3D(point(pointId),point(r.a),point(r.b)),output=id+'_H',segment=id+'_PH'
  const next=transactGeometryScene3D(scene,s=>{s.points.push({id:output,position:foot.position,label:'H'});s.linear_objects.push({id:segment,kind:'segment',a:pointId,b:output});s.constructions.push({id,kind:'perpendicular_foot',source_point_id:pointId,reference,output_point_id:output,segment_id:segment,marker_visibility:'visible',label_visibility:'hidden'})})
  if(!next)throw Error('Construction rejected');return {scene:next,id:segment,error:null}
 }catch(error){return {scene:null,id:null,error:error instanceof Error?error.message:'Construction rejected'}}
}
export function editPerpendicularDisplay3D(source:GeometryScene3D,id:string,patch:{marker_visibility?:'visible'|'hidden';label_visibility?:'visible'|'hidden';label?:string}){
 return transactGeometryScene3D(source,s=>{
  const c=s.constructions.find(c=>(c.kind==='perpendicular_foot'||c.kind==='pyramid_altitude')&&(c.id===id||c.segment_id===id||c.output_point_id===id));if(!c||c.kind!=='perpendicular_foot'&&c.kind!=='pyramid_altitude')throw Error('Missing perpendicular')
  const point=s.points.find(p=>p.id===c.output_point_id)!
  if(patch.marker_visibility)c.marker_visibility=patch.marker_visibility
  // Both Properties entry points use this existing authoritative label update.
  // Synchronize permissions only on an actual change, preserving absent defaults.
  if(patch.label_visibility&&pointLabelVisibilitySetting3D(point,c.label_visibility)!==patch.label_visibility){c.label_visibility=patch.label_visibility;point.label_visibility=patch.label_visibility}
  if(patch.label!==undefined)point.label=patch.label||null
 })
}
