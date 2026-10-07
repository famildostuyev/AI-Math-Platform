import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { GeometryRibbonAction } from './geometryRibbonMenu'
import { UniversalEditorSessionContext } from './universalEditorSession'
import type { GeometrySourceDataV1, GeometryLinearSourceV1 } from '../api/questionEditor'
import GeometryAuthoringBoard from './GeometryAuthoringBoard'
import { canClosePolyline, commitGeometryLine, isLineTool, type GeometryVertex } from './geometryLineModel'
import { isTemplateTool, parseRegularSides, REGULAR_POLYGON_LIMITS } from './geometryTemplateContract'
import { commitGeometryTemplate } from './geometryTemplateModel'
import { circleRadius, commitGeometryCircle, isCircleTool } from './geometryCircleModel'
import { commitGeometryArc, isArcTool } from './geometryArcModel'
import { commitMidpoint, findMidpoint, commitLinearConstruction, findLinearConstruction, isLinearConstructionTool, commitIntersection, findIntersection, commitAngleBisector, findAngleBisector } from './geometryConstructionModel'
import { addGeometryPolygon, addGeometrySegment, deleteGeometrySelection, renameGeometryPoint, updateGeometryTextContent, type GeometrySelection, type GeometryTool } from './geometryAuthoringModel'
import { commitAltitude, findAltitude } from './geometryConstructionModel'
import { commitTriangleMedian } from './geometryConstructionModel'
import { createGeometryHistory } from './geometryHistoryModel'

type GeometryEditorProps = {
  frameSize?: { width: number; height: number }
  targetId?: string
  value: GeometrySourceDataV1
  onChange: (value: GeometrySourceDataV1) => void
  disabled: boolean
}

const TOOL_LABELS: Record<GeometryTool, string> = {
  median: 'Median',
  altitude: 'Hündürlük',
  parallel: 'Paralel', perpendicular: 'Perpendikulyar',
  midpoint: 'Orta nöqtə',
  intersection: 'Kəsişmə',
  angle_bisector: 'Tənbölən',
  circle: 'Çevrə', disk: 'Dairə',
  arc: 'Qövs', sector: 'Sektor',
  select: 'Seç / hərəkət etdir', point: 'Nöqtə', segment: 'Parça', polygon: 'Çoxbucaqlı', text: 'Mətn',
  line: 'Düz xətt', directed_line: 'İstiqamətlənmiş düz xətt', vector: 'Vektor', polyline: 'Sınıq xətt',
  triangle: 'Üçbucaq', right_triangle: 'Düzbucaqlı üçbucaq',
  rectangle: 'Düzbucaqlı', square: 'Kvadrat', parallelogram: 'Paraleloqram', rhombus: 'Romb', trapezoid: 'Trapesiya',
  regular_pentagon: 'Düzgün 5-bucaqlı', regular_hexagon: 'Düzgün 6-bucaqlı', regular_polygon: 'Düzgün n-bucaqlı',
}

export default function GeometryEditor({ value, onChange: publish, disabled, targetId, frameSize }: GeometryEditorProps) {
  const session = useContext(UniversalEditorSessionContext)
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session }, [session])
  const [tool, setTool] = useState<GeometryTool>('select')
  const [selection, setSelection] = useState<GeometrySelection | null>(null)
  const [pendingPointIds, setPendingPointIds] = useState<string[]>([])
  const [linearSource, setLinearSource] = useState<GeometryLinearSourceV1 | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [lineDraft, setLineDraft] = useState<GeometryVertex[]>([])
  const [regularSidesText, setRegularSidesText] = useState('7')
  const regularSides = parseRegularSides(regularSidesText)
  const publishRef = useRef(publish)
  useEffect(() => { publishRef.current = publish }, [publish])
  const historyRef = useRef<ReturnType<typeof createGeometryHistory> | null>(null)
  if (!historyRef.current) historyRef.current = createGeometryHistory(value, next => {
    setSelection(null); setPendingPointIds([]); setLineDraft([]); setLinearSource(null); setMessage(null); setTool('select')
    publishRef.current(next)
    if (targetId) sessionRef.current?.activateGeometry(targetId)
  })
  const history = historyRef.current
  useEffect(() => { history.setEnabled(!disabled) }, [history, disabled])
  const onChange = useCallback((next: GeometrySourceDataV1, editGroup?: string) => {
    if (!disabled && history.commit(next, editGroup)) publishRef.current(next)
  }, [disabled, history])
  useEffect(() => {
    if (!targetId) return
    // Setup must mirror cleanup: StrictMode replays both when entering Edit.
    sessionRef.current?.registerGeometryHistory(targetId, history.provider)
    sessionRef.current?.activateGeometry(targetId)
    return () => sessionRef.current?.unregisterGeometry(targetId)
  }, [targetId, history])

  const chooseTool = (nextTool: GeometryTool) => {
    history.endGroup()
    setTool(nextTool); setSelection(null); setPendingPointIds([]); setMessage(null)
    setLinearSource(null)
    setLineDraft([])
    if (targetId) sessionRef.current?.activateGeometry(targetId)
  }

  const handleObjectClick = useCallback((nextSelection: GeometrySelection) => {
    if (disabled) return
    if (tool === 'median') {
      if (nextSelection.kind !== 'point') return
      if (pendingPointIds.includes(nextSelection.id)) {
        setMessage('Median üçün üç fərqli nöqtə seçin: A, V, C.')
        return
      }
      const sources = [...pendingPointIds, nextSelection.id]
      if (sources.length < 3) {
        setPendingPointIds(sources)
        setMessage(sources.length === 1 ? 'İndi medianın təpəsi V-ni seçin.' : 'İndi qarşı tərəfin digər ucu C-ni seçin.')
        return
      }
      const [a, vertex, c] = sources
      const result = commitTriangleMedian(value, a, vertex, c)
      setPendingPointIds([])
      if (result.status === 'rejected') {
        setMessage('Eyni üçbucağın üç fərqli, bir düz xətt üzərində olmayan təpəsini seçin.')
        return
      }
      if (result.geometry !== value) onChange(result.geometry)
      const selected = { kind: 'segment' as const, id: result.outputSegmentId }
      setSelection(selected)
      setTool('select')
      setMessage(result.status === 'existing' ? 'Bu median artıq mövcuddur.' : null)
      if (targetId) sessionRef.current?.activateGeometry(targetId, selected)
      return
    }
    if (tool === 'altitude') {
      if (nextSelection.kind !== 'point') return
      if (pendingPointIds.includes(nextSelection.id)) { setMessage('Hündürlük üçün üç fərqli nöqtə seçin: A, V, C.'); return }
      const sources = [...pendingPointIds, nextSelection.id]
      if (sources.length < 3) { setPendingPointIds(sources); setMessage('Əvvəl A, sonra hündürlüyün təpəsi V, sonra C nöqtəsini seçin.'); return }
      const [a, vertex, c] = sources
      const existing = findAltitude(value, a, vertex, c)
      const next = commitAltitude(value, a, vertex, c)
      setPendingPointIds([])
      if (next === value && !existing) { setMessage('Eyni üçbucağın üç fərqli, bir düz xətt üzərində olmayan təpəsini seçin.'); return }
      if (next !== value) onChange(next)
      const recipe = findAltitude(next, a, vertex, c)!
      const selected = { kind: 'segment' as const, id: recipe.output_segment_id }
      setSelection(selected); setTool('select')
      setMessage(existing ? 'Bu hündürlük artıq mövcuddur.' : null)
      if (targetId) sessionRef.current?.activateGeometry(targetId, selected)
      return
    }
    if (tool === 'intersection') {
      let source: GeometryLinearSourceV1 | null = null

      if (nextSelection.kind === 'segment') {
        source = { kind: 'segment', id: nextSelection.id }
      } else if (nextSelection.kind === 'line') {
        const line = value.lines?.find(l => l.id === nextSelection.id)
        if (line) source = { kind: line.kind, id: line.id }
      }

      if (!source) return

      if (!linearSource) {
        setLinearSource(source)
        setMessage(null)
        return
      }

      const existing = findIntersection(value, linearSource, source)
      const next = commitIntersection(value, linearSource, source)

      if (next === value && !existing) {
        setMessage('Kəsişən iki fərqli xətt, parça və ya vektor seçin.')
        return
      }

      if (next !== value) onChange(next)

      const id = findIntersection(next, linearSource, source)!.output_point_id
      setSelection({ kind: 'point', id })
      setLinearSource(null)
      setTool('select')
      setMessage(existing ? 'Bu kəsişmə nöqtəsi artıq mövcuddur.' : null)

      if (targetId) {
        sessionRef.current?.activateGeometry(
          targetId,
          { kind: 'point', id },
        )
      }
      return
    }

    if (tool === 'angle_bisector') {
      if (nextSelection.kind !== 'point') return

      const nextPointIds = [...pendingPointIds, nextSelection.id]

      if (
        nextPointIds.length > 1
        && nextPointIds.slice(0, -1).includes(nextSelection.id)
      ) {
        setMessage('Tənbölən üçün üç fərqli nöqtə seçin.')
        return
      }

      if (nextPointIds.length < 3) {
        setPendingPointIds(nextPointIds)
        setMessage(null)
        return
      }

      const [aId, vertexId, cId] = nextPointIds
      const existing = findAngleBisector(value, aId, vertexId, cId)
      const next = commitAngleBisector(value, aId, vertexId, cId)

      if (next === value && !existing) {
        setMessage('Etibarlı bucaq yaradan üç fərqli nöqtə seçin.')
        setPendingPointIds([])
        return
      }

      if (next !== value) onChange(next)

      const id = findAngleBisector(next, aId, vertexId, cId)!.output_line_id
      setSelection({ kind: 'line', id })
      setPendingPointIds([])
      setTool('select')
      setMessage(existing ? 'Bu bucağın tənböləni artıq mövcuddur.' : null)

      if (targetId) {
        sessionRef.current?.activateGeometry(
          targetId,
          { kind: 'line', id },
        )
      }
      return
    }

    if (isLinearConstructionTool(tool)) {
      if (!linearSource) {
        if (nextSelection.kind === 'segment') setLinearSource({ kind:'segment',id:nextSelection.id })
        else if (nextSelection.kind === 'line') {
          const line=value.lines?.find(l=>l.id===nextSelection.id)
          if(line)setLinearSource({kind:line.kind,id:line.id})
        }
        return
      }
      if(nextSelection.kind!=='point')return
      const existing=findLinearConstruction(value,tool,linearSource,nextSelection.id)
      const next=commitLinearConstruction(value,tool,linearSource,nextSelection.id)
      if(next===value&&!existing){setMessage('Etibarlı istiqamət və mövcud nöqtə seçin.');return}
      if(next!==value)onChange(next)
      const id=findLinearConstruction(next,tool,linearSource,nextSelection.id)!.output_line_id
      setSelection({kind:'line',id});setLinearSource(null);setTool('select')
      setMessage(existing?'Bu konstruksiya artıq mövcuddur.':null)
      if(targetId)sessionRef.current?.activateGeometry(targetId,{kind:'line',id})
      return
    }
    if (tool === 'midpoint') {
      let sources: [string, string] | null = null
      if (nextSelection.kind === 'segment') {
        const segment = value.segments.find(s => s.id === nextSelection.id)
        if (segment) sources = [segment.start_point_id, segment.end_point_id]
      } else if (nextSelection.kind === 'point') {
        if (!pendingPointIds.length) { setPendingPointIds([nextSelection.id]); return }
        sources = [pendingPointIds[0], nextSelection.id]
      }
      if (!sources) return
      const existing = findMidpoint(value, ...sources)
      const next = commitMidpoint(value, ...sources)
      if (next === value && !existing) { setMessage('İki fərqli, üst-üstə düşməyən nöqtə seçin.'); return }
      if (next !== value) onChange(next)
      const id = findMidpoint(next, ...sources)!.output_point_id
      setSelection({ kind: 'point', id }); setPendingPointIds([]); setTool('select')
      setMessage(existing ? 'Bu nöqtələr üçün orta nöqtə artıq mövcuddur.' : null)
      if (targetId) sessionRef.current?.activateGeometry(targetId, { kind: 'point', id })
      return
    }
    if (tool === 'select') { setSelection(nextSelection); if (targetId) sessionRef.current?.activateGeometry(targetId, nextSelection); return }
    if (tool === 'text' && nextSelection.kind === 'text') { setSelection(nextSelection); if (targetId) sessionRef.current?.activateGeometry(targetId, nextSelection); return }
    if (nextSelection.kind !== 'point') return
    if (tool === 'segment') {
      if (pendingPointIds.length === 0) { setPendingPointIds([nextSelection.id]); return }
      if (pendingPointIds[0] === nextSelection.id) { setMessage('Parçanın ucları fərqli nöqtələr olmalıdır.'); return }
      onChange(addGeometrySegment(value, pendingPointIds[0], nextSelection.id))
      setMessage(null); setPendingPointIds([])
      return
    }
    if (tool === 'polygon') setPendingPointIds((current) => current.includes(nextSelection.id) ? current : [...current, nextSelection.id])
  }, [disabled, onChange, pendingPointIds, linearSource, targetId, tool, value])

  const finishPolygon = () => {
    const updated = addGeometryPolygon(value, pendingPointIds)
    if (updated === null) { setMessage('Çoxbucaqlı üçün ən azı üç fərqli nöqtə seçin.'); return }
    onChange(updated); setPendingPointIds([]); setMessage(null)
  }

  const cancelLine = () => { setLineDraft([]); setPendingPointIds([]); setLinearSource(null); setMessage(null) }
  const finishLine = () => {
    if (disabled || tool !== 'polyline' || lineDraft.length < 2) return
    const next = commitGeometryLine(value, tool, lineDraft)
    if (next !== value) { onChange(next); setLineDraft([]); setMessage(null) }
  }
  const lineClick = (vertex: GeometryVertex) => {
    if (!disabled && isArcTool(tool)) {
      if (targetId) sessionRef.current?.activateGeometry(targetId)
      if (lineDraft.length === 0) { setLineDraft([vertex]); return }
      if (lineDraft.length === 1) {
        if (circleRadius(lineDraft[0], vertex) === null) { setMessage('Radiusu artırın.'); return }
        setLineDraft([...lineDraft, vertex]); setMessage(null); return
      }
      const next = commitGeometryArc(value, tool, lineDraft[0], lineDraft[1], vertex)
      if (next === value) { setMessage('Fərqli son istiqamət seçin.'); return }
      onChange(next); setLineDraft([]); setTool('select'); setMessage(null)
      const created = { kind: 'arc' as const, id: next.arcs!.at(-1)!.id }
      setSelection(created)
      if (targetId) sessionRef.current?.activateGeometry(targetId, created)
      return
    }
    if (!disabled && isCircleTool(tool)) {
      if (targetId) sessionRef.current?.activateGeometry(targetId)
      if (lineDraft.length === 0) { setLineDraft([vertex]); return }
      const next = commitGeometryCircle(value, tool, lineDraft[0], vertex)
      if (next === value) { setMessage('Radiusu artırın.'); return }
      onChange(next); setLineDraft([]); setTool('select'); setMessage(null)
      const created = { kind: 'circle' as const, id: next.circles!.at(-1)!.id }
      setSelection(created)
      if (targetId) sessionRef.current?.activateGeometry(targetId, created)
      return
    }
    if (!disabled && isTemplateTool(tool)) {
      if (tool === 'regular_polygon' && regularSides === null) return
      if (targetId) sessionRef.current?.activateGeometry(targetId)
      if (lineDraft.length === 0) { setLineDraft([vertex]); return }
      const next = commitGeometryTemplate(value, tool, lineDraft[0], vertex, regularSides ?? undefined)
      if (next === value) { setMessage('Fiqurun ölçüsünü artırın.'); return }
      onChange(next); setLineDraft([]); setTool('select'); setMessage(null)
      const created = { kind: 'polygon' as const, id: next.polygons.at(-1)!.id }
      setSelection(created)
      if (targetId) sessionRef.current?.activateGeometry(targetId, created)
      return
    }
    if (disabled || !isLineTool(tool)) return
    if (targetId) sessionRef.current?.activateGeometry(targetId)
    if (tool === 'polyline' && canClosePolyline(lineDraft, vertex)) {
      const next = commitGeometryLine(value, tool, lineDraft, true)
      if (next !== value) { onChange(next); setLineDraft([]) }
      return
    }
    if (lineDraft.some(p => (p.x === vertex.x && p.y === vertex.y) || (p.pointId && p.pointId === vertex.pointId))) return
    const nextDraft = [...lineDraft, vertex]
    if (tool !== 'polyline' && nextDraft.length === 2) {
      const next = commitGeometryLine(value, tool, nextDraft)
      if (next !== value) { onChange(next); setLineDraft([]) }
    } else setLineDraft(nextDraft)
  }

  const deleteSelected = () => {
    if (selection === null) return
    onChange(deleteGeometrySelection(value, selection)); setSelection(null)
    if (targetId) sessionRef.current?.activateGeometry(targetId)
    setMessage(selection.kind === 'point' ? 'Nöqtə və ona bağlı parçalar/çoxbucaqlılar silindi.' : 'Seçilmiş obyekt silindi.')
  }

  const selectedPoint = selection?.kind === 'point' ? value.points.find((point) => point.id === selection.id) ?? null : null
  const selectedText = selection?.kind === 'text' ? value.texts.find((text) => text.id === selection.id) ?? null : null

  const ribbonAction = useRef<(action: GeometryRibbonAction) => void>(() => {})
  useEffect(() => {
    ribbonAction.current = (action) => {
      const active = sessionRef.current?.getActiveContext()
      if (disabled || active?.kind !== 'geometry' || active.id !== targetId) return
      if (action === 'delete') deleteSelected()
      else chooseTool(action)
    }
  })
  const setGeometryCommands = session?.setGeometryCommands
  useEffect(() => {
    if (!targetId || !setGeometryCommands) return
    setGeometryCommands({ id: targetId, tool, disabled, canDelete: selection !== null, run: action => ribbonAction.current(action) })
    return () => setGeometryCommands(current => current?.id === targetId ? null : current)
  }, [targetId, tool, disabled, selection, setGeometryCommands])

  const toolbar = <div className="geometry-editor__toolbar" role="toolbar" aria-label="Həndəsə alətləri">
      {(Object.keys(TOOL_LABELS) as GeometryTool[]).map((item) => <button key={item} type="button" className={tool === item ? 'active' : undefined} aria-pressed={tool === item} disabled={disabled} onClick={() => chooseTool(item)}>{TOOL_LABELS[item]}</button>)}
      <button type="button" className="danger" disabled={disabled || selection === null} onClick={deleteSelected}>Seçiləni sil</button>
    </div>
  return <div className={`geometry-editor${frameSize ? ' geometry-editor--framed' : ''}`}>
    {tool === 'regular_polygon' && <div data-frame-chrome="" className="geometry-editor__regular-parameter" style={{ position: 'absolute', top: 8, right: 8, zIndex: 4, background: 'white', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') cancelLine() }}>
      <label>Tərəflərin sayı (n) <input aria-label="Tərəflərin sayı (n)" inputMode="numeric" value={regularSidesText} disabled={disabled} aria-invalid={regularSides === null} style={{ width: 60 }} onChange={event => { setRegularSidesText(event.target.value); setLineDraft([]) }} /></label>
      {regularSides === null && <div role="status">{REGULAR_POLYGON_LIMITS.minSides}–{REGULAR_POLYGON_LIMITS.maxSides} arası tam ədəd daxil edin.</div>}
    </div>}
    {!session?.geometryToolbarHost && toolbar}
    {frameSize && <GeometryAuthoringBoard linearSource={linearSource} midpointSource={pendingPointIds[0]} geometry={value} tool={tool} disabled={disabled} onChange={onChange} onObjectClick={handleObjectClick} frameSize={frameSize} lineDraft={lineDraft} regularSides={regularSides ?? undefined} onLineClick={lineClick} onFinishLine={finishLine} onCancelLine={cancelLine} />}
    <div className={frameSize ? 'geometry-editor__frame-controls' : undefined} data-frame-chrome={frameSize ? '' : undefined}>
    <label className="geometry-editor__description"><span>Əlçatan təsvir</span><textarea value={value.description} required disabled={disabled} onBlur={() => history.endGroup()} onChange={(event) => onChange({ ...value, description: event.target.value }, 'description')} /></label>
    {!isLineTool(tool) && !isTemplateTool(tool) && !isCircleTool(tool) && !isArcTool(tool) && <p className="geometry-editor__hint">{isLinearConstructionTool(tool) ? (linearSource ? 'Xəttin keçəcəyi mövcud nöqtəni seçin. Escape ilə ləğv edin.' : 'Mənbə xətt, parça və ya vektor seçin.') : tool === 'midpoint' ? 'İki mövcud nöqtə və ya bir parça seçin. Escape ilə ləğv edin.' : tool === 'point' ? 'Lövhədə boş yerə klikləyin.' : tool === 'text' ? 'Mətnin yerləşəcəyi boş yerə klikləyin.' : tool === 'segment' ? `İki nöqtə seçin (${pendingPointIds.length}/2).` : tool === 'polygon' ? `Nöqtələri sıra ilə seçin (${pendingPointIds.length} seçilib).` : 'Nöqtəni və ya mətni sürükləyin; silmək üçün obyekti seçin.'}</p>}
    {isArcTool(tool) && <div className="geometry-editor__line-actions">
      <p>Mərkəzi, sonra radius və başlanğıcı seçin. Son istiqaməti üçüncü kliklə təsdiqləyin. Qövs saat istiqamətində çəkilir. Escape ilə ləğv edin.</p>
      <button type="button" disabled={disabled || lineDraft.length === 0} onClick={cancelLine}>Çəkilişi ləğv et</button>
    </div>}
    {(isTemplateTool(tool) || isCircleTool(tool)) && <div className="geometry-editor__line-actions">
      <p>Başlanğıcı seçin, ölçü və istiqaməti ikinci kliklə təsdiqləyin. Escape ilə ləğv edin.</p>
      <button type="button" disabled={disabled || lineDraft.length === 0} onClick={cancelLine}>Çəkilişi ləğv et</button>
    </div>}
    {isLineTool(tool) && <div className="geometry-editor__line-actions">
      <p>{tool === 'polyline' ? 'Kliklə təpələr əlavə edin. Enter ilə tamamlayın; bağlamaq üçün başlanğıca yaxın klikləyin. Escape ilə cari çəkilişi ləğv edin.' : 'İki nöqtə və ya yer seçin. Escape ilə cari çəkilişi ləğv edin.'}</p>
      {tool === 'polyline' && <button type="button" disabled={disabled || lineDraft.length < 2} onClick={finishLine}>Sınıq xətti tamamla</button>}
      <button type="button" disabled={disabled || lineDraft.length === 0} onClick={cancelLine}>Çəkilişi ləğv et</button>
    </div>}
    {tool === 'polygon' && <div className="geometry-editor__polygon-actions">
      <button type="button" disabled={disabled || pendingPointIds.length < 3} onClick={finishPolygon}>Çoxbucaqlını tamamla</button>
      <button type="button" className="secondary" disabled={disabled || pendingPointIds.length === 0} onClick={() => setPendingPointIds([])}>Seçimi təmizlə</button>
    </div>}
    {!frameSize && <GeometryAuthoringBoard linearSource={linearSource} midpointSource={pendingPointIds[0]} geometry={value} tool={tool} disabled={disabled} onChange={onChange} onObjectClick={handleObjectClick} lineDraft={lineDraft} regularSides={regularSides ?? undefined} onLineClick={lineClick} onFinishLine={finishLine} onCancelLine={cancelLine} />}
    {selectedPoint && <label className="geometry-editor__label"><span>Seçilmiş nöqtənin nişanı</span><input value={selectedPoint.label ?? ''} maxLength={100} disabled={disabled} onBlur={() => history.endGroup()} onChange={(event) => onChange(renameGeometryPoint(value, selectedPoint.id, event.target.value.trim() || null), `label:${selectedPoint.id}`)} /></label>}
    {selectedText && <label className="geometry-editor__annotation"><span>Mətn annotasiyası</span><input value={selectedText.content} required maxLength={500} disabled={disabled} onBlur={() => history.endGroup()} onChange={(event) => onChange(updateGeometryTextContent(value, selectedText.id, event.target.value), `text:${selectedText.id}`)} /></label>}
    {message && <p className="geometry-editor__message" role="status">{message}</p>}
    </div>
  </div>
}
