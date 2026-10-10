import type { GeometrySourceDataV1, GeometryPointV1, GeometryConstructionV1, GeometryLinearSourceV1, GeometryLinearConstructionV1, GeometryMidpointConstructionV1, GeometryIntersectionConstructionV1, GeometryAngleBisectorConstructionV1 } from '../api/questionEditor'
import limitsJson from '../../../backend/app/schemas/geometry_construction_limits.json?raw'
import type { GeometryAltitudeConstructionV1 } from '../api/questionEditor'
import type { GeometryMedianConstructionV1 } from '../api/questionEditor'
import { triangleContext } from './geometryTopologyModel'
import type { GeometryPointParent, GeometryPointConstraintV1 } from '../api/questionEditor'
import { pointParentEndpoints, parameterCoordinates, projectPointParameter } from './geometryPointConstraintModel'
import { canAllocateGeometry } from './geometryCapacityModel'

export const CONSTRUCTION_LIMITS = JSON.parse(limitsJson) as { coordinateTolerance: number; minimumSourceDistance: number; maxConstructions: number }
export const midpointCoordinates = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x / 2 + b.x / 2, y: a.y / 2 + b.y / 2 })
export const ownedConstructionIds = (c: GeometryConstructionV1) =>
  c.kind === 'midpoint' || c.kind === 'intersection' || c.kind === 'point_on_segment' || c.kind === 'point_on_line'
    ? [c.output_point_id]
    : c.kind === 'altitude' ? [c.output_segment_id, c.foot_point_id]
    : c.kind === 'median' ? [c.output_segment_id]
    : [c.output_line_id, c.support_point_id, ...(c.kind === 'angle_bisector' && c.intersection_point_id ? [c.intersection_point_id] : [])]

export const isDerivedPoint = (g: GeometrySourceDataV1, id: string) =>
  (g.constructions ?? []).some(c =>
    c.kind === 'midpoint' || c.kind === 'intersection' || c.kind === 'point_on_segment' || c.kind === 'point_on_line'
      ? c.output_point_id === id
      : c.kind === 'altitude' ? c.foot_point_id === id
      : c.kind === 'median' ? false
      : c.support_point_id === id || (c.kind === 'angle_bisector' && c.intersection_point_id === id)
  )
export const geometryObjectIds = (g: GeometrySourceDataV1) => new Set([...g.points, ...g.segments, ...g.polygons, ...g.texts, ...(g.lines ?? []), ...(g.polylines ?? []), ...(g.circles ?? []), ...(g.arcs ?? []), ...(g.constructions ?? [])].map(o => o.id))
const pairKey = (ids: readonly string[]) => JSON.stringify([...ids].sort())
export const findMidpoint = (g: GeometrySourceDataV1, a: string, b: string) => g.constructions?.find((c): c is GeometryMidpointConstructionV1 => c.kind === 'midpoint' && pairKey(c.source_point_ids) === pairKey([a, b]))
type LinearObjects = Pick<GeometrySourceDataV1, 'segments' | 'lines'> & Partial<Pick<GeometrySourceDataV1, 'polygons'>>
export const linearSourceObject = (g: LinearObjects, source: GeometryLinearSourceV1) => source.kind === 'segment' ? g.segments.find(s => s.id === source.id) : g.lines?.find(l => l.id === source.id && l.kind === source.kind)
export const isLinearConstructionTool = (tool: string): tool is GeometryLinearConstructionV1['kind'] => tool === 'parallel' || tool === 'perpendicular'
export function linearSupportCoordinates(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }, kind: GeometryLinearConstructionV1['kind']) {
  let dx = b.x - a.x, dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < CONSTRUCTION_LIMITS.minimumSourceDistance) return null
  dx /= length; dy /= length
  if (kind === 'perpendicular') [dx, dy] = [-dy, dx]
  if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy }
  const result = { x: p.x + dx, y: p.y + dy }
  return Number.isFinite(result.x) && Number.isFinite(result.y) && (result.x !== p.x || result.y !== p.y) ? result : null
}
export const findLinearConstruction = (g: GeometrySourceDataV1, kind: GeometryLinearConstructionV1['kind'], source: GeometryLinearSourceV1, through: string) => g.constructions?.find((c): c is GeometryLinearConstructionV1 => c.kind === kind && c.source.kind === source.kind && c.source.id === source.id && c.through_point_id === through)

const linearSourceKey = (source: GeometryLinearSourceV1) =>
  JSON.stringify([source.kind, source.id])

export const findIntersection = (
  g: GeometrySourceDataV1,
  sourceA: GeometryLinearSourceV1,
  sourceB: GeometryLinearSourceV1,
) => {
  const key = JSON.stringify(
    [linearSourceKey(sourceA), linearSourceKey(sourceB)].sort(),
  )
  return g.constructions?.find((c): c is GeometryIntersectionConstructionV1 =>
    c.kind === 'intersection'
    && JSON.stringify(
      [linearSourceKey(c.source_a), linearSourceKey(c.source_b)].sort(),
    ) === key
  )
}
export const findAngleBisector = (
  g: GeometrySourceDataV1,
  aId: string,
  vertexId: string,
  cId: string,
) => g.constructions?.find(
  (construction): construction is GeometryAngleBisectorConstructionV1 =>
    construction.kind === 'angle_bisector'
    && construction.source_point_ids[1] === vertexId
    && pairKey([
      construction.source_point_ids[0],
      construction.source_point_ids[2],
    ]) === pairKey([aId, cId]),
)

const constructionInputs = (c: GeometryConstructionV1, g?: LinearObjects) =>
  (c.kind === 'point_on_segment' || c.kind === 'point_on_line')
    ? [...(g ? pointParentEndpoints(g,c.parent) ?? [] : c.parent.kind==='polygon_edge'?[c.parent.start_point_id,c.parent.end_point_id]:[]), ...(c.parent.kind==='segment'?[c.parent.segment_id]:c.parent.kind==='line'?[c.parent.line_id]:[])]
    : c.kind === 'median'
    ? [c.vertex_point_id, c.midpoint_point_id]
    : c.kind === 'midpoint' || c.kind === 'angle_bisector' || c.kind === 'altitude'
      ? c.source_point_ids
      : c.kind === 'intersection'
        ? [c.source_a.id, c.source_b.id]
        : [c.source.id, c.through_point_id]
export function angleBisectorSupportCoordinates(
  a: { x: number; y: number },
  vertex: { x: number; y: number },
  c: { x: number; y: number },
) {
  let ax = a.x - vertex.x, ay = a.y - vertex.y
  let cx = c.x - vertex.x, cy = c.y - vertex.y

  const aLength = Math.hypot(ax, ay)
  const cLength = Math.hypot(cx, cy)

  if (
    !Number.isFinite(aLength)
    || !Number.isFinite(cLength)
    || aLength < CONSTRUCTION_LIMITS.minimumSourceDistance
    || cLength < CONSTRUCTION_LIMITS.minimumSourceDistance
  ) return null

  ax /= aLength
  ay /= aLength
  cx /= cLength
  cy /= cLength

  let dx = ax + cx, dy = ay + cy
  const directionLength = Math.hypot(dx, dy)

  if (
    !Number.isFinite(directionLength)
    || directionLength < CONSTRUCTION_LIMITS.minimumSourceDistance
  ) return null

  dx /= directionLength
  dy /= directionLength

  const result = {
    x: vertex.x + dx,
    y: vertex.y + dy,
  }

  return Number.isFinite(result.x) && Number.isFinite(result.y)
    ? result
    : null
}

export function intersectionCoordinates(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
) {
  const adx = a2.x - a1.x, ady = a2.y - a1.y
  const bdx = b2.x - b1.x, bdy = b2.y - b1.y

  if (
    Math.hypot(adx, ady) < CONSTRUCTION_LIMITS.minimumSourceDistance
    || Math.hypot(bdx, bdy) < CONSTRUCTION_LIMITS.minimumSourceDistance
  ) return null

  const denominator = adx * bdy - ady * bdx
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= CONSTRUCTION_LIMITS.coordinateTolerance) return null

  const dx = b1.x - a1.x, dy = b1.y - a1.y
  const t = (dx * bdy - dy * bdx) / denominator
  const u = (dx * ady - dy * adx) / denominator
  const x = a1.x + t * adx, y = a1.y + t * ady

  return [t, u, x, y].every(Number.isFinite) ? { x, y, t, u } : null
}

export function angleBisectorIntersectionCoordinates(a: GeometryPointV1, vertex: GeometryPointV1, c: GeometryPointV1, support: { x: number; y: number }) {
  const intersection = intersectionCoordinates(vertex, support, a, c)
  const tolerance = CONSTRUCTION_LIMITS.coordinateTolerance
  return intersection && intersection.t >= 0 && intersection.u >= -tolerance && intersection.u <= 1 + tolerance
    ? { x: intersection.x, y: intersection.y } : null
}

export function altitudeFootCoordinates(a: { x: number; y: number }, vertex: { x: number; y: number }, c: { x: number; y: number }) {
  const length = Math.hypot(c.x - a.x, c.y - a.y)
  if (!Number.isFinite(length) || length < CONSTRUCTION_LIMITS.minimumSourceDistance) return null
  const dx = (c.x - a.x) / length, dy = (c.y - a.y) / length
  const vx = vertex.x - a.x, vy = vertex.y - a.y
  const distance = vx * dx + vy * dy
  const height = vx * dy - vy * dx
  const result = { x: a.x + distance * dx, y: a.y + distance * dy }
  return [distance, height, result.x, result.y].every(Number.isFinite)
    && Math.abs(height) >= CONSTRUCTION_LIMITS.minimumSourceDistance
    && (result.x !== vertex.x || result.y !== vertex.y) ? result : null
}

export const findMedian = (
  g: GeometrySourceDataV1,
  vertexId: string,
  midpointId: string,
) =>
  g.constructions?.find(
    (recipe): recipe is GeometryMedianConstructionV1 =>
      recipe.kind === 'median'
      && recipe.vertex_point_id === vertexId
      && recipe.midpoint_point_id === midpointId
  )

export function commitMedian(
  g: GeometrySourceDataV1,
  vertexId: string,
  midpointId: string,
): GeometrySourceDataV1 {
  if (
    vertexId === midpointId
    || findMedian(g, vertexId, midpointId)
    || g.segments.length >= 1000
    || (g.constructions?.length ?? 0) >= CONSTRUCTION_LIMITS.maxConstructions
  ) return g

  const vertex = g.points.find(p => p.id === vertexId)
  const midpoint = g.points.find(p => p.id === midpointId)
  if (
    !vertex
    || !midpoint
    || ![vertex.x, vertex.y, midpoint.x, midpoint.y].every(Number.isFinite)
    || Math.hypot(vertex.x - midpoint.x, vertex.y - midpoint.y)
      < CONSTRUCTION_LIMITS.minimumSourceDistance
  ) return g

  const ids = geometryObjectIds(g)
  const nextId = (prefix: string) => {
    let n = 1
    while (ids.has(`${prefix}-${n}`)) n++
    const id = `${prefix}-${n}`
    ids.add(id)
    return id
  }

  const segment = {
    id: nextId('segment'),
    start_point_id: vertexId,
    end_point_id: midpointId,
  }

  const recipe: GeometryMedianConstructionV1 = {
    id: nextId('construction'),
    kind: 'median',
    vertex_point_id: vertexId,
    midpoint_point_id: midpointId,
    output_segment_id: segment.id,
  }

  return recomputeConstructions({
    ...g,
    segments: [...g.segments, segment],
    constructions: [...(g.constructions ?? []), recipe],
  }) ?? g
}

export function commitTriangleMedian(g: GeometrySourceDataV1, aId: string, vertexId: string, cId: string):
  { geometry: GeometrySourceDataV1; status: 'rejected' }
  | { geometry: GeometrySourceDataV1; status: 'existing' | 'created'; outputSegmentId: string } {
  const rejected = { geometry: g, status: 'rejected' as const }
  const sourceIds = [aId, vertexId, cId]
  if (new Set(sourceIds).size !== 3
    || !triangleContext(g, sourceIds)) return rejected
  const [a, vertex, c] = sourceIds.map(id => g.points.find(p => p.id === id))
  if (!a || !vertex || !c || ![a.x, a.y, vertex.x, vertex.y, c.x, c.y].every(Number.isFinite)
    || !altitudeFootCoordinates(a, vertex, c)) return rejected

  // Keep both commits local so a failed Median cannot publish an orphan midpoint.
  const candidate = findMidpoint(g, aId, cId) ? g : commitMidpoint(g, aId, cId)
  const midpoint = findMidpoint(candidate, aId, cId)
  if (!midpoint) return rejected
  const existing = findMedian(candidate, vertexId, midpoint.output_point_id)
  if (existing) return { geometry: g, status: 'existing', outputSegmentId: existing.output_segment_id }
  const next = commitMedian(candidate, vertexId, midpoint.output_point_id)
  const median = findMedian(next, vertexId, midpoint.output_point_id)
  return median ? { geometry: next, status: 'created', outputSegmentId: median.output_segment_id } : rejected
}

// Shared presentation only: keep the owned foot even when its marker overlaps a source.
export function altitudePresentation(g: GeometrySourceDataV1) {
  const points = new Map(g.points.map(p => [p.id, p]))
  const hiddenFootIds = new Set<string>()
  const extensions: { id: string; start: GeometryPointV1; end: GeometryPointV1 }[] = []
  for (const recipe of g.constructions ?? []) {
    if (recipe.kind !== 'altitude') continue
    const a = points.get(recipe.source_point_ids[0]), c = points.get(recipe.source_point_ids[2]), h = points.get(recipe.foot_point_id)
    if (!a || !c || !h) continue
    const tolerance = CONSTRUCTION_LIMITS.coordinateTolerance
    if ([a, c].some(p => Math.hypot(p.x - h.x, p.y - h.y) <= tolerance)) {
      hiddenFootIds.add(h.id)
      continue
    }
    const length = Math.hypot(c.x - a.x, c.y - a.y)
    if (!length) continue
    const along = (h.x - a.x) * ((c.x - a.x) / length) + (h.y - a.y) * ((c.y - a.y) / length)
    if (along < -tolerance || along > length + tolerance) extensions.push({ id: recipe.id, start: along < 0 ? a : c, end: h })
  }
  return { hiddenFootIds, extensions }
}

export const findAltitude = (g: GeometrySourceDataV1, a: string, vertex: string, c: string) =>
  g.constructions?.find((recipe): recipe is GeometryAltitudeConstructionV1 => recipe.kind === 'altitude' && recipe.source_point_ids[1] === vertex
    && pairKey([recipe.source_point_ids[0], recipe.source_point_ids[2]]) === pairKey([a, c]))

export function commitAltitude(g: GeometrySourceDataV1, aId: string, vertexId: string, cId: string): GeometrySourceDataV1 {
  const sourceIds: [string, string, string] = [aId, vertexId, cId]
  if (new Set(sourceIds).size !== 3 || findAltitude(g, ...sourceIds) || g.points.length >= 500
    || g.segments.length >= 1000 || (g.constructions?.length ?? 0) >= CONSTRUCTION_LIMITS.maxConstructions
    || !triangleContext(g, sourceIds)) return g
  const [a, vertex, c] = sourceIds.map(id => g.points.find(p => p.id === id))
  if (!a || !vertex || !c) return g
  const foot = altitudeFootCoordinates(a, vertex, c)
  if (!foot) return g
  const ids = geometryObjectIds(g)
  const nextId = (prefix: string) => { let n = 1; while (ids.has(`${prefix}-${n}`)) n++; const id = `${prefix}-${n}`; ids.add(id); return id }
  const h = { id: nextId('point'), ...foot, label: null }
  const segment = { id: nextId('segment'), start_point_id: vertexId, end_point_id: h.id }
  const recipe: GeometryConstructionV1 = { id: nextId('construction'), kind: 'altitude', source_point_ids: sourceIds, output_segment_id: segment.id, foot_point_id: h.id }
  return recomputeConstructions({ ...g, points: [...g.points, h], segments: [...g.segments, segment], constructions: [...(g.constructions ?? []), recipe] }) ?? g
}

// One bounded evaluation boundary for validation and atomic source edits. Recipes
// own their output only; sources are borrowed. Array order is never dependency order.
export function evaluateConstructions(points: GeometryPointV1[], recipes: unknown, otherIds: Set<string>, checkStored = true, linear: LinearObjects = { segments: [] }): GeometryPointV1[] | null {
  if (!Array.isArray(recipes) || recipes.length > CONSTRUCTION_LIMITS.maxConstructions) return null
  const locations = new Map(points.map(p => [p.id, { ...p }]))
  const ids = new Set(otherIds), outputs = new Set<string>(), pairs = new Set<string>()
  const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)
  for (const c of recipes) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || !validId(c.id) || ids.has(c.id)) return null
    let key: string
    if (c.kind === 'point_on_segment' || c.kind === 'point_on_line') {
      const p=c.parent
      if(Object.keys(c).sort().join(',')!=='id,kind,output_point_id,parent,t'||!p||typeof p!=='object'||Array.isArray(p)
        || !Number.isFinite(c.t)||(c.kind==='point_on_segment'&&(c.t<0||c.t>1))||!validId(c.output_point_id)||!locations.has(c.output_point_id)
        || (c.kind==='point_on_line' ? p.kind!=='line'||Object.keys(p).sort().join(',')!=='kind,line_id'||!validId(p.line_id) : p.kind==='segment' ? Object.keys(p).sort().join(',')!=='kind,segment_id'||!validId(p.segment_id)
          : p.kind==='polygon_edge'?Object.keys(p).sort().join(',')!=='end_point_id,kind,polygon_id,start_point_id'||![p.polygon_id,p.start_point_id,p.end_point_id].every(validId):true))return null
      const endpoints=pointParentEndpoints(linear,p)
      if(!endpoints||endpoints[0]===endpoints[1]||!endpoints.every(id=>locations.has(id))||endpoints.includes(c.output_point_id))return null
      key=JSON.stringify([c.kind,c.output_point_id])
    } else if (c.kind === 'midpoint') {
      if (Object.keys(c).sort().join(',') !== 'id,kind,output_point_id,source_point_ids' || !Array.isArray(c.source_point_ids) || c.source_point_ids.length !== 2
      || !c.source_point_ids.every((id: unknown) => validId(id) && locations.has(id)) || c.source_point_ids[0] === c.source_point_ids[1]
      || !validId(c.output_point_id) || !locations.has(c.output_point_id) || c.source_point_ids.includes(c.output_point_id)
      || outputs.has(c.output_point_id)) return null
      key = 'midpoint:' + pairKey(c.source_point_ids)
    } else if (c.kind === 'intersection') {
      if (
        Object.keys(c).sort().join(',') !== 'id,kind,output_point_id,source_a,source_b'
        || !c.source_a || typeof c.source_a !== 'object' || Array.isArray(c.source_a)
        || !c.source_b || typeof c.source_b !== 'object' || Array.isArray(c.source_b)
        || Object.keys(c.source_a).sort().join(',') !== 'id,kind'
        || Object.keys(c.source_b).sort().join(',') !== 'id,kind'
        || !['line','directed_line','segment','vector'].includes(c.source_a.kind)
        || !['line','directed_line','segment','vector'].includes(c.source_b.kind)
        || !validId(c.source_a.id) || !validId(c.source_b.id)
        || !linearSourceObject(linear, c.source_a)
        || !linearSourceObject(linear, c.source_b)
        || c.source_a.id === c.source_b.id
        || !validId(c.output_point_id) || !locations.has(c.output_point_id)
        || outputs.has(c.output_point_id)
      ) return null

      const sourceA = linearSourceObject(linear, c.source_a)!
      const sourceB = linearSourceObject(linear, c.source_b)!
      if (
        [
          sourceA.start_point_id,
          sourceA.end_point_id,
          sourceB.start_point_id,
          sourceB.end_point_id,
        ].includes(c.output_point_id)
      ) return null

      key = JSON.stringify([
        'intersection',
        ...[
          [c.source_a.kind, c.source_a.id],
          [c.source_b.kind, c.source_b.id],
        ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      ])
    } else if (c.kind === 'median') {
      if (
        Object.keys(c).sort().join(',') !== 'id,kind,midpoint_point_id,output_segment_id,vertex_point_id'
        || !validId(c.vertex_point_id)
        || !locations.has(c.vertex_point_id)
        || !validId(c.midpoint_point_id)
        || !locations.has(c.midpoint_point_id)
        || c.vertex_point_id === c.midpoint_point_id
        || !validId(c.output_segment_id)
      ) return null

      const segment = linear.segments.find(s => s.id === c.output_segment_id)
      if (
        !segment
        || segment.start_point_id !== c.vertex_point_id
        || segment.end_point_id !== c.midpoint_point_id
      ) return null

      key = JSON.stringify([
        'median',
        c.vertex_point_id,
        c.midpoint_point_id,
      ])
    } else if (c.kind === 'altitude') {
      if (Object.keys(c).sort().join(',') !== 'foot_point_id,id,kind,output_segment_id,source_point_ids'
        || !Array.isArray(c.source_point_ids) || c.source_point_ids.length !== 3 || new Set(c.source_point_ids).size !== 3
        || !c.source_point_ids.every((id: unknown) => validId(id) && locations.has(id))
        || !validId(c.foot_point_id) || !locations.has(c.foot_point_id) || c.source_point_ids.includes(c.foot_point_id)
        || !validId(c.output_segment_id)) return null
      const segment = linear.segments.find(s => s.id === c.output_segment_id)
      if (!segment || segment.start_point_id !== c.source_point_ids[1] || segment.end_point_id !== c.foot_point_id) return null
      key = JSON.stringify(['altitude', c.source_point_ids[1], ...[c.source_point_ids[0], c.source_point_ids[2]].sort()])
    } else if (c.kind === 'angle_bisector') {
      if (
        Object.keys(c).sort().join(',') !== (Object.hasOwn(c, 'intersection_point_id')
          ? 'id,intersection_point_id,kind,output_line_id,source_point_ids,support_point_id'
          : 'id,kind,output_line_id,source_point_ids,support_point_id')
        || !Array.isArray(c.source_point_ids)
        || c.source_point_ids.length !== 3
        || !c.source_point_ids.every((id: unknown) => validId(id) && locations.has(id))
        || new Set(c.source_point_ids).size !== 3
        || !validId(c.support_point_id)
        || !locations.has(c.support_point_id)
        || c.source_point_ids.includes(c.support_point_id)
        || !validId(c.output_line_id)
        || (Object.hasOwn(c, 'intersection_point_id') && (!validId(c.intersection_point_id)
          || !locations.has(c.intersection_point_id) || c.source_point_ids.includes(c.intersection_point_id)
          || c.intersection_point_id === c.support_point_id))
      ) return null

      const output = linear.lines?.find(l => l.id === c.output_line_id)
      if (
        !output
        || output.kind !== 'line'
        || output.start_point_id !== c.source_point_ids[1]
        || output.end_point_id !== c.support_point_id
      ) return null

      key = JSON.stringify([
        'angle_bisector',
        c.source_point_ids[1], ...[c.source_point_ids[0], c.source_point_ids[2]].sort(),
      ])
    } else if (isLinearConstructionTool(c.kind)) {
      if (Object.keys(c).sort().join(',') !== 'id,kind,output_line_id,source,support_point_id,through_point_id'
        || !c.source || typeof c.source !== 'object' || Array.isArray(c.source) || Object.keys(c.source).sort().join(',') !== 'id,kind'
        || !['line','directed_line','segment','vector'].includes(c.source.kind) || !validId(c.source.id) || !linearSourceObject(linear,c.source)
        || !validId(c.through_point_id) || !locations.has(c.through_point_id) || !validId(c.support_point_id) || !locations.has(c.support_point_id)
        || !validId(c.output_line_id) || c.source.id === c.output_line_id || c.through_point_id === c.support_point_id) return null
      const output = linear.lines?.find(l => l.id === c.output_line_id)
      if (!output || output.kind !== 'line' || output.start_point_id !== c.through_point_id || output.end_point_id !== c.support_point_id) return null
      key = JSON.stringify([c.kind,c.source.kind,c.source.id,c.through_point_id])
    } else return null
    if (pairs.has(key) || ownedConstructionIds(c).some(id => outputs.has(id))) return null
    ids.add(c.id); ownedConstructionIds(c).forEach(id => outputs.add(id)); pairs.add(key)
  }
  let pending = [...recipes] as GeometryConstructionV1[]
  const ready = new Set(points.filter(p => !outputs.has(p.id)).map(p => p.id))
  const ordinaryLinear = [...linear.segments, ...(linear.lines ?? [])].filter(l => !outputs.has(l.id))
  while (pending.length) {
    for (const l of ordinaryLinear) if (ready.has(l.start_point_id) && ready.has(l.end_point_id)) ready.add(l.id)
    const next = pending.filter(c => constructionInputs(c,linear).every(id => ready.has(id))).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    if (!next.length) return null
    for (const c of next) {
      let expected: { x: number; y: number } | null
      let stored: GeometryPointV1

      if (c.kind === 'point_on_segment' || c.kind === 'point_on_line') {
        const [a,b]=pointParentEndpoints(linear,c.parent)!
        expected=parameterCoordinates(locations.get(a)!,locations.get(b)!,c.t,c.kind==='point_on_line')
        stored=locations.get(c.output_point_id)!
      } else if (c.kind === 'midpoint') {
        expected = midpointCoordinates(
          locations.get(c.source_point_ids[0])!,
          locations.get(c.source_point_ids[1])!,
        )
        stored = locations.get(c.output_point_id)!
      } else if (c.kind === 'intersection') {
        const sourceA = linearSourceObject(linear, c.source_a)!
        const sourceB = linearSourceObject(linear, c.source_b)!
        const intersection = intersectionCoordinates(
          locations.get(sourceA.start_point_id)!,
          locations.get(sourceA.end_point_id)!,
          locations.get(sourceB.start_point_id)!,
          locations.get(sourceB.end_point_id)!,
        )
        if (!intersection) return null

        const tolerance = CONSTRUCTION_LIMITS.coordinateTolerance
        if (
          (['segment', 'vector'].includes(c.source_a.kind)
            && !(intersection.t >= -tolerance && intersection.t <= 1 + tolerance))
          || (['segment', 'vector'].includes(c.source_b.kind)
            && !(intersection.u >= -tolerance && intersection.u <= 1 + tolerance))
        ) return null

        expected = { x: intersection.x, y: intersection.y }
        stored = locations.get(c.output_point_id)!
      } else if (c.kind === 'median') {
        const vertex = locations.get(c.vertex_point_id)!
        const midpoint = locations.get(c.midpoint_point_id)!
        if (![vertex.x, vertex.y, midpoint.x, midpoint.y].every(Number.isFinite)
          || Math.hypot(vertex.x - midpoint.x, vertex.y - midpoint.y) < CONSTRUCTION_LIMITS.minimumSourceDistance) return null
        ownedConstructionIds(c).forEach(id => ready.add(id))
        ready.add(c.id)
        continue
      } else if (c.kind === 'altitude') {
        expected = altitudeFootCoordinates(locations.get(c.source_point_ids[0])!, locations.get(c.source_point_ids[1])!, locations.get(c.source_point_ids[2])!)
        stored = locations.get(c.foot_point_id)!
      } else if (c.kind === 'angle_bisector') {
        expected = angleBisectorSupportCoordinates(
          locations.get(c.source_point_ids[0])!,
          locations.get(c.source_point_ids[1])!,
          locations.get(c.source_point_ids[2])!,
        )
        stored = locations.get(c.support_point_id)!
        if (c.intersection_point_id) {
          if (!expected) return null
          const intersection = angleBisectorIntersectionCoordinates(
            locations.get(c.source_point_ids[0])!, locations.get(c.source_point_ids[1])!,
            locations.get(c.source_point_ids[2])!, expected,
          )
          const output = locations.get(c.intersection_point_id)!
          if (!intersection || ![output.x, output.y].every(Number.isFinite)
            || (checkStored && (Math.abs(intersection.x - output.x) > CONSTRUCTION_LIMITS.coordinateTolerance
              || Math.abs(intersection.y - output.y) > CONSTRUCTION_LIMITS.coordinateTolerance))) return null
          locations.set(output.id, { ...output, ...intersection })
        }
      } else {
        const source = linearSourceObject(linear, c.source)!
        expected = linearSupportCoordinates(
          locations.get(source.start_point_id)!,
          locations.get(source.end_point_id)!,
          locations.get(c.through_point_id)!,
          c.kind,
        )
        stored = locations.get(c.support_point_id)!
      }

      if (!expected) return null
      if (![expected.x, expected.y, stored.x, stored.y].every(Number.isFinite)
        || (checkStored && (Math.abs(expected.x - stored.x) > CONSTRUCTION_LIMITS.coordinateTolerance || Math.abs(expected.y - stored.y) > CONSTRUCTION_LIMITS.coordinateTolerance))) return null
      locations.set(stored.id, { ...stored, ...expected }); ownedConstructionIds(c).forEach(id => ready.add(id)); ready.add(c.id)
    }
    pending = pending.filter(c => !ready.has(c.id))
  }
  return points.map(p => locations.get(p.id)!)
}

export function recomputeConstructions(g: GeometrySourceDataV1): GeometrySourceDataV1 | null {
  if (!g.constructions) return g
  g=detachInvalidPointParents(g)
  const ids = geometryObjectIds({ ...g, constructions: [] })
  const points = evaluateConstructions(g.points, g.constructions, ids, false, g)
  return points ? { ...g, points } : null
}

export function commitMidpoint(g: GeometrySourceDataV1, aId: string, bId: string): GeometrySourceDataV1 {
  const a = g.points.find(p => p.id === aId), b = g.points.find(p => p.id === bId)
  if (!a || !b || aId === bId || findMidpoint(g, aId, bId) || Math.hypot(a.x - b.x, a.y - b.y) < CONSTRUCTION_LIMITS.minimumSourceDistance
    || g.points.length >= 500 || (g.constructions?.length ?? 0) >= CONSTRUCTION_LIMITS.maxConstructions) return g
  const ids = geometryObjectIds(g)
  const nextId = (prefix: string) => { let n = 1; while (ids.has(`${prefix}-${n}`)) n++; const id = `${prefix}-${n}`; ids.add(id); return id }
  const output = { id: nextId('point'), ...midpointCoordinates(a, b), label: null }
  const recipe: GeometryConstructionV1 = { id: nextId('construction'), kind: 'midpoint', source_point_ids: [aId, bId].sort() as [string, string], output_point_id: output.id }
  return recomputeConstructions({ ...g, points: [...g.points, output], constructions: [...(g.constructions ?? []), recipe] }) ?? g
}

export function commitAngleBisector(
  g: GeometrySourceDataV1,
  aId: string,
  vertexId: string,
  cId: string,
): GeometrySourceDataV1 {
  if (
    new Set([aId, vertexId, cId]).size !== 3
    || findAngleBisector(g, aId, vertexId, cId)
    || (g.lines?.length ?? 0) >= 1000
    || g.points.length >= 500
    || (g.constructions?.length ?? 0) >= CONSTRUCTION_LIMITS.maxConstructions
  ) return g

  const a = g.points.find(p => p.id === aId)
  const vertex = g.points.find(p => p.id === vertexId)
  const c = g.points.find(p => p.id === cId)
  if (!a || !vertex || !c) return g

  const coordinates = angleBisectorSupportCoordinates(a, vertex, c)
  if (!coordinates) return g
  const triangle = !!triangleContext(g, [aId, vertexId, cId])
  const intersection = triangle ? angleBisectorIntersectionCoordinates(a, vertex, c, coordinates) : null
  if (triangle && (!intersection || g.points.length > 498)) return g

  const ids = geometryObjectIds(g)
  const nextId = (prefix: string) => {
    let n = 1
    while (ids.has(`${prefix}-${n}`)) n++
    const id = `${prefix}-${n}`
    ids.add(id)
    return id
  }

  const support = {
    id: nextId('point'),
    ...coordinates,
    label: null,
  }
  const intersectionPoint = intersection ? { id: nextId('point'), ...intersection, label: null } : null

  const line = {
    id: nextId('line'),
    kind: 'line' as const,
    start_point_id: vertexId,
    end_point_id: support.id,
  }

  const recipe: GeometryAngleBisectorConstructionV1 = {
    id: nextId('construction'),
    kind: 'angle_bisector',
    source_point_ids: [aId, vertexId, cId],
    output_line_id: line.id,
    support_point_id: support.id,
    ...(intersectionPoint ? { intersection_point_id: intersectionPoint.id } : {}),
  }

  return recomputeConstructions({
    ...g,
    points: [...g.points, support, ...(intersectionPoint ? [intersectionPoint] : [])],
    lines: [...(g.lines ?? []), line],
    constructions: [...(g.constructions ?? []), recipe],
  }) ?? g
}

export function constructionDeletionClosure(g: GeometrySourceDataV1, objectId: string): Set<string> {
  const removed = new Set([objectId])
  let changed = true
  while (changed) {
    changed = false
    const add = (id: string) => { if (!removed.has(id)) { removed.add(id); changed = true } }
    for (const l of [...g.segments,...(g.lines ?? [])]) if (removed.has(l.start_point_id) || removed.has(l.end_point_id)) add(l.id)
    for (const c of g.constructions ?? []) if ((c.kind !== 'point_on_segment' && c.kind !== 'point_on_line' && constructionInputs(c,g).some(id => removed.has(id))) || ownedConstructionIds(c).some(id => removed.has(id))) {
      add(c.id); ownedConstructionIds(c).forEach(add)
    }
  }
  return removed
}

export function commitIntersection(
  g: GeometrySourceDataV1,
  sourceA: GeometryLinearSourceV1,
  sourceB: GeometryLinearSourceV1,
): GeometrySourceDataV1 {
  if (
    sourceA.id === sourceB.id
    || findIntersection(g, sourceA, sourceB)
    || g.points.length >= 500
    || (g.constructions?.length ?? 0) >= CONSTRUCTION_LIMITS.maxConstructions
  ) return g

  const objectA = linearSourceObject(g, sourceA)
  const objectB = linearSourceObject(g, sourceB)
  if (!objectA || !objectB) return g

  const a1 = g.points.find(p => p.id === objectA.start_point_id)
  const a2 = g.points.find(p => p.id === objectA.end_point_id)
  const b1 = g.points.find(p => p.id === objectB.start_point_id)
  const b2 = g.points.find(p => p.id === objectB.end_point_id)
  if (!a1 || !a2 || !b1 || !b2) return g

  const intersection = intersectionCoordinates(a1, a2, b1, b2)
  if (!intersection) return g

  const tolerance = CONSTRUCTION_LIMITS.coordinateTolerance
  if (
    (['segment', 'vector'].includes(sourceA.kind)
      && !(intersection.t >= -tolerance && intersection.t <= 1 + tolerance))
    || (['segment', 'vector'].includes(sourceB.kind)
      && !(intersection.u >= -tolerance && intersection.u <= 1 + tolerance))
  ) return g

  const ids = geometryObjectIds(g)
  const nextId = (prefix: string) => {
    let n = 1
    while (ids.has(`${prefix}-${n}`)) n++
    const id = `${prefix}-${n}`
    ids.add(id)
    return id
  }

  const output = {
    id: nextId('point'),
    x: intersection.x,
    y: intersection.y,
    label: null,
  }

  const recipe: GeometryIntersectionConstructionV1 = {
    id: nextId('construction'),
    kind: 'intersection',
    source_a: { ...sourceA },
    source_b: { ...sourceB },
    output_point_id: output.id,
  }

  return recomputeConstructions({
    ...g,
    points: [...g.points, output],
    constructions: [...(g.constructions ?? []), recipe],
  }) ?? g
}

export function commitLinearConstruction(g: GeometrySourceDataV1, kind: GeometryLinearConstructionV1['kind'], source: GeometryLinearSourceV1, through: string): GeometrySourceDataV1 {
  if (!isLinearConstructionTool(kind) || findLinearConstruction(g,kind,source,through) || g.points.length >= 500 || (g.lines?.length ?? 0) >= 1000 || (g.constructions?.length ?? 0) >= CONSTRUCTION_LIMITS.maxConstructions) return g
  const object = linearSourceObject(g,source), p = g.points.find(p => p.id === through)
  if (!object || !p) return g
  const a = g.points.find(p => p.id === object.start_point_id), b = g.points.find(p => p.id === object.end_point_id)
  if (!a || !b) return g
  const coordinates = linearSupportCoordinates(a,b,p,kind)
  if (!coordinates) return g
  const ids = geometryObjectIds(g)
  const nextId = (prefix: string) => { let n=1; while(ids.has(`${prefix}-${n}`))n++; const id=`${prefix}-${n}`;ids.add(id);return id }
  const support = { id:nextId('point'),...coordinates,label:null }
  const line = { id:nextId('line'),kind:'line' as const,start_point_id:through,end_point_id:support.id }
  const recipe: GeometryLinearConstructionV1 = { id:nextId('construction'),kind,source:{...source},through_point_id:through,output_line_id:line.id,support_point_id:support.id }
  return recomputeConstructions({...g,points:[...g.points,support],lines:[...(g.lines??[]),line],constructions:[...(g.constructions??[]),recipe]}) ?? g
}

export const pointConstraint = (g:GeometrySourceDataV1,id:string) => g.constructions?.find((c):c is GeometryPointConstraintV1=>(c.kind==='point_on_segment'||c.kind==='point_on_line')&&c.output_point_id===id)

export function detachPointConstraint(g:GeometrySourceDataV1,id:string):GeometrySourceDataV1 {
  const c=pointConstraint(g,id)
  return c?{...g,constructions:g.constructions!.filter(r=>r.id!==c.id)}:g
}

// Parent removal preserves the last valid persisted location and all consumers.
export function detachInvalidPointParents(g:GeometrySourceDataV1):GeometrySourceDataV1 {
  if(!g.constructions)return g
  const constructions=g.constructions.filter(c=>{
    if(c.kind!=='point_on_segment'&&c.kind!=='point_on_line')return true
    const p=c.parent
    if(c.kind==='point_on_line'){
      // A present but invalid/degenerate parent must fail evaluation, never detach.
      if(!p||typeof p!=='object'||Array.isArray(p)||p.kind!=='line'||Object.keys(p).sort().join(',')!=='kind,line_id'||typeof p.line_id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(p.line_id))return true
      return (g.lines??[]).some(line=>line.id===p.line_id)
    }
    // Only a well-formed relationship may be detached; malformed data still fails evaluation.
    if(!p||typeof p!=='object'||(p.kind==='segment'?Object.keys(p).sort().join(',')!=='kind,segment_id'||typeof p.segment_id!=='string'
      :p.kind==='polygon_edge'?Object.keys(p).sort().join(',')!=='end_point_id,kind,polygon_id,start_point_id'||![p.polygon_id,p.start_point_id,p.end_point_id].every(id=>typeof id==='string'):true))return true
    return pointParentEndpoints(g,p)!==null
  })
  return constructions.length===g.constructions.length?g:{...g,constructions}
}

export function retargetPointConstraint(g:GeometrySourceDataV1,id:string,parent:GeometryPointParent,x?:number,y?:number):GeometrySourceDataV1 {
  const c=pointConstraint(g,id),p=g.points.find(p=>p.id===id),ends=pointParentEndpoints(g,parent)
  if(!c||!p||!ends)return g
  const a=g.points.find(p=>p.id===ends[0]),b=g.points.find(p=>p.id===ends[1])
  if(!a||!b)return g
  const t=projectPointParameter(a,b,{x:x??p.x,y:y??p.y},parent.kind==='line')
  if(t===null||JSON.stringify(parent)===JSON.stringify(c.parent)&&Math.abs(t-c.t)<=8*Number.EPSILON)return g
  const next=recomputeConstructions({...g,constructions:g.constructions!.map(r=>r.id===c.id?(parent.kind==='line'?{...c,kind:'point_on_line' as const,parent,t}:{...c,kind:'point_on_segment' as const,parent,t}):r)})
  if(!next)return g
  const locations=new Map(next.points.map(p=>[p.id,p]))
  const coincident=(a:string,b:string)=>{const p=locations.get(a),q=locations.get(b);return !p||!q||p.x===q.x&&p.y===q.y}
  if(next.lines?.some(l=>coincident(l.start_point_id,l.end_point_id))
    ||next.polylines?.some(l=>l.point_ids.some((id,i)=>i>0&&coincident(l.point_ids[i-1],id))))return g
  return next
}

export function commitPointOnSegment(g:GeometrySourceDataV1,parent:Exclude<GeometryPointParent,{kind:'line'}>,x:number,y:number):GeometrySourceDataV1 {
  if(!canAllocateGeometry(g,{points:1})||(g.constructions?.length??0)>=CONSTRUCTION_LIMITS.maxConstructions)return g
  const ends=pointParentEndpoints(g,parent),a=ends&&g.points.find(p=>p.id===ends[0]),b=ends&&g.points.find(p=>p.id===ends[1])
  if(!a||!b)return g
  const t=projectPointParameter(a,b,{x,y}),q=t!==null?parameterCoordinates(a,b,t):null
  if(t===null||!q)return g
  const ids=geometryObjectIds(g),id=(prefix:string)=>{let i=1;while(ids.has(`${prefix}-${i}`))i++;const v=`${prefix}-${i}`;ids.add(v);return v}
  const output_point_id=id('point'),recipe:GeometryPointConstraintV1={id:id('point-on-segment'),kind:'point_on_segment',output_point_id,parent,t}
  return recomputeConstructions({...g,points:[...g.points,{id:output_point_id,...q,label:null}],constructions:[...(g.constructions??[]),recipe]})??g
}

export function commitPointOnLine(g:GeometrySourceDataV1,parent:Extract<GeometryPointParent,{kind:'line'}>,x:number,y:number,duplicateTolerance=CONSTRUCTION_LIMITS.coordinateTolerance):GeometrySourceDataV1 {
  if(!canAllocateGeometry(g,{points:1})||(g.constructions?.length??0)>=CONSTRUCTION_LIMITS.maxConstructions||!Number.isFinite(duplicateTolerance)||duplicateTolerance<0)return g
  const ends=pointParentEndpoints(g,parent),a=ends&&g.points.find(p=>p.id===ends[0]),b=ends&&g.points.find(p=>p.id===ends[1])
  if(!a||!b)return g
  const t=projectPointParameter(a,b,{x,y},true),q=t!==null?parameterCoordinates(a,b,t,true):null
  if(t===null||!q||g.points.some(p=>Math.hypot(p.x-q.x,p.y-q.y)<=duplicateTolerance))return g
  const ids=geometryObjectIds(g),id=(prefix:string)=>{let i=1;while(ids.has(`${prefix}-${i}`))i++;const v=`${prefix}-${i}`;ids.add(v);return v}
  const output_point_id=id('point'),recipe:GeometryPointConstraintV1={id:id('point-on-line'),kind:'point_on_line',output_point_id,parent,t}
  return recomputeConstructions({...g,points:[...g.points,{id:output_point_id,...q,label:null}],constructions:[...(g.constructions??[]),recipe]})??g
}
