import { useEffect, useId, useRef } from 'react'
import JXG from 'jsxgraph'
import { canClosePolyline, clipInfiniteLine, isLineTool, type GeometryVertex } from './geometryLineModel'
import { isTemplateTool } from './geometryTemplateContract'
import { templateVertices } from './geometryTemplateModel'
import { circleRadius, isCircleTool } from './geometryCircleModel'
import { arcFromPointers, isArcTool } from './geometryArcModel'
import { CONSTRUCTION_LIMITS, isDerivedPoint, midpointCoordinates, isLinearConstructionTool, linearSourceObject, linearSupportCoordinates, altitudePresentation } from './geometryConstructionModel'
import { geometryFrameMetrics, GEOMETRY_FRAME_SCALE, GEOMETRY_FRAME_FONT } from './geometryFrameModel'
import type { GeometryArcV1, GeometrySourceDataV1, GeometryLinearSourceV1 } from '../api/questionEditor'
import { addGeometryPoint, addGeometryText, boardYFromGeometry, geometryYFromBoard, moveGeometryPoint, moveGeometryText, type GeometrySelection, type GeometryTool } from './geometryAuthoringModel'

type GeometryAuthoringBoardProps = {
  midpointSource?: string
  linearSource?: GeometryLinearSourceV1 | null
  regularSides?: number
  lineDraft?: GeometryVertex[]
  onLineClick?: (vertex: GeometryVertex) => void
  onFinishLine?: () => void
  onCancelLine?: () => void
  frameSize?: { width: number; height: number }
  geometry: GeometrySourceDataV1
  tool: GeometryTool
  disabled: boolean
  onChange: (geometry: GeometrySourceDataV1) => void
  onObjectClick: (selection: GeometrySelection) => void
}

const POINT_ATTRIBUTES = Object.freeze({ size: 4, face: 'o', fillColor: '#ffffff', strokeColor: '#1f2937', highlightFillColor: '#dbeafe', highlightStrokeColor: '#1d4ed8' })
const SEGMENT_ATTRIBUTES = Object.freeze({ strokeColor: '#374151', strokeWidth: 2, highlightStrokeColor: '#1d4ed8', layer: 5 })
const POLYGON_ATTRIBUTES: Readonly<JXG.PolygonAttributes> = Object.freeze({ fillColor: 'none', fillOpacity: 0, strokeColor: '#374151', highlightFillColor: 'none', highlightStrokeColor: '#1d4ed8', hasInnerPoints: true, borders: { strokeColor: '#374151', layer: 5 } })
const TEXT_ATTRIBUTES = Object.freeze({ display: 'internal' as const, parse: false, useMathJax: false, fontSize: 16, color: '#111827', highlightColor: '#1d4ed8', dragArea: 'all' as const })

export default function GeometryAuthoringBoard({ geometry, tool, disabled, onChange, onObjectClick, frameSize, lineDraft, regularSides, midpointSource, linearSource, onLineClick, onFinishLine, onCancelLine }: GeometryAuthoringBoardProps) {
  const reactId = useId()
  const boardId = `geometry-board-${reactId.replace(/:/g, '')}`
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Selection updates parent callbacks; keep a live bridge without rebuilding an active drag.
  const callbacks = useRef({ onChange, onObjectClick, onLineClick })
  useEffect(() => { callbacks.current = { onChange, onObjectClick, onLineClick } }, [onChange, onObjectClick, onLineClick])

  const frameWidth = frameSize?.width, frameHeight = frameSize?.height
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const onChange = (next: GeometrySourceDataV1) => callbacks.current.onChange(next)
    const onObjectClick = (selection: GeometrySelection) => { if (tool !== 'midpoint' && !isLinearConstructionTool(tool)) callbacks.current.onObjectClick(selection) }
    const { min_x: minX, min_y: minY, width, height } = geometry.viewport
    const metrics = geometryFrameMetrics(geometry)
    const framed = frameWidth !== undefined && frameHeight !== undefined
    const board = JXG.JSXGraph.initBoard(container, {
      boundingbox: framed ? [metrics.originX, boardYFromGeometry(geometry, metrics.originY), metrics.originX + frameWidth / GEOMETRY_FRAME_SCALE, boardYFromGeometry(geometry, metrics.originY + frameHeight / GEOMETRY_FRAME_SCALE)] : [minX, minY + height, minX + width, minY], axis: false, grid: true,
      showNavigation: false, showCopyright: false, pan: { enabled: false }, zoom: { wheel: false },
      resize: { enabled: !framed, throttle: 100 },
    })
    // JSXGraph caches the screen origin for up to a second. A persistent board must
    // refresh it after document scrolling or frame movement before hit testing.
    const refreshScreenOrigin = () => { board.cPos = [] }
    window.addEventListener('scroll', refreshScreenOrigin, true)
    container.addEventListener('pointerdown', refreshScreenOrigin, true)
    const pointElements = new Map<string, JXG.Point>()
    const { hiddenFootIds, extensions } = altitudePresentation(geometry)
    const hiddenSupportIds = new Set((geometry.constructions ?? []).filter(c => c.kind === 'angle_bisector').map(c => c.support_point_id))
    geometry.points.forEach((point) => {
      if (hiddenFootIds.has(point.id)) hiddenSupportIds.add(point.id)
      const element = board.create('point', [point.x, boardYFromGeometry(geometry, point.y)], { ...POINT_ATTRIBUTES, visible: !hiddenSupportIds.has(point.id), name: point.label ?? '', label: { fontSize: framed ? GEOMETRY_FRAME_FONT : 12, offset: [10, 10] }, fixed: disabled || tool !== 'select' || isDerivedPoint(geometry, point.id) })
      let dragged = false
      element.rendNode?.setAttribute('data-geometry-point-id', point.id)
      element.on('down', () => {
        dragged = false
        if (tool === 'median' || !isDerivedPoint(geometry, point.id) || (geometry.constructions ?? []).some(c => (c.kind === 'angle_bisector' && c.intersection_point_id === point.id) || (c.kind === 'altitude' && c.foot_point_id === point.id) || (c.kind === 'median' && c.midpoint_point_id === point.id))) {
          onObjectClick({ kind: 'point', id: point.id })
        }
      })
      element.on('drag', () => { dragged = true })
      element.on('up', () => {
        if (dragged && !disabled && tool === 'select' && !isDerivedPoint(geometry, point.id)) {
          const next = moveGeometryPoint(geometry, point.id, element.X(), geometryYFromBoard(geometry, element.Y()))
          if (next === geometry) { element.setPosition(JXG.COORDS_BY_USER, [point.x, boardYFromGeometry(geometry, point.y)]); board.update() }
          else onChange(next)
        }
      })
      pointElements.set(point.id, element)
    })
    const boundary = framed
      ? { x: metrics.originX + 4, y: metrics.originY + 4, width: frameWidth / GEOMETRY_FRAME_SCALE - 8, height: frameHeight / GEOMETRY_FRAME_SCALE - 8 }
      : { x: minX, y: minY, width, height }
    const drawLine = (a: GeometryVertex, b: GeometryVertex, kind: string, transient = false) => {
      const ends = kind === 'line' || kind === 'directed_line' ? clipInfiniteLine(a, b, boundary) : [a, b]
      if (!ends) return null
      const element = board.create('segment', ends.map(p => [p.x, boardYFromGeometry(geometry, p.y)]), {
        ...SEGMENT_ATTRIBUTES, fixed: true, lastArrow: kind === 'vector' || kind === 'directed_line',
        strokeColor: transient ? '#6d4bd1' : '#374151', highlight: !transient,
      })
      if (transient) {
        element.rendNode?.setAttribute('data-geometry-transient', '')
        const arrows = element as unknown as { rendNodeTriangleEnd?: Element; rendNodeTriangleStart?: Element }
        arrows.rendNodeTriangleEnd?.setAttribute('data-geometry-transient', '')
        arrows.rendNodeTriangleStart?.setAttribute('data-geometry-transient', '')
      }
      else element.rendNode?.setAttribute('data-geometry-kind', kind)
      return element
    }
    const linearElements = new Map<string, JXG.Line>()
    for (const line of geometry.lines ?? []) {
      const a = geometry.points.find(p => p.id === line.start_point_id), b = geometry.points.find(p => p.id === line.end_point_id)
      const element = a && b ? drawLine(a,b,line.kind) : null
      if(element){linearElements.set(line.id,element);element.rendNode?.setAttribute('data-geometry-line-id',line.id);element.on('down',()=>onObjectClick({kind:'line',id:line.id}))}
    }
    for (const polyline of geometry.polylines ?? []) {
      const vertices = polyline.point_ids.map(id => geometry.points.find(p => p.id === id)!)
      vertices.slice(1).forEach((b, i) => drawLine(vertices[i], b, 'polyline')?.on('down', () => onObjectClick({ kind: 'polyline', id: polyline.id })))
    }
    const draft = lineDraft ?? []
    const draftPoints = draft.map(p => {
      const point = board.create('point', [p.x, boardYFromGeometry(geometry, p.y)], { ...POINT_ATTRIBUTES, name: '', fixed: true, highlight: false })
      point.rendNode?.setAttribute('data-geometry-transient', '')
      return point
    })
    draft.slice(1).forEach((b, i) => drawLine(draft[i], b, 'polyline', true))
    let preview: ReturnType<typeof drawLine> = null
    let templatePreview: JXG.Polygon | null = null
    let circlePreview: JXG.Circle | null = null
    const drawArc = (center: JXG.Point, definition: Pick<GeometryArcV1, 'kind' | 'radius' | 'start_angle' | 'sweep_angle'>, transient = false) => {
      const { kind, radius, start_angle: start, sweep_angle: sweep } = definition
      const helpers = [start + sweep, start].map(angle => {
        const point = board.create('point', [() => center.X() + radius * Math.cos(angle), () => center.Y() - radius * Math.sin(angle)], { visible: false, withLabel: false, fixed: true })
        point.rendNode?.setAttribute('data-geometry-helper', '')
        return point
      })
      // JSXGraph is y-up and counterclockwise: reversed endpoint order draws the
      // same selected sweep as the semantic clockwise, y-down SVG path.
      const attributes: JXG.ArcAttributes & { arc: { visible: boolean } } = { selection: 'auto', fixed: true, strokeWidth: 2, strokeColor: transient ? '#6d4bd1' : '#374151', fillColor: kind === 'sector' ? '#e5e7eb' : 'none', fillOpacity: kind === 'sector' ? 0.45 : 0, hasInnerPoints: kind === 'sector', highlight: !transient, highlightStrokeColor: '#1d4ed8', layer: 4, arc: { visible: false } }
      const element = kind === 'sector' ? board.create('sector', [center, ...helpers], attributes) : board.create('arc', [center, ...helpers], attributes)
      if (kind === 'sector' && !transient) {
        element.setAttribute({ layer: 1, strokeOpacity: 0 })
        board.create('sector', [center, ...helpers], { ...attributes, layer: 5, fillColor: 'none', fillOpacity: 0, hasInnerPoints: false, highlight: false })
      } else element.setAttribute({ layer: 5 })
      if (transient) {
        for (const object of [element, ...helpers]) object.rendNode?.setAttribute('data-geometry-transient', '')
        element.rendNode?.setAttribute('data-geometry-arc-preview', kind)
      } else element.rendNode?.setAttribute('data-geometry-kind', kind)
      return { element, helpers }
    }
    let arcPreview: ReturnType<typeof drawArc> | null = null
    for (const arc of geometry.arcs ?? []) {
      const center = pointElements.get(arc.center_point_id)
      if (!center) continue
      const { element } = drawArc(center, arc)
      element.rendNode?.setAttribute('data-geometry-id', arc.id)
      element.on('down', () => onObjectClick({ kind: 'arc', id: arc.id }))
    }
    const circleAttributes = (kind: string, transient = false): JXG.CircleAttributes => ({ strokeColor: transient ? '#6d4bd1' : '#374151', strokeWidth: 2, fillColor: kind === 'disk' ? '#e5e7eb' : 'none', fillOpacity: kind === 'disk' ? 0.45 : 0, highlightStrokeColor: '#1d4ed8', hasInnerPoints: kind === 'disk', fixed: true, highlight: !transient, layer: 4 })
    for (const circle of geometry.circles ?? []) {
      const center = pointElements.get(circle.center_point_id)
      if (!center) continue
      const element = board.create('circle', [center, circle.radius], circleAttributes(circle.kind))
      if (circle.kind === 'disk') {
        element.setAttribute({ layer: 1, strokeOpacity: 0 })
        board.create('circle', [center, circle.radius], { ...circleAttributes('circle'), layer: 5, highlight: false })
      } else element.setAttribute({ layer: 5 })
      element.rendNode?.setAttribute('data-geometry-kind', circle.kind)
      element.rendNode?.setAttribute('data-geometry-id', circle.id)
      element.on('down', () => onObjectClick({ kind: 'circle', id: circle.id }))
    }
    board.on('move', event => {
      if (disabled || (!isLineTool(tool) && !isTemplateTool(tool) && !isCircleTool(tool) && !isArcTool(tool)) || draft.length === 0) return
      const [x, y] = board.getUsrCoordsOfMouse(event)
      const pointer = { x, y: geometryYFromBoard(geometry, y) }
      if (isArcTool(tool) && draft.length === 2) {
        if (arcPreview) { board.removeObject([arcPreview.element, ...arcPreview.helpers]); arcPreview = null }
        const definition = arcFromPointers(draft[0], draft[1], pointer)
        if (definition) arcPreview = drawArc(draftPoints[0], { kind: tool, ...definition }, true)
        return
      }
      if (isCircleTool(tool) || isArcTool(tool)) {
        if (circlePreview) { board.removeObject(circlePreview); circlePreview = null }
        const radius = circleRadius(draft[0], pointer)
        if (radius === null) return
        circlePreview = board.create('circle', [draftPoints[0], radius], circleAttributes(tool, true))
        circlePreview.rendNode?.setAttribute('data-geometry-transient', '')
        circlePreview.rendNode?.setAttribute('data-geometry-circle-preview', tool)
        return
      }
      if (isTemplateTool(tool)) {
        if (templatePreview) { board.removeObject([...templatePreview.vertices]); templatePreview = null }
        const vertices = templateVertices(tool, draft[0], pointer, regularSides)
        if (!vertices) return
        templatePreview = board.create('polygon', vertices.map(p => [p.x, boardYFromGeometry(geometry, p.y)]), {
          ...POLYGON_ATTRIBUTES, fixed: true, highlight: false,
          vertices: { visible: false, withLabel: false, fixed: true },
          borders: { strokeColor: '#6d4bd1', highlight: false },
        })
        // JSXGraph exposes polygon borders at runtime, but omits them from its Polygon declaration.
        const borders = (templatePreview as JXG.Polygon & { borders: JXG.Line[] }).borders
        for (const element of [templatePreview, ...borders, ...templatePreview.vertices]) element.rendNode?.setAttribute('data-geometry-transient', '')
        templatePreview.rendNode?.setAttribute('data-geometry-template-preview', tool)
        return
      }
      const closing = tool === 'polyline' && canClosePolyline(draft, pointer)
      draftPoints[0]?.setAttribute({ size: closing ? 7 : 4, fillColor: closing ? '#c4b5fd' : '#ffffff' })
      draftPoints[0]?.rendNode?.setAttribute('data-geometry-closure', String(closing))
      if (preview) board.removeObject([preview.point1, preview.point2])
      preview = drawLine(draft[draft.length - 1], closing ? draft[0] : pointer, tool, true)
      preview?.rendNode?.setAttribute('data-geometry-preview', '')
    })
    geometry.polygons.forEach((polygon) => {
      const vertices = polygon.point_ids.map((id) => pointElements.get(id)).filter((point): point is JXG.Point => point !== undefined)
      if (vertices.length !== polygon.point_ids.length) return
      const element = board.create('polygon', vertices, { ...POLYGON_ATTRIBUTES, fixed: true })
      element.on('down', () => onObjectClick({ kind: 'polygon', id: polygon.id }))
    })
    const segmentElements = new Map<string, JXG.Line>()
    geometry.segments.forEach((segment) => {
      const start = pointElements.get(segment.start_point_id)
      const end = pointElements.get(segment.end_point_id)
      if (!start || !end) return
      const element = board.create('segment', [start, end], { ...SEGMENT_ATTRIBUTES, fixed: true })
      segmentElements.set(segment.id, element)
      element.rendNode?.setAttribute('data-geometry-segment-id', segment.id)
      element.on('down', () => onObjectClick({ kind: 'segment', id: segment.id }))
    })
    for (const extension of extensions) {
      const element = board.create('segment', [[extension.start.x, boardYFromGeometry(geometry, extension.start.y)], [extension.end.x, boardYFromGeometry(geometry, extension.end.y)]], { ...SEGMENT_ATTRIBUTES, fixed: true, dash: 2, highlight: false })
      element.rendNode?.setAttribute('data-geometry-altitude-extension', extension.id)
    }
    geometry.texts.forEach((text) => {
      const element = board.create('text', [text.x, boardYFromGeometry(geometry, text.y), text.content], {
        ...TEXT_ATTRIBUTES, cssStyle: 'font-family:Arial', fixed: disabled || tool !== 'select',
      })
      let dragged = false
      element.on('down', () => { dragged = false; onObjectClick({ kind: 'text', id: text.id }) })
      element.on('drag', () => { dragged = true })
      element.on('up', () => {
        if (dragged && !disabled && tool === 'select') onChange(moveGeometryText(geometry, text.id, element.X(), geometryYFromBoard(geometry, element.Y())))
      })
    })
    let midpointPreview: JXG.Point | null = null
    let constructionPreview: JXG.Line | null = null
    if(isLinearConstructionTool(tool)&&!disabled)board.on('move',event=>{
      if(constructionPreview){board.removeObject([constructionPreview,constructionPreview.point1,constructionPreview.point2]);constructionPreview=null}
      const hit=board.getAllObjectsUnderMouse(event)
      const hoverLine=geometry.lines?.find(l=>hit.includes(linearElements.get(l.id)!))
      const hoverSegment=geometry.segments.find(s=>hit.includes(segmentElements.get(s.id)!))
      const source=linearSource?linearSourceObject(geometry,linearSource):hoverLine??hoverSegment
      if(!source)return
      const a=geometry.points.find(p=>p.id===source.start_point_id)!,b=geometry.points.find(p=>p.id===source.end_point_id)!
      if(!linearSource){
        constructionPreview=drawLine(a,b,hoverLine?.kind??'segment',true)
        constructionPreview?.rendNode?.setAttribute('data-geometry-source-preview','')
        return
      }
      const p=geometry.points.find(p=>hit.includes(pointElements.get(p.id)!))
      if(!p)return
      const q=linearSupportCoordinates(a,b,p,tool)
      if(!q)return
      constructionPreview=drawLine(p,q,'line',true)
      constructionPreview?.rendNode?.setAttribute('data-geometry-construction-preview',tool)
    })
    if (tool === 'midpoint' && !disabled) board.on('move', event => {
      if (midpointPreview) { board.removeObject(midpointPreview); midpointPreview = null }
      const hit = board.getAllObjectsUnderMouse(event)
      const candidate = geometry.points.find(p => hit.includes(pointElements.get(p.id)!))
      const segment = geometry.segments.find(s => hit.includes(segmentElements.get(s.id)!))
      const a = geometry.points.find(p => p.id === (candidate ? midpointSource : segment?.start_point_id))
      const b = candidate ?? geometry.points.find(p => p.id === segment?.end_point_id)
      if (!a || !b || a.id === b.id || Math.hypot(a.x - b.x, a.y - b.y) < CONSTRUCTION_LIMITS.minimumSourceDistance) return
      const m = midpointCoordinates(a, b)
      midpointPreview = board.create('point', [m.x, boardYFromGeometry(geometry, m.y)], { ...POINT_ATTRIBUTES, name: '', fixed: true, highlight: false, strokeColor: '#6d4bd1', fillColor: '#6d4bd1' })
      midpointPreview.rendNode?.setAttribute('data-geometry-transient', '')
      midpointPreview.rendNode?.setAttribute('data-geometry-midpoint-preview', '')
    })
    board.on('down', (event) => {
      if(isLinearConstructionTool(tool)){
        if(disabled)return
        container.focus({preventScroll:true})
        const hit=board.getAllObjectsUnderMouse(event)
        if(linearSource){
          const point=geometry.points.find(p=>hit.includes(pointElements.get(p.id)!))
          if(point)callbacks.current.onObjectClick({kind:'point',id:point.id})
        }else{
          const line=geometry.lines?.find(l=>hit.includes(linearElements.get(l.id)!))
          const segment=geometry.segments.find(s=>hit.includes(segmentElements.get(s.id)!))
          if(line)callbacks.current.onObjectClick({kind:'line',id:line.id})
          else if(segment)callbacks.current.onObjectClick({kind:'segment',id:segment.id})
        }
        return
      }
      if (tool === 'midpoint') {
        if (disabled) return
        container.focus({ preventScroll: true })
        const hit = board.getAllObjectsUnderMouse(event)
        const point = geometry.points.find(p => hit.includes(pointElements.get(p.id)!))
        const segment = geometry.segments.find(s => hit.includes(segmentElements.get(s.id)!))
        // A segment endpoint is a point choice, not a second simultaneous shortcut.
        if (point) callbacks.current.onObjectClick({ kind: 'point', id: point.id })
        else if (segment) callbacks.current.onObjectClick({ kind: 'segment', id: segment.id })
        return
      }
      if (!disabled && (isLineTool(tool) || isTemplateTool(tool) || isCircleTool(tool) || isArcTool(tool))) {
        container.focus({ preventScroll: true })
        const hit = board.getAllObjectsUnderMouse(event)
        const point = geometry.points.find(p => hit.includes(pointElements.get(p.id)!))
        const [x, y] = board.getUsrCoordsOfMouse(event)
        callbacks.current.onLineClick?.(point ? { x: point.x, y: point.y, pointId: point.id } : { x, y: geometryYFromBoard(geometry, y) })
        return
      }
      if (disabled || (tool !== 'point' && tool !== 'text')) return
      if (tool === 'point' && board.getAllObjectsUnderMouse(event).length > 0) return
      const [x, boardY] = board.getUsrCoordsOfMouse(event)
      if (tool === 'point') {
        onChange(addGeometryPoint(geometry, x, geometryYFromBoard(geometry, boardY)))
      } else {
        const updated = addGeometryText(geometry, x, geometryYFromBoard(geometry, boardY))
        if (updated === geometry) return
        onChange(updated)
        onObjectClick({ kind: 'text', id: updated.texts[updated.texts.length - 1].id })
      }
    })
    if ((tool === 'midpoint' || tool === 'altitude' || tool === 'median' || isLinearConstructionTool(tool)) && !disabled) container.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('scroll', refreshScreenOrigin, true)
      container.removeEventListener('pointerdown', refreshScreenOrigin, true)
      JXG.JSXGraph.freeBoard(board)
    }
  }, [disabled, geometry, tool, frameWidth, frameHeight, lineDraft, regularSides, midpointSource, linearSource])

  return <div id={boardId} ref={containerRef} tabIndex={0} onKeyDown={event => {
    if ((tool !== 'midpoint' && tool !== 'altitude' && tool !== 'median' && !isLinearConstructionTool(tool) && !isLineTool(tool) && !isTemplateTool(tool) && !isCircleTool(tool) && !isArcTool(tool)) || disabled) return
    if (event.key === 'Enter') { event.preventDefault(); onFinishLine?.() }
    if (event.key === 'Escape') { event.preventDefault(); onCancelLine?.() }
  }} style={frameSize ? { width: frameSize.width, height: frameSize.height } : undefined} className="geometry-authoring-board jxgbox" aria-label="İnteraktiv həndəsə lövhəsi" />
}
