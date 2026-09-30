import type {
  InlineNode,
  ListItemNode,
  ParagraphNode,
  StructuredTextBlockNode,
  StructuredTextDocument,
  TextMark,
  TextNode,
} from '../api/questionEditor'
import type {
  RestrictedInlineNode,
  RestrictedListItemNode,
  RestrictedListNode,
  RestrictedParagraphNode,
  RestrictedTextMark,
  RestrictedTiptapDocument,
  StructuredContinuousTextDocumentAdapter,
  StructuredContinuousTextEditorState,
} from './structuredContinuousTextEditorModel'
import { validFontFamily, validFontSize, validTextColor } from './structuredTextTypography.ts'

type JsonRecord = Record<string, unknown>

const MARK_ORDER = ['bold', 'italic', 'underline', 'font_family', 'font_size', 'foreground_color', 'background_color'] as const
const ALIGNMENTS = new Set(['start', 'center', 'end', 'justify'])

export class StructuredTextAdapterError extends Error {
  readonly path: string

  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`)
    this.name = 'StructuredTextAdapterError'
    this.path = path
  }
}

function fail(path: string, detail: string): never {
  throw new StructuredTextAdapterError(path, detail)
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'Expected an object.')
  }
  return value as JsonRecord
}

function exactKeys(value: JsonRecord, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) fail(`${path}.${unknown[0]}`, 'Unsupported attribute or field.')
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'Expected an array.')
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'Expected a string.')
  return value
}

function canonicalMarkToTiptap(mark: TextMark, path: string): RestrictedTextMark {
  const raw = record(mark, path)
  if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'underline') {
    exactKeys(raw, ['type'], path)
    return { type: mark.type }
  }
  exactKeys(raw, ['type', 'value'], path)
  if (mark.type === 'font_family' && validFontFamily(mark.value)) return { type: 'font_family', attrs: { value: mark.value } }
  if (mark.type === 'font_size' && validFontSize(mark.value)) return { type: 'font_size', attrs: { value: mark.value } }
  if ((mark.type === 'foreground_color' || mark.type === 'background_color') && validTextColor(mark.value)) return { type: mark.type, attrs: { value: mark.value } }
  return fail(`${path}.value`, 'Unsupported formatting value.')
}

function normalizeCanonicalMarks(marks: TextMark[], path: string): RestrictedTextMark[] {
  const byType = new Map<TextMark['type'], TextMark>()
  marks.forEach((mark, index) => {
    if (byType.has(mark.type)) fail(`${path}[${index}]`, `Duplicate mark type: ${mark.type}.`)
    byType.set(mark.type, mark)
  })
  return MARK_ORDER.flatMap((type) => {
    const mark = byType.get(type)
    return mark ? [canonicalMarkToTiptap(mark, `${path}.${type}`)] : []
  })
}

function canonicalInlineToTiptap(node: InlineNode, path: string): RestrictedInlineNode {
  if (node.type === 'text') {
    return {
      type: 'text',
      text: node.text,
      ...(node.marks.length > 0 ? { marks: normalizeCanonicalMarks(node.marks, `${path}.marks`) } : {}),
    }
  }
  if (node.type === 'inline_math') return { type: 'inline_math', attrs: { latex: node.latex } }
  return { type: 'hard_break' }
}

function canonicalParagraphToTiptap(node: ParagraphNode, path: string): RestrictedParagraphNode {
  const content = node.content.map((inline, index) => canonicalInlineToTiptap(inline, `${path}.content[${index}]`))
  return {
    type: 'paragraph',
    attrs: { alignment: node.attrs?.alignment ?? null },
    ...(content.length > 0 ? { content } : {}),
  }
}

function canonicalListItemToTiptap(node: ListItemNode, path: string): RestrictedListItemNode {
  return {
    type: 'list_item',
    content: node.content.map((paragraph, index) => canonicalParagraphToTiptap(paragraph, `${path}.content[${index}]`)),
  }
}

function canonicalBlockToTiptap(node: StructuredTextBlockNode, path: string): RestrictedParagraphNode | RestrictedListNode {
  if (node.type === 'paragraph') return canonicalParagraphToTiptap(node, path)
  const content = node.content.map((item, index) => canonicalListItemToTiptap(item, `${path}.content[${index}]`))
  return { type: node.type, ...(content.length > 0 ? { content } : {}) }
}

export function structuredTextDocumentToTiptap(
  document: StructuredTextDocument,
): StructuredContinuousTextEditorState {
  const content = document.content.map((block, index) => canonicalBlockToTiptap(block, `document.content[${index}]`))
  return {
    format: 'restricted-tiptap-v1',
    document: { type: 'document', ...(content.length > 0 ? { content } : {}) },
  }
}

function tiptapMarkToCanonical(value: unknown, path: string): TextMark {
  const mark = record(value, path)
  exactKeys(mark, ['type', 'attrs'], path)
  const type = string(mark.type, `${path}.type`)
  if (type === 'bold' || type === 'italic' || type === 'underline') {
    if ('attrs' in mark && mark.attrs !== undefined) fail(`${path}.attrs`, `Mark ${type} does not accept attributes.`)
    return { type }
  }
  if (type !== 'font_family' && type !== 'font_size' && type !== 'foreground_color' && type !== 'background_color') fail(`${path}.type`, `Unsupported mark type: ${type}.`)
  const attrs = record(mark.attrs, `${path}.attrs`)
  exactKeys(attrs, ['value'], `${path}.attrs`)
  if (type === 'font_family') {
    if (!validFontFamily(attrs.value)) fail(`${path}.attrs.value`, 'Unsupported font-family token.')
    return { type, value: attrs.value }
  }
  if (type === 'font_size') {
    if (!validFontSize(attrs.value)) fail(`${path}.attrs.value`, 'Unsupported font size.')
    return { type, value: attrs.value }
  }
  if (!validTextColor(attrs.value)) fail(`${path}.attrs.value`, 'Unsupported color.')
  return { type, value: attrs.value }
}

function normalizeTiptapMarks(value: unknown, path: string): TextMark[] {
  if (value === undefined) return []
  const byType = new Map<TextMark['type'], TextMark>()
  array(value, path).forEach((rawMark, index) => {
    const mark = tiptapMarkToCanonical(rawMark, `${path}[${index}]`)
    if (byType.has(mark.type)) fail(`${path}[${index}]`, `Duplicate mark type: ${mark.type}.`)
    byType.set(mark.type, mark)
  })
  return MARK_ORDER.flatMap((type) => {
    const mark = byType.get(type)
    return mark ? [mark] : []
  })
}

function tiptapInlineToCanonical(value: unknown, path: string): InlineNode {
  const node = record(value, path)
  const type = string(node.type, `${path}.type`)
  if (type === 'text') {
    exactKeys(node, ['type', 'text', 'marks'], path)
    return {
      type: 'text',
      text: string(node.text, `${path}.text`),
      marks: normalizeTiptapMarks(node.marks, `${path}.marks`),
    } satisfies TextNode
  }
  if (type === 'hard_break') {
    exactKeys(node, ['type'], path)
    return { type: 'hard_break' }
  }
  if (type === 'inline_math') {
    exactKeys(node, ['type', 'attrs'], path)
    const attrs = record(node.attrs, `${path}.attrs`)
    exactKeys(attrs, ['latex'], `${path}.attrs`)
    return { type: 'inline_math', latex: string(attrs.latex, `${path}.attrs.latex`) }
  }
  fail(`${path}.type`, `Unsupported inline node type: ${type}.`)
}

function tiptapParagraphToCanonical(value: unknown, path: string): ParagraphNode {
  const node = record(value, path)
  exactKeys(node, ['type', 'attrs', 'content'], path)
  if (node.type !== 'paragraph') fail(`${path}.type`, 'Expected paragraph.')
  let attrs: ParagraphNode['attrs'] = null
  if (node.attrs !== undefined) {
    const rawAttrs = record(node.attrs, `${path}.attrs`)
    exactKeys(rawAttrs, ['alignment'], `${path}.attrs`)
    if (rawAttrs.alignment !== null && rawAttrs.alignment !== undefined) {
      const alignment = string(rawAttrs.alignment, `${path}.attrs.alignment`)
      if (!ALIGNMENTS.has(alignment)) fail(`${path}.attrs.alignment`, `Unsupported alignment: ${alignment}.`)
      attrs = { alignment: alignment as NonNullable<ParagraphNode['attrs']>['alignment'] }
    }
  }
  const content = node.content === undefined
    ? []
    : array(node.content, `${path}.content`).map((inline, index) => tiptapInlineToCanonical(inline, `${path}.content[${index}]`))
  return { type: 'paragraph', attrs, content }
}

function tiptapListItemToCanonical(value: unknown, path: string): ListItemNode {
  const node = record(value, path)
  exactKeys(node, ['type', 'content'], path)
  if (node.type !== 'list_item') fail(`${path}.type`, 'Expected list_item.')
  const content = array(node.content, `${path}.content`)
  if (content.length === 0) fail(`${path}.content`, 'A list item requires at least one paragraph.')
  return {
    type: 'list_item',
    content: content.map((paragraph, index) => tiptapParagraphToCanonical(paragraph, `${path}.content[${index}]`)),
  }
}

function tiptapBlockToCanonical(value: unknown, path: string): StructuredTextBlockNode {
  const node = record(value, path)
  const type = string(node.type, `${path}.type`)
  if (type === 'paragraph') return tiptapParagraphToCanonical(node, path)
  if (type !== 'bullet_list' && type !== 'ordered_list') fail(`${path}.type`, `Unsupported block node type: ${type}.`)
  exactKeys(node, ['type', 'content'], path)
  const content = node.content === undefined
    ? []
    : array(node.content, `${path}.content`).map((item, index) => tiptapListItemToCanonical(item, `${path}.content[${index}]`))
  return { type, content }
}

export function tiptapToStructuredTextDocument(
  value: RestrictedTiptapDocument | unknown,
): StructuredTextDocument {
  const document = record(value, 'document')
  exactKeys(document, ['type', 'content'], 'document')
  if (document.type !== 'document') fail('document.type', 'Expected document.')
  const content = document.content === undefined
    ? []
    : array(document.content, 'document.content').map((block, index) => tiptapBlockToCanonical(block, `document.content[${index}]`))
  return { type: 'document', content }
}

export const structuredContinuousTextDocumentAdapter: StructuredContinuousTextDocumentAdapter = {
  toEditorState: structuredTextDocumentToTiptap,
  toCanonicalDocument: (state) => {
    const rawState = record(state, 'state')
    exactKeys(rawState, ['format', 'document'], 'state')
    if (rawState.format !== 'restricted-tiptap-v1') fail('state.format', 'Unsupported editor-state format.')
    return tiptapToStructuredTextDocument(rawState.document)
  },
}
