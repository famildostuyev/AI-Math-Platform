import type {GeometryScene3D,Vec3} from './geometry3dContract'
import {faceFrame3D} from './geometry3dFaces'
export type PlaneReference3D={kind:'plane'|'face';id:string}
export function planeReferencePointIds3D(scene:GeometryScene3D,reference:PlaneReference3D){
 const entity=reference.kind==='plane'?scene.planes.find(p=>p.id===reference.id&&p.kind!=='half_plane'):scene.faces.find(f=>f.id===reference.id)
 if(!entity)throw Error('Select a standalone plane or a polyhedron face')
 return 'point_ids'in entity?entity.point_ids:entity.boundary
}
export function planeReference3D(scene:GeometryScene3D,reference:PlaneReference3D){
 const pointIds=planeReferencePointIds3D(scene,reference)
 const positions=pointIds.map(id=>{const p=scene.points.find(p=>p.id===id);if(!p)throw Error('Missing plane point');return p.position})
 return {pointIds,positions,frame:faceFrame3D(positions)}
}
export function planePerpendicularFoot3D(point:Vec3,vertices:Vec3[]){
 if(vertices.length<3||[...point,...vertices.flat()].some(v=>!Number.isFinite(v)))throw Error('Invalid supporting plane')
 const frame=faceFrame3D(vertices),distance=point.reduce((s,v,i)=>s+(v-frame.origin[i])*frame.normal[i],0)
 const tolerance=1e-9+64*Number.EPSILON*Math.max(1,...[...point,...vertices.flat()].map(Math.abs))
 if(Math.abs(distance)<=tolerance)throw Error('The point lies on the supporting plane; a zero-length perpendicular cannot be created.')
 const position=point.map((v,i)=>v-distance*frame.normal[i]) as Vec3
 if(position.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))throw Error('Invalid perpendicular foot')
 return {position,normal:frame.normal,tangent:frame.x,distance}
}
export function pyramidAltitudeOwner3D(scene:GeometryScene3D,pointId:string,faceId:string,pyramidId?:string){
 const face=scene.faces.find(f=>f.id===faceId),solid=scene.solids.find(s=>s.mode==='parametric'&&s.kind==='pyramid'&&(!pyramidId||s.id===pyramidId)&&s.features.some(f=>f.slot==='f_0'&&f.entity_id===faceId)&&s.features.some(f=>f.slot===`v_${face?.boundary.length}`&&f.entity_id===pointId))
 if(!solid)throw Error('Select the apex and base face of the same semantic pyramid.')
 return solid.id
}
