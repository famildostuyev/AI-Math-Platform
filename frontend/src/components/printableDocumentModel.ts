import katex from 'katex'
import type { StructuredTextDocument } from '../api/questionEditor'
import type { PrintableSnapshot } from './printableRevisionSnapshot'
import { adaptContentBlocksToUniversalDocument, type UniversalDocumentAdapterBlock } from './universalEditorDocumentAdapter'
import type { UniversalDocumentNode } from './universalEditorDocument'
import type { PersistedVisualPlacement } from './visualPlacement'
import { defaultGeometryPlacement } from './geometryFrameModel'
import { defaultGeometryScenePlacement3D } from './geometry3dModel'
import { geometrySceneSVG3D, scenePrimitives3D } from './geometry3dProjection'
import { validFontFamily, validFontSize, validTextColor } from './structuredTextTypography'

export type PrintableContentIssue = {
  revisionId: string
  blockId: string
  code: 'unsupported_block' | 'invalid_content' | 'unsupported_geometry' | 'unsupported_placement'
  message: string
}
export type PrintableBlock = {
  id: string
  scope: string
  node: UniversalDocumentNode | null
  placement?: PersistedVisualPlacement
  size?: { width: number; height: number }
  svg?: string
  issue?: PrintableContentIssue
}
export type PrintableDocumentPlan = {
  exportable: boolean
  issues: PrintableContentIssue[]
  revisions: { revisionId: string; blocks: PrintableBlock[]; minWidth: number; minHeight: number }[]
}

/** Injective, CSS/XML-safe encoding; caller supplies a distinct instanceId per mounted copy. */
export function printableSvgScope(instanceId: string): string {
  if (!instanceId) throw new Error('PrintableDocument requires a nonempty instanceId.')
  return `print_${Array.from(instanceId, character => character.codePointAt(0)!.toString(16)).join('_')}`
}

/** Applies only to trusted output of geometrySceneSVG3D, never arbitrary uploaded SVG. */
export function namespacePrintableSVG(svg: string, scope: string): string {
  const ids = new Map([...svg.matchAll(/\sid="([^"]+)"/g)].map(match => [match[1], `${scope}_${match[1]}`]))
  return svg.replace(/(\s)id="([^"]+)"/g, (_, space: string, id: string) => `${space}id="${ids.get(id)}"`)
    .replace(/url\(#([^)]+)\)/g, (reference: string, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : reference)
}

function validateMath(latex: string, displayMode: boolean) {
  if (typeof latex !== 'string') throw new Error('Invalid mathematical expression.')
  katex.renderToString(latex, { displayMode, output: 'htmlAndMathml', strict: 'warn', throwOnError: true, trust: false })
}

/** Reject unknown inline nodes and marks rather than silently dropping future content. */
function validateText(document: StructuredTextDocument) {
  if (document.type !== 'document' || !Array.isArray(document.content)) throw new Error('Invalid structured text document.')
  const paragraph = (node: StructuredTextDocument['content'][number]) => {
    if (node.type !== 'paragraph' || !Array.isArray(node.content)) throw new Error('Unsupported paragraph content.')
    if (node.attrs && !['start', 'center', 'end', 'justify'].includes(node.attrs.alignment)) throw new Error('Unsupported text alignment.')
    for (const inline of node.content) {
      if (inline.type === 'hard_break') continue
      if (inline.type === 'inline_math') { validateMath(inline.latex, false); continue }
      if (inline.type !== 'text' || typeof inline.text !== 'string' || !Array.isArray(inline.marks)) throw new Error('Unsupported inline content.')
      for (const mark of inline.marks) {
        if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'underline') continue
        if (mark.type === 'font_family' && validFontFamily(mark.value)) continue
        if (mark.type === 'font_size' && validFontSize(mark.value)) continue
        if ((mark.type === 'foreground_color' || mark.type === 'background_color') && validTextColor(mark.value)) continue
        throw new Error('Unsupported text formatting.')
      }
    }
  }
  for (const block of document.content) {
    if (block.type === 'paragraph') paragraph(block)
    else if ((block.type === 'ordered_list' || block.type === 'bullet_list') && Array.isArray(block.content)) {
      for (const item of block.content) {
        if (item.type !== 'list_item' || !Array.isArray(item.content)) throw new Error('Unsupported list content.')
        item.content.forEach(paragraph)
      }
    } else throw new Error('Unsupported structured text block.')
  }
}

function supportedPlacement(value: unknown): value is PersistedVisualPlacement {
  if (!value || typeof value !== 'object') return false
  const p = value as PersistedVisualPlacement
  return Object.keys(p).every(key => ['version', 'layoutMode', 'anchor', 'position', 'size'].includes(key))
    && p.version === 1 && p.layoutMode === 'floating' && p.anchor?.kind === 'document'
    && p.position?.unit === 'px' && p.size?.unit === 'px'
    && [p.position.x, p.position.y, p.size.width, p.size.height].every(Number.isFinite)
    && p.position.x >= 0 && p.position.y >= 0 && p.size.width > 0 && p.size.height > 0
}

/** Detached adapter view only: the immutable snapshot and persisted blocks are never rewritten. */
export function preparePrintableDocument(snapshot: PrintableSnapshot, instanceId: string): PrintableDocumentPlan {
  const scope = printableSvgScope(instanceId)
  const issues: PrintableContentIssue[] = []
  const revisions = snapshot.revisions.map((revision, revisionIndex) => {
    // The adapter's existing contract is mutable; give it an isolated canonical copy.
    const source = structuredClone(revision.blocks) as unknown as UniversalDocumentAdapterBlock[]
    source.sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    let minWidth = 0, minHeight = 0
    const blocks = source.map((block, index): PrintableBlock => {
      const result: PrintableBlock = { id: block.id, scope: `${scope}_r${revisionIndex}_b${index}`, node: null }
      let code: PrintableContentIssue['code'] = 'invalid_content'
      try {
        const node = adaptContentBlocksToUniversalDocument([block]).nodes[0]
        result.node = node
        if (node.type === 'paragraph') validateText(node.document)
        else if (node.type === 'display_formula') validateMath(node.latex, true)
        else if (node.type === 'geometry') {
          code = 'unsupported_geometry'
          if (!node.geometryV1 && !node.geometryV2) throw new Error('Geometry format is unsupported or invalid.')
          if (node.geometryV2 && scenePrimitives3D(node.geometryV2).status !== 'ok') throw new Error('Geometry evaluation is unsupported or invalid.')
          code = 'unsupported_placement'
          if (node.placement) {
            if (!supportedPlacement(node.placement)) throw new Error('Only saved document-relative floating pixel frames are supported.')
            result.placement = node.placement
          }
          result.size = result.placement?.size ?? (node.geometryV1
            ? defaultGeometryPlacement(node.geometryV1).size : defaultGeometryScenePlacement3D().size)
          code = 'unsupported_geometry'
          if (node.geometryV2) result.svg = namespacePrintableSVG(geometrySceneSVG3D(node.geometryV2, result.size.width, result.size.height), result.scope)
          minWidth = Math.max(minWidth, (result.placement?.position.x ?? 0) + result.size.width)
          if (result.placement) minHeight = Math.max(minHeight, result.placement.position.y + result.size.height)
        } else {
          code = 'unsupported_block'
          throw new Error(`Unsupported printable content: ${node.type === 'unsupported' ? node.blockType : node.type}.`)
        }
      } catch (error) {
        result.issue = { revisionId: revision.revision_id, blockId: block.id, code, message: error instanceof Error ? error.message : 'Content cannot be rendered.' }
        issues.push(result.issue)
      }
      return result
    })
    return { revisionId: revision.revision_id, blocks, minWidth, minHeight }
  })
  return { revisions, issues, exportable: issues.length === 0 }
}
