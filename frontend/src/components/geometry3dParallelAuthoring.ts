import type {GeometryScene3D} from './geometry3dContract'
import type {PerpendicularReference3D} from './geometry3dPerpendicular'
import {parallelGeometry3D,parallelReference3D,parallelPlaneGeometry3D,type ParallelPlaneReference3D} from './geometry3dParallel'
import {evaluateGeometryScene3D,transactGeometryScene3D} from './geometry3dModel'
export function createParallel3D(source:GeometryScene3D,pointId:string,reference:PerpendicularReference3D,id=`parallel_${crypto.randomUUID().replace(/-/g,'')}`){
 try{
  const e=evaluateGeometryScene3D(source);if(e.status!=='ok')throw Error('Invalid scene')
  const r=parallelReference3D(e.scene,reference),point=(id:string)=>{const p=e.scene.points.find(p=>p.id===id);if(!p)throw Error('Missing point');return p.position},geometry=parallelGeometry3D(point(pointId),point(r.a),point(r.b),'line','forward',2),endpoint=id+'_end',linear=id+'_object'
  const scene=transactGeometryScene3D(e.scene,s=>{s.points.push({id:endpoint,position:geometry.position,label:null});s.linear_objects.push({id:linear,kind:'line',a:pointId,b:endpoint});s.constructions.push({id,kind:'parallel',source_point_id:pointId,reference,output_point_id:endpoint,linear_id:linear,output_kind:'line',direction:'forward',length:2})})
  if(!scene)throw Error('Construction rejected');return {scene,id:linear,coincident:geometry.coincident,error:null}
 }catch(error){return {scene:null,id:null,coincident:false,error:error instanceof Error?error.message:'Construction rejected'}}
}
export function editParallel3D(source:GeometryScene3D,id:string,patch:{output_kind?:'line'|'ray'|'segment';direction?:'forward'|'reverse';length?:number}){
 if(Object.keys(patch).some(k=>!['output_kind','direction','length'].includes(k)))return null
 return transactGeometryScene3D(source,s=>{const c=s.constructions.find(c=>c.kind==='parallel'&&(c.id===id||c.linear_id===id));if(!c||c.kind!=='parallel')throw Error('Missing parallel');Object.assign(c,patch);s.linear_objects.find(l=>l.id===c.linear_id)!.kind=c.output_kind})
}
export function createPlaneParallel3D(source:GeometryScene3D,pointId:string,reference:ParallelPlaneReference3D,id=`parallel_${crypto.randomUUID().replace(/-/g,'')}`){
 try{
  const e=evaluateGeometryScene3D(source);if(e.status!=='ok')throw Error('Invalid scene')
  const p=e.scene.points.find(p=>p.id===pointId);if(!p)throw Error('Missing source point')
  const angle=((reference.angle_radians%(2*Math.PI))+2*Math.PI)%(2*Math.PI),canonical={...reference,angle_radians:angle}
  const geometry=parallelPlaneGeometry3D(e.scene,p.position,canonical,'line','forward',2),endpoint=id+'_end',linear=id+'_object'
  const scene=transactGeometryScene3D(e.scene,s=>{s.points.push({id:endpoint,position:geometry.position,label:null});s.linear_objects.push({id:linear,kind:'line',a:pointId,b:endpoint});s.constructions.push({id,kind:'parallel',source_point_id:pointId,reference:canonical,output_point_id:endpoint,linear_id:linear,output_kind:'line',direction:'forward',length:2})})
  if(!scene)throw Error('Construction rejected');return {scene,id:linear,coincident:geometry.coincident,error:null}
 }catch(error){return {scene:null,id:null,coincident:false,error:error instanceof Error?error.message:'Construction rejected'}}
}
