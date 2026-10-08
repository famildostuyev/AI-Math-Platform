import type { GeometrySourceDataV1 } from '../api/questionEditor'
import type { GeometryTemplateTool } from './geometryTemplateContract'
import { canAllocateGeometry } from './geometryCapacityModel'
import { constructionDeletionClosure, geometryObjectIds, isDerivedPoint, recomputeConstructions, pointConstraint, retargetPointConstraint, detachInvalidPointParents } from './geometryConstructionModel'
import { cleanupImplicitAnchors, promoteGeometryPoints } from './geometryReferenceModel'
import { moveAnnotation, preserveAnnotationsOnDeletion, synchronizeAnnotationPositions } from './geometryAnnotationModel'

export type GeometryTool = 'parallel' | 'perpendicular' | 'midpoint' | 'intersection' | 'angle_bisector' | 'altitude' | 'median' | 'select' | 'point' | 'segment' | 'polygon' | 'text' | 'line' | 'directed_line' | 'vector' | 'polyline' | 'circle' | 'disk' | 'arc' | 'sector' | GeometryTemplateTool
export type GeometrySelection = { kind: 'point' | 'segment' | 'polygon' | 'text' | 'line' | 'polyline' | 'circle' | 'arc' | 'shape'; id: string }

export const GEOMETRY_BOARD_VIEWPORT = Object.freeze({ min_x: 0, min_y: 0, width: 100, height: 100 })

function nextId(prefix: string, used: Set<string>): string {
  let index = 1
  while (used.has(`${prefix}-${index}`)) index += 1
  return `${prefix}-${index}`
}

function geometryIds(geometry: GeometrySourceDataV1): Set<string> {
  return geometryObjectIds(geometry)
}

export function addGeometryPoint(geometry: GeometrySourceDataV1, x: number, y: number): GeometrySourceDataV1 {
  if (!canAllocateGeometry(geometry, { points: 1 })) return geometry
  return { ...geometry, points: [...geometry.points, { id: nextId('point', geometryIds(geometry)), x, y, label: null }] }
}

export function moveGeometryPoint(geometry: GeometrySourceDataV1, pointId: string, x: number, y: number): GeometrySourceDataV1 {
  const constraint=pointConstraint(geometry,pointId)
  if(constraint){const next=retargetPointConstraint(geometry,pointId,constraint.parent,x,y);return next===geometry?geometry:synchronizeAnnotationPositions(next)}
  if (!Number.isFinite(x) || !Number.isFinite(y) || isDerivedPoint(geometry, pointId)) return geometry
  const next = recomputeConstructions({ ...geometry, points: geometry.points.map(point => point.id === pointId ? { ...point, x, y } : point) })
  if (!next) return geometry
  const location = (id: string) => next.points.find(p => p.id === id)
  const coincident = (a: string, b: string) => { const start = location(a), end = location(b); return start && end && start.x === end.x && start.y === end.y }
  if ((geometry.lines ?? []).some(line => coincident(line.start_point_id, line.end_point_id))
    || (geometry.polylines ?? []).some(polyline => polyline.point_ids.some((id, i) => i > 0 && coincident(polyline.point_ids[i - 1], id)))) return geometry
  return synchronizeAnnotationPositions(next)
}

export function renameGeometryPoint(geometry: GeometrySourceDataV1, pointId: string, label: string | null): GeometrySourceDataV1 {
  return { ...geometry, points: geometry.points.map((point) => point.id === pointId ? { ...point, label } : point) }
}

export function addGeometryText(geometry: GeometrySourceDataV1, x: number, y: number): GeometrySourceDataV1 {
  if (!canAllocateGeometry(geometry, { texts: 1 })) return geometry
  return { ...geometry, texts: [...geometry.texts, { id: nextId('text', geometryIds(geometry)), x, y, content: 'Mətn' }] }
}

export function moveGeometryText(geometry: GeometrySourceDataV1, textId: string, x: number, y: number): GeometrySourceDataV1 {
  return moveAnnotation(geometry, textId, x, y)
}

export function updateGeometryTextContent(geometry: GeometrySourceDataV1, textId: string, content: string): GeometrySourceDataV1 {
  return { ...geometry, texts: geometry.texts.map((text) => text.id === textId ? { ...text, content } : text) }
}

export function addGeometrySegment(geometry: GeometrySourceDataV1, startPointId: string, endPointId: string): GeometrySourceDataV1 {
  if (startPointId === endPointId) return geometry
  if (!geometry.points.some((point) => point.id === startPointId) || !geometry.points.some((point) => point.id === endPointId)) return geometry
  if (geometry.segments.some((segment) => (segment.start_point_id === startPointId && segment.end_point_id === endPointId) || (segment.start_point_id === endPointId && segment.end_point_id === startPointId))) return geometry
  if (!canAllocateGeometry(geometry, { segments: 1 })) return geometry
  return { ...geometry, segments: [...geometry.segments, { id: nextId('segment', geometryIds(geometry)), start_point_id: startPointId, end_point_id: endPointId }] }
}

export function addGeometryPolygon(geometry: GeometrySourceDataV1, pointIds: string[]): GeometrySourceDataV1 | null {
  if (pointIds.length < 3 || new Set(pointIds).size !== pointIds.length) return null
  const known = new Set(geometry.points.map((point) => point.id))
  if (pointIds.some((id) => !known.has(id))) return null
  if (!canAllocateGeometry(geometry, { polygons: 1 })) return null
  return { ...promoteGeometryPoints(geometry, pointIds), polygons: [...geometry.polygons, { id: nextId('polygon', geometryIds(geometry)), point_ids: [...pointIds] }] }
}

export function deleteGeometrySelection(geometry: GeometrySourceDataV1, selection: GeometrySelection): GeometrySourceDataV1 {
  return preserveAnnotationsOnDeletion(geometry, cleanupImplicitAnchors(detachInvalidPointParents(deleteGeometrySelectionObjects(geometry, selection))))
}

function deleteGeometrySelectionObjects(geometry: GeometrySourceDataV1, selection: GeometrySelection): GeometrySourceDataV1 {
  if (geometry.constructions && ['point','line','segment'].includes(selection.kind)) {
    const removed = constructionDeletionClosure(geometry, selection.id)
    let next = { ...geometry, constructions: geometry.constructions.filter(c => !removed.has(c.id)) }
    for (const id of removed) {
      const kind = geometry.points.some(p => p.id === id) ? 'point' : geometry.segments.some(s => s.id === id) ? 'segment' : geometry.lines?.some(l => l.id === id) ? 'line' : null
      if (kind) next = { ...deleteGeometrySelectionObjects({ ...next, constructions: undefined }, { kind, id }), constructions: next.constructions }
    }
    return next
  }
  if (selection.kind === 'point') return {
    ...geometry,
    points: geometry.points.filter((point) => point.id !== selection.id),
    segments: geometry.segments.filter((segment) => segment.start_point_id !== selection.id && segment.end_point_id !== selection.id),
    polygons: geometry.polygons.filter((polygon) => !polygon.point_ids.includes(selection.id)),
    ...(geometry.lines ? { lines: geometry.lines.filter(line => line.start_point_id !== selection.id && line.end_point_id !== selection.id) } : {}),
    ...(geometry.polylines ? { polylines: geometry.polylines.filter(polyline => !polyline.point_ids.includes(selection.id)) } : {}),
    ...(geometry.circles ? { circles: geometry.circles.filter(circle => circle.center_point_id !== selection.id) } : {}),
    ...(geometry.arcs ? { arcs: geometry.arcs.filter(arc => arc.center_point_id !== selection.id) } : {}),
  }
  if (selection.kind === 'segment') return { ...geometry, segments: geometry.segments.filter((segment) => segment.id !== selection.id) }
  if (selection.kind === 'polygon') return { ...geometry, polygons: geometry.polygons.filter((polygon) => polygon.id !== selection.id) }
  if (selection.kind === 'circle') return { ...geometry, circles: (geometry.circles ?? []).filter(circle => circle.id !== selection.id) }
  if (selection.kind === 'arc') return { ...geometry, arcs: (geometry.arcs ?? []).filter(arc => arc.id !== selection.id) }
  if (selection.kind === 'line') return { ...geometry, lines: (geometry.lines ?? []).filter(line => line.id !== selection.id) }
  if (selection.kind === 'polyline') return { ...geometry, polylines: (geometry.polylines ?? []).filter(polyline => polyline.id !== selection.id) }
  return { ...geometry, texts: geometry.texts.filter((text) => text.id !== selection.id) }
}

export function boardYFromGeometry(geometry: GeometrySourceDataV1, y: number): number {
  return (2 * geometry.viewport.min_y) + geometry.viewport.height - y
}

export function geometryYFromBoard(geometry: GeometrySourceDataV1, y: number): number {
  return (2 * geometry.viewport.min_y) + geometry.viewport.height - y
}
