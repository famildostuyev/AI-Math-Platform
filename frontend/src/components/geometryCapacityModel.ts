import type { GeometrySourceDataV1 } from '../api/questionEditor'

export const GEOMETRY_COLLECTION_LIMITS = Object.freeze({
  points: 500, segments: 1000, polygons: 200, texts: 500,
  lines: 1000, polylines: 200, circles: 200, arcs: 200,
})

const collections = ['points', 'segments', 'polygons', 'texts', 'lines', 'polylines', 'circles', 'arcs'] as const
export type GeometryAllocation = Partial<Record<typeof collections[number], number>>

export function canAllocateGeometry(geometry: GeometrySourceDataV1, delta: GeometryAllocation): boolean {
  if (Reflect.ownKeys(delta).some(key => Object.prototype.propertyIsEnumerable.call(delta, key)
    && !Object.hasOwn(GEOMETRY_COLLECTION_LIMITS, key))) return false
  return collections.every(collection => {
    const required = delta[collection]
    return required === undefined || (Number.isSafeInteger(required) && required >= 0
      && (geometry[collection]?.length ?? 0) + required <= GEOMETRY_COLLECTION_LIMITS[collection])
  })
}
