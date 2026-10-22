import { useEffect, useRef, useState } from 'react'
import { getQuestionBankQuestions, type QuestionBankItemRead } from '../api/questionBank'
import { getQuestionRevisionForEditor } from '../api/questionEditor'
import { createPrintableRevisionLoader, type SnapshotState } from './printableRevisionSnapshot'

type AuthenticatedRequest = <T>(request: (token: string) => Promise<T>) => Promise<T>

/** Admin-only preparation boundary. Rendering/export deliberately remains a later slice. */
export default function PrintableRevisionPreparation({ authenticatedRequest, state, onChange }: {
  authenticatedRequest: AuthenticatedRequest
  state: SnapshotState
  onChange: (state: SnapshotState) => void
}) {
  const [loader] = useState(() => createPrintableRevisionLoader(null, onChange))
  useEffect(() => () => loader.cancel(), [loader])
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<QuestionBankItemRead[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [searchStatus, setSearchStatus] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const searchGeneration = useRef(0)
  useEffect(() => () => { searchGeneration.current++ }, [])
  async function search(requestedPage = 1) {
    const generation = ++searchGeneration.current
    setItems([])
    setTotalPages(0)
    setSearchStatus('Yüklənir…')
    try {
      const result = await authenticatedRequest(token => getQuestionBankQuestions(token, { q: query, page: requestedPage, page_size: 20 }))
      if (generation !== searchGeneration.current) return
      setItems(result.items)
      setPage(result.page)
      setTotalPages(result.total_pages)
      setSearchStatus(`${result.total} nəticə; səhifə ${result.page}/${result.total_pages}.`)
    } catch (error) {
      if (generation === searchGeneration.current) setSearchStatus(error instanceof Error ? error.message : 'Yükləmə xətası')
    }
  }
  function toggle(id: string) {
    loader.clear()
    setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id])
  }
  return <section aria-label="Saxlanmış sualların PDF hazırlığı">
    <h3>Saxlanmış sualların PDF hazırlığı</h3>
    <p>Admin: reviziyaları istədiyiniz sırada seçin və saxlanmış məzmunu yükləyin.</p>
    <form onSubmit={event => { event.preventDefault(); void search() }}>
      <label>Sual bazasında axtarış <input value={query} onChange={event => { searchGeneration.current++; setItems([]); setTotalPages(0); setSearchStatus(''); setQuery(event.target.value) }} /></label>
      <button type="submit">Axtar</button>
    </form>
    <p role="status">{searchStatus}</p>
    {items.map(item => <label key={item.revision_id} style={{ display: 'block' }}>
      <input type="checkbox" checked={selected.includes(item.revision_id)} onChange={() => toggle(item.revision_id)} />
      {item.text_preview || 'Mətn önbaxışı yoxdur'} — r{item.revision_number} ({item.status}) — {item.revision_id}
    </label>)}
    <button type="button" disabled={!totalPages || page <= 1} onClick={() => void search(page - 1)}>Əvvəlki səhifə</button>
    <button type="button" disabled={!totalPages || page >= totalPages} onClick={() => void search(page + 1)}>Növbəti səhifə</button>
    <ol>{selected.map(id => <li key={id}>{id} <button type="button" onClick={() => toggle(id)}>Çıxar</button></li>)}</ol>
    <button type="button" disabled={!selected.length || state.status === 'loading'} onClick={() => void loader.load(selected, id => authenticatedRequest(token => getQuestionRevisionForEditor(token, id)))}>Saxlanmış məzmunu yüklə</button>
    <p role={state.status === 'error' ? 'alert' : 'status'}>
      {state.status === 'loading' ? 'Reviziyalar yüklənir…' : state.status === 'error' ? `${state.code}: ${state.message}`
        : state.status === 'ready' ? `${state.snapshot.revisions.length} reviziya PDF hazırlığı üçün yükləndi.` : 'Reviziya seçilməyib/yüklənməyib.'}
    </p>
    {state.status === 'ready' && <ul>{state.snapshot.revisions.map(revision => <li key={revision.revision_id}>
      {revision.revision_id} — r{revision.revision_number} — {revision.blocks.length} blok — {revision.updated_at}
    </li>)}</ul>}
  </section>
}
