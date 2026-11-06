import {guidedPlaneDisplaySize3D} from './geometry3dGuidedPlane'
import {constructionOutputPointIds3D} from './geometry3dConstructedPlane'
import type {GeometryScene3D,Vec3} from './geometry3dContract'
import {transactGeometryScene3D} from './geometry3dModel'
import {add,sub,scale,unit,cross,dot} from './geometry3dProjection'

/** The three points define an infinite plane; display sizes do not bound its semantics. */
export function createPlaneAt3D(source:GeometryScene3D,origin:Vec3,working:'XY'|'XZ'|'YZ',id=`plane_${crypto.randomUUID().replace(/-/g,'')}`){
 if(!['XY','XZ','YZ'].includes(working))return null
 const x:Vec3=working==='YZ'?[0,1,0]:[1,0,0],y:Vec3=working==='XY'?[0,1,0]:[0,0,1]
 const scene=transactGeometryScene3D(source,s=>{
  const ids=[id+'_origin',id+'_x',id+'_y'] as [string,string,string]
  ;[origin,add(origin,x),add(origin,y)].forEach((position,i)=>s.points.push({id:ids[i],position:[...position],label:null}))
  s.planes.push({id,point_ids:ids,display:{width:4,height:3,shape:'rectangle',skew:.35}})
 })
 return scene?{scene,id}:null
}
export function resizePlaneDisplay3D(source:GeometryScene3D,id:string,width:number,height:number){
 return transactGeometryScene3D(source,s=>{const plane=s.planes.find(p=>p.id===id&&p.display);if(!plane)throw Error('Missing display plane');plane.display={...plane.display,width,height};const recipe=s.constructions.find(c=>c.kind==='perpendicular_plane_on_line'&&c.output_plane_id===id);if(recipe?.kind==='perpendicular_plane_on_line'){const parent=guidedPlaneDisplaySize3D(s,recipe.reference,recipe.guide);recipe.display_link={width_ratio:width/parent.width,height_ratio:height/parent.height,extent_mode:'intersection'}}})
}
export function setPlaneShape3D(source:GeometryScene3D,id:string,shape:'rectangle'|'parallelogram'|'cloud',skew:number){
 return transactGeometryScene3D(source,s=>{const plane=s.planes.find(p=>p.id===id&&p.display);if(!plane)throw Error('Missing display plane');plane.display={...plane.display!,shape,skew}})
}
export function transformPlane3D(source:GeometryScene3D,id:string,delta:Vec3,axis?:Vec3,angle=0){
 const plane=source.planes.find(p=>p.id===id&&p.display);if(!plane)return null
 if(plane.point_ids.some(id=>source.constructions.some(c=>constructionOutputPointIds3D(c).includes(id))||source.solids.some(s=>s.mode==='parametric'?s.features.some(f=>f.entity_id===id):s.point_ids.includes(id))||(source.dihedrals??[]).some(d=>d.features.some(f=>f.entity_id===id))))return null
 if(axis&&(!Number.isFinite(angle)||!Number.isFinite(Math.hypot(...axis))||Math.hypot(...axis)<1e-9))return null
 const center=source.points.find(p=>p.id===plane.point_ids[0])!.position,n=axis?unit(axis):null
 return transactGeometryScene3D(source,s=>{for(const p of s.points)if(plane.point_ids.includes(p.id)){
  const v=sub(p.position,center),rot=n?add(add(scale(v,Math.cos(angle)),scale(cross(n,v),Math.sin(angle))),scale(n,(1-Math.cos(angle))*dot(n,v))):v
  p.position=add(add(center,rot),delta)
 }})
}
