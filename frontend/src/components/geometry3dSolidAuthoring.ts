import type { GeometryParametricSolid3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { evaluateGeometryScene3D, transactGeometryScene3D, deleteGeometryTargets3D } from './geometry3dModel'
import { solidTopology3D, solidSupported3D, pyramidApexParameters3D, polygonBaseGeometry3D, type SolidKind3D } from './geometry3dSolids'
import { add, sub, dot, cross, scale, unit } from './geometry3dProjection'

/** Resolve an owned base feature without changing its stable identity or source polygon. */
export function pyramidBaseDrag3D(source:GeometryScene3D,pointId:string){
  try{
    const solid=source.solids.find(s=>solidSupported3D(s)&&s.kind==='pyramid'&&'sides'in s.parameters&&s.features.some(f=>f.entity_id===pointId&&/^v_\d+$/.test(f.slot)&&Number(f.slot.slice(2))<s.parameters.sides))
    if(!solid||!solidSupported3D(solid))return null
    const feature=solid.features.find(f=>f.entity_id===pointId)!,index=Number(feature.slot.slice(2)),topology=solidTopology3D(source,solid)
    const base=topology.vertices.slice(0,-1),basis=polygonBaseGeometry3D(base)
    return {solidId:solid.id,index,position:base[index],base,apex:topology.vertices.at(-1)!,normal:basis.normal,area:basis.area}
  }catch{return null}
}

/** One transaction snapshots the base and recomputes apex parameters in the same local frame. */
export function movePyramidBaseVertex3D(source:GeometryScene3D,pointId:string,position:Vec3){
  const drag=pyramidBaseDrag3D(source,pointId)
  if(!drag||position.some(x=>!Number.isFinite(x)||Math.abs(x)>1e12))return null
  if(Math.hypot(...sub(position,drag.position))<=1e-9)return source
  if(Math.abs(dot(sub(position,drag.position),drag.normal))>1e-9*Math.max(1,Math.hypot(...sub(position,drag.position))))return null
  try{
    const solid=source.solids.find(s=>s.id===drag.solidId)!
    if(!solidSupported3D(solid)||solid.kind!=='pyramid'||!('sides'in solid.parameters))return null
    const frame=solid.frame,z=cross(frame.x_axis,frame.y_axis),dualX=cross(frame.y_axis,z),dualY=cross(z,frame.x_axis),det=dot(frame.x_axis,dualX)
    const local=(world:Vec3):Vec3=>{const d=sub(world,frame.origin);return [dot(d,dualX)/det,dot(d,dualY)/det,dot(d,z)/det]}
    const previous=solid.parameters
    const vertices='base'in previous&&previous.base.kind==='polygon'?previous.base.vertices.map(v=>[...v] as Vec3):drag.base.map(local)
    vertices[drag.index]=local(position)
    const candidate=polygonBaseGeometry3D(vertices),worldNormal=add(scale(frame.x_axis,candidate.normal[0]),add(scale(frame.y_axis,candidate.normal[1]),scale(z,candidate.normal[2])))
    if(dot(worldNormal,drag.normal)<1-1e-9||Math.sign(candidate.area)!==Math.sign(drag.area))return null
    const delta=sub(local(drag.apex),candidate.center)
    const parameters={sides:previous.sides,height:dot(delta,candidate.normal),base:{kind:'polygon' as const,vertices},apex_offset:[dot(delta,candidate.u),dot(delta,candidate.v)] as [number,number]}
    if(Math.sign(parameters.height)!==Math.sign(previous.height))return null
    // Dedicated conversion: generic parameter editing must not silently change provenance.
    return transactGeometryScene3D(source,d=>{d.solids[d.solids.findIndex(s=>s.id===solid.id)]={...solid,parameters} as GeometryParametricSolid3D})
  }catch{return null}
}

/** Only a parametric pyramid's existing apex feature is interactively editable. */
export function pyramidApexDrag3D(source:GeometryScene3D,pointId:string){
  try{
    const solid=source.solids.find(s=>solidSupported3D(s)&&s.kind==='pyramid'&&'sides'in s.parameters&&s.features.some(f=>f.slot===`v_${s.parameters.sides}`&&f.entity_id===pointId))
    if(!solid||!solidSupported3D(solid))return null
    const topology=solidTopology3D(source,solid),frame=solid.frame,n=topology.basis.normal
    const normal=unit(add(scale(frame.x_axis,n[0]),add(scale(frame.y_axis,n[1]),scale(cross(frame.x_axis,frame.y_axis),n[2]))))
    return {solidId:solid.id,position:topology.vertices.at(-1)!,normal}
  }catch{return null}
}

/** Edit semantic offsets only; signed height and the complete feature map stay unchanged. */
export function movePyramidApexParallel3D(source:GeometryScene3D,pointId:string,position:Vec3){
  const drag=pyramidApexDrag3D(source,pointId)
  if(!drag)return null
  try{
    const solid=source.solids.find(s=>s.id===drag.solidId)!
    if(!solidSupported3D(solid)||solid.kind!=='pyramid'||!('sides'in solid.parameters))return null
    const old=solid.parameters
    // Legacy regular pyramids already accept the M4 template/offset contract.
    const parameters='radius'in old?{sides:old.sides,height:old.height,base:{kind:'template' as const,radius:old.radius},apex_offset:[0,0] as [number,number]}:old
    const definition={...solid,parameters} as GeometryParametricSolid3D
    const edited=pyramidApexParameters3D(source,definition,position)
    return editSolid3D(source,{...definition,parameters:{...edited,height:old.height}} as GeometryParametricSolid3D)
  }catch{return null}
}

/** Height gestures stay on the original side of the base; offsets are never rewritten. */
export function changePyramidHeight3D(source:GeometryScene3D,pointId:string,delta:number){
  const drag=pyramidApexDrag3D(source,pointId)
  if(!drag||!Number.isFinite(delta))return null
  const solid=source.solids.find(s=>s.id===drag.solidId)!
  if(!solidSupported3D(solid)||!('height'in solid.parameters))return null
  const height=solid.parameters.height+delta
  if(Math.abs(height)<=1e-9||Math.sign(height)!==Math.sign(solid.parameters.height))return null
  return editSolid3D(source,{...solid,parameters:{...solid.parameters,height}} as GeometryParametricSolid3D)
}

export const defaultSolid3D=(kind:SolidKind3D,id=`solid_${crypto.randomUUID().replace(/-/g,'')}`):GeometryParametricSolid3D=>({id,kind,mode:'parametric',frame:{origin:[0,0,0],x_axis:[1,0,0],y_axis:[0,1,0]},features:[],parameters:kind==='cube'?{side:2}:kind==='cuboid'?{width:2,depth:3,height:2}:kind==='prism'?{sides:3,height:2,base:{kind:'template',radius:2},direction:[0,0,1]}:{sides:4,height:2,base:{kind:'template',radius:2},apex_offset:[0,0]}} as GeometryParametricSolid3D)

/** A polygon is an ordered closed cycle of existing semantic segments/edges. */
export function addBasePolygon3D(source:GeometryScene3D,pointIds:string[],id=`base_${crypto.randomUUID().replace(/-/g,'')}`){
  const pairs=[...source.linear_objects.filter(l=>l.kind==='segment').map(l=>[l.a,l.b]),...source.edges.map(e=>[e.start,e.end])]
  if(pointIds.length<3||pointIds.length>128||new Set(pointIds).size!==pointIds.length)return null
  if(pointIds.some((a,i)=>!pairs.some(([x,y])=>x===a&&y===pointIds[(i+1)%pointIds.length]||y===a&&x===pointIds[(i+1)%pointIds.length])))return null
  const existing=source.faces.find(f=>JSON.stringify(f.boundary)===JSON.stringify(pointIds))
  if(existing)return {scene:source,id:existing.id}
  const scene=transactGeometryScene3D(source,d=>d.faces.push({id,boundary:[...pointIds]}))
  return scene?{scene,id}:null
}
export function createSolid3D(source:GeometryScene3D,definition:GeometryParametricSolid3D){
  if(evaluateGeometryScene3D(source).status!=='ok'||!solidSupported3D(definition))return null
  try{
    const draft=structuredClone(source),solid=structuredClone(definition),topology=solidTopology3D(draft,solid)
    if(solid.features.length)return null
    const ids=(prefix:string,n:number)=>Array.from({length:n},(_,i)=>`${solid.id}_${prefix}_${i}`)
    const points=ids('v',topology.vertices.length),edges=ids('e',topology.edges.length),faces=ids('f',topology.faces.length)
    solid.features=[...points.map((entity_id,i)=>({slot:`v_${i}`,entity_id})),...edges.map((entity_id,i)=>({slot:`e_${i}`,entity_id})),...faces.map((entity_id,i)=>({slot:`f_${i}`,entity_id}))]
    draft.points.push(...points.map((id,i)=>({id,position:topology.vertices[i],label:null})))
    draft.edges.push(...edges.map((id,i)=>({id,start:points[topology.edges[i][0]],end:points[topology.edges[i][1]]})))
    draft.faces.push(...faces.map((id,i)=>({id,boundary:topology.faces[i].map(j=>points[j])})))
    draft.solids.push(solid)
    const evaluated=evaluateGeometryScene3D(draft)
    return evaluated.status==='ok'?{scene:evaluated.scene,id:solid.id}:null
  }catch{return null}
}
/** Scene authoring reuses the same face-based solid transaction as the inspector. */
export function createPyramidOnFace3D(source:GeometryScene3D,faceId:string,id?:string){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,face=scene.faces.find(f=>f.id===faceId)
  if(!face)return null
  try{
    polygonBaseGeometry3D(face.boundary.map(id=>scene.points.find(p=>p.id===id)!.position))
    const definition=defaultSolid3D('pyramid',id)
    // Positive height 2 follows the ordered base's normal, including reversed winding.
    definition.parameters={sides:face.boundary.length,height:2,base:{kind:'face',face_id:face.id,point_ids:[...face.boundary]},apex_offset:[0,0]}
    return createSolid3D(scene,definition)
  }catch{return null}
}
/** Consume only an unshared cycle produced by the planar polygon authoring command.
 * A trial transaction checks every reference category without cascading or detaching it.
 */
export function createPyramidFromPolygon3D(source:GeometryScene3D,faceId:string,id?:string){
  const created=createPyramidOnFace3D(source,faceId,id)
  if(!created)return null
  const original=evaluateGeometryScene3D(source)
  if(original.status!=='ok')return null
  const scene=original.scene,face=scene.faces.find(f=>f.id===faceId)!,points=new Set(face.boundary)
  const cycle=new Set(face.boundary.map((_,i)=>`${face.id}_e${i}`))
  const preserve=(reason:'ambiguous_ownership'|'external_dependencies')=>({...created,sourceConsumed:false as const,reason})
  if(!face.boundary.every((a,i)=>{
    const edge=scene.linear_objects.find(e=>e.id===`${face.id}_e${i}`),b=face.boundary[(i+1)%face.boundary.length]
    return edge?.kind==='segment'&&(edge.a===a&&edge.b===b||edge.a===b&&edge.b===a)
  }))return preserve('ambiguous_ownership')
  const removeSource=(draft:GeometryScene3D)=>{
    draft.faces=draft.faces.filter(f=>f.id!==faceId)
    draft.linear_objects=draft.linear_objects.filter(e=>!cycle.has(e.id))
    draft.points=draft.points.filter(p=>!points.has(p.id))
  }
  if(!transactGeometryScene3D(scene,removeSource))return preserve('external_dependencies')
  const next=transactGeometryScene3D(created.scene,draft=>{
    const solid=draft.solids.find(s=>s.id===created.id)!
    if(!solidSupported3D(solid)||solid.kind!=='pyramid'||!('height'in solid.parameters))throw Error('Unsupported pyramid')
    const vertices=face.boundary.map(id=>[...scene.points.find(p=>p.id===id)!.position] as Vec3)
    const apex=solidTopology3D(draft,solid).vertices.at(-1)!
    const definition={...solid,parameters:{sides:vertices.length,height:solid.parameters.height,base:{kind:'polygon' as const,vertices},apex_offset:[0,0] as [number,number]}} as GeometryParametricSolid3D
    solid.parameters=pyramidApexParameters3D(draft,definition,apex)
    face.boundary.forEach((id,i)=>{
      const owned=solid.features.find(f=>f.slot===`v_${i}`)!.entity_id
      draft.points.find(p=>p.id===owned)!.label=scene.points.find(p=>p.id===id)!.label
    })
    removeSource(draft)
  })
  return next?{scene:next,id:created.id,sourceConsumed:true as const,reason:null}:preserve('ambiguous_ownership')
}
export function editSolid3D(source:GeometryScene3D,definition:GeometryParametricSolid3D){
  const previous=source.solids.find(s=>s.id===definition.id)
  if(!previous||!solidSupported3D(previous)||definition.kind!==previous.kind||JSON.stringify(definition.features)!==JSON.stringify(previous.features))return null
  // M4 parameter edits preserve topology and source provenance. Retargeting is explicit future work.
  const old=previous.parameters,next=definition.parameters
  if('sides'in old&&(!('sides'in next)||old.sides!==next.sides))return null
  const provenance=(p:typeof old)=>'base'in p?p.base.kind==='face'?p.base.face_id:p.base.kind:'template'
  if(provenance(old)!==provenance(next))return null
  return transactGeometryScene3D(source,d=>{d.solids[d.solids.findIndex(s=>s.id===definition.id)]=structuredClone(definition)})
}
export function deleteSolid3D(source:GeometryScene3D,id:string){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene
  const solid=scene.solids.find(s=>s.id===id)
  if(!solid||!solidSupported3D(solid))return null
  const faces=new Set(solid.features.filter(f=>f.slot.startsWith('f_')).map(f=>f.entity_id))
  if(scene.solids.some(s=>s.mode==='parametric'&&'base'in s.parameters&&s.parameters.base.kind==='face'&&faces.has(s.parameters.base.face_id)))return null
  scene.solids=scene.solids.filter(s=>s.id!==id)
  // Vertices remain as free points at their last evaluated coordinates. Downstream references survive.
  return deleteGeometryTargets3D(scene,solid.features.filter(f=>!f.slot.startsWith('v_')).map(f=>f.entity_id))
}
/** Euler orientation is UI state only; the persisted orthonormal frame remains authoritative. */
export function solidFrame3D(origin:Vec3,angles:Vec3){
  const [a,b,c]=angles.map(v=>v*Math.PI/180),ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cc=Math.cos(c),sc=Math.sin(c)
  return {origin,x_axis:[cc*cb,sc*cb,-sb] as Vec3,y_axis:[cc*sb*sa-sc*ca,sc*sb*sa+cc*ca,cb*sa] as Vec3}
}
export function solidAngles3D(frame:GeometryParametricSolid3D['frame']):Vec3{
  const x=frame.x_axis,y=frame.y_axis,b=Math.asin(Math.max(-1,Math.min(1,-x[2]))),regular=Math.abs(Math.cos(b))>1e-8,a=regular?Math.atan2(y[2],x[0]*y[1]-x[1]*y[0]):0,c=regular?Math.atan2(x[1],x[0]):Math.atan2(-y[0],y[1])
  return [a,b,c].map(v=>v*180/Math.PI) as Vec3
}

/** A rigid world rotation changes only placement, never local parameters or feature IDs. */
export function rotateSolid3D(source:GeometryScene3D,id:string,axis:Vec3,angle:number){
  if(!Number.isFinite(angle)||axis.some(v=>!Number.isFinite(v))||Math.hypot(...axis)<1e-9)return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,solid=scene.solids.find(s=>s.id===id)
  if(!solid||!solidSupported3D(solid))return null
  if(Math.abs(angle)<1e-12)return source
  try{
    const topology=solidTopology3D(scene,solid),pivot=scale(topology.vertices.reduce((a,b)=>add(a,b),[0,0,0] as Vec3),1/topology.vertices.length)
    const n=unit(axis),c=Math.cos(angle),s=Math.sin(angle)
    const rotate=(v:Vec3)=>add(add(scale(v,c),scale(cross(n,v),s)),scale(n,dot(n,v)*(1-c)))
    // Face bases use sourceOrigin + frame.origin + R(local); source points stay authoritative.
    const sourceOrigin=topology.sourceIds.length?scene.points.find(p=>p.id===topology.sourceIds[0])!.position:[0,0,0] as Vec3
    const origin=sub(add(pivot,rotate(sub(add(sourceOrigin,solid.frame.origin),pivot))),sourceOrigin)
    const next=editSolid3D(scene,{...solid,frame:{origin,x_axis:rotate(solid.frame.x_axis),y_axis:rotate(solid.frame.y_axis)}})
    if(!next)return null
    // Reject a rotation that would indirectly deform another solid through shared references.
    for(const other of scene.solids.filter(s=>s.id!==id)){
      const ids=other.mode==='parametric'?other.features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id):other.point_ids
      if(ids.some(id=>Math.hypot(...sub(next.points.find(p=>p.id===id)!.position,scene.points.find(p=>p.id===id)!.position))>1e-9))return null
    }
    return next
  }catch{return null}
}

export function solidPivot3D(source:GeometryScene3D,id:string):Vec3|null{
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const solid=evaluated.scene.solids.find(s=>s.id===id)
  if(!solid||!solidSupported3D(solid))return null
  try{const vertices=solidTopology3D(evaluated.scene,solid).vertices;return scale(vertices.reduce((a,b)=>add(a,b),[0,0,0] as Vec3),1/vertices.length)}catch{return null}
}

/** Translation changes placement only. Shared sources and unrelated geometry remain fixed. */
export function translateSolid3D(source:GeometryScene3D,id:string,delta:Vec3){
  if(delta.length!==3||delta.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,solid=scene.solids.find(s=>s.id===id)
  if(!solid||!solidSupported3D(solid))return null
  if(Math.hypot(...delta)<=1e-9)return source
  const next=editSolid3D(scene,{...solid,frame:{...solid.frame,origin:add(solid.frame.origin,delta)}})
  if(!next)return null
  return isolatedSolidEdit3D(scene,next,id)?next:null
}

function isolatedSolidEdit3D(scene:GeometryScene3D,next:GeometryScene3D,id:string){
  const solid=scene.solids.find(s=>s.id===id)!
  if(!solidSupported3D(solid))return false
  const owned=new Set(solid.features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id))
  if(scene.points.some(p=>!owned.has(p.id)&&Math.hypot(...sub(next.points.find(v=>v.id===p.id)!.position,p.position))>1e-9))return null
  // A freeform solid or standalone object may directly share an owned vertex.
  if(scene.solids.some(s=>s.id!==id&&(s.mode==='freeform'?s.point_ids.some(id=>owned.has(id)):s.features.some(f=>owned.has(f.entity_id)))))return null
  const ownsFeature=new Set(solid.features.map(f=>f.entity_id))
  if(scene.linear_objects.some(l=>owned.has(l.a)||owned.has(l.b))||scene.planes.some(p=>p.point_ids.some(id=>owned.has(id)))||scene.edges.some(e=>!ownsFeature.has(e.id)&&(owned.has(e.start)||owned.has(e.end)))||scene.faces.some(f=>!ownsFeature.has(f.id)&&f.boundary.some(id=>owned.has(id))))return null
  return true
}

/** Native dimensions/local vertices scale; placement compensates around a fixed world pivot. */
export function scaleSolid3D(source:GeometryScene3D,id:string,factor:number){
  if(!Number.isFinite(factor)||factor<=1e-6||factor>1e6)return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,solid=scene.solids.find(s=>s.id===id),pivot=solidPivot3D(scene,id)
  if(!solid||!solidSupported3D(solid)||!pivot)return null
  const p=solid.parameters
  if('base'in p&&p.base.kind==='face')return null
  if(Math.abs(factor-1)<=1e-12)return source
  const owned=new Set(solid.features.map(f=>f.entity_id))
  if(scene.markings.some(m=>m.point_ids.some(id=>owned.has(id)))||scene.annotations.some(a=>Object.values(a.anchor).some(v=>typeof v==='string'&&owned.has(v))))return null
  const parameters=structuredClone(p)
  for(const key of ['side','width','depth','height','radius'] as const)if(key in parameters)(parameters as unknown as Record<string,unknown>)[key]=(parameters as unknown as Record<string,number>)[key]*factor
  if('base'in parameters){
    if(parameters.base.kind==='template')parameters.base.radius*=factor
    else if(parameters.base.kind==='polygon')parameters.base.vertices=parameters.base.vertices.map(v=>scale(v,factor))
  }
  if('apex_offset'in parameters)parameters.apex_offset=parameters.apex_offset.map(v=>v*factor) as [number,number]
  const frame={...solid.frame,origin:add(pivot,scale(sub(solid.frame.origin,pivot),factor))}
  const next=editSolid3D(scene,{...solid,parameters,frame} as GeometryParametricSolid3D)
  return next&&isolatedSolidEdit3D(scene,next,id)?next:null
}

/** Tight oriented bounds in the persisted orthonormal frame; never document geometry. */
export function solidBounds3D(source:GeometryScene3D,id:string){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const solid=evaluated.scene.solids.find(s=>s.id===id)
  if(!solid||!solidSupported3D(solid))return null
  try{
    const vertices=solidTopology3D(evaluated.scene,solid).vertices,axes=[solid.frame.x_axis,solid.frame.y_axis,cross(solid.frame.x_axis,solid.frame.y_axis)]
    const local=vertices.map(v=>axes.map(a=>dot(sub(v,solid.frame.origin),a))),min=axes.map((_,i)=>Math.min(...local.map(v=>v[i]))),max=axes.map((_,i)=>Math.max(...local.map(v=>v[i])))
    const corners=Array.from({length:8},(_,i)=>axes.reduce((v,a,j)=>add(v,scale(a,(i&(1<<j))?max[j]:min[j])),[...solid.frame.origin] as Vec3))
    const edges:[number,number][]=[];for(let i=0;i<8;i++)for(let j=0;j<3;j++)if(!(i&(1<<j)))edges.push([i,i|(1<<j)])
    return {corners,edges,pivot:scale(vertices.reduce((a,b)=>add(a,b),[0,0,0] as Vec3),1/vertices.length)}
  }catch{return null}
}
