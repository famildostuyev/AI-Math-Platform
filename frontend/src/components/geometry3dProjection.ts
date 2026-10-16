import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { normalizeGeometryEditingCamera3D } from './geometry3d'
import { evaluateGeometryScene3D } from './geometry3dModel'

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
  const result = evaluateGeometryScene3D(source)
  if (result.status !== 'ok') return { status: result.status, primitives: [] as Primitive3D[] }
  const scene = result.scene, points = new Map(scene.points.map(p => [p.id, p.position]))
  const p = (id: string) => points.get(id)!
  const primitives: Primitive3D[] = scene.points.map(point => ({ ...point, kind: 'point' }))
  primitives.push(...scene.linear_objects.map(l => ({ id: l.id, kind: l.kind, a: p(l.a), b: p(l.b) })))
  primitives.push(...scene.edges.map(e => ({ id: e.id, kind: 'segment' as const, a: p(e.start), b: p(e.end) })))
  primitives.push(...scene.faces.map(f => ({ id: f.id, kind: 'face' as const, vertices: f.boundary.map(p) })))
  // A plane is represented by its basis, not by an arbitrary persisted finite patch.
  primitives.push(...scene.planes.map(f => ({ id: f.id, kind: 'plane' as const, vertices: f.point_ids.map(p) })))
  return { status: 'ok' as const, primitives: primitives.sort((a,b) => a.id.localeCompare(b.id)) }
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
export type ProjectedFace3D = { id: string; kind: 'face' | 'plane'; vertices: Vec3[]; outline?:boolean; viewVertices?:Vec3[] }
export type ProjectedLine3D = { id: string; kind: string; a: Vec3; b: Vec3; arrow?: boolean; viewA?:Vec3; viewB?:Vec3 }
export function projectScene3D(source: GeometryScene3D, camera: GeometryCamera3D, width: number, height: number, display=false) {
  const adapter=scenePrimitives3D(source), projection=createProjection3D(camera,width,height)
  const points: { id: string; position: Vec3; label: string|null }[] = [], lines: ProjectedLine3D[] = [], faces: ProjectedFace3D[] = []
  for (const primitive of display?displayPrimitives3D(adapter.primitives).primitives:adapter.primitives) {
    if (primitive.kind==='point') { if (projection.visible(primitive.position)) points.push({ ...primitive, position: projection.screen(projection.view(primitive.position)) }); }
    else if ('a' in primitive) { const clipped=projection.line(primitive.a,primitive.b,primitive.kind); if(clipped) lines.push({ id:primitive.id, kind:primitive.kind, a:projection.screen(clipped[0]), b:projection.screen(clipped[1]), viewA:clipped[0],viewB:clipped[1],arrow: primitive.kind==='vector'&&projection.visible(primitive.b) }); }
    else { const polygon=projection.polygon(primitive.kind==='plane' ? projection.planePatch(primitive.vertices) : primitive.vertices); if(polygon.length>=3) faces.push({ id:primitive.id,kind:primitive.kind,vertices:polygon.map(projection.screen),viewVertices:polygon,...(primitive.outline===false?{outline:false}:{}) }); }
  }
  return { status:adapter.status, projection, points, lines, faces }
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
    const intervals=projected.faces.filter(f=>f.kind==='face').flatMap(f=>hiddenIntervals3D(line,f,mode)).sort((a,b)=>a[0]-b[0]),merged:[number,number][]=[]
    for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+1e-9)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval])}
    const cuts=[...new Set([0,1,...merged.flat()])].sort((a,b)=>a-b)
    const point=(t:number):Vec3=>[line.a[0]+(line.b[0]-line.a[0])*t,line.a[1]+(line.b[1]-line.a[1])*t,mode==='perspective'?1/((1-t)/line.a[2]+t/line.b[2]):line.a[2]+(line.b[2]-line.a[2])*t]
    const view=(t:number)=>{if(!line.viewA||!line.viewB)return undefined;const u=mode==='perspective'?t*line.a[2]/((1-t)*line.b[2]+t*line.a[2]):t;return add(line.viewA,scale(sub(line.viewB,line.viewA),u))}
    for(let i=0;i<cuts.length-1;i++){const lo=cuts[i],hi=cuts[i+1];if(hi-lo<=1e-9)continue;const t=(lo+hi)/2;strokes.push({...line,a:point(lo),b:point(hi),viewA:view(lo),viewB:view(hi),hidden:merged.some(([a,b])=>t>a&&t<b)})}
  }
  return strokes.sort((a,b)=>Number(b.hidden)-Number(a.hidden))
}
const escape = (value: string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
const number = (v: number) => String(Math.abs(v)<0.0000005 ? 0 : Number(v.toFixed(6)))
export function geometrySceneSVG3D(source: GeometryScene3D, width=520, height=300): string {
  const projected=projectScene3D(source,source.print_camera,width,height,true), parts: string[]=[]
  const xy=(p:Vec3)=>`${number(p[0])},${number(p[1])}`
  for(const face of [...projected.faces].sort((a,b)=> b.vertices.reduce((s,p)=>s+p[2],0)/b.vertices.length-a.vertices.reduce((s,p)=>s+p[2],0)/a.vertices.length || a.id.localeCompare(b.id))) parts.push(`<polygon data-id="${escape(face.id)}" points="${face.vertices.map(xy).join(' ')}" fill="#e2e8f0" fill-opacity="0.35" stroke="${face.outline===false?'none':'#94a3b8'}"/>`)
  for(const line of projectedEdgeStrokes3D(projected,source.print_camera.projection)) {
    parts.push(`<path data-id="${escape(line.id)}" d="M${xy(line.a)} L${xy(line.b)}" fill="none" stroke="#334155"${line.hidden?' stroke-dasharray="4 3" opacity="0.45"':''}/>`)
  }
  for(const line of projected.lines){
    if(line.arrow) { const dx=line.b[0]-line.a[0], dy=line.b[1]-line.a[1], len=Math.hypot(dx,dy); if(len>1e-8) { const x=dx/len,y=dy/len; parts.push(`<path d="M${xy([line.b[0]-8*x+4*y,line.b[1]-8*y-4*x,0])} L${xy(line.b)} L${xy([line.b[0]-8*x-4*y,line.b[1]-8*y+4*x,0])}" fill="none" stroke="#334155"/>`) } }
  }
  for(const point of projected.points) { parts.push(`<circle data-id="${escape(point.id)}" cx="${number(point.position[0])}" cy="${number(point.position[1])}" r="3" fill="#2563eb"/>`); if(point.label)parts.push(`<text x="${number(point.position[0]+6)}" y="${number(point.position[1]-6)}" font-size="12">${escape(point.label)}</text>`) }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(width)} ${number(height)}" width="${number(width)}" height="${number(height)}" role="img" aria-label="3D həndəsə">${parts.join('')}</svg>`
}
