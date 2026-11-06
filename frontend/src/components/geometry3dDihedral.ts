import type {GeometryDihedral3D,GeometryScene3D,Vec3} from './geometry3dContract'
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3
const mul=(a:Vec3,t:number):Vec3=>a.map(v=>v*t) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
export const DIHEDRAL_FEATURES_3D={v_0:'points',v_1:'points',v_2:'points',v_3:'points',edge:'linear_objects',half_0:'planes',half_1:'planes'} as const
export const DEFAULT_DIHEDRAL_DISPLAY_3D={edge_length:4,widths:[2.5,2.5] as [number,number]}
export function dihedralDisplay3D(d:GeometryDihedral3D){
 const size=d.display??DEFAULT_DIHEDRAL_DISPLAY_3D
 if([size.edge_length,...size.widths].some(x=>!Number.isFinite(x)||x<.05||x>1e6))throw Error('Invalid dihedral display size')
 const {e,a,b}=dihedralGeometry3D(d),o=d.frame.origin,h=size.edge_length/2,left=add(o,mul(e,-h)),right=add(o,mul(e,h))
 const patches=[a,b].map((v,i)=>[left,right,add(right,mul(v,size.widths[i])),add(left,mul(v,size.widths[i]))])
 const handles=[{kind:'width0' as const,position:add(o,mul(a,size.widths[0])),direction:a,length:size.widths[0]},{kind:'width1' as const,position:add(o,mul(b,size.widths[1])),direction:b,length:size.widths[1]},{kind:'edge' as const,position:right,direction:e,length:h},{kind:'edge' as const,position:left,direction:mul(e,-1),length:h}]
 return {size,patches,left,right,handles}
}
export function dihedralGeometry3D(d:GeometryDihedral3D){
 const {origin:o,x_axis:e,y_axis:a}=d.frame,t=d.angle_radians
 if(!Number.isFinite(t)||t<0||t>Math.PI||[o,e,a].some(v=>v.length!==3||v.some(x=>!Number.isFinite(x)||Math.abs(x)>1e12))||Math.abs(dot(e,e)-1)>1e-9||Math.abs(dot(a,a)-1)>1e-9||Math.abs(dot(e,a))>1e-9)throw Error('Invalid dihedral frame or angle')
 const c=cross(e,a),b=add(mul(a,t===Math.PI?-1:Math.cos(t)),mul(c,t===0||t===Math.PI?0:Math.sin(t)))
 const point=(angle:number,radius=1.4)=>add(o,add(mul(a,radius*Math.cos(angle)),mul(c,radius*Math.sin(angle))))
 const positions={v_0:[...o] as Vec3,v_1:add(o,e),v_2:add(o,a),v_3:add(o,b)}
 if(Object.values(positions).some(v=>v.some(x=>!Number.isFinite(x)||Math.abs(x)>1e12)))throw Error('Dihedral coordinate overflow')
 return {e,a,b,c,positions,arc:Array.from({length:49},(_,i)=>point(t*i/48)),label:point(t/2,1.7),handle:point(t,1.8)}
}
export function validateDihedralTopology3D(scene:GeometryScene3D,d:GeometryDihedral3D){
 dihedralGeometry3D(d)
 dihedralDisplay3D(d)
 const slots=new Map(d.features.map(f=>[f.slot,f.entity_id]));if(slots.size!==7||d.features.length!==7||new Set(slots.values()).size!==7||Object.keys(DIHEDRAL_FEATURES_3D).some(k=>!slots.has(k)))throw Error('Invalid dihedral feature map')
 const edge=scene.linear_objects.find(e=>e.id===slots.get('edge'))
 if(!edge||edge.kind!=='line'||edge.a!==slots.get('v_0')||edge.b!==slots.get('v_1'))throw Error('Invalid dihedral edge')
 for(const i of [0,1]){const plane=scene.planes.find(p=>p.id===slots.get('half_'+i));if(!plane||plane.kind!=='half_plane'||JSON.stringify(plane.point_ids)!==JSON.stringify([slots.get('v_0'),slots.get('v_1'),slots.get('v_'+(i+2))]))throw Error('Invalid dihedral half-plane')}
}
