/** M0 semantic data only. Renderer objects and transient editing state are excluded. */
export type Geometry3DId = string
export type Vec3 = [number, number, number]
export type Vec2 = [number, number]
export type GeometryCamera3D = {
  projection: 'orthographic' | 'perspective'
  position: Vec3; target: Vec3; up: Vec3
  vertical_span: number; fov_degrees: number; near: number; far: number
}
/** Session-only; orbit/pan/zoom never enter persisted geometry history. */
export type GeometryEditingState3D = { camera: GeometryCamera3D }
/** Transient transaction report; never a substitute for a valid persisted graph. */
export type GeometryAttachmentLoss3D = {
  subject_id: Geometry3DId; parent_id: Geometry3DId
  reason: 'parent_deleted' | 'feature_removed' | 'invalid_parent'
  preserved_world_position: Vec3 | null
}
export type GeometryPoint3D = { id: Geometry3DId; position: Vec3; label: string | null }
export type GeometryLinear3D = { id: Geometry3DId; kind: 'line' | 'ray' | 'segment' | 'vector'; a: Geometry3DId; b: Geometry3DId }
export type GeometryPlane3D = { id: Geometry3DId; point_ids: [Geometry3DId, Geometry3DId, Geometry3DId] }
export type GeometryEdge3D = { id: Geometry3DId; start: Geometry3DId; end: Geometry3DId }
export type GeometryFace3D = { id: Geometry3DId; boundary: Geometry3DId[] }
export type GeometrySurface3D = { id: Geometry3DId; kind: 'sphere' | 'cylinder' | 'cone' | 'frustum'; solid_id: Geometry3DId; slot: Geometry3DId }
export type GeometrySolidParameters3D = {
  cube: { side: number }
  cuboid: { width: number; depth: number; height: number }
  prism: { sides: number; radius: number; height: number }
  pyramid: { sides: number; radius: number; height: number }
  truncated_pyramid: { sides: number; bottom_radius: number; top_radius: number; height: number }
  regular_polyhedron: { family: 'tetrahedron' | 'cube' | 'octahedron' | 'dodecahedron' | 'icosahedron'; edge_length: number }
  cylinder: { radius: number; height: number }
  cone: { radius: number; height: number }
  frustum: { bottom_radius: number; top_radius: number; height: number }
  sphere: { radius: number }
}
export type GeometryParametricSolid3D = {
  [K in keyof GeometrySolidParameters3D]: {
    id: Geometry3DId; kind: K; mode: 'parametric'
    frame: { origin: Vec3; x_axis: Vec3; y_axis: Vec3 }
    parameters: GeometrySolidParameters3D[K]
    features: { slot: Geometry3DId; entity_id: Geometry3DId }[]
  }
}[keyof GeometrySolidParameters3D]
export type GeometrySolid3D = GeometryParametricSolid3D | {
  id: Geometry3DId; kind: 'polyhedron'; mode: 'freeform'
  point_ids: Geometry3DId[]; edge_ids: Geometry3DId[]; face_ids: Geometry3DId[]
}
export type GeometryConstruction3D = { id: Geometry3DId; output_point_id: Geometry3DId } & (
  | { kind: 'midpoint'; a: Geometry3DId; b: Geometry3DId }
  | { kind: 'point_on_linear'; linear_id: Geometry3DId; t: number }
  | { kind: 'point_on_edge'; edge_id: Geometry3DId; t: number }
  | { kind: 'point_on_face'; face_id: Geometry3DId; uv: Vec2 }
  | { kind: 'point_on_surface'; surface_id: Geometry3DId; uv: Vec2 }
)
export type GeometryAnchor3D =
  | { kind: 'world'; position: Vec3 }
  | { kind: 'point'; point_id: Geometry3DId }
  | { kind: 'edge'; edge_id: Geometry3DId; t: number }
  | { kind: 'face'; face_id: Geometry3DId; uv: Vec2 }
  | { kind: 'surface'; surface_id: Geometry3DId; uv: Vec2 }
export type GeometryAnnotation3D = { id: Geometry3DId; content: string; format: 'text' | 'latex'; anchor: GeometryAnchor3D; offset_mm: Vec2 }
export type GeometryMarking3D = { id: Geometry3DId; kind: 'length' | 'angle' | 'right_angle' | 'equal_length'; point_ids: Geometry3DId[]; label: string | null }
export type GeometryScene3D = {
  schema_version: 2; dimension: 3; description: string
  points: GeometryPoint3D[]; linear_objects: GeometryLinear3D[]; planes: GeometryPlane3D[]
  edges: GeometryEdge3D[]; faces: GeometryFace3D[]; surfaces: GeometrySurface3D[]; solids: GeometrySolid3D[]
  constructions: GeometryConstruction3D[]; annotations: GeometryAnnotation3D[]; markings: GeometryMarking3D[]
  print_camera: GeometryCamera3D
}
