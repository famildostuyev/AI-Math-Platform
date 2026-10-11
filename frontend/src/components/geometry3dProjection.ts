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
  | { id: string; kind: 'face' | 'plane'; vertices: Vec3[] }
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
export type ProjectedFace3D = { id: string; kind: 'face' | 'plane'; vertices: Vec3[] }
export type ProjectedLine3D = { id: string; kind: string; a: Vec3; b: Vec3; arrow?: boolean }
export function projectScene3D(source: GeometryScene3D, camera: GeometryCamera3D, width: number, height: number) {
  const adapter=scenePrimitives3D(source), projection=createProjection3D(camera,width,height)
  const points: { id: string; position: Vec3; label: string|null }[] = [], lines: ProjectedLine3D[] = [], faces: ProjectedFace3D[] = []
  for (const primitive of adapter.primitives) {
    if (primitive.kind==='point') { if (projection.visible(primitive.position)) points.push({ ...primitive, position: projection.screen(projection.view(primitive.position)) }); }
    else if ('a' in primitive) { const clipped=projection.line(primitive.a,primitive.b,primitive.kind); if(clipped) lines.push({ id:primitive.id, kind:primitive.kind, a:projection.screen(clipped[0]), b:projection.screen(clipped[1]), arrow: primitive.kind==='vector'&&projection.visible(primitive.b) }); }
    else { const polygon=projection.polygon(primitive.kind==='plane' ? projection.planePatch(primitive.vertices) : primitive.vertices); if(polygon.length>=3) faces.push({ id:primitive.id,kind:primitive.kind,vertices:polygon.map(projection.screen) }); }
  }
  return { status:adapter.status, projection, points, lines, faces }
}
// M2 feasibility: orthographic line intervals behind a convex projected planar face.
// Concave faces, intersecting faces and perspective hidden edges require M9.
export function hiddenIntervals3D(line: ProjectedLine3D, face: ProjectedFace3D): [number,number][] {
  const vertices=face.vertices, a=line.a, d=sub(line.b,a), area=vertices.reduce((s,p,i)=>{const q=vertices[(i+1)%vertices.length]; return s+p[0]*q[1]-q[0]*p[1]},0), sign=Math.sign(area)
  if (!sign) return []
  for(let i=0;i<vertices.length;i++) {
    const p=vertices[i],q=vertices[(i+1)%vertices.length],r=vertices[(i+2)%vertices.length]
    if(sign*((q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0])) < -1e-9)return []
  }
  let lo=0, hi=1
  for (let i=0;i<vertices.length;i++) {
    const p=vertices[i], q=vertices[(i+1)%vertices.length], ex=q[0]-p[0], ey=q[1]-p[1]
    const f=sign*(ex*(a[1]-p[1])-ey*(a[0]-p[0])), slope=sign*(ex*d[1]-ey*d[0])
    if(Math.abs(slope)<1e-10) { if(f<0)return []; } else if(slope>0)lo=Math.max(lo,-f/slope);else hi=Math.min(hi,-f/slope)
  }
  const n=cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0]))
  if(Math.abs(n[2])<1e-10 || lo>=hi)return []
  const faceDepth=(t:number)=>vertices[0][2]-(n[0]*(a[0]+d[0]*t-vertices[0][0])+n[1]*(a[1]+d[1]*t-vertices[0][1]))/n[2]
  const f=a[2]-faceDepth(0)-1e-7, slope=d[2]-(faceDepth(1)-faceDepth(0))
  if(Math.abs(slope)<1e-10) { if(f<=0)return []; } else if(slope>0)lo=Math.max(lo,-f/slope);else hi=Math.min(hi,-f/slope)
  return lo<hi ? [[lo,hi]] : []
}
const escape = (value: string) => value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
const number = (v: number) => String(Math.abs(v)<0.0000005 ? 0 : Number(v.toFixed(6)))
export function geometrySceneSVG3D(source: GeometryScene3D, width=520, height=300): string {
  const projected=projectScene3D(source,source.print_camera,width,height), parts: string[]=[]
  const xy=(p:Vec3)=>`${number(p[0])},${number(p[1])}`
  for(const face of [...projected.faces].sort((a,b)=> b.vertices.reduce((s,p)=>s+p[2],0)/b.vertices.length-a.vertices.reduce((s,p)=>s+p[2],0)/a.vertices.length || a.id.localeCompare(b.id))) parts.push(`<polygon data-id="${escape(face.id)}" points="${face.vertices.map(xy).join(' ')}" fill="#e2e8f0" fill-opacity="0.35" stroke="#94a3b8"/>`)
  for(const line of projected.lines) {
    const intervals=source.print_camera.projection==='orthographic' ? projected.faces.filter(f=>f.kind==='face').flatMap(f=>hiddenIntervals3D(line,f)) : []
    const splits=[...new Set([0,1,...intervals.flat()])].sort((a,b)=>a-b)
    for(let i=0;i<splits.length-1;i++) { const lo=splits[i], hi=splits[i+1], hidden=intervals.some(([l,h])=>(lo+hi)/2>l&&(lo+hi)/2<h)
      const a=add(line.a,scale(sub(line.b,line.a),lo)), b=add(line.a,scale(sub(line.b,line.a),hi))
      parts.push(`<path data-id="${escape(line.id)}" d="M${xy(a)} L${xy(b)}" fill="none" stroke="#334155"${hidden?' stroke-dasharray="4 3" opacity="0.45"':''}/>`)
    }
    if(line.arrow) { const dx=line.b[0]-line.a[0], dy=line.b[1]-line.a[1], len=Math.hypot(dx,dy); if(len>1e-8) { const x=dx/len,y=dy/len; parts.push(`<path d="M${xy([line.b[0]-8*x+4*y,line.b[1]-8*y-4*x,0])} L${xy(line.b)} L${xy([line.b[0]-8*x-4*y,line.b[1]-8*y+4*x,0])}" fill="none" stroke="#334155"/>`) } }
  }
  for(const point of projected.points) { parts.push(`<circle data-id="${escape(point.id)}" cx="${number(point.position[0])}" cy="${number(point.position[1])}" r="3" fill="#2563eb"/>`); if(point.label)parts.push(`<text x="${number(point.position[0]+6)}" y="${number(point.position[1]-6)}" font-size="12">${escape(point.label)}</text>`) }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(width)} ${number(height)}" width="${number(width)}" height="${number(height)}" role="img" aria-label="3D həndəsə">${parts.join('')}</svg>`
}
