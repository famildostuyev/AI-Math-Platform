import type { Editor } from '@tiptap/core'
import { redo, redoDepth, undo, undoDepth } from '@tiptap/pm/history'
import type { EditorHistoryProvider } from './universalEditorHistory'

const providers = new WeakMap<Editor, EditorHistoryProvider>()

export function getStructuredEditorHistory(editor: Editor): EditorHistoryProvider {
  const existing = providers.get(editor)
  if (existing) return existing
  const usable = () => !editor.isDestroyed && editor.isEditable
  const replay = (command: typeof undo) => {
    if (!usable()) return false
    const hadFocus = editor.view.dom.contains(document.activeElement)
    const applied = command(editor.state, editor.view.dispatch)
    // Undo can remove a focused inline atom. Keep focus in its editor so the
    // existing blur-save flow does not interpret replay as leaving the region.
    if (hadFocus && !editor.view.dom.contains(document.activeElement)) editor.view.focus()
    return applied
  }
  const provider: EditorHistoryProvider = {
    undo: () => replay(undo),
    redo: () => replay(redo),
    getSnapshot: () => usable() ? (undoDepth(editor.state) ? 1 : 0) | (redoDepth(editor.state) ? 2 : 0) : 0,
    subscribe: (listener) => {
      editor.on('transaction', listener)
      editor.on('update', listener)
      editor.on('destroy', listener)
      return () => {
        editor.off('transaction', listener)
        editor.off('update', listener)
        editor.off('destroy', listener)
      }
    },
  }
  providers.set(editor, provider)
  return provider
}
