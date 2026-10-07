import type { GeometryCircleV1, GeometrySourceDataV1 } from '../api/questionEditor'
import type { GeometryVertex } from './geometryLineModel'
import { canAllocateGeometry } from './geometryCapacityModel'
import { promoteGeometryPoints } from './geometryReferenceModel'
import limitsJson from '../../../backend/app/schemas/geometry_circle_limits.json?raw'

export const MIN_CIRCLE_RADIUS: number = JSON.parse(limitsJson).minimumRadius
export const isCircleTool = (tool: string): tool is GeometryCircleV1['kind'] => tool === 'circle' || tool === 'disk'
export const validCircleRadius = (radius: unknown): radius is number => typeof radius === 'number' && Number.isFinite(radius) && radius > MIN_CIRCLE_RADIUS
export function circleRadius(center: GeometryVertex, pointer: GeometryVertex): number | null {
  if (![center.x, center.y, pointer.x, pointer.y].every(Number.isFinite)) return null
  const radius = Math.hypot(pointer.x - center.x, pointer.y - center.y)
  return validCircleRadius(radius) ? radius : null
}
export function circleBounds(center: GeometryVertex, radius: number) {
  return { left: center.x - radius, right: center.x + radius, top: center.y - radius, bottom: center.y + radius }
}
export function circularCenter(geometry: GeometrySourceDataV1, center: GeometryVertex) {
  const ids = new Set([...geometry.points, ...geometry.segments, ...geometry.polygons, ...geometry.texts, ...(geometry.lines ?? []), ...(geometry.polylines ?? []), ...(geometry.circles ?? []), ...(geometry.arcs ?? []), ...(geometry.constructions ?? [])].map(p => p.id))
  const nextId = (prefix: string) => { let i = 1; while (ids.has(`${prefix}-${i}`)) i++; const id = `${prefix}-${i}`; ids.add(id); return id }
  const existing = center.pointId ? geometry.points.find(p => p.id === center.pointId) : geometry.points.find(p => p.x === center.x && p.y === center.y)
  if (center.pointId && (!existing || existing.x !== center.x || existing.y !== center.y)) return null
  if (!canAllocateGeometry(geometry, { points: existing ? 0 : 1 })) return null
  const point = existing ?? { id: nextId('point'), x: center.x, y: center.y, label: null }
  return { points: existing ? promoteGeometryPoints(geometry, [point.id]).points : [...geometry.points, point], centerId: point.id, nextId }
}
export function commitGeometryCircle(geometry: GeometrySourceDataV1, kind: GeometryCircleV1['kind'], center: GeometryVertex, pointer: GeometryVertex): GeometrySourceDataV1 {
  const radius = circleRadius(center, pointer)
  if (!isCircleTool(kind) || radius === null) return geometry
  if (!canAllocateGeometry(geometry, { circles: 1 })) return geometry
  const shared = circularCenter(geometry, center)
  if (!shared) return geometry
  return { ...geometry, points: shared.points, circles: [...(geometry.circles ?? []), { id: shared.nextId(kind), kind, center_point_id: shared.centerId, radius }] }
}
