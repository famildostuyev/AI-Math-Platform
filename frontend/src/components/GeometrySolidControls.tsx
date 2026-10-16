import { useEffect, useState } from 'react'
import type { GeometryParametricSolid3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { addBasePolygon3D, createSolid3D, defaultSolid3D, editSolid3D, solidAngles3D, solidFrame3D } from './geometry3dSolidAuthoring'
import { SOLID_TOOLS_3D, solidTopology3D, pyramidApexParameters3D, type SolidKind3D } from './geometry3dSolids'

export default function GeometrySolidControls({scene,selected,creating,disabled,onCommit,onClose}:{scene:GeometryScene3D;selected:GeometryParametricSolid3D|null;creating:SolidKind3D|null;disabled:boolean;onCommit:(scene:GeometryScene3D,id:string)=>void;onClose:()=>void}){
  const [definition,setDefinition]=useState<GeometryParametricSolid3D|null>(null),[numbers,setNumbers]=useState<Record<string,string>>({}),[mode,setMode]=useState('template'),[baseId,setBaseId]=useState(''),[polygon,setPolygon]=useState<string[]>([]),[pointId,setPointId]=useState(''),[error,setError]=useState('')
  useEffect(()=>{
    const d=selected??(creating?defaultSolid3D(creating):null);setDefinition(d);setError('');setPolygon([])
    if(!d)return
    const p=d.parameters,values:Record<string,string>={}
    for(const [k,v] of Object.entries(p))if(typeof v==='number')values[k]=String(v)
    d.frame.origin.forEach((v,i)=>values[`origin${i}`]=String(v));solidAngles3D(d.frame).forEach((v,i)=>values[`angle${i}`]=String(v))
    if('base'in p){setMode(p.base.kind==='face'?'existing':p.base.kind);setBaseId(p.base.kind==='face'?p.base.face_id:'');if(p.base.kind==='template')values.radius=String(p.base.radius)}else{setMode('template');setBaseId('')}
    if('direction'in p)p.direction.forEach((v,i)=>values[`direction${i}`]=String(v))
    else [0,0,1].forEach((v,i)=>values[`direction${i}`]=String(v))
    if('apex_offset'in p)p.apex_offset.forEach((v,i)=>values[`apex${i}`]=String(v))
    else [0,0].forEach((v,i)=>values[`apex${i}`]=String(v))
    if(d.kind==='pyramid')try{solidTopology3D(scene,d).vertices.at(-1)!.forEach((v,i)=>values[`worldApex${i}`]=String(v))}catch{/* Source selection is validated when creating. */}
    setNumbers(values)
  },[selected,creating,scene])
  if(!definition)return null
  const kind=definition.kind,polygonal=kind==='prism'||kind==='pyramid'
  const field=(name:string,label:string)=><label key={name}>{label}<input type="number" disabled={!!selected&&name==='sides'} aria-label={`Cisim ${name}`} value={numbers[name]??''} onChange={e=>setNumbers(n=>({...n,[name]:e.target.value}))}/></label>
  const apply=()=>{
    try{
      const n=(key:string)=>{const raw=numbers[key];if(!raw?.trim())throw Error('Boş koordinat');const v=Number(raw);if(!Number.isFinite(v)||Math.abs(v)>1e12)throw Error('Etibarsız ədəd');return v}
      const xyz=(prefix:string)=>[0,1,2].map(i=>n(prefix+i)) as Vec3
      const d=structuredClone(definition),origin=xyz('origin'),angles=xyz('angle'),previousAngles=solidAngles3D(definition.frame)
      d.frame=angles.every((v,i)=>Math.abs(v-previousAngles[i])<1e-10)?{...d.frame,origin}:solidFrame3D(origin,angles)
      let candidate=scene
      if(kind==='cube')d.parameters={side:n('side')}
      else if(kind==='cuboid')d.parameters={width:n('width'),depth:n('depth'),height:n('height')}
      else{
        let faceId=baseId
        if(mode==='existing'&&!faceId){const result=addBasePolygon3D(scene,polygon);if(!result)throw Error('Qapalı, planar və kəsişməyən parça dövrəsi tələb olunur');candidate=result.scene;faceId=result.id}
        const face=candidate.faces.find(f=>f.id===faceId)
        const sides=mode==='existing'?face?.boundary.length:n('sides')
        if(!sides)throw Error('Əsas seçilməyib')
        const base=mode==='polygon'&&'base'in definition.parameters&&definition.parameters.base.kind==='polygon'?structuredClone(definition.parameters.base):mode==='existing'?{kind:'face' as const,face_id:faceId,point_ids:[...face!.boundary]}:{kind:'template' as const,radius:n('radius')}
        if(kind==='prism'){
          if(base.kind==='polygon')throw Error('Prizma üçün bu əsas rejimi dəstəklənmir')
          d.parameters={sides,height:n('height'),base,direction:xyz('direction')}
        }else d.parameters={sides,height:n('height'),base,apex_offset:[n('apex0'),n('apex1')]}
        if(selected&&!('base'in selected.parameters)){
          const p=d.parameters,standard='direction'in p?p.direction.every((v,i)=>v===[0,0,1][i]):'apex_offset'in p&&p.apex_offset.every(v=>v===0)
          if(standard&&n('height')>0)d.parameters={sides,radius:n('radius'),height:n('height')}
        }
      }
      const result=selected?(()=>{const next=editSolid3D(candidate,d);return next?{scene:next,id:d.id}:null})():createSolid3D(candidate,d)
      if(!result)throw Error('Ölçü, əsas, topologiya və ya asılılıq etibarsızdır')
      onCommit(result.scene,result.id);setError('')
    }catch(e){setError(`${e instanceof Error?e.message:'Etibarsız dəyişiklik'}. Səhnə dəyişdirilmədi.`)}
  }
  return <fieldset disabled={disabled} className="geometry-3d-solid-properties"><legend>{SOLID_TOOLS_3D.find(s=>s.kind===kind)?.label} — {selected?'parametrik redaktə':'yaratma'}</legend>
    {kind==='cube'&&field('side','Kənar uzunluğu')}
    {kind==='cuboid'&&<>{field('width','Uzunluq')}{field('depth','En')}{field('height','Hündürlük')}</>}
    {polygonal&&<><label>Əsas rejimi<select aria-label="Cisim əsas rejimi" disabled={!!selected} value={mode} onChange={e=>setMode(e.target.value)}><option value="template">Poliqon şablonu</option><option value="existing">Mövcud qapalı poliqon</option>{mode==='polygon'&&<option value="polygon">Müstəqil poliqon</option>}</select></label>
      {mode==='polygon'?field('sides','Tərəf sayı'):mode==='template'?<>{field('sides','Tərəf sayı')}{field('radius','Radius')}</>:<><label>Əsas poliqon<select aria-label="Cisim əsas poliqon" disabled={!!selected} value={baseId} onChange={e=>setBaseId(e.target.value)}><option value="">Parça dövrəsini seç</option>{scene.faces.map(f=><option key={f.id} value={f.id}>{f.id} ({f.boundary.length})</option>)}</select></label>
        {!baseId&&<><label>Poliqon nöqtəsi<select aria-label="Cisim poliqon nöqtəsi" value={pointId} onChange={e=>setPointId(e.target.value)}><option value="">Nöqtə seç</option>{scene.points.map(p=><option key={p.id} value={p.id}>{p.label??p.id}</option>)}</select></label><button type="button" onClick={()=>{if(pointId&&!polygon.includes(pointId))setPolygon(p=>[...p,pointId])}}>Əsasa nöqtə əlavə et</button><button type="button" onClick={()=>setPolygon([])}>Əsası təmizlə</button><p>Qapalı parça dövrəsi: {polygon.join(' → ')}</p></>}
      </>}{field('height',kind==='pyramid'?'İşarəli hündürlük':'Hündürlük')}
      {kind==='prism'?<><p>Ekstruziya istiqaməti əsasın lokal bazisində vahid vektordur; Z sıfır ola bilməz.</p>{[0,1,2].map(i=>field(`direction${i}`,`İstiqamət ${['X','Y','Z'][i]}`))}</>:<><p>Apex əsasın vertex mərkəzinə nəzərən lokal X/Y ofseti və işarəli hündürlüklə müəyyən edilir. Mənfi hündürlük apex-i əsasın əks tərəfinə yerləşdirir.</p>{field('apex0','Apex X ofseti')}{field('apex1','Apex Y ofseti')}</>}
    </>}
    <p>{mode==='existing'&&polygonal?'Mənbə poliqona nəzərən mövqe və dünya oxları ətrafında fırlanma':'Mövqe və fırlanma (dərəcə)'}</p>
    {[0,1,2].map(i=>field(`origin${i}`,`Mövqe ${['X','Y','Z'][i]}`))}{[0,1,2].map(i=>field(`angle${i}`,`Fırlanma ${['X','Y','Z'][i]}`))}
    <button type="button" onClick={apply}>{selected?'Cismə tətbiq et':'Cisim yarat'}</button><button type="button" onClick={onClose}>Cisim panelini bağla</button>
    {selected&&kind==='pyramid'&&'apex_offset'in selected.parameters&&<><p>Apex-in dünya koordinatları (mövcud digər forma dəyişikliklərindən ayrıca tətbiq edilir)</p>{[0,1,2].map(i=>field(`worldApex${i}`,`Apex ${['X','Y','Z'][i]}`))}<button type="button" onClick={()=>{try{const pos=[0,1,2].map(i=>{const raw=numbers[`worldApex${i}`];if(!raw?.trim())throw Error('Boş koordinat');return Number(raw)}) as Vec3;const d={...selected,parameters:pyramidApexParameters3D(scene,selected,pos)} as GeometryParametricSolid3D;const next=editSolid3D(scene,d);if(!next)throw Error('Etibarsız apex');onCommit(next,d.id)}catch{setError('Apex etibarsızdır; səhnə dəyişdirilmədi.')}}}>Apex mövqeyini tətbiq et</button></>}
    {selected&&polygonal&&<p>M4 parametr redaktəsi tərəf sayını və source əsasın kimliyini dəyişmir.</p>}
    <button type="button" disabled title="Tam semantik freeform çevrilməsi M4-də əlçatan deyil.">Sərbəst redaktəyə keç</button>
    {error&&<p role="alert">{error}</p>}
  </fieldset>
}
