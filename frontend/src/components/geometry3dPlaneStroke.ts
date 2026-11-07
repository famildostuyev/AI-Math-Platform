import type {GeometryPlane3D,GeometryPlaneStroke3D} from './geometry3dContract'
import contractJson from '../../../backend/app/schemas/geometry_3d_contract.json?raw'

/** A record does not identify its boundary representation: parallel/guided
 * outlines and standalone half-planes differ from generated boundary segments.
 * Callers must supply segment for the latter; IDs are never used to infer it.
 */
export type PlaneBoundaryRepresentation3D = 'outline'|'segment'
export type PlaneStrokePattern3D = Readonly<{dashArray:readonly number[];lineCap:'butt'|'round'}>
export type ResolvedPlaneStroke3D = Readonly<GeometryPlaneStroke3D & {
  source:'stored'|'legacy'
  pattern:PlaneStrokePattern3D
  /** Existing segment occlusion fallback, not stored styling or selection.
   * Ordinary polygon outlines currently have no hidden-edge split.
   */
  legacyHidden:Readonly<{dashArray:readonly number[];opacity:number}>|null
}>

const {stroke_width_range:[minimumWidth,maximumWidth]}=JSON.parse(contractJson) as {stroke_width_range:[number,number]}
const LEGACY_COLORS=Object.freeze({outline:'#94A3B8',segment:'#334155'})
const LEGACY_WIDTH=1
// Dash/gap multiples of the resolved width, converted to logical display/SVG
// units below. Scaling keeps wide dotted strokes separated. Adapters remain
// responsible for rendering caps and converting units to WebGL.
const PATTERNS:Readonly<Record<GeometryPlaneStroke3D['style'],PlaneStrokePattern3D>>=Object.freeze({
  solid:Object.freeze({dashArray:Object.freeze([] as number[]),lineCap:'butt'}),
  dashed:Object.freeze({dashArray:Object.freeze([4,3]),lineCap:'butt'}),
  dotted:Object.freeze({dashArray:Object.freeze([1,3]),lineCap:'round'}),
})
const LEGACY_HIDDEN=Object.freeze({dashArray:PATTERNS.dashed.dashArray,opacity:.45})

/** Input should already be normalized. Defensively ignore the entire stored
 * stroke if malformed; never merge a partial/invalid style with legacy fields.
 */
function validStroke(stroke:GeometryPlaneStroke3D|undefined):stroke is GeometryPlaneStroke3D{
  return !!stroke&&typeof stroke==='object'&&!Array.isArray(stroke)&&Object.keys(stroke).length===3&&Object.keys(stroke).every(k=>k==='color'||k==='width'||k==='style')
    &&typeof stroke.color==='string'&&stroke.color.length===7&&/^#[0-9A-F]{6}$/.test(stroke.color)
    &&typeof stroke.width==='number'&&Number.isFinite(stroke.width)&&stroke.width>=minimumWidth&&stroke.width<=maximumWidth
    &&(stroke.style==='solid'||stroke.style==='dashed'||stroke.style==='dotted')
}

/** Resolve persistent boundary styling only. No camera, geometry, selection,
 * preview or renderer state is read. All descriptors are immutable and contain
 * no aliases to input metadata. Absence never writes defaults into the record.
 */
export function resolvePlaneBoundaryStroke3D(plane:GeometryPlane3D,representation:PlaneBoundaryRepresentation3D='outline'):ResolvedPlaneStroke3D{
  return resolveStroke3D(plane.display?.stroke,representation)
}
/** Same units/patterns, separate persistent channel from the boundary. */
export function resolvePlaneIntersectionStroke3D(plane:GeometryPlane3D):ResolvedPlaneStroke3D{
  return resolveStroke3D(plane.display?.intersection_stroke,'segment')
}
function resolveStroke3D(stored:GeometryPlaneStroke3D|undefined,representation:PlaneBoundaryRepresentation3D):ResolvedPlaneStroke3D{
  const valid=validStroke(stored)
  const color=valid?stored.color:LEGACY_COLORS[representation]
  const width=valid?stored.width:LEGACY_WIDTH,style=valid?stored.style:'solid'
  const base=PATTERNS[style]
  const pattern=width===1?base:Object.freeze({dashArray:Object.freeze(base.dashArray.map(v=>v*width)),lineCap:base.lineCap})
  return Object.freeze({color,width,style,source:valid?'stored':'legacy',pattern,legacyHidden:representation==='segment'?LEGACY_HIDDEN:null})
}
