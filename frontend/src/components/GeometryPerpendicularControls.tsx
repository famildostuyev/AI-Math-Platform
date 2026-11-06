import type {GeometryScene3D} from './geometry3dContract'
import {editPerpendicularDisplay3D} from './geometry3dPerpendicularAuthoring'
import {pointLabelVisibilitySetting3D} from './geometry3dPointVisibility'
export default function GeometryPerpendicularControls({scene,selected,disabled,onCommit}:{scene:GeometryScene3D;selected:string|null;disabled:boolean;onCommit:(s:GeometryScene3D)=>void}){
 const c=scene.constructions.find(c=>(c.kind==='perpendicular_foot'||c.kind==='pyramid_altitude')&&(c.id===selected||c.segment_id===selected||c.output_point_id===selected));if(!c||c.kind!=='perpendicular_foot'&&c.kind!=='pyramid_altitude')return null
 const point=scene.points.find(p=>p.id===c.output_point_id)!,labelSetting=pointLabelVisibilitySetting3D(point,c.label_visibility)
 const change=(patch:Parameters<typeof editPerpendicularDisplay3D>[2])=>{if(disabled)return;const next=editPerpendicularDisplay3D(scene,c.id,patch);if(next&&JSON.stringify(next)!==JSON.stringify(scene))onCommit(next)}
 return <fieldset disabled={disabled}><legend>{c.kind==='pyramid_altitude'?'Hündürlük':'Perpendikulyar'}</legend>
  <label>H etiketi<input aria-label="Perpendicular foot label" value={scene.points.find(p=>p.id===c.output_point_id)!.label??''} onChange={e=>change({label:e.target.value})}/></label>
  <label><input type="checkbox" aria-label="Show perpendicular foot label" checked={labelSetting==='visible'} onChange={e=>change({label_visibility:e.target.checked?'visible':'hidden'})}/>Etiketi göstər</label>
  <label><input type="checkbox" aria-label="Show perpendicular right angle" checked={c.marker_visibility==='visible'} onChange={e=>change({marker_visibility:e.target.checked?'visible':'hidden'})}/>Düz bucaq işarəsi</label>
 </fieldset>
}
