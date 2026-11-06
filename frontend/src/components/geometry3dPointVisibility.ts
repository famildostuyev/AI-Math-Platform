import type {GeometryPoint3D} from './geometry3dContract'

export type PointVisibilityContext3D=Readonly<{
  /** Existing internal/helper-point suppression supplied by the display adapter. */
  helperSuppressed?:boolean
  /** Existing perpendicular-foot/altitude label gate; never the right-angle marker. */
  constructionLabelVisibility?:'visible'|'hidden'
}>

/** Configured label permission for Properties, independent of whole-point/helper
 * suppression and empty text. Construction label permission remains authoritative.
 */
export function pointLabelVisibilitySetting3D(point:GeometryPoint3D,constructionLabelVisibility:'visible'|'hidden'='visible'):'visible'|'hidden'{
  return point.label_visibility==='hidden'||constructionLabelVisibility==='hidden'?'hidden':'visible'
}

/** Pure intrinsic-point display policy, without modifying text or stored defaults.
 * Callers supply their existing helper and construction-label gates. Camera,
 * occlusion, annotations and right-angle symbols remain separate responsibilities.
 * Returned flags are runtime-only; never materialize them in stored point data.
 */
export function resolvePointVisibility3D(point:GeometryPoint3D,context:PointVisibilityContext3D={}):Readonly<{markerVisible:boolean;labelVisible:boolean}>{
  const eligible=point.visibility!=='hidden'&&!context.helperSuppressed
  return Object.freeze({
    markerVisible:eligible&&point.marker_visibility!=='hidden',
    labelVisible:eligible&&point.label_visibility!=='hidden'&&context.constructionLabelVisibility!=='hidden'&&!!point.label,
  })
}
