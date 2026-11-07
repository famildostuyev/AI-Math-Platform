import type {GeometryScene3D} from './geometry3dContract'
import type {ResolvedPlaneStroke3D} from './geometry3dPlaneStroke'

export type PlaneIntersectionStrokeOwner3D=Readonly<{ownerId:string;stroke:ResolvedPlaneStroke3D}>
/** The recipe owns the guide even when its current clipped intersection is empty. */
export function planeOwnsIntersectionGuide3D(scene:GeometryScene3D,id:string){
 return scene.constructions.some(c=>c.kind==='perpendicular_plane_on_line'&&c.output_plane_id===id||c.kind==='constructed_plane'&&c.relation==='perpendicular'&&c.output_plane_id===id)
}
export function mergeIntersectionOwners3D(a:readonly PlaneIntersectionStrokeOwner3D[]|undefined,b:readonly PlaneIntersectionStrokeOwner3D[]|undefined){
 if(!a?.length)return b;if(!b?.length)return a
 return Object.freeze([...new Map([...a,...b].map(o=>[o.ownerId,o])).values()].sort((a,b)=>a.ownerId<b.ownerId?-1:a.ownerId>b.ownerId?1:0))
}
/** No change to the representative semantic ID: explicit style, then lexical owner. */
export function effectiveIntersectionOwner3D(owners:readonly PlaneIntersectionStrokeOwner3D[]|undefined){
 return owners&&[...owners].sort((a,b)=>Number(b.stroke.source==='stored')-Number(a.stroke.source==='stored')||(a.ownerId<b.ownerId?-1:a.ownerId>b.ownerId?1:0))[0]
}
export function explicitIntersectionStroke3D(owners:readonly PlaneIntersectionStrokeOwner3D[]|undefined){
 const owner=effectiveIntersectionOwner3D(owners);return owner?.stroke.source==='stored'?owner.stroke:undefined
}
