import type { GeometrySourceDataV1, GeometryTextV1, JsonObject } from '../api/questionEditor'
import { GEOMETRY_BOARD_VIEWPORT } from './geometryAuthoringModel'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPlainText(value: string): boolean {
  return value.trim().length > 0
    && !/<\s*\/?\s*[A-Za-z][^>]*>/.test(value)
    && !/javascript\s*:/i.test(value)
}

export function normalizeGeometrySourceDataV1(value: JsonObject): GeometrySourceDataV1 | null {
  const baseKeys = ['schema_version', 'viewport', 'description', 'points', 'segments', 'polygons']
  const hasTexts = Object.hasOwn(value, 'texts')
  if (!hasExactKeys(value, hasTexts ? [...baseKeys, 'texts'] : baseKeys)) return null
  if (value.schema_version !== 1 || typeof value.description !== 'string' || !value.description.trim()) return null
  if (!isRecord(value.viewport) || !hasExactKeys(value.viewport, ['min_x', 'min_y', 'width', 'height'])) return null
  if (!isFiniteNumber(value.viewport.min_x) || !isFiniteNumber(value.viewport.min_y)
    || !isFiniteNumber(value.viewport.width) || value.viewport.width <= 0
    || !isFiniteNumber(value.viewport.height) || value.viewport.height <= 0) return null
  if (!Array.isArray(value.points) || !Array.isArray(value.segments)
    || !Array.isArray(value.polygons) || (hasTexts && !Array.isArray(value.texts))) return null

  const ids = new Set<string>()
  const pointIds = new Set<string>()
  for (const point of value.points) {
    if (!isRecord(point) || !hasExactKeys(point, ['id', 'x', 'y', 'label'])
      || typeof point.id !== 'string' || !point.id || ids.has(point.id)
      || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)
      || !(point.label === null || typeof point.label === 'string')) return null
    ids.add(point.id); pointIds.add(point.id)
  }
  for (const segment of value.segments) {
    if (!isRecord(segment) || !hasExactKeys(segment, ['id', 'start_point_id', 'end_point_id'])
      || typeof segment.id !== 'string' || ids.has(segment.id)
      || typeof segment.start_point_id !== 'string' || typeof segment.end_point_id !== 'string'
      || segment.start_point_id === segment.end_point_id
      || !pointIds.has(segment.start_point_id) || !pointIds.has(segment.end_point_id)) return null
    ids.add(segment.id)
  }
  for (const polygon of value.polygons) {
    if (!isRecord(polygon) || !hasExactKeys(polygon, ['id', 'point_ids'])
      || typeof polygon.id !== 'string' || ids.has(polygon.id)
      || !Array.isArray(polygon.point_ids) || polygon.point_ids.length < 3
      || polygon.point_ids.some((id) => typeof id !== 'string' || !pointIds.has(id))
      || new Set(polygon.point_ids).size !== polygon.point_ids.length) return null
    ids.add(polygon.id)
  }
  const texts: GeometryTextV1[] = []
  for (const text of hasTexts ? value.texts as JsonObject[] : []) {
    if (!isRecord(text) || !hasExactKeys(text, ['id', 'x', 'y', 'content'])
      || typeof text.id !== 'string' || ids.has(text.id)
      || !isFiniteNumber(text.x) || !isFiniteNumber(text.y)
      || typeof text.content !== 'string' || !isPlainText(text.content)) return null
    ids.add(text.id)
    texts.push({ id: text.id, x: text.x, y: text.y, content: text.content })
  }
  return {
    schema_version: 1,
    viewport: value.viewport,
    description: value.description,
    points: value.points,
    segments: value.segments,
    polygons: value.polygons,
    texts,
  } as GeometrySourceDataV1
}

export function isGeometrySourceDataV1(value: JsonObject): boolean {
  return normalizeGeometrySourceDataV1(value) !== null
}

export function emptyGeometryV1(): GeometrySourceDataV1 {
  return {
    schema_version: 1,
    viewport: { ...GEOMETRY_BOARD_VIEWPORT },
    description: '',
    points: [],
    segments: [],
    polygons: [],
    texts: [],
  }
}
