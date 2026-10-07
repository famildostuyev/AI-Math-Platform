import type { GeometrySourceDataV1, GeometryTextV1, JsonObject } from '../api/questionEditor'
import { GEOMETRY_BOARD_VIEWPORT } from './geometryAuthoringModel'
import { validPolygonTemplate } from './geometryTemplateContract'
import { validCircleRadius, isCircleTool } from './geometryCircleModel'
import { validArcAngles, isArcTool } from './geometryArcModel'
import { evaluateConstructions } from './geometryConstructionModel'
import { GEOMETRY_COLLECTION_LIMITS } from './geometryCapacityModel'

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

// Python re.IGNORECASE equivalence classes for this ASCII token. Expand each
// letter rather than relying on JS /i or locale-dependent text conversion.
const pythonScriptCaseClasses: Record<string, string> = { i: 'iI\u0130\u0131', s: 'sS\u017f' }
const pythonScriptScheme = new RegExp([...'javascript']
  .map(letter => `[${pythonScriptCaseClasses[letter] ?? letter + letter.toUpperCase()}]`)
  .join('') + ' *:')

function isPlainText(value: string): boolean {
  // Match Python regex whitespace for these checks without changing stored text.
  const checked = value.replace(/[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
  return !isBlank(value)
    && !/< *\/? *[A-Za-z][^>]*>/.test(checked)
    && !pythonScriptScheme.test(checked)
}

function isBlank(value: string): boolean {
  // Match Python str.strip(), including its additional control whitespace.
  return /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/.test(value)
}

// Python/Pydantic string lengths count Unicode code points, not UTF-16 units.
function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && [...value].length >= 1 && [...value].length <= maximum
}

function geometryId(value: unknown): value is string {
  return boundedString(value, 64) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value)
}

function baseNumber<T>(value: T): T | number {
  if (typeof value === 'boolean') return Number(value)
  if (typeof value === 'string') {
    // Pydantic's float parser trims Unicode White_Space (not JS trim's BOM).
    const stripped = value.replace(/^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, '')
    // Isolated internal underscores are removed, including around punctuation.
    if (stripped.startsWith('_') || stripped.endsWith('_') || stripped.includes('__')) return value
    const decimal = stripped.replaceAll('_', '')
    if (/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(decimal)) return Number(decimal)
  }
  return value
}

export function normalizeGeometrySourceDataV1(value: JsonObject): GeometrySourceDataV1 | null {
  const baseKeys = ['schema_version', 'viewport', 'description']
  const defaultKeys = ['points', 'segments', 'polygons']
  const hasTexts = Object.hasOwn(value, 'texts')
  const additiveKeys = [...defaultKeys, 'texts', 'lines', 'polylines', 'circles', 'arcs', 'constructions'].filter(key => Object.hasOwn(value, key))
  if (!hasExactKeys(value, [...baseKeys, ...additiveKeys])) return null
  if ((value.schema_version !== 1 && value.schema_version !== true) || !boundedString(value.description, 500) || isBlank(value.description)) return null
  value = { points: [], segments: [], polygons: [], ...value }
  if (Array.isArray(value.points)) {
    value = { ...value, points: value.points.map(point => isRecord(point) ? { label: null, ...point, x: baseNumber(point.x), y: baseNumber(point.y) } : point) }
  }
  if (Array.isArray(value.texts)) value = { ...value, texts: value.texts.map(text => isRecord(text) ? { ...text, x: baseNumber(text.x), y: baseNumber(text.y) } : text) }
  if (isRecord(value.viewport)) value = { ...value, viewport: Object.fromEntries(Object.entries(value.viewport).map(([key, number]) => [key, baseNumber(number)])) }
  if (!isRecord(value.viewport) || !hasExactKeys(value.viewport, ['min_x', 'min_y', 'width', 'height'])) return null
  if (!isFiniteNumber(value.viewport.min_x) || !isFiniteNumber(value.viewport.min_y)
    || !isFiniteNumber(value.viewport.width) || value.viewport.width <= 0
    || !isFiniteNumber(value.viewport.height) || value.viewport.height <= 0) return null
  if (!Array.isArray(value.points) || !Array.isArray(value.segments)
    || !Array.isArray(value.polygons) || (hasTexts && !Array.isArray(value.texts))) return null
  if (value.points.length > GEOMETRY_COLLECTION_LIMITS.points || value.segments.length > GEOMETRY_COLLECTION_LIMITS.segments || value.polygons.length > GEOMETRY_COLLECTION_LIMITS.polygons
    || (hasTexts && (value.texts as unknown[]).length > GEOMETRY_COLLECTION_LIMITS.texts)) return null

  const ids = new Set<string>()
  const pointIds = new Set<string>()
  for (const point of value.points) {
    if (!isRecord(point) || !hasExactKeys(point, ['id', 'x', 'y', 'label', ...(Object.hasOwn(point, 'role') ? ['role'] : [])])
      || (Object.hasOwn(point, 'role') && point.role !== 'explicit' && point.role !== 'implicit')
      || !geometryId(point.id) || ids.has(point.id)
      || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)
      || !(point.label === null || boundedString(point.label, 100))) return null
    ids.add(point.id); pointIds.add(point.id)
  }
  for (const segment of value.segments) {
    if (!isRecord(segment) || !hasExactKeys(segment, ['id', 'start_point_id', 'end_point_id'])
      || !geometryId(segment.id) || ids.has(segment.id)
      || typeof segment.start_point_id !== 'string' || typeof segment.end_point_id !== 'string'
      || segment.start_point_id === segment.end_point_id
      || !pointIds.has(segment.start_point_id) || !pointIds.has(segment.end_point_id)) return null
    ids.add(segment.id)
  }
  for (const polygon of value.polygons) {
    if (!isRecord(polygon) || !hasExactKeys(polygon, Object.hasOwn(polygon, 'template') ? ['id', 'point_ids', 'template'] : ['id', 'point_ids'])
      || !geometryId(polygon.id) || ids.has(polygon.id)
      || !Array.isArray(polygon.point_ids) || polygon.point_ids.length < 3
      || polygon.point_ids.some((id) => typeof id !== 'string' || !pointIds.has(id))
      || new Set(polygon.point_ids).size !== polygon.point_ids.length) return null
    if (Object.hasOwn(polygon, 'template') && !validPolygonTemplate(polygon.template, polygon.point_ids.length)) return null
    ids.add(polygon.id)
  }
  const texts: GeometryTextV1[] = []
  for (const text of hasTexts ? value.texts as JsonObject[] : []) {
    if (!isRecord(text) || !hasExactKeys(text, ['id', 'x', 'y', 'content'])
      || !geometryId(text.id) || ids.has(text.id)
      || !isFiniteNumber(text.x) || !isFiniteNumber(text.y)
      || !boundedString(text.content, 500) || !isPlainText(text.content)) return null
    ids.add(text.id)
    texts.push({ id: text.id, x: text.x, y: text.y, content: text.content })
  }
  const points = new Map((value.points as GeometrySourceDataV1['points']).map(point => [point.id, point]))
  const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) && !ids.has(id)
  if (Object.hasOwn(value, 'lines')) {
    if (!Array.isArray(value.lines) || value.lines.length > GEOMETRY_COLLECTION_LIMITS.lines) return null
    for (const line of value.lines) {
      if (!isRecord(line) || !hasExactKeys(line, ['id', 'kind', 'start_point_id', 'end_point_id']) || !validId(line.id)
        || !['line', 'directed_line', 'vector'].includes(String(line.kind))
        || typeof line.start_point_id !== 'string' || typeof line.end_point_id !== 'string') return null
      const a = points.get(line.start_point_id), b = points.get(line.end_point_id)
      if (!a || !b || a.id === b.id || (a.x === b.x && a.y === b.y)) return null
      ids.add(line.id)
    }
  }
  if (Object.hasOwn(value, 'polylines')) {
    if (!Array.isArray(value.polylines) || value.polylines.length > GEOMETRY_COLLECTION_LIMITS.polylines) return null
    for (const polyline of value.polylines) {
      if (!isRecord(polyline) || !hasExactKeys(polyline, ['id', 'point_ids']) || !validId(polyline.id)
        || !Array.isArray(polyline.point_ids) || polyline.point_ids.length < 2 || polyline.point_ids.length > 500
        || new Set(polyline.point_ids).size !== polyline.point_ids.length
        || polyline.point_ids.some(id => typeof id !== 'string' || !points.has(id))) return null
      const vertices = (polyline.point_ids as string[]).map(id => points.get(id)!)
      if (vertices.some((p, i) => i > 0 && p.x === vertices[i - 1].x && p.y === vertices[i - 1].y)) return null
      ids.add(polyline.id)
    }
  }
  if (Object.hasOwn(value, 'circles')) {
    if (!Array.isArray(value.circles) || value.circles.length > GEOMETRY_COLLECTION_LIMITS.circles) return null
    for (const circle of value.circles) {
      if (!isRecord(circle) || !hasExactKeys(circle, ['id', 'center_point_id', 'radius', 'kind']) || !validId(circle.id)
        || typeof circle.kind !== 'string' || !isCircleTool(circle.kind) || !validCircleRadius(circle.radius)
        || typeof circle.center_point_id !== 'string' || !points.has(circle.center_point_id)) return null
      ids.add(circle.id)
    }
  }
  if (Object.hasOwn(value, 'arcs')) {
    if (!Array.isArray(value.arcs) || value.arcs.length > GEOMETRY_COLLECTION_LIMITS.arcs) return null
    for (const arc of value.arcs) {
      if (!isRecord(arc) || !hasExactKeys(arc, ['id', 'center_point_id', 'radius', 'kind', 'start_angle', 'sweep_angle']) || !validId(arc.id)
        || typeof arc.kind !== 'string' || !isArcTool(arc.kind) || !validCircleRadius(arc.radius)
        || !validArcAngles(arc.start_angle, arc.sweep_angle)
        || typeof arc.center_point_id !== 'string' || !points.has(arc.center_point_id)) return null
      ids.add(arc.id)
    }
  }
  if (Object.hasOwn(value, 'constructions') && !evaluateConstructions(value.points as GeometrySourceDataV1['points'], value.constructions, ids, true, value as GeometrySourceDataV1)) return null
  return {
    schema_version: 1,
    viewport: value.viewport,
    description: value.description,
    points: value.points,
    segments: value.segments,
    polygons: value.polygons,
    texts,
    ...(Object.hasOwn(value, 'lines') ? { lines: value.lines } : {}),
    ...(Object.hasOwn(value, 'polylines') ? { polylines: value.polylines } : {}),
    ...(Object.hasOwn(value, 'circles') ? { circles: value.circles } : {}),
    ...(Object.hasOwn(value, 'arcs') ? { arcs: value.arcs } : {}),
    ...(Object.hasOwn(value, 'constructions') ? { constructions: value.constructions } : {}),
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
