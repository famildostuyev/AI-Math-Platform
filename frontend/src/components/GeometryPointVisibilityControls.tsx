import type {GeometryPoint3D,GeometryScene3D} from './geometry3dContract'
import {pointComponentVisibilitySetting3D,setPointComponentVisibility3D,type PointVisibilityComponent3D} from './geometry3dPointVisibilityAuthoring'

export default function GeometryPointVisibilityControls({scene,selected,disabled,onCommit}:{scene:GeometryScene3D;selected:GeometryPoint3D|null;disabled:boolean;onCommit:(scene:GeometryScene3D)=>void}){
  if(!selected||!scene.points.some(p=>p.id===selected.id))return null
  const change=(component:PointVisibilityComponent3D,checked:boolean)=>{
    if(disabled)return
    const next=setPointComponentVisibility3D(scene,selected.id,component,checked?'visible':'hidden')
    if(next&&next!==scene)onCommit(next)
  }
  return <fieldset disabled={disabled}><legend>Nöqtənin görünüşü</legend>
    <label><input type="checkbox" aria-label="Nöqtənin işarəsini göstər" checked={pointComponentVisibilitySetting3D(scene,selected,'marker_visibility')==='visible'} onChange={e=>change('marker_visibility',e.target.checked)}/>Nöqtənin işarəsini göstər</label>
    <label><input type="checkbox" aria-label="Nöqtənin adını göstər" checked={pointComponentVisibilitySetting3D(scene,selected,'label_visibility')==='visible'} onChange={e=>change('label_visibility',e.target.checked)}/>Nöqtənin adını göstər</label>
  </fieldset>
}
