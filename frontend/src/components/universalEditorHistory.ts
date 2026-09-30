import { useCallback, useState, useSyncExternalStore } from 'react'

export type EditorHistoryProvider = {
  undo: () => boolean
  redo: () => boolean
  // A primitive snapshot keeps useSyncExternalStore stable between transactions.
  getSnapshot: () => number
  subscribe: (listener: () => void) => () => void
}

const emptySnapshot = () => 0
const emptySubscribe = () => () => {}

export function useUniversalEditorHistory() {
  const [provider, setProvider] = useState<EditorHistoryProvider | null>(null)
  const activate = useCallback((next: EditorHistoryProvider | null) => setProvider(next), [])
  const unregister = useCallback((previous: EditorHistoryProvider) => {
    setProvider((current) => current === previous ? null : current)
  }, [])
  const availability = useSyncExternalStore(provider?.subscribe ?? emptySubscribe, provider?.getSnapshot ?? emptySnapshot, emptySnapshot)
  return {
    activate, unregister,
    canUndo: !!(availability & 1), canRedo: !!(availability & 2),
    undo: () => provider?.undo() ?? false,
    redo: () => provider?.redo() ?? false,
  }
}
