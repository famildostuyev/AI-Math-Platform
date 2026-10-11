import { useContext, useEffect, useRef, useState } from 'react'
import type { GeometryCamera3D, GeometryScene3D } from './geometry3dContract'
import { createGeometryHistory3D, evaluateGeometryScene3D } from './geometry3dModel'
import { UniversalEditorSessionContext } from './universalEditorSession'
import GeometrySceneViewport from './GeometrySceneViewport'
import { standardView3D, type StandardView3D } from './geometry3dProjection'
import { createAuthoringInteraction3D, createPoint3D, deletePrimitive3D, editPoint3D, editReferences3D, GEOMETRY_TOOLS_3D, isFreePoint3D, parseCoordinates3D, type GeometryTool3D, type WorkingPlane3D } from './geometry3dAuthoring'

export default function GeometrySceneEditor({ value, onChange, targetId, disabled }: {
  value: GeometryScene3D; onChange: (value: GeometryScene3D) => void; targetId: string; disabled: boolean
}) {
  const session = useContext(UniversalEditorSessionContext), sessionRef = useRef(session), changeRef = useRef(onChange)
  sessionRef.current = session; changeRef.current = onChange
  const [history] = useState(() => createGeometryHistory3D(value, next => changeRef.current(next)))
  const [editingCamera, setEditingCamera] = useState(() => structuredClone(session?.geometry3DCameras.current.get(targetId) ?? value.print_camera))
  const valueRef=useRef(value),editingCameraRef=useRef(editingCamera)
  valueRef.current=value;editingCameraRef.current=editingCamera
  const [,updateInteraction]=useState(0)
  const [interaction]=useState(()=>createAuthoringInteraction3D({getScene:()=>valueRef.current,getCamera:()=>editingCameraRef.current,commit:next=>history.commit(next),notify:()=>updateInteraction(v=>v+1)}))
  const state=interaction.snapshot(),authoringDisabled=disabled||evaluateGeometryScene3D(value).status!=='ok'
  const selectedPoint=value.points.find(p=>p.id===state.selected),selectedLine=value.linear_objects.find(p=>p.id===state.selected),selectedPlane=value.planes.find(p=>p.id===state.selected)
  const freePoint=selectedPoint?isFreePoint3D(value,selectedPoint.id):false
  const [coordinates,setCoordinates]=useState(['0','0','0']),[label,setLabel]=useState(''),[references,setReferences]=useState<string[]>([]),[notice,setNotice]=useState('')
  useEffect(()=>{interaction.sync()},[value,interaction])
  useEffect(()=>{
    setCoordinates(selectedPoint?.position.map(String)??['0','0','0']);setLabel(selectedPoint?.label??'')
    setReferences(selectedLine?[selectedLine.a,selectedLine.b]:selectedPlane?[...selectedPlane.point_ids]:[])
  },[value,state.selected])
  const navigate = (next: GeometryCamera3D) => {
    if (!history.navigate(next)) return
    const normalized = history.getEditingCamera()
    sessionRef.current?.geometry3DCameras.current.set(targetId, normalized)
    setEditingCamera(normalized)
  }
  const [description, setDescription] = useState(value.description)
  const [camera, setCamera] = useState(value.print_camera.position.map(String))
  const [error, setError] = useState('')
  useEffect(() => { setDescription(value.description); setCamera(value.print_camera.position.map(String)) }, [value])
  useEffect(() => { history.setEnabled(!disabled) }, [history, disabled])
  useEffect(() => {
    sessionRef.current?.registerGeometryHistory(targetId, history.provider)
    sessionRef.current?.setGeometryCommands(null)
    sessionRef.current?.activateGeometry(targetId)
    return () => sessionRef.current?.unregisterGeometry(targetId)
  }, [targetId, history])
  const canDelete=!!state.selected&&!authoringDisabled&&deletePrimitive3D(value,state.selected)!==null
  const run=useRef<(action:GeometryTool3D|'delete')=>void>(()=>{})
  run.current=action=>{
    if(authoringDisabled)return
    setNotice('');setError('')
    if(action==='delete'){
      const result=state.selected?deletePrimitive3D(value,state.selected):null
      if(!result){setError('Bu obyektin təhlükəsiz silinməsi əlçatan deyil. Asılı obyektlər qorunur.');return}
      if(history.commit(result.scene)){interaction.select(null);setNotice(result.losses.length?`İtirilmiş əlaqələr: ${result.losses.map(l=>l.subject_id).join(', ')}. Nöqtələrin son mövqeləri qorundu.`:'Obyekt silindi.')}
    }else interaction.setTool(action)
  }
  const setGeometry3DCommands=session?.setGeometry3DCommands
  useEffect(()=>{
    setGeometry3DCommands?.({id:targetId,tool:state.tool,disabled:authoringDisabled,canDelete,run:action=>run.current(action)})
    return ()=>setGeometry3DCommands?.(current=>current?.id===targetId?null:current)
  },[setGeometry3DCommands,targetId,state.tool,authoringDisabled,canDelete])
  const commit = (next: GeometryScene3D) => {
    if (JSON.stringify(next) === JSON.stringify(value)) { setError(''); return }
    if (!history.commit(next)) { setError('Dəyişiklik etibarsızdır və tətbiq edilmədi.'); setDescription(value.description); setCamera(value.print_camera.position.map(String)) }
    else setError('')
  }
  return <div className="geometry-3d-editor" data-active-tool={state.tool} data-working-plane={state.plane} data-selected-id={state.selected??''} onFocus={() => sessionRef.current?.activateGeometry(targetId)} onKeyDown={event => {
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();interaction.cancel();setError('');setNotice('');return}
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      interaction.cancel()
      event.preventDefault(); event.stopPropagation(); (event.shiftKey ? history.provider.redo : history.provider.undo)()
    }
  }}>
    <GeometrySceneViewport scene={state.draft??value} camera={editingCamera} interactive={!disabled} onNavigate={navigate} interactionTool={state.tool}
      highlightedIds={[state.selected,state.hover,...state.pending].filter((id):id is string=>!!id)} onInteraction={(phase,pointer)=>{
        if(authoringDisabled)return false
        if(phase==='down')sessionRef.current?.activateGeometry(targetId)
        return interaction.pointer(phase,pointer)
      }} />
    {!session?.geometryToolbarHost&&<div className="geometry-3d-controls" data-geometry-transient="">{GEOMETRY_TOOLS_3D.map(item=><button type="button" key={item.tool} data-tool-3d={item.tool} disabled={authoringDisabled} aria-pressed={state.tool===item.tool} onClick={()=>run.current(item.tool)}>{item.label}</button>)}</div>}
    <div className="geometry-3d-working-plane" data-geometry-transient=""><label>İş müstəvisi <select aria-label="3D iş müstəvisi" disabled={authoringDisabled} value={state.plane} onChange={e=>interaction.setPlane(e.target.value as WorkingPlane3D)}>{['XY','XZ','YZ'].map(plane=><option key={plane}>{plane}</option>)}</select></label>
      <button type="button" onClick={()=>interaction.cancel()}>Qurmanı ləğv et</button><button type="button" onClick={()=>interaction.select(null)}>Seçimi təmizlə</button></div>
    <p className="geometry-3d-authoring-state" role="status" data-geometry-transient="">{GEOMETRY_TOOLS_3D.find(t=>t.tool===state.tool)?.label} · {state.plane}{['line','ray','segment','vector','plane'].includes(state.tool)?` · Nöqtə ${state.pending.length+1}/${state.tool==='plane'?3:2}`:''}{state.hover?` · Hədəf: ${state.hover}`:''}{state.message?` · ${state.message}`:''}</p>
    <div className="geometry-3d-controls" data-geometry-transient="">
      {([['front','Ön'],['back','Arxa'],['left','Sol'],['right','Sağ'],['top','Üst'],['bottom','Alt'],['isometric','İzometrik']] as [StandardView3D,string][]).map(([view,label]) => <button type="button" disabled={disabled} key={view} data-view={view} onClick={() => navigate(standardView3D(editingCamera,view))}>{label}</button>)}
      <button type="button" disabled={disabled} onClick={() => navigate(value.print_camera)}>Kameranı sıfırla</button>
      <button type="button" disabled={disabled} onClick={() => commit({ ...value, print_camera: structuredClone(editingCamera) })}>Sual üçün görünüşü təyin et</button>
    </div>
    <details className="geometry-3d-inspector" data-geometry-transient=""><summary>Obyektlər və koordinatlar</summary>
      <label>Seçilmiş obyekt <select aria-label="3D obyekt seç" value={state.selected??''} onChange={e=>['line','ray','segment','vector','plane'].includes(state.tool)?interaction.choose(e.target.value):interaction.select(e.target.value||null)}><option value="">Seçilməyib</option>{[...value.points,...value.linear_objects,...value.planes].map(object=><option key={object.id} value={object.id}>{'position' in object?'Nöqtə': 'kind' in object?GEOMETRY_TOOLS_3D.find(t=>t.tool===object.kind)?.label:'Müstəvi'}: {'label' in object&&object.label?object.label:object.id}</option>)}</select></label>
      <p>{state.selected??'Nöqtə yaratmaq üçün koordinatları daxil edin.'}</p>
      {selectedPoint&&!freePoint&&<p role="status">Bu nöqtə məhdudiyyətə və ya cismə bağlıdır; sərbəst redaktə əlçatan deyil.</p>}
      <fieldset disabled={authoringDisabled}><legend>Nöqtə koordinatları</legend>{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}>{axis}<input type="number" aria-label={`3D nöqtə ${axis}`} value={coordinates[i]} onChange={e=>setCoordinates(old=>old.map((v,j)=>i===j?e.target.value:v))}/></label>)}
        <label>Etiket<input aria-label="3D nöqtə etiketi" value={label} onChange={e=>setLabel(e.target.value)}/></label>
        <button type="button" onClick={()=>{
          interaction.cancel();const position=parseCoordinates3D(coordinates),result=position?createPoint3D(value,position):null
          if(!result){setError('Sonlu və limit daxilində X, Y, Z koordinatları tələb olunur.');return}
          const candidate=result.reused?result.scene:editPoint3D(result.scene,result.id,position!,label||null)
          if(!candidate||!result.reused&&!history.commit(candidate)){setError('Nöqtə yaradılmadı.');return}
          interaction.select(result.id);setError('');setNotice(result.reused?'Mövcud nöqtə seçildi.':'Nöqtə yaradıldı.')
        }}>Koordinatla nöqtə yarat</button>
        <button type="button" disabled={!freePoint} onClick={()=>{interaction.cancel();const position=parseCoordinates3D(coordinates),next=position&&selectedPoint?editPoint3D(value,selectedPoint.id,position,label||null):null;if(!next){setError('Nöqtənin redaktəsi etibarsızdır.');return}commit(next)}}>Nöqtəyə tətbiq et</button>
      </fieldset>
      {(selectedLine||selectedPlane)&&<fieldset disabled={authoringDisabled}><legend>Müəyyən edən nöqtələr</legend>{references.map((id,i)=><select key={i} aria-label={`3D istinad ${i+1}`} value={id} onChange={e=>setReferences(old=>old.map((v,j)=>i===j?e.target.value:v))}>{value.points.map(p=><option key={p.id} value={p.id}>{p.label??p.id}</option>)}</select>)}<button type="button" onClick={()=>{interaction.cancel();const next=state.selected?editReferences3D(value,state.selected,references):null;if(next)commit(next);else setError('İstinadlar degenerativdir və ya asılılıq etibarsızdır.')}}>İstinadları tətbiq et</button></fieldset>}
      <button type="button" disabled={!canDelete} onClick={()=>run.current('delete')}>3D seçiləni sil</button>
    </details>
    <details className="geometry-3d-metadata" data-geometry-transient=""><summary>Səhnə məlumatları</summary>
    <label>3D səhnə təsviri <input aria-label="3D səhnə təsviri" disabled={disabled} value={description} onChange={e => setDescription(e.target.value)} onBlur={() => commit({ ...value, description })} /></label>
    <fieldset disabled={disabled}><legend>Saxlanılan sual kamerasının mövqeyi</legend>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => <label key={axis}>{axis} <input type="number" aria-label={`Sual kamerası ${axis}`} value={camera[i]} onChange={e => setCamera(old => old.map((v, j) => j === i ? e.target.value : v))} /></label>)}
      <button type="button" onClick={() => {
        if (camera.some(v => !v.trim())) { setError('Kamera koordinatları tələb olunur.'); return }
        commit({ ...value, print_camera: { ...value.print_camera, position: camera.map(Number) as [number, number, number] } })
      }}>Sual görünüşünü tətbiq et</button>
    </fieldset>
    </details>
    {error && <p role="alert">{error}</p>}
    {notice&&<p role="status" className="geometry-3d-notice" data-geometry-transient="">{notice}</p>}
  </div>
}
