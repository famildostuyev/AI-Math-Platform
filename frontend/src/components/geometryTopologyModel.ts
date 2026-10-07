import type { GeometrySourceDataV1 } from '../api/questionEditor'

export type GeometryShape = {
  id: string
  kind: 'triangle' | 'quadrilateral' | 'polygon'
  pointIds: string[]
  boundary: { kind: 'segment' | 'polygon'; id: string; forward: boolean }[]
}

// Reference identity is independent of orientation and collection ordering.
function canonicalCycle(ids: string[]): string[] {
  // IDs are unique ASCII identifiers. Pick the least ID and the lesser neighbor;
  // no locale-dependent sorting or enumeration of every rotation is necessary.
  const start=ids.reduce((best,id,i)=>id<ids[best]?i:best,0)
  const forward=[...ids.slice(start),...ids.slice(0,start)]
  return forward[1]<forward.at(-1)! ? forward : [forward[0],...forward.slice(1).reverse()]
}

export function simpleBoundary(g: GeometrySourceDataV1, ids: string[]): boolean {
  if (ids.length < 3 || new Set(ids).size !== ids.length) return false
  const points = ids.map(id => g.points.find(p => p.id === id))
  if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false
  const vertices = points.filter((p): p is NonNullable<typeof p> => !!p)
  const scale = Math.max(...vertices.map(p => Math.hypot(p.x - vertices[0].x, p.y - vertices[0].y)))
  if (!Number.isFinite(scale) || scale === 0) return false
  const v = vertices.map(p => ({ x: (p.x - vertices[0].x) / scale, y: (p.y - vertices[0].y) / scale }))
  const cross = (a: typeof v[number], b: typeof v[number], c: typeof v[number]) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
  const eps = 1e-10
  const on = (a: typeof v[number], b: typeof v[number], c: typeof v[number]) => Math.abs(cross(a,b,c)) <= eps && c.x >= Math.min(a.x,b.x)-eps && c.x <= Math.max(a.x,b.x)+eps && c.y >= Math.min(a.y,b.y)-eps && c.y <= Math.max(a.y,b.y)+eps
  let area = 0
  for (let i=0;i<v.length;i++) {
    const a=v[i], b=v[(i+1)%v.length]
    if (Math.hypot(a.x-b.x,a.y-b.y)<=eps) return false
    area += a.x*b.y-b.x*a.y
    for(let j=i+1;j<v.length;j++) {
      if(j===i+1 || (i===0 && j===v.length-1)) continue
      const c=v[j],d=v[(j+1)%v.length]
      if ((cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)) return false
    }
  }
  return Math.abs(area)>eps
}

export function geometryShapes(g: GeometrySourceDataV1): GeometryShape[] {
  const kind = (n: number): GeometryShape['kind'] => n===3?'triangle':n===4?'quadrilateral':'polygon'
  const shapes: GeometryShape[] = g.polygons.filter(p=>simpleBoundary(g,p.point_ids)).map(p=>{
    const pointIds=canonicalCycle(p.point_ids)
    const forward=p.point_ids[(p.point_ids.indexOf(pointIds[0])+1)%p.point_ids.length]===pointIds[1]
    return {id:`polygon:${p.id}`,kind:kind(p.point_ids.length),pointIds,boundary:[{kind:'polygon',id:p.id,forward}]}
  })
  const adjacency = new Map<string, typeof g.segments>()
  for(const edge of g.segments) for(const id of [edge.start_point_id,edge.end_point_id]) adjacency.set(id,[...(adjacency.get(id)??[]),edge])
  // Peel dangling trees; they cannot define a closed boundary. Shared vertices
  // remain real references, so attached open segments still follow transforms.
  let peeled = true
  while (peeled) {
    peeled = false
    for (const [id, edges] of adjacency) if (edges.length < 2) {
      adjacency.delete(id); peeled = true
      for (const e of edges) {
        const other = e.start_point_id === id ? e.end_point_id : e.start_point_id
        if (adjacency.has(other)) adjacency.set(other, adjacency.get(other)!.filter(edge => edge.id !== e.id))
      }
    }
  }
  const visited=new Set<string>()
  for(const start of [...adjacency.keys()].sort()) {
    if(visited.has(start)) continue
    const component:string[]=[],todo=[start],edges=new Map<string,typeof g.segments[number]>()
    while(todo.length) {
      const id=todo.pop()!
      if(visited.has(id))continue
      visited.add(id);component.push(id)
      for(const e of adjacency.get(id)??[]) {edges.set(e.id,e);todo.push(e.start_point_id,e.end_point_id)}
    }
    // Only isolated degree-two components: branches/diagonals never enumerate cycles.
    if(component.length<3 || edges.size!==component.length || component.some(id=>adjacency.get(id)!.length!==2))continue
    const order=[component.sort()[0]];let previous=''
    while(order.length<component.length) {
      const id=order.at(-1)!,next=adjacency.get(id)!.map(e=>e.start_point_id===id?e.end_point_id:e.start_point_id).filter(n=>n!==previous).sort()[0]
      if(order.includes(next))break
      previous=id;order.push(next)
    }
    if(order.length!==component.length || !simpleBoundary(g,order))continue
    const pointIds=canonicalCycle(order)
    if(shapes.some(s=>JSON.stringify(s.pointIds)===JSON.stringify(pointIds)))continue
    const boundary=pointIds.map((id,i)=>{const next=pointIds[(i+1)%pointIds.length],e=[...edges.values()].find(e=>(e.start_point_id===id&&e.end_point_id===next)||(e.end_point_id===id&&e.start_point_id===next))!;return {kind:'segment' as const,id:e.id,forward:e.start_point_id===id}})
    shapes.push({id:`contour:${boundary.map(e=>e.id).sort().join('/')}`,kind:kind(pointIds.length),pointIds,boundary})
  }
  return shapes
}

export const triangleContext = (g: GeometrySourceDataV1, ids: string[]) => ids.length===3 && new Set(ids).size===3
  ? geometryShapes(g).find(s=>s.kind==='triangle' && ids.every(id=>s.pointIds.includes(id)))??null : null
