import type {GeometryPlane3D,GeometryPlaneFill3D} from './geometry3dContract'

export type PlaneFillRenderer3D='webgl'|'svg'
const defaults=Object.freeze({webgl:Object.freeze({color:'#CBD5E1',opacity:.15}),svg:Object.freeze({color:'#E2E8F0',opacity:.35})})
/** Persistent fill only; selection, opacity-independent picking and occlusion stay separate. */
export function resolvePlaneFill3D(plane:GeometryPlane3D,renderer:PlaneFillRenderer3D):Readonly<GeometryPlaneFill3D>{
 const fill=plane.display?.fill
 return fill?Object.freeze({color:fill.color,opacity:fill.opacity}):defaults[renderer]
}
