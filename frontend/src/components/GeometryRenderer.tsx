import type { GeometrySourceDataV1 } from '../api/questionEditor'
import './VisualContent.css'
import { geometryFrameMetrics, GEOMETRY_FRAME_SCALE, GEOMETRY_FRAME_FONT } from './geometryFrameModel'
import './VisualFrame.css'
import { clipInfiniteLine } from './geometryLineModel'
import { arcPath } from './geometryArcModel'

type GeometryRendererProps = { geometry: GeometrySourceDataV1; blockId: string; frameSize?: { width: number; height: number } }

export default function GeometryRenderer({ geometry, blockId, frameSize }: GeometryRendererProps) {
  const points = new Map(geometry.points.map((point) => [point.id, point]))
  const metrics = frameSize ? geometryFrameMetrics(geometry) : null
  const viewBox = frameSize && metrics
    ? `${metrics.originX} ${metrics.originY} ${frameSize.width / GEOMETRY_FRAME_SCALE} ${frameSize.height / GEOMETRY_FRAME_SCALE}`
    : `${geometry.viewport.min_x} ${geometry.viewport.min_y} ${geometry.viewport.width} ${geometry.viewport.height}`
  const descriptionId = `geometry-description-${blockId}`
  const arrowId = `geometry-arrow-${blockId}`
  const boundary = frameSize && metrics
    ? { x: metrics.originX + 4, y: metrics.originY + 4, width: frameSize.width / GEOMETRY_FRAME_SCALE - 8, height: frameSize.height / GEOMETRY_FRAME_SCALE - 8 }
    : { x: geometry.viewport.min_x, y: geometry.viewport.min_y, width: geometry.viewport.width, height: geometry.viewport.height }

  return <figure className={`visual-content visual-content--geometry${frameSize ? ' visual-content--framed' : ''}`}>
    <svg viewBox={viewBox} style={frameSize ? { width: frameSize.width, height: frameSize.height } : undefined} role="img" aria-labelledby={descriptionId} preserveAspectRatio="xMidYMid meet">
      <title id={descriptionId}>{geometry.description}</title>
      <defs><marker id={arrowId} viewBox="0 0 4 4" refX="4" refY="2" markerWidth="3" markerHeight="3" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="#374151" /></marker></defs>
      <g className="geometry-lines" fill="none" stroke="#374151" strokeWidth="0.5">
        {(geometry.lines ?? []).map(line => {
          const a = points.get(line.start_point_id), b = points.get(line.end_point_id)
          if (!a || !b) return null
          const ends = line.kind === 'vector' ? [a, b] : clipInfiniteLine(a, b, boundary)
          return ends ? <line key={line.id} data-geometry-kind={line.kind} x1={ends[0].x} y1={ends[0].y} x2={ends[1].x} y2={ends[1].y} markerEnd={line.kind === 'line' ? undefined : `url(#${arrowId})`} /> : null
        })}
        {(geometry.polylines ?? []).map(polyline => <polyline key={polyline.id} data-geometry-kind="polyline" points={polyline.point_ids.map(id => { const p = points.get(id)!; return `${p.x},${p.y}` }).join(' ')} />)}
      </g>
      <g className="geometry-polygons">
        {geometry.polygons.map((polygon) => <polygon key={polygon.id} points={polygon.point_ids.map((id) => {
          const point = points.get(id)
          return `${point?.x ?? 0},${point?.y ?? 0}`
        }).join(' ')} />)}
      </g>
      <g className="geometry-segments">
        {geometry.segments.map((segment) => {
          const start = points.get(segment.start_point_id)
          const end = points.get(segment.end_point_id)
          return start && end ? <line key={segment.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} /> : null
        })}
      </g>
      <g className="geometry-circles" stroke="#374151" strokeWidth="0.5">
        {(geometry.circles ?? []).map(circle => {
          const center = points.get(circle.center_point_id)
          return center ? <circle key={circle.id} data-geometry-kind={circle.kind} data-geometry-id={circle.id} cx={center.x} cy={center.y} r={circle.radius} fill={circle.kind === 'disk' ? '#e5e7eb' : 'none'} fillOpacity={circle.kind === 'disk' ? 0.45 : 0} /> : null
        })}
      </g>
      <g className="geometry-arcs" stroke="#374151" strokeWidth="0.5">
        {(geometry.arcs ?? []).map(arc => {
          const center = points.get(arc.center_point_id)
          return center ? <path key={arc.id} data-geometry-kind={arc.kind} data-geometry-id={arc.id} d={arcPath(center, arc)} fill={arc.kind === 'sector' ? '#e5e7eb' : 'none'} fillOpacity={arc.kind === 'sector' ? 0.45 : 0} /> : null
        })}
      </g>
      <g className="geometry-points">
        {geometry.points.map((point) => <g key={point.id}>
          <circle cx={point.x} cy={point.y} r={frameSize ? 1 : '1.7'} />
          {point.label && <text style={frameSize ? { font: `${GEOMETRY_FRAME_FONT / GEOMETRY_FRAME_SCALE}px Arial` } : undefined} x={point.x + 2.5} y={point.y - 2.5}>{point.label}</text>}
        </g>)}
      </g>
      <g className="geometry-annotations">
        {geometry.texts.map((text) => <text key={text.id} x={text.x} y={text.y} dominantBaseline={frameSize ? 'central' : undefined} style={frameSize ? { font: `${GEOMETRY_FRAME_FONT / GEOMETRY_FRAME_SCALE}px Arial` } : undefined}>{text.content}</text>)}
      </g>
    </svg>
    <figcaption>{geometry.description}</figcaption>
  </figure>
}
