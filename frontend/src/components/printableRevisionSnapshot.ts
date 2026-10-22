import type { ContentBlockRead, QuestionDraftRead, QuestionRevisionEditorRead } from '../api/questionEditor'

export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T
export type PrintableRevision = DeepReadonly<QuestionDraftRead & { blocks: ContentBlockRead[] }>
export type PrintableSnapshot = DeepReadonly<{ version: 1; revisions: PrintableRevision[] }>
export type SnapshotFailure = 'unauthorized' | 'missing' | 'empty' | 'invalid' | 'loading_failed'
export type SnapshotState =
  | { status: 'idle' | 'loading'; snapshot: null }
  | { status: 'ready'; snapshot: PrintableSnapshot }
  | { status: 'error'; snapshot: null; code: SnapshotFailure; message: string }

class SnapshotError extends Error {
  readonly code: SnapshotFailure
  constructor(code: SnapshotFailure, message: string) { super(message); this.code = code }
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whitelist printable fields: editor answer/solution fields never enter the snapshot. */
export function createPrintableSnapshot(ids: readonly string[], loaded: readonly QuestionRevisionEditorRead[]): PrintableSnapshot {
  if (!ids.length || ids.some(id => !uuid.test(id)) || new Set(ids).size !== ids.length) {
    throw new SnapshotError('invalid', 'Select distinct saved revision UUIDs.')
  }
  const revisions = ids.map(id => {
    const revision = loaded.find(item => item.revision_id === id)
    if (!revision) throw new SnapshotError('missing', `Revision ${id} was not returned.`)
    if (!revision.blocks.length) throw new SnapshotError('empty', `Revision ${id} has no content blocks.`)
    const {
      question_family_id, question_form_id, revision_id, revision_number, status,
      question_type_id, source_id, source_detail, source_display_name, primary_topic_id,
      related_topic_ids, purpose_ids, difficulty, updated_at,
    } = revision
    return {
      question_family_id, question_form_id, revision_id, revision_number, status,
      question_type_id, source_id, source_detail, source_display_name, primary_topic_id,
      related_topic_ids, purpose_ids, difficulty, updated_at,
      blocks: [...revision.blocks].sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    }
  })
  const snapshot = structuredClone({ version: 1 as const, revisions })
  freeze(snapshot)
  // Runtime freeze handles the recursive geometry contract without expanding its TS type.
  return snapshot as unknown as PrintableSnapshot
}

/** Latest selection wins; cancellation also prevents updates after unmount. No mock fallback. */
export function createPrintableRevisionLoader(
  fetchRevision: ((id: string) => Promise<QuestionRevisionEditorRead>) | null,
  publish: (state: SnapshotState) => void,
) {
  let generation = 0
  return {
    clear() { generation++; publish({ status: 'idle', snapshot: null }) },
    cancel() { generation++ },
    async load(selection: readonly string[], requestRevision = fetchRevision) {
      const request = ++generation
      const ids = [...selection]
      publish({ status: 'loading', snapshot: null })
      try {
        if (!ids.length || ids.some(id => !uuid.test(id)) || new Set(ids).size !== ids.length) {
          throw new SnapshotError('invalid', 'Select distinct saved revision UUIDs.')
        }
        if (!requestRevision) throw new SnapshotError('loading_failed', 'No revision loader supplied.')
        const revisions = await Promise.all(ids.map(requestRevision))
        if (request !== generation) return
        publish({ status: 'ready', snapshot: createPrintableSnapshot(ids, revisions) })
      } catch (error) {
        if (request !== generation) return
        const status = error && typeof error === 'object' && 'status' in error ? error.status : null
        const code: SnapshotFailure = error instanceof SnapshotError ? error.code
          : status === 401 || status === 403 ? 'unauthorized'
          : status === 404 || status === 410 ? 'missing' : 'loading_failed'
        publish({ status: 'error', snapshot: null, code, message: error instanceof Error ? error.message : 'Revision loading failed.' })
      }
    },
  }
}
