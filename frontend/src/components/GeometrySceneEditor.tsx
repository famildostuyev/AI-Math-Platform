import GeometryParallelControls from './GeometryParallelControls'
import GeometryPerpendicularControls from './GeometryPerpendicularControls'
import GeometryPointVisibilityControls from './GeometryPointVisibilityControls'
import GeometryPlaneControls from './GeometryPlaneControls'
import GeometryPlaneDeleteAction from './GeometryPlaneDeleteAction'
import GeometryDihedralControls from './GeometryDihedralControls'
import { useContext, useEffect, useRef, useState } from 'react'
import type { GeometryCamera3D, GeometryScene3D } from './geometry3dContract'
import { createGeometryHistory3D, evaluateGeometryScene3D, setGeometryPointVisibility3D } from './geometry3dModel'
import { UniversalEditorSessionContext } from './universalEditorSession'
import GeometrySceneViewport from './GeometrySceneViewport'
import { standardView3D, type StandardView3D } from './geometry3dProjection'
import GeometrySolidControls from './GeometrySolidControls'
import { setSphereEquator3D } from './geometry3dSolidAuthoring'
import GeometryEditorPanels from './GeometryEditorPanels'
import { editSurfacePointLabel3D } from './geometry3dSurfacePoints'
import { SOLID_TOOLS_3D, solidSupported3D, solidTransformSupported3D, type SolidKind3D } from './geometry3dSolids'
import { createAuthoringInteraction3D, createPoint3D, deletePrimitive3D, editPoint3D, editConeCenterLabel3D, editReferences3D, GEOMETRY_TOOLS_3D, isFreePoint3D, parseCoordinates3D, type GeometryTool3D, type WorkingPlane3D } from './geometry3dAuthoring'

export default function GeometrySceneEditor({ value, onChange, targetId, disabled }: {
  value: GeometryScene3D; onChange: (value: GeometryScene3D) => void; targetId: string; disabled: boolean
}) {
  const session = useContext(UniversalEditorSessionContext), sessionRef = useRef(session), changeRef = useRef(onChange)
  sessionRef.current = session; changeRef.current = onChange
  const [history] = useState(() => createGeometryHistory3D(value, next => changeRef.current(next)))
  const [cameraUpdate, setCameraUpdate] = useState<{camera:GeometryCamera3D;origin?:symbol}>(() => ({camera:structuredClone(session?.geometry3DCameras.current.get(targetId) ?? value.print_camera)}))
  const editingCamera=cameraUpdate.camera
  const valueRef=useRef(value),editingCameraRef=useRef(editingCamera)
  valueRef.current=value;editingCameraRef.current=editingCamera
  const [,updateInteraction]=useState(0)
  const [notice,setNotice]=useState('')
  const detachedSolid=useRef<string|null>(null)
  const preservedSourceSolid=useRef<string|null>(null)
  const preservedSourceNotice='Mənbə poliqon paylaşılır və ya təhlükəsiz ayrıla bilmir; saxlanıldı.'
  const [interaction]=useState(()=>createAuthoringInteraction3D({getScene:()=>valueRef.current,getCamera:()=>editingCameraRef.current,commit:next=>{
    const detached=valueRef.current.solids.find(s=>s.mode==='parametric'&&s.kind==='pyramid'&&'base'in s.parameters&&s.parameters.base.kind==='face'&&next.solids.some(n=>n.id===s.id&&n.mode==='parametric'&&'base'in n.parameters&&n.parameters.base.kind==='polygon'))
    const preserved=next.solids.find(s=>s.mode==='parametric'&&s.kind==='pyramid'&&'base'in s.parameters&&s.parameters.base.kind==='face'&&!valueRef.current.solids.some(old=>old.id===s.id))
    const coneView=!valueRef.current.solids.length&&next.solids.some(s=>s.kind==='cone')&&JSON.stringify(next.print_camera)!==JSON.stringify(valueRef.current.print_camera)
    const committed=history.commit(next)
    if(committed&&coneView&&history.navigate(next.print_camera)){
      const camera=history.getEditingCamera()
      editingCameraRef.current=camera
      sessionRef.current?.geometry3DCameras.current.set(targetId,camera)
      setCameraUpdate({camera})
    }
    if(committed&&detached){detachedSolid.current=detached.id;setNotice('Piramida mənbə poliqondan ayrıldı. Mənbə poliqon dəyişdirilmədi.')}
    if(committed&&preserved){preservedSourceSolid.current=preserved.id;setNotice(preservedSourceNotice)}
    return committed
  },notify:()=>updateInteraction(v=>v+1)}))
  const state=interaction.snapshot(),authoringDisabled=disabled||evaluateGeometryScene3D(value).status!=='ok'
  const [creatingSolid,setCreatingSolid]=useState<SolidKind3D|'regular_prism'|'regular_pyramid'|'regular_frustum'|null>(null)
  const openProperties=useRef<()=>void>(()=>{})
  const closeProperties=useRef<()=>void>(()=>{})
  const selectedDisplayPlane=value.planes.find(p=>p.id===state.selected&&p.display)??null
  const selectedDihedral=(value.dihedrals??[]).find(d=>d.id===state.selected)??null
  const selectedSolid=value.solids.find(s=>s.id===state.selected&&solidTransformSupported3D(s))
  const selectedPoint=value.points.find(p=>p.id===state.selected),selectedLine=value.linear_objects.find(p=>p.id===state.selected),selectedPlane=value.planes.find(p=>p.id===state.selected)
  const freePoint=selectedPoint?isFreePoint3D(value,selectedPoint.id):false
  const surfacePoint=!!selectedPoint&&value.constructions.some(c=>c.kind==='point_on_surface'&&c.output_point_id===selectedPoint.id&&value.surfaces.some(s=>s.id===c.surface_id&&['cylinder','cone','sphere','frustum'].includes(s.kind)))
  const coneCenter=!!selectedPoint&&((value.dihedrals??[]).some(d=>d.features.some(f=>f.entity_id===selectedPoint.id&&f.slot.startsWith('v_')))||value.solids.some(s=>s.mode==='parametric'&&(s.kind==='cone'||s.kind==='sphere'||s.kind==='frustum')&&s.features.some(f=>['v_0','v_1','v_2','v_3'].includes(f.slot)&&f.entity_id===selectedPoint.id)))
  const [coordinates,setCoordinates]=useState(['0','0','0']),[label,setLabel]=useState(''),[references,setReferences]=useState<string[]>([])
  useEffect(()=>{interaction.sync()},[value,interaction])
  useEffect(()=>{
    if(!preservedSourceSolid.current||value.solids.some(s=>s.id===preservedSourceSolid.current&&s.mode==='parametric'&&'base'in s.parameters&&s.parameters.base.kind==='face'))return
    preservedSourceSolid.current=null
    setNotice(current=>current===preservedSourceNotice?'':current)
  },[value])
  useEffect(()=>{
    if(!detachedSolid.current)return
    const solid=value.solids.find(s=>s.id===detachedSolid.current)
    if(solid?.mode==='parametric'&&'base'in solid.parameters&&solid.parameters.base.kind==='polygon')return
    detachedSolid.current=null
    setNotice(current=>current==='Piramida mənbə poliqondan ayrıldı. Mənbə poliqon dəyişdirilmədi.'?'':current)
  },[value])
  useEffect(()=>{
    setCoordinates(selectedPoint?.position.map(String)??['0','0','0']);setLabel(selectedPoint?.label??'')
    setReferences(selectedLine?[selectedLine.a,selectedLine.b]:selectedPlane?[...selectedPlane.point_ids]:[])
  },[value,state.selected])
  const navigate = (next: GeometryCamera3D, origin?: symbol) => {
    if (!history.navigate(next)) return
    const normalized = history.getEditingCamera()
    sessionRef.current?.geometry3DCameras.current.set(targetId, normalized)
    setCameraUpdate({camera:normalized,origin})
  }
  const [description, setDescription] = useState(value.description)
  const [camera, setCamera] = useState(value.print_camera.position.map(String))
  const [error, setError] = useState('')
  useEffect(() => { setDescription(value.description); setCamera(value.print_camera.position.map(String)) }, [value])
  useEffect(() => { history.setEnabled(!disabled) }, [history, disabled])
  useEffect(() => {
    const cameras=sessionRef.current?.geometry3DCameras.current
    // Even an untouched editing camera must survive Apply if print_camera is edited.
    if(cameras&&!cameras.has(targetId))cameras.set(targetId,structuredClone(editingCameraRef.current))
    sessionRef.current?.registerGeometryHistory(targetId, history.provider)
    sessionRef.current?.setGeometryCommands(null)
    sessionRef.current?.activateGeometry(targetId)
    return () => sessionRef.current?.unregisterGeometry(targetId)
  }, [targetId, history])
  const canDelete=!!state.selected&&!authoringDisabled&&deletePrimitive3D(value,state.selected)!==null
  const run=useRef<(action:GeometryTool3D|SolidKind3D|'regular_prism'|'regular_pyramid'|'regular_frustum'|'delete')=>void>(()=>{})
  run.current=action=>{
    if(authoringDisabled)return
    setNotice('');setError('')
    if(action==='delete'){
      const result=state.selected?deletePrimitive3D(value,state.selected):null
      if(!result){setError('Bu obyektin təhlükəsiz silinməsi əlçatan deyil. Asılı obyektlər qorunur.');return}
      if(history.commit(result.scene)){interaction.select(null);setNotice(result.losses.length?`İtirilmiş əlaqələr: ${result.losses.map(l=>l.subject_id).join(', ')}. Nöqtələrin son mövqeləri qorundu.`:'Obyekt silindi.')}
    }else if(action==='rotate_solid'||action==='translate_solid'){if(!selectedSolid&&!selectedDihedral&&!selectedDisplayPlane){setError('Əvvəlcə fiqurun üzünə və ya kənarına klikləyib seçin.');return}setCreatingSolid(null);interaction.setTool(action)}else if(action==='pyramid'||action==='cylinder'||action==='cone'||action==='sphere'||action==='sphere_surface'||action==='frustum'||action==='dihedral'){setCreatingSolid(null);interaction.select(null);interaction.setTool(action)}
    else if(action==='regular_prism'||action==='regular_pyramid'||action==='regular_frustum'||SOLID_TOOLS_3D.some(s=>s.kind===action)){interaction.setTool('select');interaction.select(null);setCreatingSolid(action as SolidKind3D|'regular_prism'|'regular_pyramid'|'regular_frustum');openProperties.current()}
    else {setCreatingSolid(null);interaction.setTool(action as GeometryTool3D)}
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
  const statusText=error||[
    session?.geometryStatusHost?'':`${GEOMETRY_TOOLS_3D.find(t=>t.tool===state.tool)?.label} · ${state.plane}`,
    ['line','ray','segment','vector','plane'].includes(state.tool)?`Nöqtə ${state.pending.length+1}/${state.tool==='plane'?3:2}`:'',
    state.message||notice,
    state.tool==='pyramid'?'Əsas üçün qapalı poliqonun daxilinə klikləyin.':'',
  ].filter(Boolean).join(' · ')
  return <div className="geometry-3d-editor" data-active-tool={state.tool} data-working-plane={state.plane} data-selected-id={state.selected??''} onFocus={() => sessionRef.current?.activateGeometry(targetId)} onKeyDown={event => {
    if(event.key==='Enter'&&(state.tool==='polyline'||state.directionSelection||state.planeConstructionPreview||state.planeOrientationSelection||state.guidedPlanePreview)&&!(event.target instanceof HTMLElement&&event.target.closest('input,select,textarea,button'))){event.preventDefault();event.stopPropagation();interaction.finish();return}
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();interaction.cancel();setError('');setNotice('');return}
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      interaction.cancel()
      event.preventDefault(); event.stopPropagation(); (event.shiftKey ? history.provider.redo : history.provider.undo)()
    }
  }}>
    <GeometrySceneViewport scene={state.draft??value} camera={editingCamera} cameraOrigin={cameraUpdate.origin} interactive={!disabled} onNavigate={navigate} interactionTool={state.tool} constructionPreview={state.preview} constructionPreviewPolygons={state.previewSurfacePolygons} constructionPreviewPlane={state.planeConstructionPreview||state.planeOrientationSelection||state.guidedPlanePreview} guidedIntersectionPreview={state.guidedIntersectionPreview} orientationHandlePreview={state.orientationHandlePreview} orientationHandleContour={state.orientationHandleContour} intersectionLinePreview={state.intersectionLinePreview} selectedSolidId={selectedSolid?.id??selectedDihedral?.id??selectedDisplayPlane?.id} onContextSelect={id=>interaction.select(id)}
      highlightedIds={[state.selected,state.hover,...state.pending,...(selectedSolid&&selectedSolid.mode==='parametric'?selectedSolid.features.map(f=>f.entity_id):[])].filter((id):id is string=>!!id)} onInteraction={(phase,pointer)=>{
        if(authoringDisabled)return false
        if(phase==='down')sessionRef.current?.activateGeometry(targetId)
        return interaction.pointer(phase,pointer)
      }} />
    {state.tool==='parallel'&&<label>Paralel obyekt<select aria-label="Parallel construction output" disabled={authoringDisabled} value={state.parallelOutput} onChange={e=>interaction.setParallelOutput(e.target.value as 'line'|'plane')}><option value="line">Xətt / şüa / parça</option><option value="plane">Müstəvi</option></select></label>}
    {state.tool==='perpendicular'&&<label>Perpendikulyar obyekt<select aria-label="Perpendicular construction output" disabled={authoringDisabled} value={state.perpendicularOutput} onChange={e=>interaction.setPerpendicularOutput(e.target.value as 'segment'|'plane'|'guided_plane')}><option value="segment">Parça</option><option value="plane">Müstəvi</option><option value="guided_plane">Xətt üzrə müstəvi</option></select></label>}
    {state.guidedPlanePreview&&<div role="group" aria-label="Guided perpendicular plane"><button type="button" disabled={authoringDisabled} onClick={()=>interaction.finish()}>Müstəvini təsdiq et</button><button type="button" onClick={()=>interaction.cancel()}>Ləğv et</button></div>}
    {state.planeOrientationSelection&&<div role="group" aria-label="Perpendicular plane orientation"><span>Dəstək yeni müstəvinin istinad müstəvisinə paralel oxudur, normalı deyil.</span><button type="button" disabled={authoringDisabled||!state.planeOrientationChosen} onClick={()=>interaction.finish()}>İstiqaməti təsdiq et</button><button type="button" onClick={()=>interaction.cancel()}>Ləğv et</button></div>}
    {state.planeConstructionPreview&&<div role="group" aria-label="Parallel plane preview"><button type="button" disabled={authoringDisabled} onClick={()=>interaction.finish()}>Müstəvini təsdiq et</button><button type="button" onClick={()=>interaction.cancel()}>Ləğv et</button></div>}
    {state.directionSelection&&<div role="group" aria-label="Plane parallel direction"><span>İstiqaməti sürükləyin və ya paralel xətt seçin.</span><button type="button" disabled={authoringDisabled||!state.directionChosen} onClick={()=>interaction.finish()}>İstiqaməti təsdiq et</button><button type="button" onClick={()=>interaction.cancel()}>Ləğv et</button></div>}
    <GeometryEditorPanels targetId={targetId} openRef={openProperties} closeRef={closeProperties} status={statusText?<span role={error?'alert':'status'} title={error||notice||state.message}>
      {statusText}
    </span>:null} menu={<>
    {!session?.geometryToolbarHost&&<details><summary>Alətlər</summary>{GEOMETRY_TOOLS_3D.map(item=><button type="button" key={item.tool} data-tool-3d={item.tool} disabled={authoringDisabled} aria-pressed={state.tool===item.tool} onClick={()=>run.current(item.tool)}>{item.label}</button>)}{SOLID_TOOLS_3D.map(item=><button type="button" key={item.kind} data-solid-3d={item.kind} disabled={authoringDisabled} onClick={()=>run.current(item.kind)}>{item.label}</button>)}</details>}
    <details className="geometry-3d-views"><summary>Görünüş</summary>
      {([['front','Ön'],['back','Arxa'],['left','Sol'],['right','Sağ'],['top','Üst'],['bottom','Alt'],['isometric','İzometrik']] as [StandardView3D,string][]).map(([view,label]) => <button type="button" disabled={disabled} key={view} data-view={view} onClick={() => navigate(standardView3D(editingCamera,view))}>{label}</button>)}
      <button type="button" disabled={disabled} onClick={() => navigate(value.print_camera)}>Kameranı sıfırla</button>
      <button type="button" disabled={disabled} onClick={() => commit({ ...value, print_camera: structuredClone(editingCamera) })}>Sual üçün görünüşü təyin et</button>
    </details>
    <label>İş müstəvisi <select aria-label="3D iş müstəvisi" disabled={authoringDisabled} value={state.plane} onChange={e=>interaction.setPlane(e.target.value as WorkingPlane3D)}>{['XY','XZ','YZ'].map(plane=><option key={plane}>{plane}</option>)}</select></label>
    {(state.pending.length>0||state.dragging)&&<button type="button" onClick={()=>interaction.cancel()}>Qurmanı ləğv et</button>}
    {state.selected&&<button type="button" onClick={()=>interaction.select(null)}>Seçimi təmizlə</button>}
    </>} properties={<>
    <GeometryPlaneDeleteAction selected={selectedPlane} disabled={authoringDisabled} canDelete={canDelete} onDelete={id=>{if(interaction.snapshot().selected===id)run.current('delete')}}/>
    <details className="geometry-3d-inspector" data-geometry-transient="" open={creatingSolid?true:undefined}><summary>Obyektlər və koordinatlar</summary>
      <label>Seçilmiş obyekt <select aria-label="3D obyekt seç" value={state.selected??''} onChange={e=>['line','ray','segment','vector','plane'].includes(state.tool)?interaction.choose(e.target.value):interaction.select(e.target.value||null)}><option value="">Seçilməyib</option>{[...value.points,...value.linear_objects,...value.planes,...value.solids,...(value.dihedrals??[]),...value.faces.filter(f=>!value.solids.some(s=>s.mode==='parametric'&&s.features.some(v=>v.entity_id===f.id)))].map(object=><option key={object.id} value={object.id}>{(value.dihedrals??[]).some(d=>d.id===object.id)?'\u0130ki\u00fczl\u00fc bucaq':'position' in object?'Nöqtə':'boundary' in object?'Poliqon': 'kind' in object?(SOLID_TOOLS_3D.find(t=>t.kind===object.kind)?.label??GEOMETRY_TOOLS_3D.find(t=>t.tool===object.kind)?.label):'Müstəvi'}: {'label' in object&&object.label?object.label:object.id}</option>)}</select></label>
      <GeometryParallelControls scene={value} selected={state.selected} disabled={authoringDisabled} onCommit={next=>{interaction.cancel();commit(next)}}/>
      <GeometryPerpendicularControls scene={value} selected={state.selected} disabled={authoringDisabled} onCommit={next=>{interaction.cancel();commit(next)}}/>
      <GeometryPlaneControls scene={value} selected={selectedDisplayPlane} disabled={authoringDisabled} onCommit={next=>{interaction.cancel();commit(next)}} onEditOrientation={id=>{if(interaction.snapshot().selected===id&&interaction.editPlaneOrientation(id))closeProperties.current()}}/>
      <GeometryDihedralControls scene={value} selected={selectedDihedral} disabled={authoringDisabled} onCommit={next=>{interaction.cancel();commit(next)}}/>
      <GeometrySolidControls scene={value} selected={selectedSolid&&solidSupported3D(selectedSolid)?selectedSolid:null} creating={creatingSolid} disabled={authoringDisabled} onCommit={(next,id)=>{commit(next);setCreatingSolid(null);interaction.select(id)}} onClose={()=>{setCreatingSolid(null);interaction.select(null)}}/>
      {selectedSolid?.kind==='sphere'&&<label><input type="checkbox" aria-label="Ekvatoru göstər" disabled={authoringDisabled} checked={selectedSolid.parameters.equator==='visible'} onChange={e=>{interaction.cancel();const next=setSphereEquator3D(value,selectedSolid.id,e.target.checked);if(next)commit(next)}}/>Ekvatoru göstər</label>}
      {creatingSolid!=='regular_prism'&&creatingSolid!=='regular_pyramid'&&creatingSolid!=='regular_frustum'&&<><p>{state.selected??'Nöqtə yaratmaq üçün koordinatları daxil edin.'}</p>
      {selectedPoint&&!freePoint&&<p role="status">{coneCenter?'Cismin istinad nöqtəsi: koordinatlar cismə bağlıdır; etiketi dəyişə bilərsiniz.':'Bu nöqtə məhdudiyyətə və ya cismə bağlıdır; sərbəst redaktə əlçatan deyil.'}</p>}
      {selectedPoint&&<label><input type="checkbox" aria-label="Nöqtəni göstər" disabled={authoringDisabled} checked={selectedPoint.visibility!=='hidden'} onChange={e=>{interaction.cancel();const next=setGeometryPointVisibility3D(value,selectedPoint.id,e.target.checked?'visible':'hidden');if(next)commit(next)}}/>Nöqtəni göstər</label>}
      <GeometryPointVisibilityControls scene={value} selected={selectedPoint??null} disabled={authoringDisabled} onCommit={next=>{interaction.cancel();commit(next)}}/>
      <fieldset disabled={authoringDisabled}><legend>Nöqtə koordinatları</legend>{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}>{axis}<input type="number" aria-label={`3D nöqtə ${axis}`} disabled={surfacePoint||coneCenter} value={coordinates[i]} onChange={e=>setCoordinates(old=>old.map((v,j)=>i===j?e.target.value:v))}/></label>)}
        <label>Etiket<input aria-label="3D nöqtə etiketi" value={label} onChange={e=>setLabel(e.target.value)}/></label>
        <button type="button" onClick={()=>{
          interaction.cancel();const position=parseCoordinates3D(coordinates),result=position?createPoint3D(value,position):null
          if(!result){setError('Sonlu və limit daxilində X, Y, Z koordinatları tələb olunur.');return}
          const candidate=result.reused?result.scene:editPoint3D(result.scene,result.id,position!,label||null)
          if(!candidate||!result.reused&&!history.commit(candidate)){setError('Nöqtə yaradılmadı.');return}
          interaction.select(result.id);setError('');setNotice(result.reused?'Mövcud nöqtə seçildi.':'Nöqtə yaradıldı.')
        }}>Koordinatla nöqtə yarat</button>
        <button type="button" disabled={!freePoint&&!surfacePoint&&!coneCenter} onClick={()=>{interaction.cancel();const position=parseCoordinates3D(coordinates),next=selectedPoint?(coneCenter?editConeCenterLabel3D(value,selectedPoint.id,label):surfacePoint?editSurfacePointLabel3D(value,selectedPoint.id,label):position?editPoint3D(value,selectedPoint.id,position,label||null):null):null;if(!next){setError('Nöqtənin redaktəsi etibarsızdır.');return}commit(next)}}>Nöqtəyə tətbiq et</button>
      </fieldset>
      {(selectedLine||selectedPlane)&&<fieldset disabled={authoringDisabled}><legend>Müəyyən edən nöqtələr</legend>{references.map((id,i)=><select key={i} aria-label={`3D istinad ${i+1}`} value={id} onChange={e=>setReferences(old=>old.map((v,j)=>i===j?e.target.value:v))}>{value.points.map(p=><option key={p.id} value={p.id}>{p.label??p.id}</option>)}</select>)}<button type="button" onClick={()=>{interaction.cancel();const next=state.selected?editReferences3D(value,state.selected,references):null;if(next)commit(next);else setError('İstinadlar degenerativdir və ya asılılıq etibarsızdır.')}}>İstinadları tətbiq et</button></fieldset>}
      <button type="button" disabled={!canDelete} onClick={()=>run.current('delete')}>3D seçiləni sil</button></>}
    </details>
    {creatingSolid!=='regular_prism'&&creatingSolid!=='regular_pyramid'&&creatingSolid!=='regular_frustum'&&<details className="geometry-3d-metadata" data-geometry-transient=""><summary>Səhnə məlumatları</summary>
    <label>3D səhnə təsviri <input aria-label="3D səhnə təsviri" disabled={disabled} value={description} onChange={e => setDescription(e.target.value)} onBlur={() => commit({ ...value, description })} /></label>
    <fieldset disabled={disabled}><legend>Saxlanılan sual kamerasının mövqeyi</legend>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => <label key={axis}>{axis} <input type="number" aria-label={`Sual kamerası ${axis}`} value={camera[i]} onChange={e => setCamera(old => old.map((v, j) => j === i ? e.target.value : v))} /></label>)}
      <button type="button" onClick={() => {
        if (camera.some(v => !v.trim())) { setError('Kamera koordinatları tələb olunur.'); return }
        commit({ ...value, print_camera: { ...value.print_camera, position: camera.map(Number) as [number, number, number] } })
      }}>Sual görünüşünü tətbiq et</button>
    </fieldset>
    </details>}
    {error && <p role="alert">{error}</p>}
    {notice&&<p role="status" className="geometry-3d-notice" data-geometry-transient="">{notice}</p>}
    </>}/>
  </div>
}
