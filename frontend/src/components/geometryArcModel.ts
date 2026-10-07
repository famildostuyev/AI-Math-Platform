import type { GeometryArcV1, GeometrySourceDataV1 } from '../api/questionEditor'
import type { GeometryVertex } from './geometryLineModel'
import { circleRadius, circularCenter, validCircleRadius } from './geometryCircleModel'
import { canAllocateGeometry } from './geometryCapacityModel'
import limitsJson from '../../../backend/app/schemas/geometry_arc_limits.json?raw'

// Geometry y points down: zero is right; positive radians run clockwise.
// Start is [0, TAU); sweep is positive, excluding near-zero AND near-full turns.
export const TAU = 2 * Math.PI
export const MIN_ARC_SWEEP: number = JSON.parse(limitsJson).minimumSweepDegrees * Math.PI / 180
export const normalizeAngle = (angle: number) => ((angle % TAU) + TAU) % TAU
export const isArcTool = (tool: string): tool is GeometryArcV1['kind'] => tool === 'arc' || tool === 'sector'
export const validArcAngles = (start: unknown, sweep: unknown): boolean => typeof start === 'number' && Number.isFinite(start) && start >= 0 && start < TAU
  && typeof sweep === 'number' && Number.isFinite(sweep) && sweep > MIN_ARC_SWEEP && sweep < TAU - MIN_ARC_SWEEP
export const arcPoint = (center: GeometryVertex, radius: number, angle: number): GeometryVertex => ({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) })
export function arcFromPointers(center: GeometryVertex, start: GeometryVertex, end: GeometryVertex) {
  const radius = circleRadius(center, start)
  if (radius === null || ![end.x, end.y].every(Number.isFinite) || (end.x === center.x && end.y === center.y)) return null
  const start_angle = normalizeAngle(Math.atan2(start.y - center.y, start.x - center.x))
  const sweep_angle = normalizeAngle(Math.atan2(end.y - center.y, end.x - center.x) - start_angle)
  return validArcAngles(start_angle, sweep_angle) ? { radius, start_angle, sweep_angle } : null
}
export function arcBounds(center: GeometryVertex, arc: Pick<GeometryArcV1, 'radius' | 'start_angle' | 'sweep_angle' | 'kind'>) {
  const { radius, start_angle: start, sweep_angle: sweep } = arc
  const angles = [start, start + sweep, ...[0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].filter(a => normalizeAngle(a - start) <= sweep)]
  const points = angles.map(a => arcPoint(center, radius, a))
  if (arc.kind === 'sector') points.push(center)
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) }
}
export function arcPath(center: GeometryVertex, arc: Pick<GeometryArcV1, 'radius' | 'start_angle' | 'sweep_angle' | 'kind'>) {
  const start = arcPoint(center, arc.radius, arc.start_angle), end = arcPoint(center, arc.radius, arc.start_angle + arc.sweep_angle)
  const curve = `A ${arc.radius} ${arc.radius} 0 ${arc.sweep_angle > Math.PI ? 1 : 0} 1 ${end.x} ${end.y}`
  return arc.kind === 'sector' ? `M ${center.x} ${center.y} L ${start.x} ${start.y} ${curve} Z` : `M ${start.x} ${start.y} ${curve}`
}
export function commitGeometryArc(geometry: GeometrySourceDataV1, kind: GeometryArcV1['kind'], center: GeometryVertex, start: GeometryVertex, end: GeometryVertex): GeometrySourceDataV1 {
  const definition = arcFromPointers(center, start, end)
  if (!isArcTool(kind) || !definition || !validCircleRadius(definition.radius)) return geometry
  if (!canAllocateGeometry(geometry, { arcs: 1 })) return geometry
  const shared = circularCenter(geometry, center)
  if (!shared) return geometry
  return { ...geometry, points: shared.points, arcs: [...(geometry.arcs ?? []), { id: shared.nextId(kind), kind, center_point_id: shared.centerId, ...definition }] }
}
