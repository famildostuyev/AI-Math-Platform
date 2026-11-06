import type {GeometryConstruction3D,GeometryScene3D,GeometryPlaneIntersectionMode3D,Vec3} from './geometry3dContract'
import {planeReference3D} from './geometry3dPlanePerpendicular'
import {faceFrame3D} from './geometry3dFaces'
import {planeDisplay3D} from './geometry3dPlaneDisplay'
import {clipLineToPlaneContour3D} from './geometry3dGuidedPlane'
/** Display-only bounds, translated normally for an indicator through an off-plane P. */
export function perpendicularPlaneDisplay3D(scene:GeometryScene3D,pointId:string,reference:{kind:'plane'|'face';id:string},angle:number){
 const f=planeReference3D(scene,reference).frame,P=scene.points.find(p=>p.id===pointId)!.position
 const plane=reference.kind==='plane'?scene.planes.find(p=>p.id===reference.id):null
 const contour=plane?planeDisplay3D(plane,scene)?.contour:scene.faces.find(p=>p.id===reference.id)?.boundary.map(id=>scene.points.find(p=>p.id===id)!.position)
 if(!contour)return {contour:[] as Vec3[],segments:[] as [Vec3,Vec3][],indicator:[] as Vec3[]}
 const t=f.x.map((v,i)=>Math.cos(angle)*v+Math.sin(angle)*f.y[i]) as Vec3
 const [a,b]=perpendicularPlaneIntersection3D(scene,pointId,reference,angle)
 const segments=clipLineToPlaneContour3D(a,b,contour,f.x,f.y)
 const distance=P.reduce((sum,v,i)=>sum+(v-f.origin[i])*f.normal[i],0)
 const offset=contour.map(q=>q.map((v,i)=>v+distance*f.normal[i]) as Vec3)
 const chords=clipLineToPlaneContour3D(P,P.map((v,i)=>v+t[i]) as Vec3,offset,f.x,f.y)
 // Use one interior chord; never bridge gaps in a non-convex cloud contour.
 const chord=chords.reduce<[Vec3,Vec3]|null>((best,c)=>!best||Math.hypot(...c[1].map((v,i)=>v-c[0][i]))>Math.hypot(...best[1].map((v,i)=>v-best[0][i]))?c:best,null)
 const indicator=chord?[chord[0],chord[0].map((v,i)=>v+.75*(chord[1][i]-v)) as Vec3]:[]
 return {contour:offset,segments,indicator}
}
/** Display-only surface; semantic basis points and persisted data stay untouched.
 * cross produces two quads per interval; first retains the ordered-normal
 * positive quad, opposite the negative quad. Every retained quad starts at the
 * exact intersection edge. halfSpan is the minimum extent on each retained side;
 * a retained side containing P expands to reach its signed offset. P remains on
 * the semantic plane even when its side is omitted from the visible surface.
 */
export function perpendicularPlaneSurface3D(scene:GeometryScene3D,pointId:string,reference:{kind:'plane'|'face';id:string},angle:number,halfSpan=1.5,mode:GeometryPlaneIntersectionMode3D='cross'){
 if(!Number.isFinite(halfSpan)||halfSpan<=0)throw Error('Surface half-span must be positive and finite')
 if(mode!=='cross'&&mode!=='first'&&mode!=='opposite')throw Error('Invalid intersection display mode')
 const {segments}=perpendicularPlaneDisplay3D(scene,pointId,reference,angle)
 const f=planeReference3D(scene,reference).frame,P=scene.points.find(p=>p.id===pointId)!.position
 const signedOffset=P.reduce((sum,v,i)=>sum+(v-f.origin[i])*f.normal[i],0)
 const bounds:[number,number]=[mode==='first'?0:Math.min(-halfSpan,signedOffset),mode==='opposite'?0:Math.max(halfSpan,signedOffset)]
 const extrude=(p:Vec3,d:number)=>p.map((v,i)=>v+d*f.normal[i]) as Vec3
 const polygons:[Vec3,Vec3,Vec3,Vec3][]=[]
 for(const [a,b] of segments){
  if(mode!=='opposite')polygons.push([[...a],[...b],extrude(b,bounds[1]),extrude(a,bounds[1])])
  if(mode!=='first')polygons.push([[...b],[...a],extrude(a,bounds[0]),extrude(b,bounds[0])])
 }
 return {segments,polygons,normal:[...f.normal] as Vec3,signedOffset,bounds}
}
export const isConstructedPlane3D=(c:GeometryConstruction3D):c is Extract<GeometryConstruction3D,{kind:'constructed_plane'|'perpendicular_plane_on_line'}>=>c.kind==='constructed_plane'||c.kind==='perpendicular_plane_on_line'
export const constructionOutputPointIds3D=(c:GeometryConstruction3D):string[]=>isConstructedPlane3D(c)?c.output_point_ids:[c.output_point_id]
/** Infinite intersection: project P onto alpha along n; the shared direction is t.
 * No semantic points or independent line are materialized. */
export function perpendicularPlaneIntersection3D(scene:GeometryScene3D,pointId:string,reference:{kind:'plane'|'face';id:string},angle:number):[Vec3,Vec3]{
 const {positions}=constructedPlaneGeometry3D(scene,pointId,reference,{kind:'plane_local_angle',angle_radians:angle})
 const f=planeReference3D(scene,reference).frame,P=positions[0],distance=P.reduce((s,v,i)=>s+(v-f.origin[i])*f.normal[i],0)
 const origin=P.map((v,i)=>v-distance*f.normal[i]) as Vec3
 const end=origin.map((v,i)=>v+positions[1][i]-P[i]) as Vec3
 if([...origin,...end].some(v=>!Number.isFinite(v)))throw Error('Invalid plane intersection')
 return [origin,end]
}
export function normalizePlaneAngle3D(angle:number){
 if(!Number.isFinite(angle))throw Error('Orientation angle must be finite')
 const turn=2*Math.PI,remainder=angle%turn,result=remainder<0?remainder+turn:remainder
 return result===0||result>=turn?0:result
}
export function constructedPlaneGeometry3D(scene:GeometryScene3D,pointId:string,reference:{kind:'plane'|'face';id:string},orientation?:{kind:'plane_local_angle';angle_radians:number}){
 const point=scene.points.find(p=>p.id===pointId);if(!point)throw Error('Missing source point')
 const f=planeReference3D(scene,reference).frame,P=point.position
 const angle=orientation?normalizePlaneAngle3D(orientation.angle_radians):0
 const x=orientation?f.x.map((v,i)=>Math.cos(angle)*v+Math.sin(angle)*f.y[i]) as Vec3:f.x,y=orientation?f.normal:f.y
 const positions:Vec3[]=[[...P],P.map((v,i)=>v+x[i]) as Vec3,P.map((v,i)=>v+y[i]) as Vec3]
 if(positions.flat().some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('Invalid constructed plane basis')
 const actual=faceFrame3D(positions)
 if(Math.hypot(...actual.x.map((v,i)=>v-x[i]))>1e-9||Math.hypot(...actual.y.map((v,i)=>v-y[i]))>1e-9)throw Error('Constructed plane orientation cannot be represented reliably at these coordinates')
 const distance=P.reduce((sum,v,i)=>sum+(v-f.origin[i])*f.normal[i],0)
 return {positions,coincident:!orientation&&Math.abs(distance)<=1e-9+64*Number.EPSILON*Math.max(1,...P.map(Math.abs),...f.origin.map(Math.abs))}
}
