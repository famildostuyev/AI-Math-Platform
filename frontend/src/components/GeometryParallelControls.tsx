import {useEffect,useState} from 'react'
import type {GeometryScene3D} from './geometry3dContract'
import {editParallel3D} from './geometry3dParallelAuthoring'
import {evaluateParallel3D} from './geometry3dParallel'
export default function GeometryParallelControls({scene,selected,disabled,onCommit}:{scene:GeometryScene3D;selected:string|null;disabled:boolean;onCommit:(s:GeometryScene3D)=>void}){
 const c=scene.constructions.find(c=>c.kind==='parallel'&&(c.id===selected||c.linear_id===selected))
 const [length,setLength]=useState('2'),[error,setError]=useState('')
 const value=c?.kind==='parallel'?c.length:2
 useEffect(()=>{setLength(String(value));setError('')},[c?.id,value])
 if(!c||c.kind!=='parallel')return null
 const change=(patch:Parameters<typeof editParallel3D>[2])=>{const next=editParallel3D(scene,c.id,patch);if(next){setError('');onCommit(next)}else setError('Uzunluq müsbət və sonlu olmalıdır.')}
 const coincident=evaluateParallel3D(scene,c).coincident
 return <fieldset disabled={disabled}><legend>Paralel</legend>
  <label>Obyekt<select aria-label="Parallel output type" value={c.output_kind} onChange={e=>change({output_kind:e.target.value as 'line'|'ray'|'segment'})}><option value="line">Düz xətt</option><option value="ray">Şüa</option><option value="segment">Parça</option></select></label>
  {c.output_kind!=='line'&&<label>İstiqamət<select aria-label="Parallel direction" value={c.direction} onChange={e=>change({direction:e.target.value as 'forward'|'reverse'})}><option value="forward">İstinad istiqaməti</option><option value="reverse">Əks istiqamət</option></select></label>}
  {c.output_kind==='segment'&&<><label>Uzunluq<input aria-label="Parallel segment length" type="number" value={length} onChange={e=>setLength(e.target.value)}/></label><button type="button" onClick={()=>change({length:Number(length)})}>Uzunluğu tətbiq et</button></>}
  {coincident&&<p role="status">{c.reference.kind==='plane'||c.reference.kind==='face'?'Xətt istinad müstəvisinin daxilindədir.':'Dayaq xətləri üst-üstə düşür.'}</p>}{error&&<p role="alert">{error}</p>}
 </fieldset>
}
