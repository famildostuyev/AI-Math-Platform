import type {
  GeometrySourceDataV1,
  JsonObject,
  StructuredTextDocument,
  TextMark,
  UUID,
} from '../api/questionEditor'

export type UniversalLayoutMode = 'inline' | 'anchored' | 'floating'

export type UniversalVisualAnchor =
  | { kind: 'document' }
  | { kind: 'node'; nodeId: UUID }

export type UniversalVisualPosition = {
  x: number
  y: number
  unit: 'relative' | 'px'
}

export type UniversalVisualSize = {
  width: number
  height: number
  unit: 'relative' | 'px'
}

/**
 * Generic placement foundation. The versioned floating/px subset is persisted;
 * other optional capabilities remain runtime-only until their contracts exist.
 */
export type UniversalVisualPlacement = {
  version?: 1
  layoutMode?: UniversalLayoutMode
  anchor?: UniversalVisualAnchor
  position?: UniversalVisualPosition
  size?: UniversalVisualSize
  rotationDegrees?: number
  zOrder?: number
  locked?: boolean
  parentGroupId?: string
}

export type UniversalTextInline = {
  type: 'text'
  text: string
  marks: TextMark[]
}

export type UniversalInlineFormula = {
  type: 'inline_formula'
  latex: string
}

export type UniversalHardBreakInline = {
  type: 'hard_break'
}

export type UniversalInlineContent =
  | UniversalTextInline
  | UniversalInlineFormula
  | UniversalHardBreakInline

type UniversalNodeBase = {
  id: UUID
  order: number
}

export type UniversalParagraphNode = UniversalNodeBase & {
  type: 'paragraph'
  /** Lossless source representation; lists and multi-paragraph documents stay intact. */
  document: StructuredTextDocument
  /** Available only when the source is exactly one paragraph. No math guessing occurs. */
  inlineContent: UniversalInlineContent[] | null
}

export type UniversalDisplayFormulaNode = UniversalNodeBase & {
  type: 'display_formula'
  latex: string
}

type UniversalVisualNodeBase = UniversalNodeBase & {
  placement?: UniversalVisualPlacement
}

export type UniversalGeometryNode = UniversalVisualNodeBase & {
  type: 'geometry'
  /** Complete original payload remains available for lossless legacy handling. */
  sourceData: JsonObject
  geometryV1: GeometrySourceDataV1 | null
}

export type UniversalImageNode = UniversalVisualNodeBase & {
  type: 'image'
  mediaAssetId: UUID
  altText: string | null
}

export type UniversalGraphNode = UniversalVisualNodeBase & {
  type: 'graph'
  sourcePayload: unknown
}

export type UniversalTableNode = UniversalVisualNodeBase & {
  type: 'table'
  sourcePayload: unknown
}

export type UniversalDiagramNode = UniversalVisualNodeBase & {
  type: 'diagram'
  sourcePayload: unknown
}

export type UniversalUnsupportedNode = UniversalNodeBase & {
  type: 'unsupported'
  blockType: string
  sourcePayload: unknown
}

export type UniversalDocumentNode =
  | UniversalParagraphNode
  | UniversalDisplayFormulaNode
  | UniversalGeometryNode
  | UniversalImageNode
  | UniversalGraphNode
  | UniversalTableNode
  | UniversalDiagramNode
  | UniversalUnsupportedNode

export type UniversalEditorDocument = {
  version: 1
  nodes: UniversalDocumentNode[]
}

export function universalDocumentNodeLabel(node: UniversalDocumentNode): string {
  const labels: Record<UniversalDocumentNode['type'], string> = {
    paragraph: 'Mətn',
    display_formula: 'Düstur',
    geometry: 'Həndəsə',
    image: 'Şəkil',
    graph: 'Qrafik',
    table: 'Cədvəl',
    diagram: 'Diaqram',
    unsupported: 'Dəstəklənməyən məzmun',
  }
  return labels[node.type]
}

/**
 * Marker for the future reverse adapter. Persistence intentionally remains with
 * the existing ContentBlock CRUD services until a lossless serializer exists.
 */
export interface UniversalDocumentPersistenceBoundary {
  readonly mode: 'existing_content_block_crud'
  readonly document: UniversalEditorDocument
}
