import type { GeometrySourceDataV1 } from '../api/questionEditor'
import { circleBounds } from './geometryCircleModel'
import { arcBounds } from './geometryArcModel'
import { FRAME_MINIMUM, FRAME_PADDING, type PersistedVisualPlacement } from './visualPlacement'

// Local units have one fixed document scale, independent of frame dimensions.
export const GEOMETRY_FRAME_SCALE = 4
export const GEOMETRY_FRAME_FONT = 16
type Bounds = { left: number; top: number; right: number; bottom: number }
export type GeometryBoundsContributor = (geometry: GeometrySourceDataV1) => Bounds[]
let measureContext: CanvasRenderingContext2D | null | undefined
function textWidth(text: string): number {
  if (measureContext === undefined && typeof document !== 'undefined') {
    measureContext = document.createElement('canvas').getContext('2d')
  }
  if (!measureContext) return Array.from(text).length * GEOMETRY_FRAME_FONT * 2
  measureContext.font = `${GEOMETRY_FRAME_FONT}px Arial`
  const metrics = measureContext.measureText(text)
  return Math.max(metrics.width, metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft) + 4
}

// Finite segments, vectors, polylines and polygons are bounded by their referenced
// points (6px covers the arrowhead half-width). Infinite lines are clipped inside
// the viewing boundary with 16px padding; only their defining points constrain
// the minimum, avoiding an unbounded or resize-dependent feedback loop.
const contributors: readonly GeometryBoundsContributor[] = [
  geometry => (geometry.arcs ?? []).flatMap(arc => {
    const center = geometry.points.find(p => p.id === arc.center_point_id)
    if (!center) return []
    const b = arcBounds(center, arc)
    return [{ left: b.left * GEOMETRY_FRAME_SCALE - 1, right: b.right * GEOMETRY_FRAME_SCALE + 1, top: b.top * GEOMETRY_FRAME_SCALE - 1, bottom: b.bottom * GEOMETRY_FRAME_SCALE + 1 }]
  }),
  geometry => (geometry.circles ?? []).flatMap(circle => {
    const center = geometry.points.find(p => p.id === circle.center_point_id)
    if (!center) return []
    const bounds = circleBounds(center, circle.radius)
    // One CSS pixel covers half of the common 2px outline, then normal frame padding applies.
    return [{ left: bounds.left * GEOMETRY_FRAME_SCALE - 1, right: bounds.right * GEOMETRY_FRAME_SCALE + 1, top: bounds.top * GEOMETRY_FRAME_SCALE - 1, bottom: bounds.bottom * GEOMETRY_FRAME_SCALE + 1 }]
  }),
  geometry => geometry.points.flatMap(point => {
    const x = point.x * GEOMETRY_FRAME_SCALE, y = point.y * GEOMETRY_FRAME_SCALE
    const bounds = [{ left: x - 6, top: y - 6, right: x + 6, bottom: y + 6 }]
    if (point.label) bounds.push({ left: x + 8, top: y - 30, right: x + 12 + textWidth(point.label), bottom: y + 8 })
    return bounds
  }),
  geometry => geometry.texts.map(text => {
    const x = text.x * GEOMETRY_FRAME_SCALE, y = text.y * GEOMETRY_FRAME_SCALE
    return { left: x - 4, top: y - 20, right: x + textWidth(text.content), bottom: y + 20 }
  }),
]

export function geometryFrameMetrics(geometry: GeometrySourceDataV1) {
  const bounds = contributors.flatMap(contribute => contribute(geometry))
  const left = Math.min(geometry.viewport.min_x * GEOMETRY_FRAME_SCALE, ...bounds.map(b => b.left)) - FRAME_PADDING
  const top = Math.min(geometry.viewport.min_y * GEOMETRY_FRAME_SCALE, ...bounds.map(b => b.top)) - FRAME_PADDING
  const right = Math.max(left, ...bounds.map(b => b.right)) + FRAME_PADDING
  const bottom = Math.max(top, ...bounds.map(b => b.bottom)) + FRAME_PADDING
  return {
    originX: left / GEOMETRY_FRAME_SCALE, originY: top / GEOMETRY_FRAME_SCALE,
    minimum: { width: Math.max(FRAME_MINIMUM.width, Math.ceil(right - left)),
      height: Math.max(FRAME_MINIMUM.height, Math.ceil(bottom - top)) },
  }
}

export function defaultGeometryPlacement(geometry: GeometrySourceDataV1, y = 0): PersistedVisualPlacement {
  const { minimum } = geometryFrameMetrics(geometry)
  return { version: 1, layoutMode: 'floating', anchor: { kind: 'document' },
    position: { x: 0, y, unit: 'px' },
    size: { width: Math.max(minimum.width, geometry.viewport.width * GEOMETRY_FRAME_SCALE + FRAME_PADDING * 2),
      height: Math.max(minimum.height, geometry.viewport.height * GEOMETRY_FRAME_SCALE + FRAME_PADDING * 2), unit: 'px' } }
}

export function containGeometry(placement: PersistedVisualPlacement, geometry: GeometrySourceDataV1): PersistedVisualPlacement {
  const { minimum } = geometryFrameMetrics(geometry)
  return { ...placement, size: { ...placement.size,
    width: Math.max(placement.size.width, minimum.width), height: Math.max(placement.size.height, minimum.height) } }
}
