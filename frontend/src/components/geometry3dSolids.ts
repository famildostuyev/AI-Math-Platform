import type { GeometryParametricSolid3D, GeometryScene3D, Vec3 } from './geometry3dContract'

export type SolidKind3D = 'cube'|'cuboid'|'prism'|'pyramid'
export const SOLID_TOOLS_3D: {kind:SolidKind3D;label:string}[]=[{kind:'cube',label:'Kub'},{kind:'cuboid',label:'Düzbucaqlı paralelepiped'},{kind:'prism',label:'Prizma'},{kind:'pyramid',label:'Piramida'}]
export const solidSupported3D=(s:GeometryScene3D['solids'][number]):s is GeometryParametricSolid3D=>s.mode==='parametric'&&['cube','cuboid','prism','pyramid'].includes(s.kind)
export function hasSolidTopology3D(s:GeometryScene3D['solids'][number]){
  if(!solidSupported3D(s))return false
  const n='sides'in s.parameters?s.parameters.sides:4
  const count=s.kind==='cube'||s.kind==='cuboid'?26:s.kind==='prism'?6*n+2:4*n+2
  return s.features.length===count
}
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v-b[i]) as Vec3
const mul=(a:Vec3,t:number):Vec3=>a.map(v=>v*t) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((v,x,i)=>v+x*b[i],0)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const unit=(a:Vec3):Vec3=>{const n=Math.hypot(...a);if(n<=1e-9)throw Error('Degenerate basis');return mul(a,1/n)}
const valid=(v:Vec3)=>v.every(x=>Number.isFinite(x)&&Math.abs(x)<=1e12)
/** Validate authoritative polygon parameters, independently of evaluated point caches. */
export function polygonBaseGeometry3D(base:Vec3[]){
  if(base.length<3||base.length>128||base.some(b=>b.length!==3||!valid(b)))throw Error('Invalid polygon coordinates')
  for(let i=0;i<base.length;i++)for(let j=i+1;j<base.length;j++)if(Math.hypot(...sub(base[i],base[j]))<=1e-9)throw Error('Duplicate polygon vertex')
  const u=unit(sub(base[1],base[0])),normal=unit(cross(u,sub(base[2],base[0]))),v=cross(normal,u)
  if(base.some(b=>Math.abs(dot(sub(b,base[0]),normal))>1e-9*Math.max(1,Math.hypot(...sub(b,base[0])))))throw Error('Nonplanar polygon')
  const coords=base.map(b=>[dot(sub(b,base[0]),u),dot(sub(b,base[0]),v)])
  const turn=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
  const n=coords.length,area=coords.reduce((s,a,i)=>{const b=coords[(i+1)%n];return s+a[0]*b[1]-b[0]*a[1]},0)
  if(Math.abs(area)<=1e-12)throw Error('Zero polygon area')
  for(let i=0;i<n;i++){
    const a=coords[i],b=coords[(i+1)%n],next=coords[(i+2)%n]
    if(Math.abs(turn(a,b,next))<=1e-9&&(b[0]-a[0])*(next[0]-b[0])+(b[1]-a[1])*(next[1]-b[1])<=0)throw Error('Overlapping adjacent edges')
    for(let j=i+1;j<n;j++){
      if(j===i+1||i===0&&j===n-1)continue
      const c=coords[j],d=coords[(j+1)%n]
      if(Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))>Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))+1e-9||Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))>Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))+1e-9)continue
      if(turn(a,b,c)*turn(a,b,d)<=1e-18&&turn(c,d,a)*turn(c,d,b)<=1e-18)throw Error('Self-intersecting polygon')
    }
  }
  return {u,v,normal,area,center:mul(base.reduce(add,[0,0,0] as Vec3),1/n)}
}
/** Pure deterministic topology. IDs come exclusively from the persisted feature map. */
export function solidTopology3D(scene:GeometryScene3D,solid:GeometryParametricSolid3D){
  if(!solidSupported3D(solid))throw Error('Unsupported solid')
  const p=solid.parameters,frame=solid.frame
  const z=cross(frame.x_axis,frame.y_axis)
  if(Math.abs(dot(frame.x_axis,frame.x_axis)-1)>1e-9||Math.abs(dot(frame.y_axis,frame.y_axis)-1)>1e-9||Math.abs(dot(frame.x_axis,frame.y_axis))>1e-9)throw Error('Invalid frame')
  let base:Vec3[],height:number,sourceOrigin:Vec3=[0,0,0],sourceIds:string[]=[]
  if(solid.kind==='cube'||solid.kind==='cuboid'){
    const width='side'in p?p.side:'width'in p?p.width:NaN,depth='side'in p?p.side:'depth'in p?p.depth:NaN
    height='side'in p?p.side:'height'in p?p.height:NaN
    base=[[0,0,0],[width,0,0],[width,depth,0],[0,depth,0]]
    if(!(width>0&&depth>0))throw Error('Invalid dimensions')
  }else if((solid.kind==='prism'||solid.kind==='pyramid')&&'sides'in p&&'height'in p){
    height=p.height
    if(!Number.isInteger(p.sides)||p.sides<3||p.sides>128)throw Error('Invalid sides')
    if('base'in p&&p.base.kind==='polygon'){
      if(solid.kind!=='pyramid'||p.base.vertices.length!==p.sides)throw Error('Invalid polygon base')
      base=p.base.vertices.map(b=>[...b] as Vec3);polygonBaseGeometry3D(base)
    }else if('base'in p&&p.base.kind==='face'){
      const baseId=p.base.face_id,face=scene.faces.find(f=>f.id===baseId)
      if(!face||face.boundary.length!==p.sides||JSON.stringify(face.boundary)!==JSON.stringify(p.base.point_ids))throw Error('Source topology changed')
      sourceIds=[...face.boundary]
      const positions=sourceIds.map(id=>{const point=scene.points.find(v=>v.id===id);if(!point)throw Error('Missing source');return point.position})
      sourceOrigin=positions[0];base=positions.map(v=>sub(v,sourceOrigin))
    }else{
      const radius='radius'in p?p.radius:'base'in p&&p.base.kind==='template'?p.base.radius:NaN
      if(!(radius>0))throw Error('Invalid radius')
      base=Array.from({length:p.sides},(_,i)=>[radius*Math.cos(2*Math.PI*i/p.sides),radius*Math.sin(2*Math.PI*i/p.sides),0] as Vec3)
    }
  }else throw Error('Unsupported definition')
  if(!Number.isFinite(height)||(solid.kind==='pyramid'&&'base'in p?Math.abs(height):height)<=1e-9)throw Error('Invalid height')
  const u=unit(sub(base[1],base[0])),normal=unit(cross(u,sub(base[2],base[0]))),v=cross(normal,u)
  const coords=base.map(b=>[dot(sub(b,base[0]),u),dot(sub(b,base[0]),v)])
  if(base.some(b=>Math.abs(dot(sub(b,base[0]),normal))>1e-9*Math.max(1,Math.hypot(...sub(b,base[0])))))throw Error('Nonplanar base')
  const area=coords.reduce((s,a,i)=>{const b=coords[(i+1)%coords.length];return s+a[0]*b[1]-b[0]*a[1]},0),sign=Math.sign(area)
  if(Math.abs(area)<=1e-12)throw Error('Zero area')
  const n=base.length,edges:[number,number][]=[],faces:number[][]=[]
  const bottom=Array.from({length:n},(_,i)=>i);faces.push([...bottom].reverse())
  let vertices:Vec3[]=[...base]
  if(solid.kind==='pyramid'){
    const offset='apex_offset'in p?p.apex_offset:[0,0]
    const center=mul(base.reduce(add,[0,0,0] as Vec3),1/n),apex=add(center,add(mul(u,offset[0]),add(mul(v,offset[1]),mul(normal,height))))
    // Concave pyramids require a visible apex projection (polygon kernel).
    const turn=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    const concave=coords.some((a,i)=>sign*turn(a,coords[(i+1)%n],coords[(i+2)%n])<-1e-9)
    const ap=[dot(sub(apex,base[0]),u),dot(sub(apex,base[0]),v)]
    if(concave&&coords.some((a,i)=>sign*turn(a,coords[(i+1)%n],ap)<-1e-9))throw Error('Apex outside concave kernel')
    vertices.push(apex)
    if('base'in p&&p.base.kind==='polygon')for(let i=0;i<n;i++)if(Math.hypot(...cross(sub(base[(i+1)%n],base[i]),sub(apex,base[i])))<=1e-9)throw Error('Degenerate side face')
    for(let i=0;i<n;i++){const j=(i+1)%n;edges.push([i,j]);faces.push([i,j,n])}
    for(let i=0;i<n;i++)edges.push([i,n])
  }else{
    const direction='direction'in p?p.direction:[0,0,1] as Vec3
    if(Math.abs(dot(direction,direction)-1)>1e-9||Math.abs(direction[2])<=1e-9)throw Error('Invalid extrusion direction')
    const displacement=mul(add(mul(u,direction[0]),add(mul(v,direction[1]),mul(normal,direction[2]))),height/Math.abs(direction[2]))
    vertices.push(...base.map(b=>add(b,displacement)))
    faces.push(bottom.map(i=>i+n))
    for(let i=0;i<n;i++){const j=(i+1)%n;edges.push([i,j]);faces.push([i,j,j+n,i+n])}
    for(let i=0;i<n;i++)edges.push([i+n,(i+1)%n+n])
    for(let i=0;i<n;i++)edges.push([i,i+n])
  }
  const world=vertices.map(b=>add(sourceOrigin,add(frame.origin,add(mul(frame.x_axis,b[0]),add(mul(frame.y_axis,b[1]),mul(z,b[2]))))))
  // Direct face-based pyramids have an identity placement. Copy their authoritative
  // source coordinates exactly instead of subtracting/adding an origin again.
  // Explicit legacy placement transforms retain their existing semantics.
  if(solid.kind==='pyramid'&&sourceIds.length&&frame.origin.every(v=>v===0)&&frame.x_axis.every((v,i)=>v===[1,0,0][i])&&frame.y_axis.every((v,i)=>v===[0,1,0][i])){
    sourceIds.forEach((id,i)=>{world[i]=[...scene.points.find(p=>p.id===id)!.position]})
  }
  if(world.some(b=>!valid(b)))throw Error('World coordinate overflow')
  return {vertices:world,edges,faces,sourceIds,basis:{u,v,normal}}
}
export function pyramidApexParameters3D(scene:GeometryScene3D,solid:GeometryParametricSolid3D,position:Vec3){
  if(solid.kind!=='pyramid'||!('height'in solid.parameters)||!('apex_offset'in solid.parameters)||!valid(position))throw Error('Unsupported apex edit')
  const topology=solidTopology3D(scene,solid),delta=sub(position,topology.vertices.at(-1)!),frame=solid.frame
  const local:[number,number,number]=[dot(delta,frame.x_axis),dot(delta,frame.y_axis),dot(delta,cross(frame.x_axis,frame.y_axis))]
  const p=solid.parameters
  return {...p,height:p.height+dot(local,topology.basis.normal),apex_offset:[p.apex_offset[0]+dot(local,topology.basis.u),p.apex_offset[1]+dot(local,topology.basis.v)] as [number,number]}
}
export function solidFeatureIds3D(solid:GeometryParametricSolid3D,topology:ReturnType<typeof solidTopology3D>){
  const slot=new Map(solid.features.map(f=>[f.slot,f.entity_id]))
  const ids=(prefix:string,n:number)=>Array.from({length:n},(_,i)=>{const id=slot.get(`${prefix}_${i}`);if(!id)throw Error('Incomplete feature map');return id})
  if(solid.features.length!==topology.vertices.length+topology.edges.length+topology.faces.length)throw Error('Incomplete topology')
  return {points:ids('v',topology.vertices.length),edges:ids('e',topology.edges.length),faces:ids('f',topology.faces.length)}
}
export function evaluateSolid3D(scene:GeometryScene3D,solid:GeometryParametricSolid3D){
  const topology=solidTopology3D(scene,solid),ids=solidFeatureIds3D(solid,topology)
  ids.points.forEach((id,i)=>{const point=scene.points.find(p=>p.id===id);if(!point)throw Error('Missing vertex');point.position=topology.vertices[i]})
  ids.edges.forEach((id,i)=>{const e=scene.edges.find(e=>e.id===id),[a,b]=topology.edges[i];if(!e||e.start!==ids.points[a]||e.end!==ids.points[b])throw Error('Changed edge identity')})
  ids.faces.forEach((id,i)=>{const f=scene.faces.find(f=>f.id===id);if(!f||JSON.stringify(f.boundary)!==JSON.stringify(topology.faces[i].map(j=>ids.points[j])))throw Error('Changed face identity')})
}
