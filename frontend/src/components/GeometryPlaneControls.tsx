import {guidedIntersectionSegments3D} from './geometry3dGuidedPlane'
import {useEffect,useState} from 'react'
import type {GeometryPlane3D,GeometryScene3D,GeometryPlaneIntersectionMode3D} from './geometry3dContract'
import {resizePlaneDisplay3D,setPlaneShape3D} from './geometry3dPlaneAuthoring'
import {isConstructedPlane3D,constructedPlaneGeometry3D} from './geometry3dConstructedPlane'
import {transactGeometryScene3D} from './geometry3dModel'
import {planeShowsHiddenEdges3D} from './geometry3dPlaneDisplay'
export default function GeometryPlaneControls({scene,selected,disabled,onCommit,onEditOrientation}:{scene:GeometryScene3D;selected:GeometryPlane3D|null;disabled:boolean;onCommit:(s:GeometryScene3D)=>void;onEditOrientation?:(id:string)=>void}){
 const [width,setWidth]=useState('4'),[height,setHeight]=useState('3'),[error,setError]=useState('')
 useEffect(()=>{setWidth(String(selected?.display?.width??4));setHeight(String(selected?.display?.height??3));setError('')},[selected?.id,selected?.display?.width,selected?.display?.height])
 if(!selected?.display)return null
 const recipe=scene.constructions.find(c=>isConstructedPlane3D(c)&&c.output_plane_id===selected.id)
 const coincident=recipe?.kind==='constructed_plane'&&recipe.relation==='parallel'&&constructedPlaneGeometry3D(scene,recipe.through.id,recipe.reference).coincident
 const intersectionControl=(recipe?.kind==='perpendicular_plane_on_line'||recipe?.kind==='constructed_plane'&&recipe.relation==='perpendicular')&&<label><input type="checkbox" checked={selected.display.intersection_visibility!=='hidden'} onChange={e=>{const next=transactGeometryScene3D(scene,s=>{s.planes.find(p=>p.id===selected.id)!.display!.intersection_visibility=e.target.checked?'visible':'hidden'});if(next)onCommit(next)}}/>Kəsişmə xəttini göstər</label>
 return <fieldset disabled={disabled}><legend>Müstəvinin görünüş ölçüləri</legend>
  {recipe?.kind==='constructed_plane'&&<p role="status">{recipe.relation==='perpendicular'?'İstinad müstəvisinə perpendikulyar müstəvi.':coincident?'Müstəvilər üst-üstə düşür.':'İstinad müstəvisinə paralel müstəvi.'}</p>}
  {recipe?.kind==='constructed_plane'&&recipe.relation==='perpendicular'&&<button type="button" disabled={disabled||!onEditOrientation} onClick={()=>onEditOrientation?.(selected.id)}>İstiqaməti redaktə et</button>}
  {recipe?.kind==='constructed_plane'&&recipe.relation==='perpendicular'&&<label>Kəsişmə görünüşü<select aria-label="Kəsişmə görünüşü" value={selected.display.intersection_mode??'cross'} onChange={e=>{const mode=e.target.value as GeometryPlaneIntersectionMode3D;if(disabled||mode===(selected.display?.intersection_mode??'cross'))return;const next=transactGeometryScene3D(scene,s=>{s.planes.find(p=>p.id===selected.id)!.display!.intersection_mode=mode});if(next)onCommit(next)}}><option value="cross">Kəsib keçsin</option><option value="first">Kəsişmə xəttinə qədər — birinci tərəf</option><option value="opposite">Kəsişmə xəttinə qədər — əks tərəf</option></select></label>}
  <label>Görünüş forması<select aria-label="Plane display shape" value={selected.display.shape??'rectangle'} onChange={e=>{const next=setPlaneShape3D(scene,selected.id,e.target.value as 'rectangle'|'parallelogram'|'cloud',selected.display?.skew??.35);if(next)onCommit(next)}}><option value="rectangle">Düzbucaqlı</option><option value="parallelogram">Paraleloqram</option><option value="cloud">Buludvari</option></select></label>
  {(selected.display.shape==='parallelogram')&&<label>Meyillik<input aria-label="Plane display skew" type="number" min="-1.5" max="1.5" step="0.05" value={selected.display.skew??.35} onChange={e=>{const next=setPlaneShape3D(scene,selected.id,'parallelogram',Number(e.target.value));if(next)onCommit(next)}}/></label>}
  <label>En<input aria-label="Plane display width" type="number" value={width} onChange={e=>setWidth(e.target.value)}/></label>
  <label>Hündürlük<input aria-label="Plane display height" type="number" value={height} onChange={e=>setHeight(e.target.value)}/></label>
  <button type="button" onClick={()=>{const next=resizePlaneDisplay3D(scene,selected.id,Number(width),Number(height));if(next){setError('');onCommit(next)}else setError('Ölçülər müsbət və sonlu olmalıdır.')}}>Müstəviyə tətbiq et</button>
  {recipe?.kind==='perpendicular_plane_on_line'&&<><p role="status">{guidedIntersectionSegments3D(scene,recipe.reference,recipe.guide).length?'':'Kəsişmə xətti istinad müstəvisinin görünən sərhədlərindən kənardadır.'}</p><p>Görünüş ölçüləri istinad müstəvisinə mütənasibdir.</p></>}
  {selected.display.lower_portion!==undefined&&<label><input type="checkbox" checked={selected.display.lower_portion==='upper'} onChange={e=>{const next=transactGeometryScene3D(scene,s=>{s.planes.find(p=>p.id===selected.id)!.display!.lower_portion=e.target.checked?'upper':'both'});if(next)onCommit(next)}}/>Aşağı hissəni istinad müstəvisində kəs</label>}
  {intersectionControl}
  <label><input type="checkbox" aria-label="Gizli sərhədləri göstər" checked={planeShowsHiddenEdges3D(selected)} onChange={e=>{const checked=e.target.checked;if(disabled||checked===planeShowsHiddenEdges3D(selected))return;const next=transactGeometryScene3D(scene,s=>{s.planes.find(p=>p.id===selected.id)!.display!.show_hidden_edges=checked});if(next)onCommit(next)}}/>Gizli sərhədləri göstər</label>
  {error&&<p role="alert">{error}</p>}
 </fieldset>
}
