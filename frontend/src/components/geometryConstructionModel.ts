import type { GeometrySourceDataV1, GeometryPointV1, GeometryConstructionV1, GeometryLinearSourceV1, GeometryLinearConstructionV1, GeometryMidpointConstructionV1, GeometryIntersectionConstructionV1, GeometryAngleBisectorConstructionV1 } from '../api/questionEditor'
import limitsJson from '../../../backend/app/schemas/geometry_construction_limits.json?raw'

export const CONSTRUCTION_LIMITS = JSON.parse(limitsJson) as { coordinateTolerance: number; minimumSourceDistance: number; maxConstructions: number }
export const midpointCoordinates = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x / 2 + b.x / 2, y: a.y / 2 + b.y / 2 })
export const ownedConstructionIds = (c: GeometryConstructionV1) =>
  c.kind === 'midpoint' || c.kind === 'intersection'
    ? [c.output_point_id]
    : [c.output_line_id, c.support_point_id, ...(c.kind === 'angle_bisector' && c.intersection_point_id ? [c.intersection_point_id] : [])]

export const isDerivedPoint = (g: GeometrySourceDataV1, id: string) =>
  (g.constructions ?? []).some(c =>
    c.kind === 'midpoint' || c.kind === 'intersection'
      ? c.output_point_id === id
      : c.support_point_id === id || (c.kind === 'angle_bisector' && c.intersection_point_id === id)
  )
export const geometryObjectIds = (g: GeometrySourceDataV1) => new Set([...g.points, ...g.segments, ...g.polygons, ...g.texts, ...(g.lines ?? []), ...(g.polylines ?? []), ...(g.circles ?? []), ...(g.arcs ?? []), ...(g.constructions ?? [])].map(o => o.id))
const pairKey = (ids: readonly string[]) => JSON.stringify([...ids].sort())
export const findMidpoint = (g: GeometrySourceDataV1, a: string, b: string) => g.constructions?.find((c): c is GeometryMidpointConstructionV1 => c.kind === 'midpoint' && pairKey(c.source_point_ids) === pairKey([a, b]))
type LinearObjects = Pick<GeometrySourceDataV1, 'segments' | 'lines'>
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

const constructionInputs = (c: GeometryConstructionV1) =>
  c.kind === 'midpoint' || c.kind === 'angle_bisector'
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
    if (c.kind === 'midpoint') {
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
    const next = pending.filter(c => constructionInputs(c).every(id => ready.has(id))).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    if (!next.length) return null
    for (const c of next) {
      let expected: { x: number; y: number } | null
      let stored: GeometryPointV1

      if (c.kind === 'midpoint') {
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
  const triangle = g.polygons.some(p => p.point_ids.length === 3 && [aId, vertexId, cId].every(id => p.point_ids.includes(id)))
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
    for (const c of g.constructions ?? []) if (constructionInputs(c).some(id => removed.has(id)) || ownedConstructionIds(c).some(id => removed.has(id))) {
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
