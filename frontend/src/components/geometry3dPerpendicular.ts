import type {GeometryScene3D,Vec3} from './geometry3dContract'
export type PerpendicularReference3D={kind:'linear'|'edge';id:string}
export function perpendicularReference3D(scene:GeometryScene3D,reference:PerpendicularReference3D){
 if(reference.kind==='edge'){const e=scene.edges.find(e=>e.id===reference.id);if(!e)throw Error('Missing edge');return {a:e.start,b:e.end,finite:true}}
 const l=scene.linear_objects.find(l=>l.id===reference.id);if(!l||!['line','segment'].includes(l.kind))throw Error('Select a line, segment or polyhedron edge')
 return {a:l.a,b:l.b,finite:l.kind==='segment'}
}
export function perpendicularFoot3D(p:Vec3,a:Vec3,b:Vec3){
 const d=b.map((v,i)=>v-a[i]),length2=d.reduce((s,v)=>s+v*v,0)
 if(![...p,...a,...b].every(Number.isFinite)||length2<=1e-18)throw Error('Invalid reference direction')
 const t=d.reduce((s,v,i)=>s+(p[i]-a[i])*v,0)/length2,h=a.map((v,i)=>v+t*d[i]) as Vec3
 if(Math.hypot(...h.map((v,i)=>v-p[i]))<=1e-9+64*Number.EPSILON*Math.max(1,...[...p,...a,...b].map(Math.abs)))throw Error('The point is already on the supporting line; no unique perpendicular direction exists.')
 if(h.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('Invalid perpendicular foot')
 return {position:h,t}
}
