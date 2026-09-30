import { Extension, Mark, Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { closeHistory, history } from '@tiptap/pm/history'
import { getStructuredEditorHistory } from './structuredEditorHistory'
import { FONT_STACKS, fontSizePoints, validFontFamily, validFontSize, validTextColor } from './structuredTextTypography'
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useRef } from 'react'
import type {
  StructuredContinuousTextActiveState,
  StructuredContinuousTextCommands,
  RestrictedTiptapDocument,
  StructuredContinuousTextEditorState,
} from './structuredContinuousTextEditorModel'
import {
  createStructuredContinuousTextCommands,
  readStructuredContinuousTextActiveState,
} from './structuredContinuousTextEditorCommands'
import {
  structuredTextDocumentToTiptap,
  tiptapToStructuredTextDocument,
} from './structuredTextTiptapAdapter'
import InlineMathNodeView from './InlineMathNodeView'
import { traceContext } from './universalContextTrace'
import { FORMULA_CLIPBOARD_MIME, FORMULA_WEB_CLIPBOARD_MIME, parseFormulaClipboard, parseFormulaClipboardHtml, writeFormulaClipboard } from './formulaClipboard'

type StructuredContinuousTextEditorProps = {
  initialState: StructuredContinuousTextEditorState
  onChange: (state: StructuredContinuousTextEditorState) => void
  disabled?: boolean
  ariaLabel?: string
  onCommandsReady?: (commands: StructuredContinuousTextCommands | null) => void
  onActiveStateChange?: (state: StructuredContinuousTextActiveState) => void
}

const DocumentNode = Node.create({
  name: 'document',
  topNode: true,
  content: '(paragraph | bullet_list | ordered_list)*',
})

const ParagraphNode = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  addAttributes() {
    return { alignment: { default: null } }
  },
  renderHTML({ HTMLAttributes }) {
    const alignment = typeof HTMLAttributes.alignment === 'string'
      ? HTMLAttributes.alignment
      : undefined
    return ['p', alignment ? { 'data-alignment': alignment } : {}, 0]
  },
})

const TextNode = Node.create({ name: 'text', group: 'inline' })

const HardBreakNode = Node.create({
  name: 'hard_break',
  inline: true,
  group: 'inline',
  selectable: false,
  renderHTML: () => ['br'],
})

const ListItemNode = Node.create({
  name: 'list_item',
  content: 'paragraph+',
  defining: true,
  renderHTML: () => ['li', 0],
})

const BulletListNode = Node.create({
  name: 'bullet_list',
  group: 'block',
  content: 'list_item*',
  renderHTML: () => ['ul', 0],
})

const OrderedListNode = Node.create({
  name: 'ordered_list',
  group: 'block',
  content: 'list_item*',
  renderHTML: () => ['ol', 0],
})

const BoldMark = Mark.create({
  name: 'bold',
  renderHTML: ({ HTMLAttributes }) => ['strong', mergeAttributes(HTMLAttributes), 0],
})

const ItalicMark = Mark.create({
  name: 'italic',
  renderHTML: ({ HTMLAttributes }) => ['em', mergeAttributes(HTMLAttributes), 0],
})

const UnderlineMark = Mark.create({
  name: 'underline',
  renderHTML: ({ HTMLAttributes }) => ['u', mergeAttributes(HTMLAttributes), 0],
})

function tokenMark(name: 'font_family' | 'font_size' | 'foreground_color' | 'background_color') {
  return Mark.create({
    name,
    addAttributes: () => ({ value: { default: null } }),
    renderHTML: ({ HTMLAttributes }) => {
      const value: unknown = HTMLAttributes.value
      const style = name === 'font_family' && validFontFamily(value) ? `font-family: ${FONT_STACKS[value]}`
        : name === 'font_size' && validFontSize(value) ? `font-size: ${fontSizePoints(value)}pt`
          : name === 'foreground_color' && validTextColor(value) ? `color: ${value}`
            : name === 'background_color' && validTextColor(value) ? `background-color: ${value}` : ''
      return ['span', style ? { [`data-${name.replace('_', '-')}`]: String(value), style } : {}, 0]
    },
  })
}

const InlineMathNode = Node.create({
  name: 'inline_math',
  inline: true,
  atom: true,
  selectable: true,
  group: 'inline',
  addAttributes: () => ({ latex: { default: '' } }),
  renderHTML: ({ HTMLAttributes }) => [
    'span',
    { 'data-inline-math': '', 'data-latex': String(HTMLAttributes.latex ?? '') },
  ],
  addNodeView: () => ReactNodeViewRenderer(InlineMathNodeView, { as: 'span' }),
})

function deleteAdjacentInlineMath(editor: Editor, direction: 'before' | 'after'): boolean {
  const { selection } = editor.state
  if (!selection.empty) return false

  const adjacentNode = direction === 'before' ? selection.$from.nodeBefore : selection.$from.nodeAfter
  if (adjacentNode?.type.name !== 'inline_math') return false

  const from = direction === 'before'
    ? selection.from - adjacentNode.nodeSize
    : selection.from
  editor.view.dispatch(editor.state.tr.delete(from, from + adjacentNode.nodeSize))
  return true
}

function transferSelectedInlineMath(view: EditorView, event: Event, cut: boolean): boolean {
  const selection = view.state.selection
  const selectedNode = selection instanceof NodeSelection
    ? selection.node
    : selection.to - selection.from === 1 ? view.state.doc.nodeAt(selection.from) : null
  if (selectedNode?.type.name !== 'inline_math') return false
  const clipboard = (event as ClipboardEvent).clipboardData
  const latex = selectedNode.attrs.latex
  if (!clipboard || typeof latex !== 'string' || !writeFormulaClipboard(clipboard, latex)) return false
  event.preventDefault()
  if (cut && view.editable) view.dispatch(closeHistory(view.state.tr.deleteSelection()))
  return true
}

const RestrictedKeyboardBehavior = Extension.create({
  name: 'restricted_keyboard_behavior',
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem('list_item')
        || this.editor.commands.splitBlock(),
      'Shift-Enter': () => this.editor.commands.insertContent({ type: 'hard_break' }),
      Backspace: () => deleteAdjacentInlineMath(this.editor, 'before')
        || this.editor.commands.joinBackward(),
      Delete: () => deleteAdjacentInlineMath(this.editor, 'after')
        || this.editor.commands.joinForward(),
      Tab: () => true,
      'Shift-Tab': () => true,
    }
  },
})

const StructuredEditingHistory = Extension.create({
  name: 'structured_editing_history',
  addProseMirrorPlugins: () => [history()],
  addKeyboardShortcuts() {
    const provider = getStructuredEditorHistory(this.editor)
    return { 'Mod-z': provider.undo, 'Mod-y': provider.redo, 'Mod-Shift-z': provider.redo }
  },
})

const RESTRICTED_STRUCTURED_TEXT_EXTENSIONS = [
  DocumentNode,
  ParagraphNode,
  TextNode,
  HardBreakNode,
  ListItemNode,
  BulletListNode,
  OrderedListNode,
  BoldMark,
  ItalicMark,
  UnderlineMark,
  tokenMark('font_family'),
  tokenMark('font_size'),
  tokenMark('foreground_color'),
  tokenMark('background_color'),
  InlineMathNode,
  RestrictedKeyboardBehavior,
  StructuredEditingHistory,
]

function asRestrictedDocument(document: JSONContent): RestrictedTiptapDocument {
  return document as RestrictedTiptapDocument
}

function validatedEditorState(document: JSONContent): StructuredContinuousTextEditorState {
  const canonical = tiptapToStructuredTextDocument(asRestrictedDocument(document))
  return structuredTextDocumentToTiptap(canonical)
}

export default function StructuredContinuousTextEditor({
  initialState,
  onChange,
  disabled = false,
  ariaLabel = 'Strukturlaşdırılmış mətn redaktoru',
  onCommandsReady,
  onActiveStateChange,
}: StructuredContinuousTextEditorProps) {
  const onChangeRef = useRef(onChange)
  const onActiveStateChangeRef = useRef(onActiveStateChange)
  useEffect(() => {
    onChangeRef.current = onChange
    onActiveStateChangeRef.current = onActiveStateChange
  }, [onActiveStateChange, onChange])

  const editor = useEditor({
    extensions: RESTRICTED_STRUCTURED_TEXT_EXTENSIONS,
    content: initialState.document,
    editable: !disabled,
    immediatelyRender: true,
    onFocus: ({ editor: focusedEditor }) => traceContext('prosemirror-focus', { editable: focusedEditor.isEditable }),
    onBlur: ({ editor: blurredEditor }) => traceContext('prosemirror-blur', { editable: blurredEditor.isEditable }),
    editorProps: {
      attributes: { 'aria-label': ariaLabel },
      handleDOMEvents: {
        copy: (view, event) => transferSelectedInlineMath(view, event, false),
        cut: (view, event) => transferSelectedInlineMath(view, event, true),
      },
      handlePaste(view, event) {
        const clipboard = event.clipboardData
        const customType = clipboard && [FORMULA_CLIPBOARD_MIME, FORMULA_WEB_CLIPBOARD_MIME].find((type) => Array.from(clipboard.types).includes(type))
        const html = clipboard?.getData('text/html') ?? ''
        if (clipboard && (customType || html.includes('data-universal-editor-inline-math'))) {
          const payload = customType ? parseFormulaClipboard(clipboard.getData(customType)) : parseFormulaClipboardHtml(html)
          event.preventDefault()
          if (!payload || !view.editable) return true
          view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.inline_math.create({ latex: payload.latex })))
          const position = view.state.selection.from - 1
          const focusInsertedFormula = (remainingFrames: number) => {
            const node = view.nodeDOM(position)
            const field = node instanceof HTMLElement
              ? (node.matches('math-field') ? node : node.querySelector<HTMLElement>('math-field')) : null
            if (field) field.focus()
            else if (remainingFrames > 0) requestAnimationFrame(() => focusInsertedFormula(remainingFrames - 1))
          }
          requestAnimationFrame(() => focusInsertedFormula(4))
          return true
        }
        const plainText = (event.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n')
        const lines = plainText.split('\n')
        if (lines.length === 1) {
          view.dispatch(view.state.tr.insertText(lines[0]))
          return true
        }
        const paragraphs = lines.map((line) => view.state.schema.nodes.paragraph.create(
          { alignment: null },
          line ? view.state.schema.text(line) : undefined,
        ))
        view.dispatch(view.state.tr.replaceSelection(Slice.maxOpen(Fragment.from(paragraphs))))
        return true
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onChangeRef.current(validatedEditorState(updatedEditor.getJSON()))
      onActiveStateChangeRef.current?.(readStructuredContinuousTextActiveState(updatedEditor))
    },
    onSelectionUpdate: ({ editor: updatedEditor }) => {
      const selection = updatedEditor.state.selection
      traceContext('prosemirror-selection-update', { editable: updatedEditor.isEditable, selectionCategory: selection.empty ? 'caret' : 'range', from: selection.from, to: selection.to, selectedNode: 'node' in selection })
      onActiveStateChangeRef.current?.(readStructuredContinuousTextActiveState(updatedEditor))
    },
  })

  const commands = useMemo(
    () => editor ? createStructuredContinuousTextCommands(editor) : null,
    [editor],
  )

  useEffect(() => {
    onCommandsReady?.(commands)
    if (commands) onActiveStateChangeRef.current?.(commands.getActiveState())
    return () => onCommandsReady?.(null)
  }, [commands, onCommandsReady])

  useEffect(() => {
    traceContext(disabled ? 'prosemirror-disabled' : 'prosemirror-editable', { editableBefore: editor?.isEditable ?? null })
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  return <EditorContent editor={editor} />
}
