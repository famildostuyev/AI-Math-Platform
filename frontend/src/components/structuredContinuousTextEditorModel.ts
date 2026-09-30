import type { StructuredTextDocument } from '../api/questionEditor'

export type StructuredTextFontFamily = 'default' | 'serif' | 'sans' | 'math-compatible' | 'times-new-roman' | 'arial' | 'calibri' | 'cambria' | 'georgia' | 'verdana'
export type StructuredTextFontSize = 'small' | 'normal' | 'large' | 'x-large' | number
export type StructuredTextAlignment = 'start' | 'center' | 'end' | 'justify'

export type RestrictedTextMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'font_family'; attrs: { value: StructuredTextFontFamily } }
  | { type: 'font_size'; attrs: { value: StructuredTextFontSize } }
  | { type: 'foreground_color' | 'background_color'; attrs: { value: string } }

export type RestrictedTextNode = {
  type: 'text'
  text: string
  marks?: RestrictedTextMark[]
}

export type RestrictedInlineMathNode = {
  type: 'inline_math'
  attrs: { latex: string }
}

export type RestrictedHardBreakNode = { type: 'hard_break' }

export type RestrictedInlineNode =
  | RestrictedTextNode
  | RestrictedInlineMathNode
  | RestrictedHardBreakNode

export type RestrictedParagraphNode = {
  type: 'paragraph'
  attrs?: { alignment: StructuredTextAlignment | null }
  content?: RestrictedInlineNode[]
}

export type RestrictedListItemNode = {
  type: 'list_item'
  content: RestrictedParagraphNode[]
}

export type RestrictedListNode = {
  type: 'bullet_list' | 'ordered_list'
  content?: RestrictedListItemNode[]
}

export type RestrictedTiptapDocument = {
  type: 'document'
  content?: Array<RestrictedParagraphNode | RestrictedListNode>
}

export type StructuredContinuousTextEditorState = {
  format: 'restricted-tiptap-v1'
  document: RestrictedTiptapDocument
}

export type StructuredContinuousTextActiveState = {
  bold: boolean
  italic: boolean
  underline: boolean
  fontFamily: StructuredTextFontFamily
  fontSize: StructuredTextFontSize
  foregroundColor: string | null
  backgroundColor: string | null
  alignment: StructuredTextAlignment
  bulletList: boolean
  orderedList: boolean
}

export type StructuredContinuousTextCommands = {
  history: import('./universalEditorHistory').EditorHistoryProvider
  isValid: () => boolean
  getSelection: () => { from: number; to: number }
  restoreSelection: (selection: { from: number; to: number }) => boolean
  focus: () => boolean
  toggleBold: () => boolean
  toggleItalic: () => boolean
  toggleUnderline: () => boolean
  setFontFamily: (value: StructuredTextFontFamily) => boolean
  setFontSize: (value: StructuredTextFontSize) => boolean
  setColor: (kind: 'foreground' | 'background', value: string | null) => boolean
  setAlignment: (value: StructuredTextAlignment) => boolean
  toggleBulletList: () => boolean
  toggleOrderedList: () => boolean
  insertHardBreak: () => boolean
  insertText: (value: string) => boolean
  insertInlineMath: (latex: string, onReady?: (field: HTMLElement) => void) => boolean
  getActiveState: () => StructuredContinuousTextActiveState
}

/** Tiptap JSON remains editor state, not the canonical platform document. */
export interface StructuredContinuousTextDocumentAdapter {
  toEditorState(document: StructuredTextDocument): StructuredContinuousTextEditorState
  toCanonicalDocument(state: StructuredContinuousTextEditorState): StructuredTextDocument
}
