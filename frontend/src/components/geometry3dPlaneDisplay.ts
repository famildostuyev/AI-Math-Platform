import type {GeometryPlane3D,GeometryScene3D,Vec3} from './geometry3dContract'
/** Presentation-only effective default. Do not materialize it in stored scenes. */
export function planeShowsHiddenEdges3D(plane:GeometryPlane3D):boolean{return plane.display?.show_hidden_edges??true}
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v-b[i]) as Vec3
const scale=(a:Vec3,t:number):Vec3=>a.map(v=>v*t) as Vec3
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const unit=(v:Vec3)=>scale(v,1/Math.hypot(...v))
export function internalPlanePointIds3D(plane:GeometryPlane3D){
 return plane.display&&plane.point_ids.every((id,i)=>id===plane.id+['_origin','_x','_y'][i])?plane.point_ids:[]
}
/** Deterministic local contours; neither display resizing nor skew changes the infinite plane. */
export function planeDisplay3D(plane:GeometryPlane3D,scene:GeometryScene3D){
 if(!plane.display)return null
 const [o,b,c]=plane.point_ids.map(id=>scene.points.find(p=>p.id===id)!.position),x=unit(sub(b,o)),normal=unit(cross(x,sub(c,o))),y=unit(cross(normal,x))
 const {width,height}=plane.display,shape=plane.display.shape??'rectangle',skew=shape==='parallelogram'?(plane.display.skew??.35):0
 const world=(u:number,v:number)=>add(o,add(scale(x,width*(u+skew*v)/2),scale(y,height*(plane.display!.lower_portion==='upper'?(v+1)/2:v)/2)))
 const contour=shape==='cloud'?Array.from({length:120},(_,i)=>{const t=2*Math.PI*i/120,r=(1+.07*Math.cos(12*t))/1.07;return world(r*Math.cos(t),r*Math.sin(t))}):[world(-1,-1),world(1,-1),world(1,1),world(-1,1)]
 const locations=shape==='cloud'?[[1,0],[0,1],[-1,0],[0,-1]]:[[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[1,0],[0,1],[-1,0]]
 const grips=locations.map(([u,v])=>({u,v,position:world(u,v)}))
 return {o,x,y,normal,skew,world,contour,grips}
}
