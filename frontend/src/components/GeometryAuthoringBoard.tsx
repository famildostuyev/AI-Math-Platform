import { useEffect, useId, useRef } from 'react'
import JXG from 'jsxgraph'
import type { GeometrySourceDataV1 } from '../api/questionEditor'
import { addGeometryPoint, addGeometryText, boardYFromGeometry, geometryYFromBoard, moveGeometryPoint, moveGeometryText, type GeometrySelection, type GeometryTool } from './geometryAuthoringModel'

type GeometryAuthoringBoardProps = {
  geometry: GeometrySourceDataV1
  tool: GeometryTool
  disabled: boolean
  onChange: (geometry: GeometrySourceDataV1) => void
  onObjectClick: (selection: GeometrySelection) => void
}

const POINT_ATTRIBUTES = Object.freeze({ size: 4, face: 'o', fillColor: '#ffffff', strokeColor: '#1f2937', highlightFillColor: '#dbeafe', highlightStrokeColor: '#1d4ed8' })
const SEGMENT_ATTRIBUTES = Object.freeze({ strokeColor: '#374151', strokeWidth: 2, highlightStrokeColor: '#1d4ed8' })
const POLYGON_ATTRIBUTES = Object.freeze({ fillColor: '#e5e7eb', fillOpacity: 0.45, strokeColor: '#374151', highlightFillColor: '#dbeafe', highlightStrokeColor: '#1d4ed8', hasInnerPoints: true })
const TEXT_ATTRIBUTES = Object.freeze({ display: 'internal' as const, parse: false, useMathJax: false, fontSize: 16, color: '#111827', highlightColor: '#1d4ed8', dragArea: 'all' as const })

export default function GeometryAuthoringBoard({ geometry, tool, disabled, onChange, onObjectClick }: GeometryAuthoringBoardProps) {
  const reactId = useId()
  const boardId = `geometry-board-${reactId.replace(/:/g, '')}`
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const { min_x: minX, min_y: minY, width, height } = geometry.viewport
    const board = JXG.JSXGraph.initBoard(container, {
      boundingbox: [minX, minY + height, minX + width, minY], axis: false, grid: true,
      showNavigation: false, showCopyright: false, pan: { enabled: false }, zoom: { wheel: false },
      resize: { enabled: true, throttle: 100 },
    })
    const pointElements = new Map<string, JXG.Point>()
    geometry.points.forEach((point) => {
      const element = board.create('point', [point.x, boardYFromGeometry(geometry, point.y)], { ...POINT_ATTRIBUTES, name: point.label ?? '', fixed: disabled || tool !== 'select' })
      element.on('down', () => onObjectClick({ kind: 'point', id: point.id }))
      element.on('up', () => {
        if (!disabled && tool === 'select') onChange(moveGeometryPoint(geometry, point.id, element.X(), geometryYFromBoard(geometry, element.Y())))
      })
      pointElements.set(point.id, element)
    })
    geometry.polygons.forEach((polygon) => {
      const vertices = polygon.point_ids.map((id) => pointElements.get(id)).filter((point): point is JXG.Point => point !== undefined)
      if (vertices.length !== polygon.point_ids.length) return
      const element = board.create('polygon', vertices, { ...POLYGON_ATTRIBUTES, fixed: true })
      element.on('down', () => onObjectClick({ kind: 'polygon', id: polygon.id }))
    })
    geometry.segments.forEach((segment) => {
      const start = pointElements.get(segment.start_point_id)
      const end = pointElements.get(segment.end_point_id)
      if (!start || !end) return
      const element = board.create('segment', [start, end], { ...SEGMENT_ATTRIBUTES, fixed: true })
      element.on('down', () => onObjectClick({ kind: 'segment', id: segment.id }))
    })
    geometry.texts.forEach((text) => {
      const element = board.create('text', [text.x, boardYFromGeometry(geometry, text.y), text.content], {
        ...TEXT_ATTRIBUTES, fixed: disabled || tool !== 'select',
      })
      element.on('down', () => onObjectClick({ kind: 'text', id: text.id }))
      element.on('up', () => {
        if (!disabled && tool === 'select') onChange(moveGeometryText(geometry, text.id, element.X(), geometryYFromBoard(geometry, element.Y())))
      })
    })
    board.on('down', (event) => {
      if (disabled || (tool !== 'point' && tool !== 'text')) return
      if (tool === 'point' && board.getAllObjectsUnderMouse(event).length > 0) return
      const [x, boardY] = board.getUsrCoordsOfMouse(event)
      if (tool === 'point') {
        onChange(addGeometryPoint(geometry, x, geometryYFromBoard(geometry, boardY)))
      } else {
        const updated = addGeometryText(geometry, x, geometryYFromBoard(geometry, boardY))
        onChange(updated)
        onObjectClick({ kind: 'text', id: updated.texts[updated.texts.length - 1].id })
      }
    })
    return () => { JXG.JSXGraph.freeBoard(board) }
  }, [disabled, geometry, onChange, onObjectClick, tool])

  return <div id={boardId} ref={containerRef} className="geometry-authoring-board jxgbox" aria-label="İnteraktiv həndəsə lövhəsi" />
}
