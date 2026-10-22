import { faceFrame3D } from './geometry3dFaces'
import type { GeometryAttachmentLoss3D, GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { normalizeGeometryEditingCamera3D, normalizeGeometryScene3D } from './geometry3d'
import type { EditorHistoryProvider } from './universalEditorHistory'
import type { PersistedVisualPlacement } from './visualPlacement'
import { solidSupported3D, hasSolidTopology3D, evaluateSolid3D } from './geometry3dSolids'
import { analyticBounds3D, analyticFeaturePositions3D, evaluateAnalyticSurface3D } from './geometry3dAnalytic'

export function defaultGeometryScenePlacement3D(y = 0): PersistedVisualPlacement {
  return { version: 1, layoutMode: 'floating', anchor: { kind: 'document' }, position: { x: 24, y: Math.max(24, y), unit: 'px' }, size: { width: 520, height: 400, unit: 'px' } }
}

export function emptyGeometryScene3D(): GeometryScene3D {
  return {
    schema_version: 2, dimension: 3, description: '3D həndəsə səhnəsi',
    points: [], linear_objects: [], planes: [], edges: [], faces: [], surfaces: [], solids: [],
    constructions: [], annotations: [], markings: [],
    print_camera: { projection: 'orthographic', position: [4, 3, 5], target: [0, 0, 0], up: [0, 0, 1], vertical_span: 10, fov_degrees: 45, near: 0.01, far: 1000 },
  }
}

/** Materialize analytic solid reference points without changing the V2 normalizer or
 * sparse contract. Deterministic IDs also keep read-only legacy display stable. */
export function prepareAnalyticCenters3D(value:unknown):GeometryScene3D|null {
  const scene=normalizeGeometryScene3D(value)
  if(!scene)return null
  try{
    const used=new Set(Object.values(scene).flatMap(v=>Array.isArray(v)?v.flatMap(e=>e&&typeof e==='object'&&'id'in e?[e.id as string]:[]):[]))
    for(const solid of [...scene.solids].sort((a,b)=>a.id.localeCompare(b.id))){
      if(solid.mode!=='parametric'||!['cylinder','cone','sphere'].includes(solid.kind))continue
      const centers=solid.kind==='sphere'?[['v_0','O']]:solid.kind==='cone'?[['v_0','O'],['v_1','S']]:[['v_0','O1'],['v_1','O2']]
      for(const [slot,label] of centers){
        let feature=solid.features.find(f=>f.slot===slot)
        if(!feature){
          const stem=`${solid.id.slice(0,54)}_${slot}`;let id=stem,n=2
          while(used.has(id))id=`${stem}_${n++}`
          used.add(id);feature={slot,entity_id:id};solid.features.push(feature)
          scene.points.push({id,position:[0,0,0],label})
        }
        const point=scene.points.find(p=>p.id===feature.entity_id)!
        if(solid.kind==='cylinder'||solid.kind==='cone'||solid.kind==='sphere')point.position=analyticFeaturePositions3D(solid)[feature.entity_id]
        if(solid.kind==='cylinder'&&point.label===null)point.label=label
      }
    }
    return normalizeGeometryScene3D(scene)
  }catch{return null}
}
export const prepareCylinderCenters3D=prepareAnalyticCenters3D
export type GeometryEvaluation3D =
  | { status: 'ok'; scene: GeometryScene3D }
  | { status: 'unavailable'; scene: GeometryScene3D; capabilities: string[] }
  | { status: 'invalid'; scene: null }
const interpolate = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v+t*(b[i]-v)) as Vec3

/** Complete evaluation of the M1 recipe subset; never treats unavailable caches as results. */
export function evaluateGeometryScene3D(value: unknown): GeometryEvaluation3D {
  return evaluateScene3D(value)
}
/** Rendering and authoring share the same validated graph. Cylinder transforms
 * and surface constructions remain independently gated by their own tools. */
export function evaluateGeometryRenderScene3D(value:unknown):GeometryEvaluation3D{
  return evaluateScene3D(value)
}
function evaluateScene3D(value:unknown):GeometryEvaluation3D{
  const scene = normalizeGeometryScene3D(value)
  if (!scene) return { status: 'invalid', scene: null }
  const capabilities = [...new Set([
    ...scene.solids.filter(s => s.mode === 'parametric'&&s.kind!=='cylinder'&&s.kind!=='cone'&&s.kind!=='sphere'&&!hasSolidTopology3D(s)).map(s => 'solid:' + s.kind),
    ...scene.constructions.filter(c => c.kind === 'point_on_surface' && !['cylinder','cone','sphere'].includes(scene.surfaces.find(s => s.id === c.surface_id)?.kind??'')).map(() => 'point_on_surface'),
  ])].sort()
  if (capabilities.length) return { status: 'unavailable', scene, capabilities }
  try {
    const points = new Map(scene.points.map(p => [p.id, p]))
    const producers = new Map(scene.constructions.map(c => [c.output_point_id, c]))
    const dependencies = (c: GeometryScene3D['constructions'][number]): string[] => {
      if (c.kind === 'midpoint') return [c.a, c.b]
      if (c.kind === 'point_on_linear') { const l = scene.linear_objects.find(l => l.id === c.linear_id)!; return [l.a, l.b] }
      if (c.kind === 'point_on_edge') { const e = scene.edges.find(e => e.id === c.edge_id)!; return [e.start, e.end] }
      if (c.kind === 'point_on_face') return scene.faces.find(f => f.id === c.face_id)!.boundary
      if (c.kind === 'point_on_surface') return [] // Analytic placement waits for its solid below.
      throw Error('Unavailable recipe')
    }
    const pending = new Map(scene.constructions.map(c => [c.id, c]))
    const renderSolids=scene.solids.filter(s=>s.mode==='parametric'&&(s.kind==='cylinder'||s.kind==='cone'||s.kind==='sphere'||solidSupported3D(s)))
    const pendingSolids=new Map(renderSolids.map(s=>[s.id,s]))
    const solidOwners=new Map(renderSolids.flatMap(s=>s.mode==='parametric'?s.features.map(f=>[f.entity_id,s.id] as const):[]))
    const complete = new Set<string>()
    const waiting=(p:string)=>producers.has(p)&&!complete.has(producers.get(p)!.id)||solidOwners.has(p)&&!complete.has(solidOwners.get(p)!)
    while (pending.size||pendingSolids.size) {
      let progressed = false
      for(const [id,s] of pendingSolids){
        if(s.mode!=='parametric')throw Error('Unavailable solid')
        const p=s.parameters,faceId='base'in p&&p.base.kind==='face'?p.base.face_id:null,face=scene.faces.find(f=>f.id===faceId)
        if(face&&face.boundary.some(waiting))continue
        if(s.kind==='cylinder'||s.kind==='cone'||s.kind==='sphere'){
          analyticBounds3D(s)
          for(const [pointId,position] of Object.entries(analyticFeaturePositions3D(s)))points.get(pointId)!.position=position
        }else evaluateSolid3D(scene,s)
        pendingSolids.delete(id);complete.add(id);progressed=true
      }
      for (const [id, c] of pending) {
        if (dependencies(c).some(waiting)) continue
        if (c.kind === 'point_on_surface' && !complete.has(scene.surfaces.find(s => s.id === c.surface_id)!.solid_id)) continue
        const position = (id: string) => points.get(id)!.position
        let result: Vec3
        if (c.kind === 'midpoint') result = interpolate(position(c.a), position(c.b), 0.5)
        else if (c.kind === 'point_on_linear') { const l = scene.linear_objects.find(l => l.id === c.linear_id)!; result = interpolate(position(l.a), position(l.b), c.t) }
        else if (c.kind === 'point_on_edge') { const e = scene.edges.find(e => e.id === c.edge_id)!; result = interpolate(position(e.start), position(e.end), c.t) }
        else if (c.kind === 'point_on_face') {
          const face = scene.faces.find(f => f.id === c.face_id)!
          result = faceFrame3D(face.boundary.map(position)).world(c.uv)
        } else if (c.kind === 'point_on_surface') {
          const surface = scene.surfaces.find(s => s.id === c.surface_id)!
          const solid = scene.solids.find(s => s.id === surface.solid_id)!
          if (solid.mode !== 'parametric' || solid.kind !== 'cylinder' && solid.kind !== 'cone' && solid.kind !== 'sphere') throw Error('Unavailable surface')
          result = evaluateAnalyticSurface3D(solid, c.uv)
        } else throw Error('Unavailable recipe')
        if (result.some(v => !Number.isFinite(v) || Math.abs(v) > 1e12)) throw Error('Invalid output')
        points.get(c.output_point_id)!.position = result
        pending.delete(id); complete.add(id); progressed = true
      }
      if (!progressed) throw Error('Cyclic graph')
    }
    const evaluated = normalizeGeometryScene3D(scene)
    return evaluated ? { status: 'ok', scene: evaluated } : { status: 'invalid', scene: null }
  } catch { return { status: 'invalid', scene: null } }
}

/** A transaction evaluates a cloned candidate; invalid/unavailable edits never alter the source. */
export function transactGeometryScene3D(source: GeometryScene3D, mutate: (draft: GeometryScene3D) => void): GeometryScene3D | null {
  if (evaluateGeometryScene3D(source).status !== 'ok') return null
  const draft = structuredClone(source)
  try { mutate(draft) } catch { return null }
  const result = evaluateGeometryScene3D(draft)
  return result.status === 'ok' ? result.scene : null
}

export function moveGeometryPoint3D(source: GeometryScene3D, id: string, position: Vec3): GeometryScene3D | null {
  if (source.constructions.some(c => c.output_point_id === id) || source.solids.some(s => s.mode === 'parametric' && s.features.some(f => f.entity_id === id))) return null
  return transactGeometryScene3D(source, draft => {
    const point = draft.points.find(p => p.id === id); if (!point) throw Error('Missing point')
    point.position = [...position]
  })
}

export function deleteGeometryTarget3D(source: GeometryScene3D, id: string): { scene: GeometryScene3D; losses: GeometryAttachmentLoss3D[] } | null {
  return deleteGeometryTargets3D(source,[id])
}
/** M4 solid topology uses one deletion transaction, sharing M1 attachment-loss rules. */
export function deleteGeometryTargets3D(source:GeometryScene3D,ids:string[]):{scene:GeometryScene3D;losses:GeometryAttachmentLoss3D[]}|null{
  const result = evaluateGeometryScene3D(source)
  if (result.status !== 'ok') return null // Recovery from unverified solid/surface snapshots is deferred.
  const draft = result.scene
  const targets=new Set(ids),groups=['linear_objects','edges','faces','planes'] as const
  if(!ids.length||targets.size!==ids.length||ids.some(id=>!groups.some(k=>draft[k].some(e=>e.id===id))))return null
  if(draft.solids.some(s=>s.mode==='parametric'&&s.features.some(f=>targets.has(f.entity_id))))return null
  // A freeform solid's topology must be edited as a future atomic topology command.
  if (draft.solids.some(s => s.mode === 'freeform' && [...s.edge_ids, ...s.face_ids].some(id=>targets.has(id)))) return null
  const losses: GeometryAttachmentLoss3D[] = []
  const targetOf = (c: GeometryScene3D['constructions'][number]) => c.kind === 'point_on_linear' ? c.linear_id : c.kind === 'point_on_edge' ? c.edge_id : c.kind === 'point_on_face' ? c.face_id : c.kind === 'point_on_surface' ? c.surface_id : null
  draft.constructions = draft.constructions.filter(c => {
    const id=targetOf(c)
    if(!id||!targets.has(id))return true
    const position = draft.points.find(p => p.id === c.output_point_id)!.position
    losses.push({ subject_id: c.output_point_id, parent_id: id, reason: 'parent_deleted', preserved_world_position: [...position] })
    return false
  })
  for (const annotation of draft.annotations) {
    const a = annotation.anchor
    const id=a.kind==='edge'?a.edge_id:a.kind==='face'?a.face_id:null
    if (id&&targets.has(id)&&(a.kind==='edge'||a.kind==='face')) {
      let position: Vec3
      if (a.kind === 'edge') {
        const edge = draft.edges.find(e => e.id === id)!
        position = interpolate(draft.points.find(p => p.id === edge.start)!.position, draft.points.find(p => p.id === edge.end)!.position, a.t)
      } else {
        const face = draft.faces.find(f => f.id === id)!
        position = faceFrame3D(face.boundary.map(id => draft.points.find(p => p.id === id)!.position)).world(a.uv)
      }
      annotation.anchor = { kind: 'world', position }
      losses.push({ subject_id: annotation.id, parent_id: id, reason: 'parent_deleted', preserved_world_position: position })
    }
  }
  for(const group of groups)draft[group]=draft[group].filter(e=>!targets.has(e.id)) as never
  const evaluated = evaluateGeometryScene3D(draft)
  return evaluated.status === 'ok' ? { scene: evaluated.scene, losses } : null
}

/** Separate V2 provider, implementing the existing universal history interface. */
export function createGeometryHistory3D(initial: GeometryScene3D, apply: (scene: GeometryScene3D) => void) {
  const normalized = normalizeGeometryScene3D(initial)
  if (!normalized) throw Error('Invalid initial scene')
  const evaluated = evaluateGeometryScene3D(normalized)
  if (evaluated.status === 'invalid') throw Error('Invalid initial evaluation')
  let snapshots = [evaluated.scene], index = 0, enabled = true
  let editingCamera = structuredClone(normalized.print_camera)
  const listeners = new Set<() => void>(), notify = () => listeners.forEach(l => l())
  function move(offset: number) {
    if (!enabled || !snapshots[index + offset]) return false
    const next = normalizeGeometryScene3D(snapshots[index + offset]); if (!next) return false
    index += offset; apply(next); notify(); return true
  }
  const provider: EditorHistoryProvider = {
    undo: () => move(-1), redo: () => move(1),
    getSnapshot: () => enabled ? (index > 0 ? 1 : 0) | (index < snapshots.length-1 ? 2 : 0) : 0,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  return {
    provider,
    setEnabled(value: boolean) { enabled = value; notify() },
    getScene: () => structuredClone(snapshots[index]),
    getEditingCamera: () => structuredClone(editingCamera),
    navigate(camera: GeometryCamera3D) { const next = normalizeGeometryEditingCamera3D(camera); if (!next) return false; editingCamera = next; return true },
    commit(value: GeometryScene3D) {
      if (!enabled) return false
      const result = evaluateGeometryScene3D(value)
      if (result.status === 'invalid') return false
      const next = result.scene
      if (result.status === 'unavailable' || evaluateGeometryScene3D(snapshots[index]).status === 'unavailable') {
        // Metadata and saved view remain editable; unknown geometry evaluation is never implied.
        const geometryOnly = (scene: GeometryScene3D) => ({ ...scene, description: '', print_camera: emptyGeometryScene3D().print_camera })
        if (JSON.stringify(geometryOnly(next)) !== JSON.stringify(geometryOnly(snapshots[index]))) return false
      }
      if (JSON.stringify(next) === JSON.stringify(snapshots[index])) return false
      snapshots = snapshots.slice(0, index+1); snapshots.push(next); index++
      if (snapshots.length > 101) { snapshots.shift(); index-- }
      apply(structuredClone(next)); notify(); return true
    },
  }
}
