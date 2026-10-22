import { transportFaceAttachments3D } from './geometry3dFaces'
import type { GeometryParametricSolid3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { evaluateGeometryScene3D, transactGeometryScene3D, deleteGeometryTargets3D, prepareCylinderCenters3D, emptyGeometryScene3D } from './geometry3dModel'
import { solidTopology3D, evaluateSolid3D, solidSupported3D, solidTransformSupported3D, pyramidApexParameters3D, polygonBaseGeometry3D, type SolidKind3D } from './geometry3dSolids'
import { add, sub, dot, cross, scale, unit } from './geometry3dProjection'
import { analyticBounds3D, analyticFeaturePositions3D, analyticFrame3D, evaluateAnalyticSurface3D, isClosedAnalyticSolid3D } from './geometry3dAnalytic'
import type { GeometryAttachmentLoss3D } from './geometry3dContract'

/** Cylinder creation is independent of the polyhedral editing/transform gate. */
export const defaultCylinder3D=(id=`solid_${crypto.randomUUID().replace(/-/g,'')}`):Extract<GeometryParametricSolid3D,{kind:'cylinder'}>=>({id,kind:'cylinder',mode:'parametric',frame:{origin:[0,0,0],x_axis:[1,0,0],y_axis:[0,1,0]},parameters:{radius:1,height:2},features:[]})
export function createCylinderAt3D(source:GeometryScene3D,origin:Vec3,plane:'XY'|'XZ'|'YZ',id?:string){
  if(!['XY','XZ','YZ'].includes(plane))return null
  const solid=defaultCylinder3D(id)
  solid.frame={origin:[...origin],x_axis:plane==='YZ'?[0,1,0]:[1,0,0],y_axis:plane==='XY'?[0,1,0]:plane==='XZ'?[0,0,-1]:[0,0,1]}
  return createSolid3D(source,solid)
}
export const defaultCone3D=(id=`solid_${crypto.randomUUID().replace(/-/g,'')}`):Extract<GeometryParametricSolid3D,{kind:'cone'}>=>({...defaultCylinder3D(id),kind:'cone'})
export const defaultSphere3D=(id=`solid_${crypto.randomUUID().replace(/-/g,'')}`):Extract<GeometryParametricSolid3D,{kind:'sphere'}>=>({id,kind:'sphere',mode:'parametric',frame:{origin:[0,0,0],x_axis:[1,0,0],y_axis:[0,1,0]},parameters:{radius:1,equator:'visible'},features:[]})
export function setSphereEquator3D(source:GeometryScene3D,id:string,visible:boolean){
  if(typeof visible!=='boolean')return null
  const sphere=source.solids.find(s=>s.id===id)
  if(!sphere||sphere.mode!=='parametric'||sphere.kind!=='sphere')return null
  if((sphere.parameters.equator==='visible')===visible)return source
  return editSolid3D(source,{...sphere,parameters:{...sphere.parameters,equator:visible?'visible':'hidden'}})
}
export function createSphereAt3D(source:GeometryScene3D,origin:Vec3,plane:'XY'|'XZ'|'YZ',id?:string){
  if(!['XY','XZ','YZ'].includes(plane))return null
  const solid=defaultSphere3D(id)
  solid.frame={origin:[...origin],x_axis:plane==='YZ'?[0,1,0]:[1,0,0],y_axis:plane==='XY'?[0,1,0]:plane==='XZ'?[0,0,-1]:[0,0,1]}
  return createSolid3D(source,solid)
}
export function createConeAt3D(source:GeometryScene3D,origin:Vec3,plane:'XY'|'XZ'|'YZ',id?:string){
  if(!['XY','XZ','YZ'].includes(plane))return null
  const solid=defaultCone3D(id)
  solid.frame={origin:[...origin],x_axis:plane==='YZ'?[0,1,0]:[1,0,0],y_axis:plane==='XY'?[0,1,0]:plane==='XZ'?[0,0,-1]:[0,0,1]}
  const result=createSolid3D(source,solid)
  if(!result)return null
  const standard=emptyGeometryScene3D().print_camera
  const pristine=!Object.values(source).some(v=>Array.isArray(v)&&v.length)&&Object.entries(standard).every(([key,value])=>key==='projection'||JSON.stringify(source.print_camera[key as keyof typeof standard])===JSON.stringify(value))
  if(pristine){
    const frame=analyticFrame3D(solid.frame),h=solid.parameters.height,r=solid.parameters.radius,d=2.5*Math.max(r,h)
    // Perspective eye at apex height makes the antipodal A/B generators tangent.
    result.scene.print_camera={...source.print_camera,projection:'perspective',position:frame.toWorld([.8*d,.6*d,h]),target:frame.toWorld([0,0,h/2]),up:frame.z,vertical_span:Math.max(4*r,1.6*h)}
  }
  const evaluated=evaluateGeometryScene3D(result.scene)
  return evaluated.status==='ok'?{scene:evaluated.scene,id:result.id}:null
}

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
    return transactSolidFaces3D(source,d=>{d.solids[d.solids.findIndex(s=>s.id===solid.id)]={...solid,parameters} as GeometryParametricSolid3D})
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
  if(isClosedAnalyticSolid3D(definition)){
    const scene=transactGeometryScene3D(source,d=>{
      const solid=structuredClone(definition)
      // A stable lateral carrier is sufficient. Circular caps are not polygon faces.
      if(!solid.features.length)solid.features=[{slot:'surface',entity_id:`${solid.id}_surface`}]
      if(solid.kind==='cone'){
        const used=new Set(Object.values(d).flatMap(v=>Array.isArray(v)?v.flatMap(e=>e&&typeof e==='object'&&'id'in e?[e.id as string]:[]):[]).concat(solid.features.map(f=>f.entity_id)))
        for(const slot of ['v_2','v_3'])if(!solid.features.some(f=>f.slot===slot)){
          const stem=`${solid.id.slice(0,54)}_${slot}`;let id=stem,n=2
          while(used.has(id))id=`${stem}_${n++}`
          used.add(id);solid.features.push({slot,entity_id:id})
        }
      }
      const positions=analyticFeaturePositions3D(solid)
      d.points.push(...Object.entries(positions).map(([id,position])=>({id,position,label:solid.kind==='cone'?({v_0:'O',v_1:'S',v_2:'A',v_3:'B'}[solid.features.find(f=>f.entity_id===id)!.slot as 'v_0'|'v_1'|'v_2'|'v_3']??null):null})))
      for(const feature of solid.features)if(feature.slot==='surface')d.surfaces.push({id:feature.entity_id,kind:solid.kind,solid_id:solid.id,slot:'surface'})
      d.solids.push(solid)
    })
    const prepared=scene?prepareCylinderCenters3D(scene):null
    if(!prepared)return null
    if(definition.kind==='cone'){
      const cone=prepared.solids.find(s=>s.id===definition.id)!
      if(cone.mode!=='parametric')return null
      const a=cone.features.find(f=>f.slot==='v_1')!.entity_id,b=cone.features.find(f=>f.slot==='v_0')!.entity_id
      // A display segment, not owned topology: its deletion must survive reload.
      const used=new Set(Object.values(prepared).flatMap(v=>Array.isArray(v)?v.flatMap(e=>e&&typeof e==='object'&&'id'in e?[e.id as string]:[]):[]))
      const stem=`${cone.id.slice(0,54)}_height`;let id=stem,n=2
      while(used.has(id))id=`${stem}_${n++}`
      prepared.linear_objects.push({id,kind:'segment',a,b})
      used.add(id)
      const diameterStem=`${cone.id.slice(0,50)}_diameter`;let diameterId=diameterStem,j=2
      while(used.has(diameterId))diameterId=`${diameterStem}_${j++}`
      prepared.linear_objects.push({id:diameterId,kind:'segment',a:cone.features.find(f=>f.slot==='v_2')!.entity_id,b:cone.features.find(f=>f.slot==='v_3')!.entity_id})
      used.add(diameterId)
      for(const [suffix,slot] of [['generator_sa','v_2'],['generator_sb','v_3']]){
        const stem=`${cone.id.slice(0,46)}_${suffix}`;let id=stem,n=2
        while(used.has(id))id=`${stem}_${n++}`
        used.add(id)
        prepared.linear_objects.push({id,kind:'segment',a,b:cone.features.find(f=>f.slot===slot)!.entity_id})
      }
    }
    const final=evaluateGeometryScene3D(prepared)
    return final.status==='ok'?{scene:final.scene,id:definition.id}:null
  }
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
/** Stage authoritative feature geometry and metric UV together; never relax normalization. */
function transactSolidFaces3D(source:GeometryScene3D,mutate:(draft:GeometryScene3D)=>void){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const before=evaluated.scene
  let transportedOwners:string[]=[]
  const next=transactGeometryScene3D(before,draft=>{
    mutate(draft)
    const changed=draft.solids.filter(s=>solidSupported3D(s)&&JSON.stringify(s)!==JSON.stringify(before.solids.find(old=>old.id===s.id)))
    if(!before.constructions.some(c=>c.kind==='point_on_face'&&changed.some(s=>s.mode==='parametric'&&s.features.some(f=>f.entity_id===c.face_id))))return
    transportedOwners=changed.map(s=>s.id)
    for(const solid of changed)if(solidSupported3D(solid))evaluateSolid3D(draft,solid)
    transportFaceAttachments3D(before,draft,new Set(changed.flatMap(s=>s.mode==='parametric'?s.features.filter(f=>f.slot.startsWith('f_')).map(f=>f.entity_id):[])))
  })
  if(next&&transportedOwners.length)for(const other of before.solids.filter(s=>!transportedOwners.includes(s.id))){
    const ids=other.mode==='parametric'?other.features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id):other.point_ids
    if(ids.some(id=>Math.hypot(...sub(next.points.find(p=>p.id===id)!.position,before.points.find(p=>p.id===id)!.position))>1e-9))return null
  }
  return next
}
export function editSolid3D(source:GeometryScene3D,definition:GeometryParametricSolid3D){
  const previous=source.solids.find(s=>s.id===definition.id)
  if(!previous||!solidTransformSupported3D(previous)||definition.kind!==previous.kind||JSON.stringify(definition.features)!==JSON.stringify(previous.features))return null
  // M4 parameter edits preserve topology and source provenance. Retargeting is explicit future work.
  const old=previous.parameters,next=definition.parameters
  if('sides'in old&&(!('sides'in next)||old.sides!==next.sides))return null
  const provenance=(p:typeof old)=>'base'in p?p.base.kind==='face'?p.base.face_id:p.base.kind:'template'
  if(provenance(old)!==provenance(next))return null
  return transactSolidFaces3D(source,d=>{d.solids[d.solids.findIndex(s=>s.id===definition.id)]=structuredClone(definition)})
}
export function deleteSolid3D(source:GeometryScene3D,id:string){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene
  const solid=scene.solids.find(s=>s.id===id)
  if(solid&&isClosedAnalyticSolid3D(solid)){
    const surfaces=new Set(solid.features.filter(f=>f.slot==='surface').map(f=>f.entity_id)),losses:GeometryAttachmentLoss3D[]=[]
    // Evaluate first, then detach recipes while retaining their semantic outputs.
    scene.constructions=scene.constructions.filter(c=>{
      if(c.kind!=='point_on_surface'||!surfaces.has(c.surface_id))return true
      const position=scene.points.find(p=>p.id===c.output_point_id)!.position
      losses.push({subject_id:c.output_point_id,parent_id:c.surface_id,reason:'parent_deleted',preserved_world_position:[...position]})
      return false
    })
    for(const annotation of scene.annotations)if(annotation.anchor.kind==='surface'&&surfaces.has(annotation.anchor.surface_id)){
      const parent=annotation.anchor.surface_id,position=evaluateAnalyticSurface3D(solid,annotation.anchor.uv)
      annotation.anchor={kind:'world',position}
      losses.push({subject_id:annotation.id,parent_id:parent,reason:'parent_deleted',preserved_world_position:position})
    }
    scene.surfaces=scene.surfaces.filter(s=>!surfaces.has(s.id));scene.solids=scene.solids.filter(s=>s.id!==id)
    // Optional materialized centers follow the established policy: preserve
    // them as free points so downstream references and labels remain valid.
    const next=evaluateGeometryScene3D(scene)
    return next.status==='ok'?{scene:next.scene,losses}:null
  }
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
  if(!solid||!solidTransformSupported3D(solid))return null
  if(Math.abs(angle)<1e-12)return source
  try{
    const topology=isClosedAnalyticSolid3D(solid)?null:solidTopology3D(scene,solid),pivot=isClosedAnalyticSolid3D(solid)?analyticBounds3D(solid).pivot:scale(topology!.vertices.reduce((a,b)=>add(a,b),[0,0,0] as Vec3),1/topology!.vertices.length)
    const n=unit(axis),c=Math.cos(angle),s=Math.sin(angle)
    const rotate=(v:Vec3)=>add(add(scale(v,c),scale(cross(n,v),s)),scale(n,dot(n,v)*(1-c)))
    // Face bases use sourceOrigin + frame.origin + R(local); source points stay authoritative.
    const sourceOrigin=topology?.sourceIds.length?scene.points.find(p=>p.id===topology.sourceIds[0])!.position:[0,0,0] as Vec3
    const origin=sub(add(pivot,rotate(sub(add(sourceOrigin,solid.frame.origin),pivot))),sourceOrigin)
    const next=editSolid3D(scene,{...solid,frame:{origin,x_axis:rotate(solid.frame.x_axis),y_axis:rotate(solid.frame.y_axis)}})
    if(!next)return null
    // Reject a rotation that would indirectly deform another solid through shared references.
    for(const other of scene.solids.filter(s=>s.id!==id)){
      const ids=other.mode==='parametric'?other.features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id):other.point_ids
      if(ids.some(id=>Math.hypot(...sub(next.points.find(p=>p.id===id)!.position,scene.points.find(p=>p.id===id)!.position))>1e-9))return null
    }
    return isClosedAnalyticSolid3D(solid)&&!isolatedSolidEdit3D(scene,next,id)?null:next
  }catch{return null}
}

export function solidPivot3D(source:GeometryScene3D,id:string):Vec3|null{
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const solid=evaluated.scene.solids.find(s=>s.id===id)
  if(!solid||!solidTransformSupported3D(solid))return null
  try{if(isClosedAnalyticSolid3D(solid))return analyticBounds3D(solid).pivot;const vertices=solidTopology3D(evaluated.scene,solid).vertices;return scale(vertices.reduce((a,b)=>add(a,b),[0,0,0] as Vec3),1/vertices.length)}catch{return null}
}

/** Translation changes placement only. Shared sources and unrelated geometry remain fixed. */
export function translateSolid3D(source:GeometryScene3D,id:string,delta:Vec3){
  if(delta.length!==3||delta.some(v=>!Number.isFinite(v)||Math.abs(v)>1e12))return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,solid=scene.solids.find(s=>s.id===id)
  if(!solid||!solidTransformSupported3D(solid))return null
  if(Math.hypot(...delta)<=1e-9)return source
  const next=editSolid3D(scene,{...solid,frame:{...solid.frame,origin:add(solid.frame.origin,delta)}})
  if(!next)return null
  return isolatedSolidEdit3D(scene,next,id)?next:null
}

function isolatedSolidEdit3D(scene:GeometryScene3D,next:GeometryScene3D,id:string){
  const solid=scene.solids.find(s=>s.id===id)!
  if(!solidTransformSupported3D(solid))return false
  const owned=new Set(solid.features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id))
  // Only construction descendants may follow the selected solid.
  const allowed=new Set(owned)
  for(const c of scene.constructions)if(c.kind==='point_on_surface'&&scene.surfaces.some(s=>s.id===c.surface_id&&s.solid_id===id))allowed.add(c.output_point_id)
  let changed=true
  while(changed){
    changed=false
    for(const c of scene.constructions){
      const refs=c.kind==='midpoint'?[c.a,c.b]:c.kind==='point_on_edge'?scene.edges.filter(e=>e.id===c.edge_id).flatMap(e=>[e.start,e.end]):c.kind==='point_on_linear'?scene.linear_objects.filter(l=>l.id===c.linear_id).flatMap(l=>[l.a,l.b]):c.kind==='point_on_face'?scene.faces.find(f=>f.id===c.face_id)?.boundary??[]:[]
      if(refs.some(id=>allowed.has(id))&&!allowed.has(c.output_point_id)){allowed.add(c.output_point_id);changed=true}
    }
  }
  if(scene.solids.some(s=>s.id!==id&&(s.mode==='freeform'?s.point_ids:s.features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id)).some(id=>{const a=scene.points.find(p=>p.id===id),b=next.points.find(p=>p.id===id);return a&&b&&Math.hypot(...sub(a.position,b.position))>1e-9})))return null
  if(scene.points.some(p=>!allowed.has(p.id)&&Math.hypot(...sub(next.points.find(v=>v.id===p.id)!.position,p.position))>1e-9))return null
  // A freeform solid or standalone object may directly share an owned vertex.
  if(scene.solids.some(s=>s.id!==id&&(s.mode==='freeform'?s.point_ids.some(id=>owned.has(id)):s.features.some(f=>owned.has(f.entity_id)))))return null
  const ownsFeature=new Set(solid.features.map(f=>f.entity_id))
  const coneAxis=(l:GeometryScene3D['linear_objects'][number])=>solid.kind==='cone'&&l.kind==='segment'&&l.a!==l.b&&[['v_0','v_1'],['v_2','v_3'],['v_1','v_2'],['v_1','v_3']].some(pair=>pair.every(slot=>solid.features.some(f=>f.slot===slot&&(f.entity_id===l.a||f.entity_id===l.b))))
  if(scene.linear_objects.some(l=>(owned.has(l.a)||owned.has(l.b))&&!coneAxis(l))||scene.planes.some(p=>p.point_ids.some(id=>owned.has(id)))||scene.edges.some(e=>!ownsFeature.has(e.id)&&(owned.has(e.start)||owned.has(e.end)))||scene.faces.some(f=>!ownsFeature.has(f.id)&&f.boundary.some(id=>owned.has(id))))return null
  return true
}

/** Native dimensions/local vertices scale; placement compensates around a fixed world pivot. */
export function scaleSolid3D(source:GeometryScene3D,id:string,factor:number){
  if(!Number.isFinite(factor)||factor<=1e-6||factor>1e6)return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,solid=scene.solids.find(s=>s.id===id),pivot=solidPivot3D(scene,id)
  if(!solid||!solidTransformSupported3D(solid)||!pivot)return null
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

/** Native sphere radius editing preserves its world-space center and frame. */
export function resizeSphereRadius3D(source:GeometryScene3D,id:string,value:number){
  if(!Number.isFinite(value)||value<=0||value>1e12)return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const solid=evaluated.scene.solids.find(s=>s.id===id)
  if(!solid||solid.mode!=='parametric'||solid.kind!=='sphere')return null
  if(value===solid.parameters.radius)return source
  // The center and frame never change; existing references to O stay valid.
  return editSolid3D(evaluated.scene,{...solid,parameters:{...solid.parameters,radius:value}})
}

/** Independent native cylinder dimensions, centered on the original analytic pivot. */
export function resizeCylinder3D(source:GeometryScene3D,id:string,dimension:'radius'|'height',value:number){
  if(!['radius','height'].includes(dimension)||!Number.isFinite(value)||value<=0||value>1e12)return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const scene=evaluated.scene,solid=scene.solids.find(s=>s.id===id)
  if(!solid||solid.mode!=='parametric'||solid.kind!=='cylinder')return null
  if(value===solid.parameters[dimension])return source
  try{
    const pivot=analyticBounds3D(solid).pivot,axis=unit(cross(solid.frame.x_axis,solid.frame.y_axis))
    const parameters={...solid.parameters,[dimension]:value}
    const origin=dimension==='radius'?solid.frame.origin:sub(pivot,scale(axis,parameters.height/2))
    const next=editSolid3D(scene,{...solid,parameters,frame:{...solid.frame,origin}})
    return next&&isolatedSolidEdit3D(scene,next,id)?next:null
  }catch{return null}
}

/** Independent cone dimensions; height moves the base while keeping the apex fixed. */
export function resizeCone3D(source:GeometryScene3D,id:string,dimension:'radius'|'height',value:number){
  if(!['radius','height'].includes(dimension)||!Number.isFinite(value)||value<=0||value>1e12)return null
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const solid=evaluated.scene.solids.find(s=>s.id===id)
  if(!solid||solid.mode!=='parametric'||solid.kind!=='cone')return null
  if(value===solid.parameters[dimension])return source
  // Keep the apex fixed: the textbook eye remains at apex height without a reset.
  const axis=unit(cross(solid.frame.x_axis,solid.frame.y_axis))
  const origin=dimension==='height'?add(solid.frame.origin,scale(axis,solid.parameters.height-value)):solid.frame.origin
  const next=editSolid3D(evaluated.scene,{...solid,parameters:{...solid.parameters,[dimension]:value},frame:{...solid.frame,origin}})
  return next&&isolatedSolidEdit3D(evaluated.scene,next,id)?next:null
}

/** Tight oriented bounds in the persisted orthonormal frame; never document geometry. */
export function solidBounds3D(source:GeometryScene3D,id:string){
  const evaluated=evaluateGeometryScene3D(source)
  if(evaluated.status!=='ok')return null
  const solid=evaluated.scene.solids.find(s=>s.id===id)
  if(!solid||!solidTransformSupported3D(solid))return null
  try{
    if(isClosedAnalyticSolid3D(solid)){const b=analyticBounds3D(solid),edges:[number,number][]=[];for(let i=0;i<8;i++)for(let j=0;j<3;j++)if(!(i&(1<<j)))edges.push([i,i|(1<<j)]);return {corners:b.corners,edges,pivot:b.pivot}}
    const vertices=solidTopology3D(evaluated.scene,solid).vertices,axes=[solid.frame.x_axis,solid.frame.y_axis,cross(solid.frame.x_axis,solid.frame.y_axis)]
    const local=vertices.map(v=>axes.map(a=>dot(sub(v,solid.frame.origin),a))),min=axes.map((_,i)=>Math.min(...local.map(v=>v[i]))),max=axes.map((_,i)=>Math.max(...local.map(v=>v[i])))
    const corners=Array.from({length:8},(_,i)=>axes.reduce((v,a,j)=>add(v,scale(a,(i&(1<<j))?max[j]:min[j])),[...solid.frame.origin] as Vec3))
    const edges:[number,number][]=[];for(let i=0;i<8;i++)for(let j=0;j<3;j++)if(!(i&(1<<j)))edges.push([i,i|(1<<j)])
    return {corners,edges,pivot:scale(vertices.reduce((a,b)=>add(a,b),[0,0,0] as Vec3),1/vertices.length)}
  }catch{return null}
}
