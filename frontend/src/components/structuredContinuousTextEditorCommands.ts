import type { Editor } from '@tiptap/core'
import { getStructuredEditorHistory } from './structuredEditorHistory.ts'
import type {
  StructuredContinuousTextActiveState,
  StructuredTextAlignment,
  StructuredContinuousTextCommands,
  StructuredTextFontFamily,
  StructuredTextFontSize,
} from './structuredContinuousTextEditorModel'
import { validFontFamily, validFontSize, validTextColor } from './structuredTextTypography.ts'

const ALIGNMENTS = new Set<StructuredTextAlignment>(['start', 'center', 'end', 'justify'])

function activeToken<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback
}

export function readStructuredContinuousTextActiveState(
  editor: Editor,
): StructuredContinuousTextActiveState {
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    fontFamily: validFontFamily(editor.getAttributes('font_family').value) ? editor.getAttributes('font_family').value as StructuredTextFontFamily : 'default',
    fontSize: validFontSize(editor.getAttributes('font_size').value) ? editor.getAttributes('font_size').value as StructuredTextFontSize : 'normal',
    foregroundColor: validTextColor(editor.getAttributes('foreground_color').value) ? editor.getAttributes('foreground_color').value as string : null,
    backgroundColor: validTextColor(editor.getAttributes('background_color').value) ? editor.getAttributes('background_color').value as string : null,
    alignment: activeToken(editor.getAttributes('paragraph').alignment, ALIGNMENTS, 'start'),
    bulletList: editor.isActive('bullet_list'),
    orderedList: editor.isActive('ordered_list'),
  }
}

export function createStructuredContinuousTextCommands(
  editor: Editor,
): StructuredContinuousTextCommands {
  return {
    history: getStructuredEditorHistory(editor),
    isValid: () => !editor.isDestroyed && editor.isEditable,
    getSelection: () => ({ from: editor.state.selection.from, to: editor.state.selection.to }),
    restoreSelection: (selection) => {
      if (editor.isDestroyed || !editor.isEditable) return false
      const end = editor.state.doc.content.size
      return editor.commands.setTextSelection({ from: Math.min(selection.from, end), to: Math.min(selection.to, end) })
    },
    focus: () => editor.commands.focus(),
    toggleBold: () => editor.chain().focus().toggleMark('bold').run(),
    toggleItalic: () => editor.chain().focus().toggleMark('italic').run(),
    toggleUnderline: () => editor.chain().focus().toggleMark('underline').run(),
    setFontFamily: (value) => validFontFamily(value) && editor.chain().focus().setMark('font_family', { value }).run(),
    setFontSize: (value) => validFontSize(value) && editor.chain().focus().setMark('font_size', { value }).run(),
    setColor: (kind, value) => {
      const name = kind === 'foreground' ? 'foreground_color' : 'background_color'
      if (value === null) return editor.chain().focus().unsetMark(name).run()
      return validTextColor(value) && editor.chain().focus().setMark(name, { value }).run()
    },
    setAlignment: (value) => editor.chain().focus().updateAttributes('paragraph', { alignment: value }).run(),
    toggleBulletList: () => editor.chain().focus().toggleList('bullet_list', 'list_item').run(),
    toggleOrderedList: () => editor.chain().focus().toggleList('ordered_list', 'list_item').run(),
    insertHardBreak: () => editor.chain().focus().insertContent({ type: 'hard_break' }).run(),
    insertText: (value) => editor.chain().focus().insertContent(value).run(),
    insertInlineMath: (latex, onReady) => {
      const existingFields = new Set(editor.view?.dom?.querySelectorAll('math-field') ?? [])
      const inserted = editor.chain().focus().insertContent({
        type: 'inline_math',
        attrs: { latex },
      }).run()
      if (inserted && editor.view) {
        const focusInsertedFormula = (remainingFrames: number) => requestAnimationFrame(() => {
          if (editor.isDestroyed) return
          const field = [...editor.view.dom.querySelectorAll<HTMLElement>('math-field')]
            .find((candidate) => !existingFields.has(candidate)) ?? null
          if (field) {
            field.focus()
            onReady?.(field)
          }
          else if (remainingFrames > 0) focusInsertedFormula(remainingFrames - 1)
        })
        focusInsertedFormula(8)
      }
      return inserted
    },
    getActiveState: () => readStructuredContinuousTextActiveState(editor),
  }
}
