import type {GeometryConstruction3D,GeometryScene3D,Vec3} from './geometry3dContract'
import {planeReference3D} from './geometry3dPlanePerpendicular'
import {planeDisplay3D} from './geometry3dPlaneDisplay'
export type GuidedPlane3D=Extract<GeometryConstruction3D,{kind:'perpendicular_plane_on_line'}>
export type PlaneGuide3D=GuidedPlane3D['guide']
export function guidedIntersectionSegments3D(scene:GeometryScene3D,reference:GuidedPlane3D['reference'],guide:PlaneGuide3D){
 const geometry=guidedPlaneGeometry3D(scene,reference,guide),display=planeDisplay3D(scene.planes.find(p=>p.id===reference.id)!,scene)
 if(!display)throw Error('Reference plane requires a finite display patch')
 return clipLineToPlaneContour3D(geometry.positions[0],geometry.positions[1],display.contour,display.x,display.y)
}
/** Display linkage follows alpha's extent along the intersection, not alpha's
 * unrelated local x-axis. Basis points and mathematical incidence stay unchanged. */
export function guidedPlaneDisplaySize3D(scene:GeometryScene3D,reference:GuidedPlane3D['reference'],guide:PlaneGuide3D){
 const geometry=guidedPlaneGeometry3D(scene,reference,guide),plane=scene.planes.find(p=>p.id===reference.id)!,display=planeDisplay3D(plane,scene)
 if(!display)throw Error('Reference plane requires a finite display patch')
 const [origin,end]=geometry.positions,t=sub(end,origin),segments=clipLineToPlaneContour3D(origin,end,display.contour,display.x,display.y)
 // Preserve the semantic basis origin. For an offset/asymmetric chord, cover
 // both endpoints without moving any dependent points. Outside-patch lines
 // use the contour's directional support; no false intersection is drawn.
 const points=segments.length?segments.flat():display.contour
 const width=2*Math.max(...points.map(p=>Math.abs(dot(sub(p,origin),t))))
 if(!Number.isFinite(width)||width<=1e-9)throw Error('Invalid linked plane display extent')
 return {width,height:plane.display!.height}
}
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0)
export function planeGuidePointIds3D(scene:GeometryScene3D,guide:PlaneGuide3D):[string,string]{
 if(guide.kind==='points'){if(guide.a===guide.b)throw Error('İki fərqli nöqtə seçin.');return [guide.a,guide.b]}
 const line=scene.linear_objects.find(l=>l.id===guide.id)
 if(!line||!['line','segment'].includes(line.kind))throw Error('Düz xətt və ya parça seçin.')
 return [line.a,line.b]
}
/** Exact supporting plane. A perpendicular guide uses alpha's stable local x. */
export function guidedPlaneGeometry3D(scene:GeometryScene3D,reference:GuidedPlane3D['reference'],guide:PlaneGuide3D){
 const f=planeReference3D(scene,reference).frame,ids=planeGuidePointIds3D(scene,guide)
 const [A,B]=ids.map(id=>{const p=scene.points.find(p=>p.id===id);if(!p)throw Error('İstinad nöqtəsi tapılmadı.');return p.position})
 const delta=sub(B,A),length=Math.hypot(...delta)
 if(!Number.isFinite(length)||length<=1e-9)throw Error('İstiqamət degenerativdir: fərqli nöqtələr seçin.')
 const d=delta.map(v=>v/length) as Vec3,dx=dot(d,f.x),dy=dot(d,f.y),tangent=f.x.map((v,i)=>dx*v+dy*f.y[i]) as Vec3,tangentLength=Math.hypot(dx,dy)
 const ambiguous=tangentLength<=64*Number.EPSILON
 const t=ambiguous?f.x:tangent.map(v=>v/tangentLength) as Vec3
 // A near-singular nonzero direction must still satisfy incidence; never fake it.
 if(Math.abs(dot(d,[t[1]*f.normal[2]-t[2]*f.normal[1],t[2]*f.normal[0]-t[0]*f.normal[2],t[0]*f.normal[1]-t[1]*f.normal[0]]))>1e-9)throw Error('İstiqamət ədədi cəhətdən dayanıqlı deyil.')
 const distance=dot(sub(A,f.origin),f.normal),Q=A.map((v,i)=>v-distance*f.normal[i]) as Vec3
 const shift=dot(sub(f.origin,Q),t),origin=Q.map((v,i)=>v+shift*t[i]) as Vec3
 const positions:[Vec3,Vec3,Vec3]=[origin,origin.map((v,i)=>v+t[i]) as Vec3,origin.map((v,i)=>v+f.normal[i]) as Vec3]
 if(positions.flat().some(v=>!Number.isFinite(v)||Math.abs(v)>1e12)||Math.hypot(...sub(positions[1],origin).map((v,i)=>v-t[i]))>1e-9||Math.hypot(...sub(positions[2],origin).map((v,i)=>v-f.normal[i]))>1e-9)throw Error('Müstəvi bu koordinatlarda etibarlı göstərilə bilmir.')
 const u=sub(positions[1],origin),v=sub(positions[2],origin),cross:Vec3=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],normal=cross.map(v=>v/Math.hypot(...cross)) as Vec3
 if([A,B].some(point=>Math.abs(dot(sub(point,origin),normal))>1e-9))throw Error('İstiqamət bu koordinatlarda ədədi cəhətdən dayanıqlı deyil.')
 return {positions,ambiguous}
}
/** Clip a true line to an arbitrary simple planar display contour (including cloud). */
export function clipLineToPlaneContour3D(a:Vec3,b:Vec3,contour:Vec3[],x:Vec3,y:Vec3):[Vec3,Vec3][]{
 const d=sub(b,a),v=[dot(d,x),dot(d,y)],points=contour.map(p=>[dot(sub(p,a),x),dot(sub(p,a),y)]),cross=(p:number[],q:number[])=>p[0]*q[1]-p[1]*q[0],cuts:number[]=[]
 if(dot(d,d)<=1e-18)return []
 for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length],edge=[q[0]-p[0],q[1]-p[1]],den=cross(v,edge)
  if(Math.abs(den)>1e-12){const t=cross(p,edge)/den,u=cross(p,v)/den;if(u>=-1e-9&&u<=1+1e-9)cuts.push(t)}
  else if(Math.abs(cross(p,v))<=1e-9){const len=v[0]*v[0]+v[1]*v[1];cuts.push((p[0]*v[0]+p[1]*v[1])/len,(q[0]*v[0]+q[1]*v[1])/len)}
 }
 const sorted=[...new Set(cuts)].sort((a,b)=>a-b),inside=(t:number)=>{const p=[t*v[0],t*v[1]];let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j],edge=[b[0]-a[0],b[1]-a[1]],offset=[p[0]-a[0],p[1]-a[1]];if(Math.abs(cross(edge,offset))<=1e-9&&(p[0]-a[0])*(p[0]-b[0])+(p[1]-a[1])*(p[1]-b[1])<=1e-9)return true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit}return hit}
 const result:[Vec3,Vec3][]=[]
 for(let i=0;i<sorted.length-1;i++){const lo=sorted[i],hi=sorted[i+1];if(hi-lo>1e-9&&inside((lo+hi)/2))result.push([a.map((v,i)=>v+lo*d[i]) as Vec3,a.map((v,i)=>v+hi*d[i]) as Vec3])}
 return result
}
