import type {
  ContentBlockRead,
  GeometryBlockRead,
  ImageBlockRead,
  JsonValue,
  StructuredTextDocument,
  TextBlockRead,
  FormulaBlockRead,
  UUID,
} from '../api/questionEditor'
import { normalizeGeometrySourceDataV1 } from './geometryV1'
import type {
  UniversalDocumentNode,
  UniversalEditorDocument,
  UniversalInlineContent,
} from './universalEditorDocument'

export type ReservedContentBlockRead = {
  id: UUID
  block_type: 'graph' | 'table' | 'diagram'
  sort_order: number
  payload: JsonValue
}

export type UnsupportedContentBlockRead = {
  id: UUID
  block_type: string
  sort_order: number
  payload: unknown
}

export type UniversalDocumentAdapterBlock =
  | ContentBlockRead
  | ReservedContentBlockRead
  | UnsupportedContentBlockRead

function paragraphInlineContent(document: StructuredTextDocument): UniversalInlineContent[] | null {
  if (document.content.length !== 1 || document.content[0].type !== 'paragraph') return null
  return document.content[0].content.map((inline): UniversalInlineContent => {
    if (inline.type === 'text') return { type: 'text', text: inline.text, marks: inline.marks }
    if (inline.type === 'inline_math') return { type: 'inline_formula', latex: inline.latex }
    return { type: 'hard_break' }
  })
}

function adaptBlock(block: UniversalDocumentAdapterBlock): UniversalDocumentNode {
  const base = { id: block.id, order: block.sort_order }
  switch (block.block_type) {
    case 'text': {
      const textBlock = block as TextBlockRead
      return {
        ...base,
        type: 'paragraph',
        document: textBlock.payload.document,
        inlineContent: paragraphInlineContent(textBlock.payload.document),
      }
    }
    case 'formula': {
      const formulaBlock = block as FormulaBlockRead
      return { ...base, type: 'display_formula', latex: formulaBlock.payload.source_latex }
    }
    case 'image': {
      const imageBlock = block as ImageBlockRead
      return {
        ...base,
        type: 'image',
        placement: imageBlock.visual_placement ?? undefined,
        mediaAssetId: imageBlock.payload.media_asset_id,
        altText: imageBlock.payload.alt_text,
      }
    }
    case 'geometry': {
      const geometryBlock = block as GeometryBlockRead
      return {
        ...base,
        type: 'geometry',
        placement: geometryBlock.visual_placement ?? undefined,
        sourceData: geometryBlock.payload.source_data,
        geometryV1: normalizeGeometrySourceDataV1(geometryBlock.payload.source_data),
      }
    }
    case 'graph':
      return { ...base, type: 'graph', sourcePayload: block.payload }
    case 'table':
      return { ...base, type: 'table', sourcePayload: block.payload }
    case 'diagram':
      return { ...base, type: 'diagram', sourcePayload: block.payload }
    default:
      return { ...base, type: 'unsupported', blockType: block.block_type, sourcePayload: block.payload }
  }
}

/** Pure, deterministic, order-preserving API block to editor document adapter. */
export function adaptContentBlocksToUniversalDocument(
  blocks: readonly UniversalDocumentAdapterBlock[],
): UniversalEditorDocument {
  return { version: 1, nodes: blocks.map(adaptBlock) }
}
