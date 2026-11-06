import {useEffect,useState} from 'react'
import type {GeometryScene3D,GeometryDihedral3D} from './geometry3dContract'
import {editDihedral3D} from './geometry3dDihedralAuthoring'
export default function GeometryDihedralControls({scene,selected,disabled,onCommit}:{scene:GeometryScene3D;selected:GeometryDihedral3D|null;disabled:boolean;onCommit:(s:GeometryScene3D)=>void}){
 const [angle,setAngle]=useState(''),[label,setLabel]=useState(''),[error,setError]=useState('')
 useEffect(()=>{setAngle(selected?String(selected.angle_radians*180/Math.PI):'');setLabel(selected?.label??'');setError('')},[selected])
 if(!selected)return null
 const apply=(patch:Parameters<typeof editDihedral3D>[2])=>{const next=editDihedral3D(scene,selected.id,patch);if(next){onCommit(next);setError('')}else setError('Invalid dihedral edit; geometry unchanged.')}
 return <fieldset className="geometry-3d-dihedral-properties" disabled={disabled}><legend>İkiüzlü bucaq</legend>
  <label>Bucaq (°)<input aria-label="Dihedral angle degrees" type="number" min="0" max="180" step="any" value={angle} onChange={e=>setAngle(e.target.value)}/></label>
  <label>Etiket<input aria-label="Dihedral label" value={label} onChange={e=>setLabel(e.target.value)}/></label>
  <button type="button" onClick={()=>{if(!angle.trim()||!Number.isFinite(Number(angle))||Number(angle)<0||Number(angle)>180){setError('Bucaq 0–180° intervalında olmalıdır.');return}apply({angle_radians:Number(angle)*Math.PI/180,label:label||null})}}>Bucağa tətbiq et</button>
  <label><input type="checkbox" aria-label="Show dihedral arc" checked={selected.arc_visibility==='visible'} onChange={e=>apply({arc_visibility:e.target.checked?'visible':'hidden'})}/>Bucaq qövsü</label>
  <label><input type="checkbox" aria-label="Show dihedral degree label" checked={selected.label_visibility==='visible'} onChange={e=>apply({label_visibility:e.target.checked?'visible':'hidden'})}/>Dərəcə etiketi</label>
  {error&&<p role="alert">{error}</p>}
 </fieldset>
}
