import type { GeometrySourceDataV1, JsonObject } from '../api/questionEditor'
import type { GeometryScene3D } from './geometry3dContract'
import { normalizeGeometrySourceDataV1 } from './geometryV1'
import { normalizeGeometryScene3D } from './geometry3d'

/** M0 version boundary. UI/render dispatch remains disabled until M1/M2. */
export function normalizeGeometrySourceData(value: JsonObject): GeometrySourceDataV1 | GeometryScene3D | null {
  if (value.schema_version === 1) return normalizeGeometrySourceDataV1(value)
  if (value.schema_version === 2) return normalizeGeometryScene3D(value)
  return null
}
