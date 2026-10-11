import type { GeometrySourceDataV1, JsonObject } from '../api/questionEditor'
import type { GeometryScene3D } from './geometry3dContract'
import { normalizeGeometrySourceDataV1 } from './geometryV1'
import { normalizeGeometryScene3D } from './geometry3d'

/** Version boundary: separate 2D V1 and semantic 3D V2; no implicit migration. */
export function normalizeGeometrySourceData(value: JsonObject): GeometrySourceDataV1 | GeometryScene3D | null {
  if (value.schema_version === 1) return normalizeGeometrySourceDataV1(value)
  if (value.schema_version === 2) return normalizeGeometryScene3D(value)
  return null
}
