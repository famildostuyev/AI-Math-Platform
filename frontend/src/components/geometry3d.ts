import contractJson from '../../../backend/app/schemas/geometry_3d_contract.json?raw'
import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'

type Spec = string | { nullable?: Spec; literal?: string | number; enum?: string[]; discriminator?: string; variants?: Record<string, Spec>; object?: Record<string, Spec>; tuple?: Spec[]; array?: Spec; min?: number }
const contract = JSON.parse(contractJson) as { definitions: Record<string, Spec>; max_depth: number; max_bytes: number; max_items: number; feature_limits: Record<string, (number | number[])[] | Record<string, number[]>> }
const collections = ['points', 'linear_objects', 'planes', 'edges', 'faces', 'surfaces', 'solids', 'constructions', 'annotations', 'markings'] as const
function fail(): never { throw new Error('Invalid semantic 3D scene') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail()
  return value as Record<string, unknown>
}
function shape(value: unknown, spec: Spec, depth = 1): unknown {
  if (depth > contract.max_depth) fail()
  if (typeof spec === 'string') {
    if (contract.definitions[spec]) return shape(value, contract.definitions[spec], depth)
    if (['number', 'positive', 'side_count'].includes(spec)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12) fail()
      if (spec === 'positive' && value <= 0) fail()
      if (spec === 'side_count' && (!Number.isInteger(value) || value < 3 || value > 128)) fail()
      return value === 0 ? 0 : value
    }
    if (typeof value !== 'string' || [...value].length > (spec === 'id' ? 64 : 4096)) fail()
    if ([...value].some(c => c.codePointAt(0)! >= 0xD800 && c.codePointAt(0)! <= 0xDFFF)) fail()
    if (spec === 'id' && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) fail()
    return value
  }
  if (spec.nullable) return value === null ? null : shape(value, spec.nullable, depth)
  if (spec.literal !== undefined) { if (value !== spec.literal) fail(); return value }
  if (spec.enum) { if (typeof value !== 'string' || !spec.enum.includes(value)) fail(); return value }
  if (spec.discriminator && spec.variants) {
    const key = record(value)[spec.discriminator]
    if (typeof key !== 'string' || !Object.hasOwn(spec.variants, key)) fail()
    return shape(value, spec.variants[key], depth)
  }
  if (spec.object) {
    const obj = record(value)
    if (Object.keys(obj).length !== Object.keys(spec.object).length || Object.keys(obj).some(k => !Object.hasOwn(spec.object!, k))) fail()
    return Object.fromEntries(Object.entries(spec.object).map(([k, s]) => [k, shape(obj[k], s, depth + 1)]))
  }
  if (!Array.isArray(value)) fail()
  if (spec.tuple) {
    if (value.length !== spec.tuple.length) fail()
    return value.map((v, i) => shape(v, spec.tuple![i], depth + 1))
  }
  if (value.length < (spec.min ?? 0) || value.length > contract.max_items || !spec.array) fail()
  return value.map(v => shape(v, spec.array!, depth + 1))
}
const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i])
const dot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const cross = (a: number[], b: number[]) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
function nonzero(a: number[]) { if (dot(a, a) <= 1e-18) fail() }
function faceCoordinates(coords: Vec3[]): number[][] {
  let x = sub(coords[1], coords[0]); const length = Math.sqrt(dot(x, x)); x = x.map(v => v / length)
  let n = cross(x, sub(coords[2], coords[0])); const norm = Math.sqrt(dot(n, n)); n = n.map(v => v / norm)
  const y = cross(n, x)
  return coords.map(p => [dot(sub(p, coords[0]), x), dot(sub(p, coords[0]), y)])
}
function insideFace(uv: number[], polygon: number[][]): boolean {
  let inside = false
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const turn = (b[0]-a[0])*(uv[1]-a[1])-(b[1]-a[1])*(uv[0]-a[0])
    if (Math.abs(turn) <= 1e-9 && uv[0] >= Math.min(a[0], b[0])-1e-9 && uv[0] <= Math.max(a[0], b[0])+1e-9 && uv[1] >= Math.min(a[1], b[1])-1e-9 && uv[1] <= Math.max(a[1], b[1])+1e-9) return true
    if ((a[1] > uv[1]) !== (b[1] > uv[1]) && uv[0] < (b[0]-a[0])*(uv[1]-a[1])/(b[1]-a[1])+a[0]) inside = !inside
  }
  return inside
}
function simpleFace(polygon: number[][]) {
  const turn = (a: number[], b: number[], c: number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i+1) % polygon.length]; nonzero(sub(b, a))
    for (let j = i+1; j < polygon.length; j++) {
      if (j === i+1 || (i === 0 && j === polygon.length-1)) continue
      const c = polygon[j], d = polygon[(j+1) % polygon.length]
      if (Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) > Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0]))+1e-9 || Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) > Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))+1e-9) continue
      if (turn(a, b, c)*turn(a, b, d) <= 1e-18 && turn(c, d, a)*turn(c, d, b) <= 1e-18) fail()
    }
  }
}
function featureGroup(solid: GeometryScene3D['solids'][number], slot: string): string {
  if (solid.mode !== 'parametric') fail()
  if (slot === 'surface' && ['sphere', 'cylinder', 'cone', 'frustum'].includes(solid.kind)) return 'surfaces'
  const match = /^([vef])_(0|[1-9][0-9]*)$/.exec(slot)
  if (!match) fail()
  let limits = contract.feature_limits[solid.kind]
  if (!Array.isArray(limits)) limits = limits[solid.kind === 'regular_polyhedron' ? solid.parameters.family : '']
  const offset = 'vef'.indexOf(match[1]), raw = limits[offset]
  const count = Array.isArray(raw) ? raw[0] * ('sides' in solid.parameters ? solid.parameters.sides : 0) + raw[1] : raw
  if (Number(match[2]) >= count) fail()
  return ['points', 'edges', 'faces'][offset]
}
function validateCamera(c: GeometryCamera3D): GeometryCamera3D {
  const direction = sub(c.target, c.position)
  nonzero(direction); nonzero(cross(direction, c.up))
  if (Math.abs(dot(c.up, c.up)-1) > 1e-9 || c.near >= c.far || c.fov_degrees < 1 || c.fov_degrees > 179) fail()
  return c
}
export function normalizeGeometryEditingCamera3D(value: unknown): GeometryCamera3D | null {
  try { return validateCamera(shape(value, 'camera') as GeometryCamera3D) } catch { return null }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical((value as Record<string, unknown>)[k])]))
  return value
}
/** Strict boundary: rejects unsupported structures; never clamps or detaches. */
export function normalizeGeometryScene3D(value: unknown): GeometryScene3D | null {
  try {
    const scene = shape(value, 'scene') as GeometryScene3D
    if (new TextEncoder().encode(JSON.stringify(scene)).length > contract.max_bytes) fail()
    if (collections.reduce((n, k) => n + scene[k].length, 0) > contract.max_items) fail()
    const index = new Map<string, Record<string, unknown>>()
    const category = new Map<string, string>()
    const graph = new Map<string, Set<string>>()
    const owners = new Map<string, string>()
    for (const group of collections) for (const entity of scene[group]) {
      if (index.has(entity.id)) fail()
      index.set(entity.id, entity as unknown as Record<string, unknown>); category.set(entity.id, group); graph.set(entity.id, new Set())
    }
    function ref(source: string, target: string, group: string) {
      if (category.get(target) !== group) fail()
      graph.get(source)!.add(target)
      return index.get(target)!
    }
    function points(source: string, ids: string[], minimum = 2): Vec3[] {
      if (new Set(ids).size !== ids.length || ids.length < minimum) fail()
      return ids.map(p => ref(source, p, 'points').position as Vec3)
    }
    function own(output: string, owner: string) {
      if (owners.has(output)) fail()
      owners.set(output, owner); graph.get(output)!.add(owner)
    }
    for (const e of scene.linear_objects) { const [a, b] = points(e.id, [e.a, e.b]); nonzero(sub(b, a)) }
    for (const e of scene.edges) { const [a, b] = points(e.id, [e.start, e.end]); nonzero(sub(b, a)) }
    for (const e of [...scene.planes, ...scene.faces]) {
      const coords = points(e.id, 'point_ids' in e ? e.point_ids : e.boundary, 3)
      const normal = cross(sub(coords[1], coords[0]), sub(coords[2], coords[0])); nonzero(normal)
      for (const p of coords.slice(3)) {
        const delta = sub(p, coords[0])
        if (Math.abs(dot(normal, delta)) > 1e-9 * Math.sqrt(dot(normal, normal)) * Math.max(1, Math.sqrt(dot(delta, delta)))) fail()
      }
      if ('boundary' in e) simpleFace(faceCoordinates(coords))
    }
    for (const e of scene.solids) {
      if (e.mode === 'freeform') {
        points(e.id, e.point_ids, 4)
        for (const [ids, group] of [[e.edge_ids, 'edges'], [e.face_ids, 'faces']] as const) {
          if (new Set(ids).size !== ids.length) fail()
          for (const target of ids) {
            const feature = ref(e.id, target, group)
            const vertices = group === 'edges' ? [feature.start, feature.end] : feature.boundary as string[]
            if (vertices.some(p => !e.point_ids.includes(p as string))) fail()
          }
        }
        const edgePairs = new Map<string, [string, string][]>()
        for (const edgeId of e.edge_ids) {
          const edge = index.get(edgeId)!, key = [edge.start, edge.end].sort().join('|')
          if (edgePairs.has(key)) fail()
          edgePairs.set(key, [])
        }
        let volume = 0; const usedVertices = new Set<string>()
        const origin = index.get(e.point_ids[0])!.position as Vec3
        const adjacency = new Map(e.point_ids.map(p => [p, new Set<string>()]))
        for (const faceId of e.face_ids) {
          const boundary = index.get(faceId)!.boundary as string[]
          for (let i = 0; i < boundary.length; i++) {
            const a = boundary[i], b = boundary[(i+1) % boundary.length]; usedVertices.add(a)
            const key = [a, b].sort().join('|'); if (!edgePairs.has(key)) fail()
            edgePairs.get(key)!.push([a, b])
            adjacency.get(a)!.add(b); adjacency.get(b)!.add(a)
          }
          const coords = boundary.map(p => sub(index.get(p)!.position as Vec3, origin))
          for (let i = 1; i < coords.length-1; i++) volume += dot(coords[0], cross(coords[i], coords[i+1])) / 6
        }
        if (usedVertices.size !== e.point_ids.length || e.point_ids.length-e.edge_ids.length+e.face_ids.length !== 2 || Math.abs(volume) <= 1e-12) fail()
        for (const pairs of edgePairs.values()) if (pairs.length !== 2 || pairs[0][0] !== pairs[1][1] || pairs[0][1] !== pairs[1][0]) fail()
        const reached = new Set<string>(), queue = [e.point_ids[0]]
        while (queue.length) { const p = queue.pop()!; if (!reached.has(p)) { reached.add(p); for (const q of adjacency.get(p)!) if (!reached.has(q)) queue.push(q) } }
        if (reached.size !== usedVertices.size) fail()
        continue
      }
      const x = e.frame.x_axis, y = e.frame.y_axis
      if (Math.abs(dot(x, x)-1) > 1e-9 || Math.abs(dot(y, y)-1) > 1e-9 || Math.abs(dot(x, y)) > 1e-9) fail()
      const slots = new Set<string>()
      for (const f of e.features) {
        if (slots.has(f.slot) || category.get(f.entity_id) !== featureGroup(e, f.slot)) fail()
        slots.add(f.slot); own(f.entity_id, e.id)
      }
    }
    for (const [id, owner] of owners) if (['edges', 'faces'].includes(category.get(id)!)) {
      const feature = index.get(id)!
      const vertices = category.get(id) === 'edges' ? [feature.start, feature.end] : feature.boundary as string[]
      if (vertices.some(p => owners.get(p as string) !== owner)) fail()
    }
    for (const e of scene.surfaces) {
      const solid = scene.solids.find(s => s.id === e.solid_id)
      if (!solid || solid.mode !== 'parametric' || solid.kind !== e.kind || !solid.features.some(f => f.slot === e.slot && f.entity_id === e.id)) fail()
      ref(e.id, e.solid_id, 'solids')
    }
    function attachment(source: string, kind: string, target: string, parameter: number | number[]) {
      const group = ({ linear: 'linear_objects', edge: 'edges', face: 'faces', surface: 'surfaces' } as Record<string, string>)[kind]
      const parent = ref(source, target, group)
      if (kind === 'edge' || kind === 'linear') {
        const t = parameter as number
        if ((kind === 'edge' || ['segment', 'vector'].includes(parent.kind as string)) && (t < 0 || t > 1)) fail()
        if (kind === 'linear' && parent.kind === 'ray' && t < 0) fail()
      }
      if (kind === 'surface') { const [u, v] = parameter as number[]; if (u < 0 || u >= 1 || v < 0 || v > 1) fail() }
      if (kind === 'face') {
        const coords = (parent.boundary as string[]).map(p => index.get(p)!.position as Vec3)
        if (!insideFace(parameter as number[], faceCoordinates(coords))) fail()
      }
    }
    for (const e of scene.constructions) {
      ref(e.id, e.output_point_id, 'points'); graph.get(e.id)!.delete(e.output_point_id); own(e.output_point_id, e.id)
      if (e.kind === 'midpoint') points(e.id, [e.a, e.b])
      else {
        const kind = e.kind.replace('point_on_', '')
        const raw = e as unknown as Record<string, unknown>
        attachment(e.id, kind, raw[kind + '_id'] as string, (raw.t ?? raw.uv) as number | number[])
      }
    }
    for (const e of scene.annotations) {
      const a = e.anchor
      if (a.kind === 'point') ref(e.id, a.point_id, 'points')
      else if (a.kind !== 'world') {
        const raw = a as unknown as Record<string, unknown>
        attachment(e.id, a.kind, raw[a.kind + '_id'] as string, (raw.t ?? raw.uv) as number | number[])
      }
    }
    for (const e of scene.markings) {
      if (e.point_ids.length !== ({ length: 2, angle: 3, right_angle: 3, equal_length: 4 })[e.kind]) fail()
      if (e.kind === 'equal_length') { points(e.id, e.point_ids.slice(0, 2)); points(e.id, e.point_ids.slice(2)) }
      else points(e.id, e.point_ids)
    }
    const pending = new Map([...graph].map(([id, deps]) => [id, deps.size]))
    const dependents = new Map([...graph.keys()].map(id => [id, [] as string[]]))
    for (const [id, deps] of graph) for (const dep of deps) dependents.get(dep)!.push(id)
    const ready = [...pending].filter(([, n]) => n === 0).map(([id]) => id)
    let count = 0
    while (ready.length) {
      const id = ready.pop()!; count++
      for (const child of dependents.get(id)!) { const n = pending.get(child)! - 1; pending.set(child, n); if (n === 0) ready.push(child) }
    }
    if (count !== graph.size) fail()
    validateCamera(scene.print_camera)
    for (const group of collections) scene[group].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    for (const solid of scene.solids) if (solid.mode === 'parametric') solid.features.sort((a, b) => a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0)
    const result = canonical(scene) as GeometryScene3D
    if (new TextEncoder().encode(JSON.stringify(result)).length > contract.max_bytes) fail()
    return result
  } catch { return null }
}
export function serializeGeometryScene3D(value: unknown): string | null {
  const scene = normalizeGeometryScene3D(value)
  return scene ? JSON.stringify(scene) : null
}
