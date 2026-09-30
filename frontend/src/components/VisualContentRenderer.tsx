import type { GeometryBlockRead } from '../api/questionEditor'
import GeometryRenderer from './GeometryRenderer'
import { normalizeGeometrySourceDataV1 } from './geometryV1'
import type { UniversalGeometryNode } from './universalEditorDocument'

type VisualContentRendererProps =
  | { block: GeometryBlockRead; node?: never }
  | { block?: never; node: UniversalGeometryNode }

export default function VisualContentRenderer(props: VisualContentRendererProps) {
  const blockId = props.block ? props.block.id : props.node.id
  const sourceData = props.block ? props.block.payload.source_data : props.node.sourceData
  const geometry = props.block
    ? normalizeGeometrySourceDataV1(sourceData)
    : props.node.geometryV1 ?? normalizeGeometrySourceDataV1(sourceData)
  if (geometry === null) {
    return <p className="visual-content-unsupported" role="status">
      Bu köhnə və ya dəstəklənməyən həndəsə formatıdır. Təhlükəsizliyə görə vizual kimi göstərilmir.
    </p>
  }
  const placement = props.block ? props.block.visual_placement : props.node.placement
  return <GeometryRenderer geometry={geometry} blockId={blockId} frameSize={placement?.size?.unit === 'px' ? placement.size : undefined} />
}
