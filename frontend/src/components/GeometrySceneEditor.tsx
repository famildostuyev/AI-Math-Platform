import { useContext, useEffect, useRef, useState } from 'react'
import type { GeometryCamera3D, GeometryScene3D } from './geometry3dContract'
import { createGeometryHistory3D } from './geometry3dModel'
import { UniversalEditorSessionContext } from './universalEditorSession'
import GeometrySceneViewport from './GeometrySceneViewport'
import { standardView3D, type StandardView3D } from './geometry3dProjection'

export default function GeometrySceneEditor({ value, onChange, targetId, disabled }: {
  value: GeometryScene3D; onChange: (value: GeometryScene3D) => void; targetId: string; disabled: boolean
}) {
  const session = useContext(UniversalEditorSessionContext), sessionRef = useRef(session), changeRef = useRef(onChange)
  sessionRef.current = session; changeRef.current = onChange
  const [history] = useState(() => createGeometryHistory3D(value, next => changeRef.current(next)))
  const [editingCamera, setEditingCamera] = useState(() => structuredClone(session?.geometry3DCameras.current.get(targetId) ?? value.print_camera))
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
  const commit = (next: GeometryScene3D) => {
    if (JSON.stringify(next) === JSON.stringify(value)) { setError(''); return }
    if (!history.commit(next)) { setError('Dəyişiklik etibarsızdır və tətbiq edilmədi.'); setDescription(value.description); setCamera(value.print_camera.position.map(String)) }
    else setError('')
  }
  return <div className="geometry-3d-editor" onFocus={() => sessionRef.current?.activateGeometry(targetId)} onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault(); event.stopPropagation(); (event.shiftKey ? history.provider.redo : history.provider.undo)()
    }
  }}>
    <GeometrySceneViewport scene={value} camera={editingCamera} interactive={!disabled} onNavigate={navigate} />
    <div className="geometry-3d-controls" data-geometry-transient="">
      {([['front','Ön'],['back','Arxa'],['left','Sol'],['right','Sağ'],['top','Üst'],['bottom','Alt'],['isometric','İzometrik']] as [StandardView3D,string][]).map(([view,label]) => <button type="button" disabled={disabled} key={view} data-view={view} onClick={() => navigate(standardView3D(editingCamera,view))}>{label}</button>)}
      <button type="button" disabled={disabled} onClick={() => navigate(value.print_camera)}>Kameranı sıfırla</button>
      <button type="button" disabled={disabled} onClick={() => commit({ ...value, print_camera: structuredClone(editingCamera) })}>Sual üçün görünüşü təyin et</button>
    </div>
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
  </div>
}
