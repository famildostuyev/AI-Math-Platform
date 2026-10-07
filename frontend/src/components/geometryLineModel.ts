import type { GeometryLineV1, GeometrySourceDataV1 } from '../api/questionEditor'
import { addGeometryPoint, addGeometryPolygon } from './geometryAuthoringModel'
import { canAllocateGeometry, GEOMETRY_COLLECTION_LIMITS } from './geometryCapacityModel'

export type GeometryVertex = { x: number; y: number; pointId?: string }
export type GeometryLineTool = GeometryLineV1['kind'] | 'polyline'
export const POLYLINE_CLOSURE_TOLERANCE = 3 // Geometry-local units (12 CSS px at the fixed frame scale).
export const isLineTool = (tool: string): tool is GeometryLineTool => ['line', 'directed_line', 'vector', 'polyline'].includes(tool)
export const canClosePolyline = (vertices: GeometryVertex[], pointer: GeometryVertex) => vertices.length >= 3
  && Math.hypot(pointer.x - vertices[0].x, pointer.y - vertices[0].y) <= POLYLINE_CLOSURE_TOLERANCE

// Draft vertices are deliberately separate from the persisted Geometry object graph.
export function commitGeometryLine(geometry: GeometrySourceDataV1, tool: GeometryLineTool, vertices: GeometryVertex[], closed = false): GeometrySourceDataV1 {
  if (vertices.length < (closed ? 3 : 2) || vertices.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return geometry
  if (tool !== 'polyline' && vertices.length !== 2) return geometry
  if (vertices.some((p, i) => i > 0 && p.x === vertices[i - 1].x && p.y === vertices[i - 1].y)) return geometry
  if (tool === 'polyline' && !closed && vertices.length > GEOMETRY_COLLECTION_LIMITS.points) return geometry
  const missing: GeometryVertex[] = []
  for (const vertex of vertices) {
    const existing = vertex.pointId ? geometry.points.find(p => p.id === vertex.pointId) : geometry.points.find(p => p.x === vertex.x && p.y === vertex.y)
    if (vertex.pointId && !existing) return geometry
    if (!existing && !missing.some(p => p.x === vertex.x && p.y === vertex.y)) missing.push(vertex)
  }
  if (!canAllocateGeometry(geometry, { points: missing.length,
    ...(closed ? { polygons: 1 } : tool === 'polyline' ? { polylines: 1 } : { lines: 1 }),
  })) return geometry
  let next = geometry
  const pointIds: string[] = []
  for (const vertex of vertices) {
    const existing = vertex.pointId ? next.points.find(p => p.id === vertex.pointId) : next.points.find(p => p.x === vertex.x && p.y === vertex.y)
    if (vertex.pointId && !existing) return geometry
    if (existing) pointIds.push(existing.id)
    else {
      const added = addGeometryPoint(next, vertex.x, vertex.y)
      if (added === next) return geometry
      next = added; pointIds.push(next.points.at(-1)!.id)
    }
  }
  if (new Set(pointIds).size !== pointIds.length) return geometry
  if (closed) return tool === 'polyline' ? addGeometryPolygon(next, pointIds) ?? geometry : geometry
  const ids = new Set([...next.points, ...next.segments, ...next.polygons, ...next.texts, ...(next.lines ?? []), ...(next.polylines ?? []), ...(next.circles ?? []), ...(next.arcs ?? []), ...(next.constructions ?? [])].map(p => p.id))
  let index = 1
  while (ids.has(`${tool}-${index}`)) index++
  const id = `${tool}-${index}`
  if (tool === 'polyline') return { ...next, polylines: [...(next.polylines ?? []), { id, point_ids: pointIds }] }
  return { ...next, lines: [...(next.lines ?? []), { id, kind: tool, start_point_id: pointIds[0], end_point_id: pointIds[1] }] }
}

// Clip only the presentation. A/B references remain the mathematical definition.
export function clipInfiniteLine(a: GeometryVertex, b: GeometryVertex, bounds: { x: number; y: number; width: number; height: number }): [GeometryVertex, GeometryVertex] | null {
  const dx = b.x - a.x, dy = b.y - a.y
  if (dx === 0 && dy === 0) return null
  let lo = -Infinity, hi = Infinity
  for (const [start, delta, min, max] of [[a.x, dx, bounds.x, bounds.x + bounds.width], [a.y, dy, bounds.y, bounds.y + bounds.height]]) {
    if (delta === 0) { if (start < min || start > max) return null; continue }
    const t1 = (min - start) / delta, t2 = (max - start) / delta
    lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2))
  }
  return lo <= hi ? [{ x: a.x + lo * dx, y: a.y + lo * dy }, { x: a.x + hi * dx, y: a.y + hi * dy }] : null
}
