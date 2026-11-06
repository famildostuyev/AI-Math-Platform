import type {GeometryScene3D,GeometryDihedral3D,Vec3} from './geometry3dContract'
import {transactGeometryScene3D,evaluateGeometryScene3D,deleteGeometryTargets3D} from './geometry3dModel'
import {dihedralGeometry3D,dihedralDisplay3D,DIHEDRAL_FEATURES_3D} from './geometry3dDihedral'
export function createDihedral3D(source:GeometryScene3D,origin:Vec3,plane:'XY'|'XZ'|'YZ',id=`dihedral_${crypto.randomUUID().replace(/-/g,'')}`){
 if(!['XY','XZ','YZ'].includes(plane))return null
 const d:GeometryDihedral3D={id,display:{edge_length:4,widths:[2.5,2.5]},label:null,frame:{origin:[...origin],x_axis:plane==='YZ'?[0,1,0]:[1,0,0],y_axis:plane==='XY'?[0,1,0]:[0,0,1]},angle_radians:Math.PI/2,features:Object.keys(DIHEDRAL_FEATURES_3D).map(slot=>({slot,entity_id:id+'_'+slot})),arc_visibility:'hidden',label_visibility:'hidden'}
 const scene=transactGeometryScene3D(source,s=>{const pos=dihedralGeometry3D(d).positions,slot=(key:string)=>d.features.find(f=>f.slot===key)!.entity_id;s.dihedrals.push(d);for(const [key,position]of Object.entries(pos))s.points.push({id:slot(key),position,label:null});s.linear_objects.push({id:slot('edge'),kind:'line',a:slot('v_0'),b:slot('v_1')});for(const i of [0,1])s.planes.push({id:slot('half_'+i),kind:'half_plane',point_ids:[slot('v_0'),slot('v_1'),slot('v_'+(i+2))]})})
 return scene?{scene,id}:null
}
export function editDihedral3D(source:GeometryScene3D,id:string,patch:Partial<Pick<GeometryDihedral3D,'angle_radians'|'frame'|'label'|'arc_visibility'|'label_visibility'|'display'>>){
 if(!patch||Object.keys(patch).some(k=>!['angle_radians','frame','label','arc_visibility','label_visibility','display'].includes(k)))return null
 return transactGeometryScene3D(source,s=>{const d=s.dihedrals.find(d=>d.id===id);if(!d)throw Error('Missing dihedral');Object.assign(d,structuredClone(patch));dihedralGeometry3D(d);dihedralDisplay3D(d)})
}
export function deleteDihedral3D(source:GeometryScene3D,id:string){
 const e=evaluateGeometryScene3D(source);if(e.status!=='ok')return null
 const d=(e.scene.dihedrals??[]).find(d=>d.id===id);if(!d)return null
 const ids=d.features.filter(f=>!f.slot.startsWith('v_')).map(f=>f.entity_id);e.scene.dihedrals=e.scene.dihedrals.filter(d=>d.id!==id)
 return deleteGeometryTargets3D(e.scene,ids)
}
export function transformDihedral3D(source:GeometryScene3D,id:string,delta:Vec3,axis?:Vec3,angle=0){
 const d=(source.dihedrals??[]).find(d=>d.id===id);if(!d)return null
 let frame=structuredClone(d.frame)
 if(axis){const len=Math.hypot(...axis);if(!Number.isFinite(angle)||!Number.isFinite(len)||len<=1e-9)return null;const n=axis.map(x=>x/len) as Vec3,c=Math.cos(angle),s=Math.sin(angle);const rot=(v:Vec3):Vec3=>{const cross=[n[1]*v[2]-n[2]*v[1],n[2]*v[0]-n[0]*v[2],n[0]*v[1]-n[1]*v[0]],dot=n.reduce((s,x,i)=>s+x*v[i],0);return v.map((x,i)=>c*x+s*cross[i]+(1-c)*dot*n[i]) as Vec3};frame={...frame,x_axis:rot(frame.x_axis),y_axis:rot(frame.y_axis)}}
 frame.origin=frame.origin.map((v,i)=>v+delta[i]) as Vec3
 return editDihedral3D(source,id,{frame})
}
