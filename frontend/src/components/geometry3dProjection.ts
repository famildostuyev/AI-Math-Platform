import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { normalizeGeometryEditingCamera3D } from './geometry3d'
import { evaluateGeometryRenderScene3D, prepareCylinderCenters3D } from './geometry3dModel'
import { analyticRenderGeometry3D, type RenderAnalyticSolid3D } from './geometry3dRenderGeometry'
import { analyticLineIntervals3D, faceOcclusionMasks3D, pointHiddenByAnalytic3D, pointHiddenByFaces3D } from './geometry3dRenderVisibility'
import { evaluateAnalyticSurface3D } from './geometry3dAnalytic'
import { faceFrame3D } from './geometry3dFaces'

export const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3
export const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3
export const scale = (a: Vec3, n: number): Vec3 => a.map(v => v * n) as Vec3
export const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0)
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
export const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(...a))
export type StandardView3D = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric'
export function standardView3D(camera: GeometryCamera3D, view: StandardView3D): GeometryCamera3D {
  const directions: Record<StandardView3D, Vec3> = { front: [0,-1,0], back: [0,1,0], left: [-1,0,0], right: [1,0,0], top: [0,0,1], bottom: [0,0,-1], isometric: [1,-1,1] }
  return { ...structuredClone(camera), position: add(camera.target, scale(unit(directions[view]), Math.hypot(...sub(camera.position, camera.target)))), up: view === 'top' || view === 'bottom' ? [0,1,0] : [0,0,1] }
}
export type Primitive3D =
  | { id: string; kind: 'point'; position: Vec3; label: string | null }
  | { id: string; kind: 'segment' | 'line' | 'ray' | 'vector'; a: Vec3; b: Vec3 }
  | { id: string; kind: 'face' | 'plane'; vertices: Vec3[]; outline?:boolean }
export function scenePrimitives3D(source: GeometryScene3D) {
  const result = evaluateGeometryRenderScene3D(prepareCylinderCenters3D(source)??source)
  if (result.status !== 'ok') return { status: result.status, primitives: [] as Primitive3D[], analyticSolids:[] as RenderAnalyticSolid3D[], annotations:[] as {id:string;position:Vec3;content:string;offset:[number,number]}[] }
  const scene = result.scene, points = new Map(scene.points.map(p => [p.id, p.position]))
  const analyticSolids=scene.solids.filter((s):s is RenderAnalyticSolid3D=>s.mode==='parametric'&&(s.kind==='cylinder'||s.kind==='cone'||s.kind==='sphere'))
  const p = (id: string) => points.get(id)!
  const primitives: Primitive3D[] = scene.points.map(point => ({ ...point, kind: 'point' }))
  primitives.push(...scene.linear_objects.map(l => ({ id: l.id, kind: l.kind, a: p(l.a), b: p(l.b) })))
  primitives.push(...scene.edges.map(e => ({ id: e.id, kind: 'segment' as const, a: p(e.start), b: p(e.end) })))
  primitives.push(...scene.faces.map(f => ({ id: f.id, kind: 'face' as const, vertices: f.boundary.map(p) })))
  // A plane is represented by its basis, not by an arbitrary persisted finite patch.
  primitives.push(...scene.planes.map(f => ({ id: f.id, kind: 'plane' as const, vertices: f.point_ids.map(p) })))
  const annotations:{id:string;position:Vec3;content:string;offset:[number,number]}[]=[]
  // Existing text anchors can participate in read-only analytic display without
  // adding annotation authoring or changing attachment semantics.
  if(analyticSolids.length)for(const annotation of scene.annotations){
    if(annotation.format!=='text')continue
    const a=annotation.anchor;let position:Vec3|undefined
    if(a.kind==='world')position=a.position
    else if(a.kind==='point')position=p(a.point_id)
    else if(a.kind==='edge'){const e=scene.edges.find(e=>e.id===a.edge_id)!;position=add(p(e.start),scale(sub(p(e.end),p(e.start)),a.t))}
    else if(a.kind==='face'){const f=scene.faces.find(f=>f.id===a.face_id)!;position=faceFrame3D(f.boundary.map(p)).world(a.uv)}
    else {const surface=scene.surfaces.find(s=>s.id===a.surface_id),solid=analyticSolids.find(s=>s.id===surface?.solid_id);if(solid)position=evaluateAnalyticSurface3D(solid,a.uv)}
    if(position)annotations.push({id:annotation.id,position,content:annotation.content,offset:annotation.offset_mm})
  }
  return { status: 'ok' as const, primitives: primitives.sort((a,b) => a.id.localeCompare(b.id)),analyticSolids,annotations }
}
/** Display only: preserve semantic objects/picking while drawing coincident edges once. */
export function displayPrimitives3D(primitives:Primitive3D[]){
  const key=(a:Vec3,b:Vec3)=>[JSON.stringify(a),JSON.stringify(b)].sort().join('|')
  const representatives=new Map<string,string>(),aliases=new Map<string,string[]>(),output:Primitive3D[]=[]
  for(const p of primitives)if(p.kind==='segment'){
    const k=key(p.a,p.b),id=representatives.get(k)??p.id
    representatives.set(k,id);aliases.set(id,[...(aliases.get(id)??[]),p.id])
    if(id===p.id)output.push(p)
  }else output.push(p.kind==='face'?{...p,outline:false}:p)
  // Faces without explicit semantic boundary segments still need an outline.
  for(const p of primitives)if(p.kind==='face')for(let i=0;i<p.vertices.length;i++){
    const a=p.vertices[i],b=p.vertices[(i+1)%p.vertices.length],k=key(a,b)
    if(representatives.has(k))continue
    representatives.set(k,p.id);output.push({id:p.id,kind:'segment',a,b})
  }
  return {primitives:output,aliases}
}
export type Projection3D = ReturnType<typeof createProjection3D>
export function createProjection3D(value: GeometryCamera3D, width: number, height: number) {
  const normalized = normalizeGeometryEditingCamera3D(value)
  if (!normalized || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw Error('Invalid view')
  const camera: GeometryCamera3D = normalized
  const forward = unit(sub(camera.target, camera.position)), right = unit(cross(forward, camera.up)), up = cross(right, forward)
  const aspect = width / height, halfY = camera.vertical_span / 2, halfX = halfY * aspect, slopeY = Math.tan(camera.fov_degrees * Math.PI / 360), slopeX = slopeY * aspect
  const view = (p: Vec3): Vec3 => { const d = sub(p, camera.position); return [dot(d,right), dot(d,up), dot(d,forward)] }
  const world = (p: Vec3) => add(camera.position, add(scale(right,p[0]), add(scale(up,p[1]),scale(forward,p[2]))))
  const screen = (v: Vec3): Vec3 => [width/2 + v[0]*width/(2*(camera.projection === 'orthographic' ? halfX : v[2]*slopeX)), height/2 - v[1]*height/(2*(camera.projection === 'orthographic' ? halfY : v[2]*slopeY)), v[2]]
  // Half-spaces f(v)>=0, shared by points, bounded/unbounded lines and polygons.
  const planes = [(v: Vec3) => v[2]-camera.near, (v: Vec3) => camera.far-v[2],
    (v: Vec3) => (camera.projection === 'orthographic' ? halfX : v[2]*slopeX)+v[0],
    (v: Vec3) => (camera.projection === 'orthographic' ? halfX : v[2]*slopeX)-v[0],
    (v: Vec3) => (camera.projection === 'orthographic' ? halfY : v[2]*slopeY)+v[1],
    (v: Vec3) => (camera.projection === 'orthographic' ? halfY : v[2]*slopeY)-v[1]]
  function line(a: Vec3, b: Vec3, kind: 'segment' | 'line' | 'ray' | 'vector') {
    const va = view(a), d = sub(view(b),va)
    let lo = kind === 'line' ? -Infinity : 0, hi = kind === 'line' || kind === 'ray' ? Infinity : 1
    for (const f of planes) {
      const origin = f(va), slope = f(add(va,d))-origin
      if (Math.abs(slope) < 1e-12) { if (origin < -1e-9) return null; continue }
      const t = -origin/slope
      if (slope > 0) lo = Math.max(lo,t); else hi = Math.min(hi,t)
      if (hi < lo) return null
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
    return [add(va,scale(d,lo)), add(va,scale(d,hi))] as [Vec3,Vec3]
  }
  function polygon(vertices: Vec3[]) {
    let output = vertices.map(view)
    for (const f of planes) {
      const input = output; output = []
      for (let i=0; i<input.length; i++) {
        const a=input[i], b=input[(i+1)%input.length], fa=f(a), fb=f(b)
        if (fa >= 0) output.push(a)
        if ((fa>=0)!==(fb>=0)) output.push(add(a,scale(sub(b,a),fa/(fa-fb))))
      }
    }
    return output
  }
  function planePatch(vertices: Vec3[]) {
    const [a,b,c] = vertices, n = unit(cross(sub(b,a),sub(c,a))), distance = dot(n,sub(a,camera.position))
    const xs = camera.projection === 'orthographic' ? [halfX] : [camera.far*slopeX], ys = camera.projection === 'orthographic' ? [halfY] : [camera.far*slopeY]
    const corners: Vec3[] = []
    for (const z of [camera.near,camera.far]) for (const x of [-1,1]) for (const y of [-1,1]) corners.push(world([x*(camera.projection === 'orthographic' ? xs[0] : z*slopeX),y*(camera.projection === 'orthographic' ? ys[0] : z*slopeY),z]))
    const hits: Vec3[] = []
    for (let i=0;i<8;i++) for (const bit of [1,2,4]) { const j=i^bit; if (j<=i) continue
      const u=corners[i], v=corners[j], fu=dot(n,sub(u,camera.position))-distance, fv=dot(n,sub(v,camera.position))-distance
      if (Math.abs(fu)<1e-9) hits.push(u)
      if (fu*fv<0) hits.push(add(u,scale(sub(v,u),fu/(fu-fv))))
    }
    const unique = hits.filter((p,i) => hits.findIndex(q => Math.hypot(...sub(p,q))<1e-8)===i)
    if (unique.length<3) return []
    const center=scale(unique.reduce(add,[0,0,0] as Vec3),1/unique.length), x=unit(sub(b,a)), y=cross(n,x)
    return unique.sort((p,q)=> Math.atan2(dot(sub(p,center),y),dot(sub(p,center),x))-Math.atan2(dot(sub(q,center),y),dot(sub(q,center),x)))
  }
  return { camera, width, height, view, world, screen, line, polygon, planePatch, visible: (p: Vec3) => planes.every(f=>f(view(p))>=-1e-9) }
}
export type ProjectedFace3D = { id: string; kind: 'face' | 'plane'; vertices: Vec3[]; outline?:boolean; viewVertices?:Vec3[];ownerId?:string;analytic?:boolean;region?:string }
export type ProjectedLine3D = { id: string; kind: string; a: Vec3; b: Vec3; arrow?: boolean; viewA?:Vec3; viewB?:Vec3;role?:'rim'|'silhouette'|'equator';dashOffset?:number;arc?:{solid:RenderAnalyticSolid3D;from:number;to:number;z:number} }
export function projectScene3D(source: GeometryScene3D, camera: GeometryCamera3D, width: number, height: number, display=false) {
  const adapter=scenePrimitives3D(source), projection=createProjection3D(camera,width,height)
  const worldPoints=new Map(adapter.primitives.filter(p=>p.kind==='point').map(p=>[p.id,p.position]))
  const points: { id: string; position: Vec3; label: string|null }[] = [], lines: ProjectedLine3D[] = [], faces: ProjectedFace3D[] = []
  for (const primitive of display?displayPrimitives3D(adapter.primitives).primitives:adapter.primitives) {
    if (primitive.kind==='point') { if (projection.visible(primitive.position)) points.push({ ...primitive, position: projection.screen(projection.view(primitive.position)) }); }
    else if ('a' in primitive) { const clipped=projection.line(primitive.a,primitive.b,primitive.kind); if(clipped) lines.push({ id:primitive.id, kind:primitive.kind, a:projection.screen(clipped[0]), b:projection.screen(clipped[1]), viewA:clipped[0],viewB:clipped[1],arrow: primitive.kind==='vector'&&projection.visible(primitive.b) }); }
    else { const polygon=projection.polygon(primitive.kind==='plane' ? projection.planePatch(primitive.vertices) : primitive.vertices); if(polygon.length>=3) faces.push({ id:primitive.id,kind:primitive.kind,vertices:polygon.map(projection.screen),viewVertices:polygon,...(primitive.outline===false?{outline:false}:{}) }); }
  }
  const owner=new Map(source.solids.flatMap(s=>s.mode==='parametric'?s.features.map(f=>[f.entity_id,s.id] as const):s.face_ids.map(id=>[id,s.id] as const)))
  faces.forEach(f=>{f.ownerId=owner.get(f.id)})
  // Derived patches are display-only. Ordinary semantic picking must never
  // mistake a tessellation patch/circular cap for an independently owned face.
  for(const solid of display?adapter.analyticSolids:[]){
    // Deterministic display quality, independent of semantic sparse features.
    const render=analyticRenderGeometry3D(solid,camera)
    for(const patch of render.patches){
      const clipped=projection.polygon(patch.vertices)
      if(clipped.length>=3)faces.push({id:solid.id,kind:'face',vertices:clipped.map(projection.screen),viewVertices:clipped,outline:false,ownerId:solid.id,analytic:true,region:patch.region})
    }
    for(const curve of render.curves){
      // A real owned generator takes precedence over a coincident display-only
      // silhouette. Keep semantic picking/IDs and its analytic visibility intact.
      if(solid.kind==='cone'&&curve.role==='silhouette'){
        const owned=new Set(solid.features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id))
        const same=(a:Vec3,b:Vec3)=>Math.hypot(...sub(a,b))<=1e-10*Math.max(1,solid.parameters.radius,solid.parameters.height)
        if(source.linear_objects.some(l=>{
          if(l.kind!=='segment'||!owned.has(l.a)||!owned.has(l.b))return false
          const a=worldPoints.get(l.a),b=worldPoints.get(l.b);if(!a||!b)return false
          return same(a,curve.vertices[0])&&same(b,curve.vertices[1])||same(b,curve.vertices[0])&&same(a,curve.vertices[1])
        }))continue
      }
      let curveDistance=0
      for(let i=0;i<curve.vertices.length-1;i++){
      const clipped=projection.line(curve.vertices[i],curve.vertices[i+1],'segment');if(!clipped)continue
      const line:ProjectedLine3D={id:solid.id,kind:'segment',a:projection.screen(clipped[0]),b:projection.screen(clipped[1]),viewA:clipped[0],viewB:clipped[1],role:curve.role,dashOffset:curveDistance}
      curveDistance+=Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1])
      if(curve.role==='equator'||curve.role==='rim'&&solid.kind!=='sphere'){
        // Clip parameter recovery preserves the arc's original pointer-free geometry.
        const a=projection.view(curve.vertices[i]),b=projection.view(curve.vertices[i+1]),d=sub(b,a),length=dot(d,d)
        const lo=length?dot(sub(clipped[0],a),d)/length:0,hi=length?dot(sub(clipped[1],a),d)/length:1
        const angles=curve.angles
        line.arc={solid,from:angles?angles[i]+(angles[i+1]-angles[i])*lo:2*Math.PI*(i+lo)/render.resolution,to:angles?angles[i]+(angles[i+1]-angles[i])*hi:2*Math.PI*(i+hi)/render.resolution,z:solid.kind==='sphere'||curve===render.curves[0]?0:solid.parameters.height}
      }
      if(Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1])>1e-7)lines.push(line)
      }
    }
  }
  const ordinaryFaces=faces.filter(f=>!f.analytic)
  const hiddenPoint=(position:Vec3)=>pointHiddenByAnalytic3D(position,camera,adapter.analyticSolids)||pointHiddenByFaces3D(projection.screen(projection.view(position)),ordinaryFaces,camera.projection)
  // Predefined cone references and a sphere's center remain visible through their own solid,
  // as in a geometric construction diagram; other occluders retain depth order.
  const visiblePoints=adapter.analyticSolids.length?points.filter(p=>{
    const owner=adapter.analyticSolids.find(s=>(s.kind==='cone'||s.kind==='sphere')&&s.features.some(f=>['v_0','v_1','v_2','v_3'].includes(f.slot)&&f.entity_id===p.id))
    if(!owner)return !hiddenPoint(worldPoints.get(p.id)!)
    const world=worldPoints.get(p.id)!
    return !pointHiddenByAnalytic3D(world,camera,adapter.analyticSolids.filter(s=>s.id!==owner.id))&&!pointHiddenByFaces3D(p.position,ordinaryFaces,camera.projection)
  }):points
  const annotations=adapter.annotations.filter(a=>projection.visible(a.position)&&!hiddenPoint(a.position)).map(a=>({...a,position:projection.screen(projection.view(a.position))}))
  return { status:adapter.status, projection, points:visiblePoints, lines, faces,analyticSolids:adapter.analyticSolids,annotations }
}
/** Screen intervals inside a planar face and strictly behind it. Perspective uses
 * reciprocal depth, which is affine in screen space. Coplanarity is tested in
 * view space first, so an almost edge-on incident face cannot hide its own edge.
 */
export function hiddenIntervals3D(line:ProjectedLine3D,face:ProjectedFace3D,mode:GeometryCamera3D['projection']='orthographic'):[number,number][]{
  const vertices=face.vertices,finite=(v:Vec3)=>v.every(Number.isFinite)
  if(vertices.length<3||!finite(line.a)||!finite(line.b)||vertices.some(v=>!finite(v))||mode==='perspective'&&[line.a,line.b,...vertices].some(v=>v[2]<=0))return []
  if(face.viewVertices&&line.viewA&&line.viewB){
    const origin=face.viewVertices[0],vectors=face.viewVertices.slice(1).map(v=>sub(v,origin)),u=vectors.reduce((a,b)=>dot(a,a)>dot(b,b)?a:b),normal=vectors.map(v=>cross(u,v)).reduce((a,b)=>dot(a,a)>dot(b,b)?a:b)
    const length=Math.hypot(...normal),extent=Math.max(1,...vectors.map(v=>Math.hypot(...v)))
    if(length<=1e-20)return []
    if([line.viewA,line.viewB].every(v=>Math.abs(dot(sub(v,origin),normal))/length<=1e-9*extent))return []
  }
  const origin=vertices[0],span=Math.max(1,...vertices.flatMap(v=>[Math.abs(v[0]-origin[0]),Math.abs(v[1]-origin[1])])),metric=(z:number)=>mode==='perspective'?-1/z:z
  const v=vertices.map(p=>[(p[0]-origin[0])/span,(p[1]-origin[1])/span,metric(p[2])] as Vec3),a:[number,number]=[(line.a[0]-origin[0])/span,(line.a[1]-origin[1])/span],d:[number,number]=[(line.b[0]-line.a[0])/span,(line.b[1]-line.a[1])/span]
  const cross2=(a:number[],b:number[])=>a[0]*b[1]-a[1]*b[0],length2=d[0]*d[0]+d[1]*d[1]
  if(length2<=1e-24)return []
  const u=v.reduce((a,b)=>a[0]*a[0]+a[1]*a[1]>b[0]*b[0]+b[1]*b[1]?a:b),w=v.reduce((a,b)=>Math.abs(cross2(u,a))>Math.abs(cross2(u,b))?a:b),det=cross2(u,w)
  if(Math.abs(det)<=1e-12)return []
  const q0=v[0][2],gx=((u[2]-q0)*w[1]-(w[2]-q0)*u[1])/det,gy=(u[0]*(w[2]-q0)-w[0]*(u[2]-q0))/det
  const start=metric(line.a[2])-q0-gx*a[0]-gy*a[1],slope=metric(line.b[2])-metric(line.a[2])-gx*d[0]-gy*d[1],tolerance=1e-9*Math.max(1,...v.map(p=>Math.abs(p[2])),Math.abs(metric(line.a[2])),Math.abs(metric(line.b[2])))
  const cuts=[0,1],cut=(t:number)=>{if(Number.isFinite(t)&&t>0&&t<1)cuts.push(t)}
  if(Math.abs(slope)>1e-15)cut((tolerance-start)/slope)
  for(let i=0;i<v.length;i++){
    const p=v[i],q=v[(i+1)%v.length],edge=[q[0]-p[0],q[1]-p[1]],offset=[p[0]-a[0],p[1]-a[1]],den=cross2(d,edge)
    if(Math.abs(den)>1e-14){const t=cross2(offset,edge)/den,u=cross2(offset,d)/den;if(u>=-1e-10&&u<=1+1e-10)cut(t)}
    else if(Math.abs(cross2(offset,d))<=1e-12){cut((offset[0]*d[0]+offset[1]*d[1])/length2);cut(((q[0]-a[0])*d[0]+(q[1]-a[1])*d[1])/length2)}
  }
  const inside=(x:number,y:number)=>{
    let hit=false
    for(let i=0,j=v.length-1;i<v.length;j=i++){
      const p=v[i],q=v[j],edge=[q[0]-p[0],q[1]-p[1]],offset=[x-p[0],y-p[1]]
      if(Math.abs(cross2(edge,offset))<=1e-10*Math.max(1,Math.hypot(...edge))&&(x-p[0])*(x-q[0])+(y-p[1])*(y-q[1])<=1e-12)return true
      if((p[1]>y)!==(q[1]>y)&&x<(q[0]-p[0])*(y-p[1])/(q[1]-p[1])+p[0])hit=!hit
    }return hit
  }
  const sorted=[...new Set(cuts)].sort((a,b)=>a-b),result:[number,number][]=[]
  for(let i=0;i<sorted.length-1;i++){const lo=sorted[i],hi=sorted[i+1],t=(lo+hi)/2;if(hi-lo>1e-10&&start+slope*t>tolerance&&inside(a[0]+d[0]*t,a[1]+d[1]*t))result.push([lo,hi])}
  return result
}
export function projectedEdgeStrokes3D(projected:ReturnType<typeof projectScene3D>,mode:GeometryCamera3D['projection']){
  const strokes:(ProjectedLine3D&{hidden:boolean})[]=[]
  for(const line of projected.lines){
    const polygonIntervals=projected.faces.filter(f=>f.kind==='face'&&!f.analytic).flatMap(f=>hiddenIntervals3D(line,f,mode))
    const seeds=projected.faces.filter(f=>f.analytic&&f.ownerId!==line.id).flatMap(f=>hiddenIntervals3D(line,f,mode)).flat()
    // A sphere silhouette's sampled chords are inside its own surface. The
    // true tangent curve cannot self-occlude; all other occluders still apply.
    const occluders=line.role==='silhouette'?projected.analyticSolids.filter(s=>s.kind!=='sphere'||s.id!==line.id):projected.analyticSolids
    const analyticIntervals=analyticLineIntervals3D(line,projected.projection,occluders,seeds)
    const intervals=[...polygonIntervals,...analyticIntervals].sort((a,b)=>a[0]-b[0]),merged:[number,number][]=[]
    for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+1e-9)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval])}
    const cuts=[...new Set([0,1,...merged.flat()])].sort((a,b)=>a-b)
    const point=(t:number):Vec3=>[line.a[0]+(line.b[0]-line.a[0])*t,line.a[1]+(line.b[1]-line.a[1])*t,mode==='perspective'?1/((1-t)/line.a[2]+t/line.b[2]):line.a[2]+(line.b[2]-line.a[2])*t]
    const view=(t:number)=>{if(!line.viewA||!line.viewB)return undefined;const u=mode==='perspective'?t*line.a[2]/((1-t)*line.b[2]+t*line.a[2]):t;return add(line.viewA,scale(sub(line.viewB,line.viewA),u))}
    for(let i=0;i<cuts.length-1;i++){const lo=cuts[i],hi=cuts[i+1];if(hi-lo<=1e-9)continue;const t=(lo+hi)/2;strokes.push({...line,a:point(lo),b:point(hi),viewA:view(lo),viewB:view(hi),...(line.dashOffset!==undefined?{dashOffset:line.dashOffset+Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1])*lo}:{}),hidden:merged.some(([a,b])=>t>a&&t<b)})}
  }
  // Orthographic axial rims can project to the same curve. Keep the visible
  // representative instead of laying a second dashed stroke over it.
  const curves=new Map<string,(typeof strokes)[number]>(),ordinary=strokes.filter(s=>!s.role)
  for(const stroke of strokes.filter(s=>s.role)){
    const key=stroke.id+'|'+[stroke.a,stroke.b].map(p=>p.slice(0,2).map(v=>v.toFixed(6)).join(',')).sort().join('|')
    const previous=curves.get(key)
    if(!previous||previous.hidden&&!stroke.hidden)curves.set(key,stroke)
  }
  return [...ordinary,...curves.values()].sort((a,b)=>Number(b.hidden)-Number(a.hidden))
}
const escape = (value: string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
const number = (v: number) => String(Math.abs(v)<0.0000005 ? 0 : Number(v.toFixed(6)))
export function geometrySceneSVG3D(source: GeometryScene3D, width=520, height=300,highlighted:ReadonlySet<string>=new Set()): string {
  const projected=projectScene3D(source,source.print_camera,width,height,true), parts: string[]=[]
  const xy=(p:Vec3)=>`${number(p[0])},${number(p[1])}`
  let hash=2166136261
  if(projected.analyticSolids.length)for(const c of JSON.stringify([width,height,source.print_camera,projected.faces]))hash=Math.imul(hash^c.charCodeAt(0),16777619)
  const prefix=`g3d${(hash>>>0).toString(16)}`,defs:string[]=[]
  const sorted=[...projected.faces].sort((a,b)=> b.vertices.reduce((s,p)=>s+p[2],0)/b.vertices.length-a.vertices.reduce((s,p)=>s+p[2],0)/a.vertices.length || a.id.localeCompare(b.id))
  sorted.forEach((face,i)=>{
    const masks=projected.analyticSolids.length?faceOcclusionMasks3D(face,projected.faces,source.print_camera.projection):[],id=`${prefix}_${i}`
    if(masks.length)defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${number(width)}" height="${number(height)}" style="mask-type:luminance"><rect width="100%" height="100%" fill="white"/>${masks.map(v=>`<polygon points="${v.map(xy).join(' ')}" fill="black"/>`).join('')}</mask>`)
    const color=highlighted.has(face.id)?'#f97316':face.analytic?(face.region==='lateral'?'#e2e8f0':'#f1f5f9'):'#e2e8f0'
    parts.push(`<polygon data-id="${escape(face.id)}"${face.analytic?` data-render-surface="${face.region}"`:''} points="${face.vertices.map(xy).join(' ')}" fill="${color}" fill-opacity="${face.analytic?'1':'0.35'}" stroke="${face.analytic?color:face.outline===false?'none':'#94a3b8'}"${face.analytic?' stroke-width="0.3" stroke-linejoin="round"':''}${masks.length?` mask="url(#${id})"`:''}/>`)
  })
  for(const line of projectedEdgeStrokes3D(projected,source.print_camera.projection)) {
    parts.push(`<path data-id="${escape(line.id)}"${line.role?` data-render-curve="${line.role}"`:''} d="M${xy(line.a)} L${xy(line.b)}" fill="none" stroke="${highlighted.has(line.id)?'#f97316':'#334155'}"${line.hidden?` stroke-dasharray="4 3"${line.dashOffset!==undefined?` stroke-dashoffset="${number(-line.dashOffset)}"`:''} opacity="0.45"`:''}/>`)
  }
  for(const line of projected.lines){
    if(line.arrow&&!(projected.analyticSolids.length&&pointHiddenByAnalytic3D(projected.projection.world(line.viewB!),source.print_camera,projected.analyticSolids))) { const dx=line.b[0]-line.a[0], dy=line.b[1]-line.a[1], len=Math.hypot(dx,dy); if(len>1e-8) { const x=dx/len,y=dy/len; parts.push(`<path d="M${xy([line.b[0]-8*x+4*y,line.b[1]-8*y-4*x,0])} L${xy(line.b)} L${xy([line.b[0]-8*x-4*y,line.b[1]-8*y+4*x,0])}" fill="none" stroke="#334155"/>`) } }
  }
  for(const point of projected.points) {
    parts.push(`<circle data-id="${escape(point.id)}" cx="${number(point.position[0])}" cy="${number(point.position[1])}" r="3" fill="${highlighted.has(point.id)?'#f97316':'#2563eb'}"/>`)
    if(point.label){
      let dx=6,dy=-6,anchor='start'
      const cone=source.solids.find(s=>s.mode==='parametric'&&s.kind==='cone'&&s.features.some(f=>f.entity_id===point.id&&['v_0','v_1','v_2','v_3'].includes(f.slot)))
      if(cone?.mode==='parametric'){
        const slot=cone.features.find(f=>f.entity_id===point.id)!.slot,center=projected.points.find(p=>p.id===cone.features.find(f=>f.slot==='v_0')?.entity_id)?.position
        if(slot==='v_0'){dx=9;dy=15}
        else if(center){
          const vx=point.position[0]-center[0],vy=point.position[1]-center[1],length=Math.hypot(vx,vy)
          if(length>1e-7){dx=12*vx/length;dy=12*vy/length+4;anchor=Math.abs(vx)<.25*length?'middle':vx<0?'end':'start'}
        }
      }
      // Static cone references must not acquire native text-selection tiles.
      // Keep this inside the SVG so editor and standalone saved views agree.
      parts.push(`<text x="${number(point.position[0]+dx)}" y="${number(point.position[1]+dy)}"${cone?` text-anchor="${anchor}" data-cone-point-label="${escape(point.id)}" style="fill:#172033;background:transparent;user-select:none;-webkit-user-select:none"`:''} font-size="12">${escape(point.label)}</text>`)
    }
  }
  for(const a of projected.annotations)parts.push(`<text data-id="${escape(a.id)}" x="${number(a.position[0]+a.offset[0]*96/25.4)}" y="${number(a.position[1]+a.offset[1]*96/25.4)}" font-size="12">${escape(a.content)}</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(width)} ${number(height)}" width="${number(width)}" height="${number(height)}" role="img" aria-label="3D həndəsə">${defs.length?`<defs>${defs.join('')}</defs>`:''}${parts.join('')}</svg>`
}
