import type { GeometryPolygonTemplate, GeometrySourceDataV1 } from '../api/questionEditor'
import { addGeometryPolygon } from './geometryAuthoringModel'
import type { GeometryVertex } from './geometryLineModel'
import { isTemplateTool, MIN_TEMPLATE_CREATION_LENGTH, regularSidesForTool, validRegularSides, type GeometryTemplateTool } from './geometryTemplateContract'

export function regularPolygon(center: GeometryVertex, radius: number, n: number, orientation: number): GeometryVertex[] | null {
  if (!validRegularSides(n) || ![center.x, center.y, radius, orientation].every(Number.isFinite) || radius < MIN_TEMPLATE_CREATION_LENGTH) return null
  return Array.from({ length: n }, (_, i) => {
    const angle = orientation + i * 2 * Math.PI / n
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
  })
}

export function templateVertices(tool: GeometryTemplateTool, a: GeometryVertex, b: GeometryVertex, n?: number): GeometryVertex[] | null {
  if (!isTemplateTool(tool) || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null
  const dx = b.x - a.x, dy = b.y - a.y
  if (Math.hypot(dx, dy) < MIN_TEMPLATE_CREATION_LENGTH) return null
  if (tool.startsWith('regular_')) return regularPolygon(a, Math.hypot(dx, dy), regularSidesForTool(tool, n)!, Math.atan2(dy, dx))
  const at = (u: number, v: number) => ({ x: a.x + u * dx - v * dy, y: a.y + u * dy + v * dx })
  switch (tool) {
    case 'triangle': return [at(0, 0), at(1, 0), at(.28, .73)]
    case 'right_triangle': return [at(0, 0), at(1, 0), at(0, .68)]
    case 'rectangle': return [at(0, 0), at(1, 0), at(1, .65), at(0, .65)]
    case 'square': return [at(0, 0), at(1, 0), at(1, 1), at(0, 1)]
    case 'parallelogram': return [at(0, 0), at(1, 0), at(1.35, .65), at(.35, .65)]
    case 'rhombus': return [at(0, 0), at(1, 0), at(1.4, Math.sqrt(.84)), at(.4, Math.sqrt(.84))]
    case 'trapezoid': return [at(0, 0), at(1, 0), at(.77, .65), at(.18, .65)]
  }
  return null
}

// Atomic creation using the common polygon graph. Preview never calls this function.
export function commitGeometryTemplate(geometry: GeometrySourceDataV1, tool: GeometryTemplateTool, a: GeometryVertex, b: GeometryVertex, n?: number): GeometrySourceDataV1 {
  const vertices = templateVertices(tool, a, b, n)
  if (!vertices) return geometry
  const points = [...geometry.points]
  const ids = new Set([...points, ...geometry.segments, ...geometry.polygons, ...geometry.texts, ...(geometry.lines ?? []), ...(geometry.polylines ?? []), ...(geometry.circles ?? []), ...(geometry.arcs ?? []), ...(geometry.constructions ?? [])].map(p => p.id))
  const pointIds = vertices.map(vertex => {
    const existing = points.find(p => p.x === vertex.x && p.y === vertex.y)
    if (existing) return existing.id
    let index = 1
    while (ids.has(`point-${index}`)) index++
    const id = `point-${index}`
    ids.add(id); points.push({ id, x: vertex.x, y: vertex.y, label: null })
    return id
  })
  const next = addGeometryPolygon({ ...geometry, points }, pointIds)
  if (!next) return geometry
  const sides = regularSidesForTool(tool, n)
  const template: GeometryPolygonTemplate = tool === 'regular_polygon' || tool === 'regular_pentagon' || tool === 'regular_hexagon' ? { kind: 'regular_polygon', n: sides! } : { kind: tool }
  return { ...next, polygons: next.polygons.map((polygon, i) => i === next.polygons.length - 1 ? { ...polygon, template } : polygon) }
}
