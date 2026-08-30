import { useCallback, useState } from 'react'
import type { GeometrySourceDataV1 } from '../api/questionEditor'
import GeometryAuthoringBoard from './GeometryAuthoringBoard'
import { addGeometryPolygon, addGeometrySegment, deleteGeometrySelection, renameGeometryPoint, updateGeometryTextContent, type GeometrySelection, type GeometryTool } from './geometryAuthoringModel'

type GeometryEditorProps = {
  value: GeometrySourceDataV1
  onChange: (value: GeometrySourceDataV1) => void
  disabled: boolean
}

const TOOL_LABELS: Record<GeometryTool, string> = {
  select: 'Seç / hərəkət etdir', point: 'Nöqtə', segment: 'Parça', polygon: 'Çoxbucaqlı', text: 'Mətn',
}

export default function GeometryEditor({ value, onChange, disabled }: GeometryEditorProps) {
  const [tool, setTool] = useState<GeometryTool>('select')
  const [selection, setSelection] = useState<GeometrySelection | null>(null)
  const [pendingPointIds, setPendingPointIds] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)

  const chooseTool = (nextTool: GeometryTool) => {
    setTool(nextTool); setSelection(null); setPendingPointIds([]); setMessage(null)
  }

  const handleObjectClick = useCallback((nextSelection: GeometrySelection) => {
    if (disabled) return
    if (tool === 'select') { setSelection(nextSelection); return }
    if (tool === 'text' && nextSelection.kind === 'text') { setSelection(nextSelection); return }
    if (nextSelection.kind !== 'point') return
    if (tool === 'segment') {
      setPendingPointIds((current) => {
        if (current.length === 0) return [nextSelection.id]
        if (current[0] === nextSelection.id) { setMessage('Parçanın ucları fərqli nöqtələr olmalıdır.'); return current }
        onChange(addGeometrySegment(value, current[0], nextSelection.id)); setMessage(null); return []
      })
      return
    }
    if (tool === 'polygon') setPendingPointIds((current) => current.includes(nextSelection.id) ? current : [...current, nextSelection.id])
  }, [disabled, onChange, tool, value])

  const finishPolygon = () => {
    const updated = addGeometryPolygon(value, pendingPointIds)
    if (updated === null) { setMessage('Çoxbucaqlı üçün ən azı üç fərqli nöqtə seçin.'); return }
    onChange(updated); setPendingPointIds([]); setMessage(null)
  }

  const deleteSelected = () => {
    if (selection === null) return
    onChange(deleteGeometrySelection(value, selection)); setSelection(null)
    setMessage(selection.kind === 'point' ? 'Nöqtə və ona bağlı parçalar/çoxbucaqlılar silindi.' : 'Seçilmiş obyekt silindi.')
  }

  const selectedPoint = selection?.kind === 'point' ? value.points.find((point) => point.id === selection.id) ?? null : null
  const selectedText = selection?.kind === 'text' ? value.texts.find((text) => text.id === selection.id) ?? null : null

  return <div className="geometry-editor">
    <label className="geometry-editor__description"><span>Əlçatan təsvir</span><textarea value={value.description} required disabled={disabled} onChange={(event) => onChange({ ...value, description: event.target.value })} /></label>
    <div className="geometry-editor__toolbar" role="toolbar" aria-label="Həndəsə alətləri">
      {(Object.keys(TOOL_LABELS) as GeometryTool[]).map((item) => <button key={item} type="button" className={tool === item ? 'active' : undefined} aria-pressed={tool === item} disabled={disabled} onClick={() => chooseTool(item)}>{TOOL_LABELS[item]}</button>)}
      <button type="button" className="danger" disabled={disabled || selection === null} onClick={deleteSelected}>Seçiləni sil</button>
    </div>
    <p className="geometry-editor__hint">{tool === 'point' ? 'Lövhədə boş yerə klikləyin.' : tool === 'text' ? 'Mətnin yerləşəcəyi boş yerə klikləyin.' : tool === 'segment' ? `İki nöqtə seçin (${pendingPointIds.length}/2).` : tool === 'polygon' ? `Nöqtələri sıra ilə seçin (${pendingPointIds.length} seçilib).` : 'Nöqtəni və ya mətni sürükləyin; silmək üçün obyekti seçin.'}</p>
    {tool === 'polygon' && <div className="geometry-editor__polygon-actions">
      <button type="button" disabled={disabled || pendingPointIds.length < 3} onClick={finishPolygon}>Çoxbucaqlını tamamla</button>
      <button type="button" className="secondary" disabled={disabled || pendingPointIds.length === 0} onClick={() => setPendingPointIds([])}>Seçimi təmizlə</button>
    </div>}
    <GeometryAuthoringBoard geometry={value} tool={tool} disabled={disabled} onChange={onChange} onObjectClick={handleObjectClick} />
    {selectedPoint && <label className="geometry-editor__label"><span>Seçilmiş nöqtənin nişanı</span><input value={selectedPoint.label ?? ''} maxLength={100} disabled={disabled} onChange={(event) => onChange(renameGeometryPoint(value, selectedPoint.id, event.target.value.trim() || null))} /></label>}
    {selectedText && <label className="geometry-editor__annotation"><span>Mətn annotasiyası</span><input value={selectedText.content} required maxLength={500} disabled={disabled} onChange={(event) => onChange(updateGeometryTextContent(value, selectedText.id, event.target.value))} /></label>}
    {message && <p className="geometry-editor__message" role="status">{message}</p>}
  </div>
}
