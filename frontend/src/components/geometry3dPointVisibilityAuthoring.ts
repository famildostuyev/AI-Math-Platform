import type {GeometryPoint3D,GeometryScene3D} from './geometry3dContract'
import {transactGeometryScene3D} from './geometry3dModel'
import {editPerpendicularDisplay3D} from './geometry3dPerpendicularAuthoring'
import {pointLabelVisibilitySetting3D} from './geometry3dPointVisibility'

export type PointVisibilityComponent3D='marker_visibility'|'label_visibility'
const labelConstruction=(scene:GeometryScene3D,id:string)=>scene.constructions.find(c=>(c.kind==='perpendicular_foot'||c.kind==='pyramid_altitude')&&c.output_point_id===id)

/** Properties shows component permissions, not current glyph presence: blank text,
 * whole-point visibility and internal helper suppression keep their own gates.
 */
export function pointComponentVisibilitySetting3D(scene:GeometryScene3D,point:GeometryPoint3D,component:PointVisibilityComponent3D){
  if(component==='marker_visibility')return point.marker_visibility??'visible'
  const c=labelConstruction(scene,point.id)
  return pointLabelVisibilitySetting3D(point,c?.kind==='perpendicular_foot'||c?.kind==='pyramid_altitude'?c.label_visibility:undefined)
}

/** Exactly one immutable transaction per actual setting change; no-op returns the
 * original scene so callers preserve history, redo and absent optional fields.
 */
export function setPointComponentVisibility3D(source:GeometryScene3D,id:string,component:PointVisibilityComponent3D,visibility:'visible'|'hidden'){
  if(!['marker_visibility','label_visibility'].includes(component)||!['visible','hidden'].includes(visibility))return null
  const point=source.points.find(p=>p.id===id);if(!point)return null
  if(pointComponentVisibilitySetting3D(source,point,component)===visibility)return source
  if(component==='label_visibility'){
    const c=labelConstruction(source,id)
    if(c)return editPerpendicularDisplay3D(source,c.id,{label_visibility:visibility})
  }
  return transactGeometryScene3D(source,s=>{s.points.find(p=>p.id===id)![component]=visibility})
}
