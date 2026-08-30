import type { GeometrySourceDataV1 } from '../api/questionEditor'
import './VisualContent.css'

type GeometryRendererProps = { geometry: GeometrySourceDataV1; blockId: string }

export default function GeometryRenderer({ geometry, blockId }: GeometryRendererProps) {
  const points = new Map(geometry.points.map((point) => [point.id, point]))
  const viewBox = `${geometry.viewport.min_x} ${geometry.viewport.min_y} ${geometry.viewport.width} ${geometry.viewport.height}`
  const descriptionId = `geometry-description-${blockId}`

  return <figure className="visual-content visual-content--geometry">
    <svg viewBox={viewBox} role="img" aria-labelledby={descriptionId} preserveAspectRatio="xMidYMid meet">
      <title id={descriptionId}>{geometry.description}</title>
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
      <g className="geometry-points">
        {geometry.points.map((point) => <g key={point.id}>
          <circle cx={point.x} cy={point.y} r="1.7" />
          {point.label && <text x={point.x + 2.5} y={point.y - 2.5}>{point.label}</text>}
        </g>)}
      </g>
      <g className="geometry-annotations">
        {geometry.texts.map((text) => <text key={text.id} x={text.x} y={text.y}>{text.content}</text>)}
      </g>
    </svg>
    <figcaption>{geometry.description}</figcaption>
  </figure>
}
