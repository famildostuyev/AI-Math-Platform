import {guidedIntersectionSegments3D} from './geometry3dGuidedPlane'
import {useEffect,useState} from 'react'
import type {GeometryPlane3D,GeometryScene3D,GeometryPlaneIntersectionMode3D,GeometryPlaneStroke3D} from './geometry3dContract'
import {resizePlaneDisplay3D,setPlaneShape3D,planeStrokeSetting3D,setPlaneStroke3D,setPlaneFill3D,setPlaneIntersectionStroke3D} from './geometry3dPlaneAuthoring'
import {planeOwnsIntersectionGuide3D} from './geometry3dPlaneIntersectionStroke'
import {resolvePlaneIntersectionStroke3D} from './geometry3dPlaneStroke'
import {resolvePlaneFill3D} from './geometry3dPlaneFill'
import {isConstructedPlane3D,constructedPlaneGeometry3D} from './geometry3dConstructedPlane'
import {transactGeometryScene3D} from './geometry3dModel'
import {planeShowsHiddenEdges3D} from './geometry3dPlaneDisplay'
export default function GeometryPlaneControls({scene,selected,disabled,onCommit,onEditOrientation}:{scene:GeometryScene3D;selected:GeometryPlane3D|null;disabled:boolean;onCommit:(s:GeometryScene3D)=>void;onEditOrientation?:(id:string)=>void}){
 const [width,setWidth]=useState('4'),[height,setHeight]=useState('3'),[error,setError]=useState('')
 useEffect(()=>{setWidth(String(selected?.display?.width??4));setHeight(String(selected?.display?.height??3));setError('')},[selected?.id,selected?.display?.width,selected?.display?.height])
 if(!selected?.display)return null
 const stroke=planeStrokeSetting3D(scene,selected.id)!
 const intersectionStroke=resolvePlaneIntersectionStroke3D(selected)
 const changeIntersectionStroke=(patch:Partial<GeometryPlaneStroke3D>)=>{
  if(disabled)return
  const next=setPlaneIntersectionStroke3D(scene,selected.id,{color:intersectionStroke.color,width:intersectionStroke.width,style:intersectionStroke.style,...patch})
  if(!next){setError('Kəsişmə rəngi #RRGGBB, qalınlığı 0.25–8 aralığında olmalıdır.');return}
  setError('');if(next!==scene)onCommit(next)
 }
 const fill=resolvePlaneFill3D(selected,'webgl')
 const changeFill=(color:string,opacity:number)=>{
  if(disabled)return
  const next=setPlaneFill3D(scene,selected.id,{color,opacity})
  if(!next){setError('Müstəvinin rəngi #RRGGBB, qeyri-şəffaflığı 0–100% aralığında olmalıdır.');return}
  setError('');if(next!==scene)onCommit(next)
 }
 const changeStroke=(patch:Partial<GeometryPlaneStroke3D>)=>{
  if(disabled)return
  const next=setPlaneStroke3D(scene,selected.id,{color:stroke.color,width:stroke.width,style:stroke.style,...patch})
  if(!next){setError('Sərhəd rəngi #RRGGBB, qalınlığı 0.25–8 aralığında olmalıdır.');return}
  setError('');if(next!==scene)onCommit(next)
 }
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
  {planeOwnsIntersectionGuide3D(scene,selected.id)&&<fieldset><legend>Kəsişmə xəttinin görünüşü</legend>
   <label>Kəsişmə xəttinin rəngi<input aria-label="Kəsişmə xəttinin rəngi" type="color" value={intersectionStroke.color} onChange={e=>changeIntersectionStroke({color:e.target.value})}/></label>
   <label>Kəsişmə xəttinin qalınlığı<input aria-label="Kəsişmə xəttinin qalınlığı" type="number" min="0.25" max="8" step="0.25" value={intersectionStroke.width} onChange={e=>changeIntersectionStroke({width:e.target.value===''?NaN:Number(e.target.value)})}/></label>
   <label>Kəsişmə xəttinin üslubu<select aria-label="Kəsişmə xəttinin üslubu" value={intersectionStroke.style} onChange={e=>changeIntersectionStroke({style:e.target.value as GeometryPlaneStroke3D['style']})}><option value="solid">Bütöv</option><option value="dashed">Kəsik-kəsik</option><option value="dotted">Nöqtəli</option></select></label>
  </fieldset>}
  <label>Müstəvinin rəngi<input aria-label="Müstəvinin rəngi" type="color" value={fill.color} onChange={e=>changeFill(e.target.value,fill.opacity)}/></label>
  <label>Müstəvinin qeyri-şəffaflığı<input aria-label="Müstəvinin qeyri-şəffaflığı" type="number" min="0" max="100" step="1" value={Number((fill.opacity*100).toFixed(10))} onChange={e=>changeFill(fill.color,e.target.value===''?NaN:Number(e.target.value)/100)}/>%</label>
  <label>Sərhəd xəttinin rəngi<input aria-label="Sərhəd xəttinin rəngi" type="color" value={stroke.color} onChange={e=>changeStroke({color:e.target.value})}/></label>
  <label>Sərhəd xəttinin qalınlığı<input aria-label="Sərhəd xəttinin qalınlığı" type="number" min="0.25" max="8" step="0.25" value={stroke.width} onChange={e=>changeStroke({width:e.target.value===''?NaN:Number(e.target.value)})}/></label>
  <label>Sərhəd xəttinin üslubu<select aria-label="Sərhəd xəttinin üslubu" value={stroke.style} onChange={e=>changeStroke({style:e.target.value as GeometryPlaneStroke3D['style']})}><option value="solid">Bütöv</option><option value="dashed">Kəsik-kəsik</option><option value="dotted">Nöqtəli</option></select></label>
  <label><input type="checkbox" aria-label="Gizli sərhədləri göstər" checked={planeShowsHiddenEdges3D(selected)} onChange={e=>{const checked=e.target.checked;if(disabled||checked===planeShowsHiddenEdges3D(selected))return;const next=transactGeometryScene3D(scene,s=>{s.planes.find(p=>p.id===selected.id)!.display!.show_hidden_edges=checked});if(next)onCommit(next)}}/>Gizli sərhədləri göstər</label>
  {error&&<p role="alert">{error}</p>}
 </fieldset>
}
