import type {GeometryScene3D,Vec3} from './geometry3dContract'
import {perpendicularReference3D,type PerpendicularReference3D} from './geometry3dPerpendicular'
import {planeReference3D,planeReferencePointIds3D} from './geometry3dPlanePerpendicular'
export type ParallelPlaneReference3D={kind:'plane'|'face';id:string;angle_radians:number}
export type ParallelReference3D=PerpendicularReference3D|ParallelPlaneReference3D
export function parallelDependencies3D(scene:GeometryScene3D,reference:ParallelReference3D){
 if(reference.kind==='plane'||reference.kind==='face')return planeReferencePointIds3D(scene,reference)
 const r=parallelReference3D(scene,reference as PerpendicularReference3D);return [r.a,r.b]
}
export function parallelPlaneGeometry3D(scene:GeometryScene3D,p:Vec3,reference:ParallelPlaneReference3D,kind:'line'|'ray'|'segment',direction:'forward'|'reverse',length:number){
 if(!Number.isFinite(reference.angle_radians))throw Error('Invalid plane-local direction')
 const f=planeReference3D(scene,reference).frame,d=f.x.map((v,i)=>Math.cos(reference.angle_radians)*v+Math.sin(reference.angle_radians)*f.y[i]) as Vec3
 const result=parallelGeometry3D(p,[0,0,0],d,kind,direction,length)
 const distance=p.reduce((sum,v,i)=>sum+(v-f.origin[i])*f.normal[i],0)
 return {...result,coincident:Math.abs(distance)<=1e-9+64*Number.EPSILON*Math.max(1,...p.map(Math.abs),...f.origin.map(Math.abs))}
}
export function evaluateParallel3D(scene:GeometryScene3D,c:Extract<GeometryScene3D['constructions'][number],{kind:'parallel'}>){
 const point=(id:string)=>scene.points.find(p=>p.id===id)!.position
 if(c.reference.kind==='plane'||c.reference.kind==='face')return parallelPlaneGeometry3D(scene,point(c.source_point_id),c.reference,c.output_kind,c.direction,c.length)
 const r=parallelReference3D(scene,c.reference as PerpendicularReference3D);return parallelGeometry3D(point(c.source_point_id),point(r.a),point(r.b),c.output_kind,c.direction,c.length)
}
export function alignParallelPlaneDirection3D(scene:GeometryScene3D,reference:ParallelPlaneReference3D,alignment:PerpendicularReference3D){
 const f=planeReference3D(scene,reference).frame,r=parallelReference3D(scene,alignment),a=scene.points.find(p=>p.id===r.a)!.position,b=scene.points.find(p=>p.id===r.b)!.position,d=b.map((v,i)=>v-a[i]),norm=Math.hypot(...d)
 if(!Number.isFinite(norm)||norm<=1e-9||Math.abs(d.reduce((s,v,i)=>s+v*f.normal[i],0))/norm>1e-9)throw Error('Alignment reference must be parallel to the selected plane.')
 return Math.atan2(d.reduce((s,v,i)=>s+v*f.y[i],0),d.reduce((s,v,i)=>s+v*f.x[i],0))
}
export function parallelReference3D(scene:GeometryScene3D,reference:PerpendicularReference3D){
 if(reference.kind==='linear'){const ray=scene.linear_objects.find(l=>l.id===reference.id&&l.kind==='ray');if(ray)return {a:ray.a,b:ray.b,finite:false}}
 return perpendicularReference3D(scene,reference)
}
export function parallelGeometry3D(p:Vec3,a:Vec3,b:Vec3,kind:'line'|'ray'|'segment',direction:'forward'|'reverse',length:number){
 const d=b.map((v,i)=>v-a[i]),norm=Math.hypot(...d)
 if(![...p,...a,...b,length].every(Number.isFinite)||norm<=1e-9||length<=0||length>1e12||!['line','ray','segment'].includes(kind)||!['forward','reverse'].includes(direction))throw Error('Invalid parallel parameters')
 const size=(kind==='segment'?length:1)*(direction==='reverse'?-1:1),position=p.map((v,i)=>v+size*d[i]/norm) as Vec3
 if(position.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('Invalid parallel endpoint')
 const t=d.reduce((sum,v,i)=>sum+(p[i]-a[i])*v,0)/(norm*norm),distance=Math.hypot(...a.map((v,i)=>v+t*d[i]-p[i])),tolerance=1e-9+64*Number.EPSILON*Math.max(1,...[...p,...a,...b].map(Math.abs))
 return {position,coincident:distance<=tolerance}
}
