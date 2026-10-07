import type { GeometrySourceDataV1 } from '../api/questionEditor'
import type { EditorHistoryProvider } from './universalEditorHistory'
import { normalizeGeometrySourceDataV1 } from './geometryV1'

// At most 100 undoable committed operations per mounted geometry editing session.
export const GEOMETRY_HISTORY_LIMIT = 100

export function createGeometryHistory(initial: GeometrySourceDataV1, apply: (geometry: GeometrySourceDataV1) => void) {
  let snapshots = [structuredClone(initial)]
  let index = 0
  let group: string | undefined
  let enabled = true
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())
  const move = (offset: number) => {
    if (!enabled || index + offset < 0 || index + offset >= snapshots.length) return false
    index += offset; group = undefined
    apply(structuredClone(snapshots[index])); notify()
    return true
  }
  const provider: EditorHistoryProvider = {
    undo: () => move(-1), redo: () => move(1),
    getSnapshot: () => enabled ? (index > 0 ? 1 : 0) | (index < snapshots.length - 1 ? 2 : 0) : 0,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  return {
    provider,
    setEnabled(next: boolean) { if (enabled !== next) { enabled = next; notify() } },
    endGroup() { group = undefined },
    commit(next: GeometrySourceDataV1, editGroup?: string) {
      if (!enabled || JSON.stringify(next) === JSON.stringify(snapshots[index]) || !normalizeGeometrySourceDataV1(next)) return false
      const snapshot = structuredClone(next)
      const merge = editGroup !== undefined && editGroup === group && index === snapshots.length - 1 && index > 0
      snapshots = snapshots.slice(0, index + 1)
      if (merge) snapshots[index] = snapshot
      else { snapshots.push(snapshot); index++ }
      if (snapshots.length > GEOMETRY_HISTORY_LIMIT + 1) { snapshots.shift(); index-- }
      group = editGroup; notify()
      return true
    },
  }
}
