import type { GeometrySourceDataV1 } from '../api/questionEditor'

export type GeometryTool = 'select' | 'point' | 'segment' | 'polygon' | 'text'
export type GeometrySelection = { kind: 'point' | 'segment' | 'polygon' | 'text'; id: string }

export const GEOMETRY_BOARD_VIEWPORT = Object.freeze({ min_x: 0, min_y: 0, width: 100, height: 100 })

function nextId(prefix: string, used: Set<string>): string {
  let index = 1
  while (used.has(`${prefix}-${index}`)) index += 1
  return `${prefix}-${index}`
}

function labelForIndex(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26))
  const cycle = Math.floor(index / 26)
  return cycle === 0 ? letter : `${letter}${cycle}`
}

export function nextPointLabel(geometry: GeometrySourceDataV1): string {
  const used = new Set(geometry.points.map((point) => point.label).filter((label): label is string => label !== null))
  let index = 0
  while (used.has(labelForIndex(index))) index += 1
  return labelForIndex(index)
}

function geometryIds(geometry: GeometrySourceDataV1): Set<string> {
  return new Set([...geometry.points.map((point) => point.id), ...geometry.segments.map((segment) => segment.id), ...geometry.polygons.map((polygon) => polygon.id), ...geometry.texts.map((text) => text.id)])
}

export function addGeometryPoint(geometry: GeometrySourceDataV1, x: number, y: number): GeometrySourceDataV1 {
  return { ...geometry, points: [...geometry.points, { id: nextId('point', geometryIds(geometry)), x, y, label: nextPointLabel(geometry) }] }
}

export function moveGeometryPoint(geometry: GeometrySourceDataV1, pointId: string, x: number, y: number): GeometrySourceDataV1 {
  return { ...geometry, points: geometry.points.map((point) => point.id === pointId ? { ...point, x, y } : point) }
}

export function renameGeometryPoint(geometry: GeometrySourceDataV1, pointId: string, label: string | null): GeometrySourceDataV1 {
  return { ...geometry, points: geometry.points.map((point) => point.id === pointId ? { ...point, label } : point) }
}

export function addGeometryText(geometry: GeometrySourceDataV1, x: number, y: number): GeometrySourceDataV1 {
  return { ...geometry, texts: [...geometry.texts, { id: nextId('text', geometryIds(geometry)), x, y, content: 'Mətn' }] }
}

export function moveGeometryText(geometry: GeometrySourceDataV1, textId: string, x: number, y: number): GeometrySourceDataV1 {
  return { ...geometry, texts: geometry.texts.map((text) => text.id === textId ? { ...text, x, y } : text) }
}

export function updateGeometryTextContent(geometry: GeometrySourceDataV1, textId: string, content: string): GeometrySourceDataV1 {
  return { ...geometry, texts: geometry.texts.map((text) => text.id === textId ? { ...text, content } : text) }
}

export function addGeometrySegment(geometry: GeometrySourceDataV1, startPointId: string, endPointId: string): GeometrySourceDataV1 {
  if (startPointId === endPointId) return geometry
  if (!geometry.points.some((point) => point.id === startPointId) || !geometry.points.some((point) => point.id === endPointId)) return geometry
  if (geometry.segments.some((segment) => (segment.start_point_id === startPointId && segment.end_point_id === endPointId) || (segment.start_point_id === endPointId && segment.end_point_id === startPointId))) return geometry
  return { ...geometry, segments: [...geometry.segments, { id: nextId('segment', geometryIds(geometry)), start_point_id: startPointId, end_point_id: endPointId }] }
}

export function addGeometryPolygon(geometry: GeometrySourceDataV1, pointIds: string[]): GeometrySourceDataV1 | null {
  if (pointIds.length < 3 || new Set(pointIds).size !== pointIds.length) return null
  const known = new Set(geometry.points.map((point) => point.id))
  if (pointIds.some((id) => !known.has(id))) return null
  return { ...geometry, polygons: [...geometry.polygons, { id: nextId('polygon', geometryIds(geometry)), point_ids: [...pointIds] }] }
}

export function deleteGeometrySelection(geometry: GeometrySourceDataV1, selection: GeometrySelection): GeometrySourceDataV1 {
  if (selection.kind === 'point') return {
    ...geometry,
    points: geometry.points.filter((point) => point.id !== selection.id),
    segments: geometry.segments.filter((segment) => segment.start_point_id !== selection.id && segment.end_point_id !== selection.id),
    polygons: geometry.polygons.filter((polygon) => !polygon.point_ids.includes(selection.id)),
  }
  if (selection.kind === 'segment') return { ...geometry, segments: geometry.segments.filter((segment) => segment.id !== selection.id) }
  if (selection.kind === 'polygon') return { ...geometry, polygons: geometry.polygons.filter((polygon) => polygon.id !== selection.id) }
  return { ...geometry, texts: geometry.texts.filter((text) => text.id !== selection.id) }
}

export function boardYFromGeometry(geometry: GeometrySourceDataV1, y: number): number {
  return (2 * geometry.viewport.min_y) + geometry.viewport.height - y
}

export function geometryYFromBoard(geometry: GeometrySourceDataV1, y: number): number {
  return (2 * geometry.viewport.min_y) + geometry.viewport.height - y
}
