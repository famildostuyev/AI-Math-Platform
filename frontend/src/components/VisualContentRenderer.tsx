import type { GeometryBlockRead } from '../api/questionEditor'
import GeometryRenderer from './GeometryRenderer'
import { normalizeGeometrySourceDataV1 } from './geometryV1'

type VisualContentRendererProps = { block: GeometryBlockRead }

export default function VisualContentRenderer({ block }: VisualContentRendererProps) {
  const geometry = normalizeGeometrySourceDataV1(block.payload.source_data)
  if (geometry === null) {
    return <p className="visual-content-unsupported" role="status">
      Bu köhnə və ya dəstəklənməyən həndəsə formatıdır. Təhlükəsizliyə görə vizual kimi göstərilmir.
    </p>
  }
  return <GeometryRenderer geometry={geometry} blockId={block.id} />
}
