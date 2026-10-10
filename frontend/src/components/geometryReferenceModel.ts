import type { GeometrySourceDataV1 } from '../api/questionEditor'

// Visible mathematical roles promote the existing identity; legacy points stay unchanged.
export function promoteGeometryPoints(g: GeometrySourceDataV1, pointIds: string[]): GeometrySourceDataV1 {
  const ids = new Set(pointIds)
  if (!g.points.some(p => ids.has(p.id) && p.role === 'implicit')) return g
  return { ...g, points: g.points.map(p => ids.has(p.id) && p.role === 'implicit' ? { ...p, role: 'explicit' } : p) }
}

export function referencedPointIds(g: GeometrySourceDataV1): Set<string> {
  const ids = new Set<string>()
  for (const edge of [...g.segments, ...(g.lines ?? [])]) { ids.add(edge.start_point_id); ids.add(edge.end_point_id) }
  for (const boundary of [...g.polygons, ...(g.polylines ?? [])]) boundary.point_ids.forEach(id => ids.add(id))
  for (const object of [...(g.circles ?? []), ...(g.arcs ?? [])]) ids.add(object.center_point_id)
  for (const c of g.constructions ?? []) {
    if(c.kind==='point_on_segment'||c.kind==='point_on_line') {
      ids.add(c.output_point_id)
      if(c.parent.kind==='polygon_edge'){ids.add(c.parent.start_point_id);ids.add(c.parent.end_point_id)}
      continue
    }
    if(c.kind==='midpoint'||c.kind==='angle_bisector'||c.kind==='altitude')c.source_point_ids.forEach(id=>ids.add(id))
    if(c.kind==='midpoint'||c.kind==='intersection')ids.add(c.output_point_id)
    else if(c.kind==='median'){ids.add(c.vertex_point_id);ids.add(c.midpoint_point_id)}
    else if(c.kind==='altitude')ids.add(c.foot_point_id)
    else {ids.add(c.support_point_id);if(c.kind==='angle_bisector'){if(c.intersection_point_id)ids.add(c.intersection_point_id)}else ids.add(c.through_point_id)}
  }
  return ids
}

// Implicit anchors are reference-owned, never exclusive-owned: surviving
// primitives or recipes keep them alive even after their creator is deleted.
export function cleanupImplicitAnchors(g: GeometrySourceDataV1): GeometrySourceDataV1 {
  const referenced=referencedPointIds(g)
  return { ...g, points:g.points.filter(p=>p.role!=='implicit'||referenced.has(p.id)) }
}
