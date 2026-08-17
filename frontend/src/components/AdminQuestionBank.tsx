import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  RotateCcw,
  Search,
} from 'lucide-react'
import { ApiError } from '../api/client'
import {
  getPurposes,
  getQuestionSources,
  getQuestionTypes,
  type PurposeCatalogResponse,
  type QuestionSourceCatalogResponse,
  type QuestionTypeCatalogResponse,
} from '../api/catalog'
import {
  getQuestionBankQuestions,
  type QuestionBankItemRead,
  type QuestionBankListQuery,
  type QuestionBankPageRead,
  type QuestionBankSort,
} from '../api/questionBank'
import type {
  QuestionDifficulty,
  QuestionRevisionStatus,
} from '../api/questionEditor'

type AuthenticatedRequest = <T>(
  request: (accessToken: string) => Promise<T>,
) => Promise<T>

type AdminQuestionBankProps = {
  authenticatedRequest: AuthenticatedRequest
  query: QuestionBankListQuery
  onQueryChange: (query: QuestionBankListQuery) => void
  onOpenQuestion: (revisionId: string) => void
  onCreateQuestion: () => void
}

const statusLabels: Record<QuestionRevisionStatus, string> = {
  draft: 'Qaralama',
  proposed: 'Təklif edilib',
  approved: 'Təsdiqlənib',
  rejected: 'Rədd edilib',
}

const difficultyLabels: Record<QuestionDifficulty, string> = {
  easy: 'Asan',
  medium: 'Orta',
  hard: 'Çətin',
}

function formatUpdatedAt(value: string): { date: string; time: string } {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { date: value, time: '' }
  return {
    date: new Intl.DateTimeFormat('az-AZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('az-AZ', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date),
  }
}

function questionBankError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Sual bazasına giriş icazəniz yoxdur.'
  }
  if (error instanceof Error && error.message) return error.message
  return 'Gözlənilməz xəta baş verdi.'
}

function pageNumbers(current: number, total: number): Array<number | string> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages = new Set([1, total, current - 1, current, current + 1])
  const valid = [...pages].filter((page) => page > 0 && page <= total).sort((a, b) => a - b)
  const result: Array<number | string> = []
  valid.forEach((page, index) => {
    if (index > 0 && page - valid[index - 1] > 1) result.push(`ellipsis-${page}`)
    result.push(page)
  })
  return result
}

function QuestionRow({
  item,
  number,
  disabled,
  onOpen,
}: {
  item: QuestionBankItemRead
  number: number
  disabled: boolean
  onOpen: () => void
}) {
  const updatedAt = formatUpdatedAt(item.updated_at)

  return (
    <tr>
      <td data-label="#" className="admin-question-bank-number">{number}</td>
      <td data-label="Sual" className="admin-question-bank-question">
        <strong>{item.text_preview?.trim() || 'Mətn önizləməsi yoxdur'}</strong>
        <small>{item.block_count} blok</small>
      </td>
      <td data-label="Mənbə">
        {item.source ? (
          <span className="admin-question-bank-source">
            <strong>{item.source.display_name}</strong>
            {item.source.detail && <small>{item.source.detail}</small>}
          </span>
        ) : <span className="admin-question-bank-muted">—</span>}
      </td>
      <td data-label="Tip">{item.question_type.display_name}</td>
      <td data-label="Mövzu">{item.primary_topic?.display_name ?? '—'}</td>
      <td data-label="Çətinlik">
        {item.difficulty ? (
          <span className={`admin-question-bank-badge difficulty-${item.difficulty}`}>
            {difficultyLabels[item.difficulty]}
          </span>
        ) : <span className="admin-question-bank-badge difficulty-none">Təyin edilməyib</span>}
      </td>
      <td data-label="Status">
        <span className="admin-question-bank-status-stack">
          <span className={`admin-question-bank-badge status-${item.status}`}>
            {statusLabels[item.status]}
          </span>
          {item.is_current_approved && <small>Cari təsdiqlənmiş</small>}
        </span>
      </td>
      <td data-label="Son yenilənmə">
        <time className="admin-question-bank-updated" dateTime={item.updated_at}>
          <strong>{updatedAt.date}</strong>
          {updatedAt.time && <span>{updatedAt.time}</span>}
        </time>
      </td>
      <td data-label="Əməliyyat">
        <button
          className="admin-question-bank-open"
          type="button"
          onClick={onOpen}
          disabled={disabled}
        >
          Redaktorda aç
        </button>
      </td>
    </tr>
  )
}

export default function AdminQuestionBank({
  authenticatedRequest,
  query,
  onQueryChange,
  onOpenQuestion,
  onCreateQuestion,
}: AdminQuestionBankProps) {
  const runAuthenticatedRequest = useEffectEvent(authenticatedRequest)
  const requestGeneration = useRef(0)
  const [searchDraft, setSearchDraft] = useState(query.q ?? '')
  const [page, setPage] = useState<QuestionBankPageRead | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [catalogReloadKey, setCatalogReloadKey] = useState(0)
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeCatalogResponse[]>([])
  const [sources, setSources] = useState<QuestionSourceCatalogResponse[]>([])
  const [purposes, setPurposes] = useState<PurposeCatalogResponse[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(false)

  useEffect(() => {
    let current = true
    const loadCatalogs = async () => {
      setCatalogLoading(true)
      setCatalogError(false)
      try {
        const [loadedTypes, loadedSources, loadedPurposes] = await Promise.all([
          runAuthenticatedRequest((token) => getQuestionTypes(token)),
          runAuthenticatedRequest((token) => getQuestionSources(token)),
          runAuthenticatedRequest((token) => getPurposes(token)),
        ])
        if (!current) return
        setQuestionTypes(loadedTypes)
        setSources(loadedSources)
        setPurposes(loadedPurposes)
      } catch {
        if (!current) return
        setCatalogError(true)
      } finally {
        if (current) setCatalogLoading(false)
      }
    }
    void loadCatalogs()
    return () => { current = false }
  }, [catalogReloadKey])

  useEffect(() => {
    const generation = ++requestGeneration.current
    const loadQuestions = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const loaded = await runAuthenticatedRequest((token) =>
          getQuestionBankQuestions(token, query),
        )
        if (requestGeneration.current !== generation) return
        setPage(loaded)
      } catch (loadError: unknown) {
        if (requestGeneration.current !== generation) return
        setError(questionBankError(loadError))
      } finally {
        if (requestGeneration.current === generation) setIsLoading(false)
      }
    }
    void loadQuestions()
    return () => { requestGeneration.current += 1 }
  }, [query, reloadKey])

  type FilterField = keyof Pick<
      QuestionBankListQuery,
      'question_type_id' | 'source_id' | 'status' | 'difficulty' | 'purpose_id'
    >
  const updateFilter = <Field extends FilterField,>(
    field: Field,
    value: QuestionBankListQuery[Field],
  ) => {
    onQueryChange({ ...query, [field]: value || undefined, page: 1 })
  }

  const resetFilters = () => {
    setSearchDraft('')
    onQueryChange({ page: 1, page_size: 25, sort: 'updated_desc' })
  }

  const hasFilters = Boolean(
    query.q || query.question_type_id || query.source_id || query.status
    || query.difficulty || query.purpose_id,
  )
  const firstLoad = isLoading && page === null
  const items = page?.items ?? []

  return (
    <main className="workspace admin-question-bank-workspace">
      <div className="content admin-question-bank-content">
        <header className="admin-question-bank-header">
          <div>
            <h1>Sual bazası</h1>
            <p>Sualları axtarın, filtrləyin və redaktə edin.</p>
          </div>
          <button type="button" onClick={onCreateQuestion}>
            + Yeni sual tərtib et
          </button>
        </header>

        <section className="admin-question-bank-tools" aria-label="Sual bazası axtarış və filtrləri">
          <form
            className="admin-question-bank-search"
            onSubmit={(event) => {
              event.preventDefault()
              onQueryChange({ ...query, q: searchDraft || undefined, page: 1 })
            }}
          >
            <label htmlFor="question-bank-search">Axtarış</label>
            <div>
              <Search size={19} />
              <input
                id="question-bank-search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Sualın mətnini və ya açar sözü daxil edin..."
              />
              <button type="submit" disabled={isLoading}>Axtar</button>
            </div>
          </form>

          <div className="admin-question-bank-filters">
            <label><span>Sual tipi</span><select aria-label="Sual tipi" value={query.question_type_id ?? ''} onChange={(event) => updateFilter('question_type_id', event.target.value || undefined)} disabled={catalogLoading}>
              <option value="">Hamısı</option>
              {questionTypes.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </select></label>
            <label><span>Mənbə</span><select aria-label="Mənbə" value={query.source_id ?? ''} onChange={(event) => updateFilter('source_id', event.target.value || undefined)} disabled={catalogLoading}>
              <option value="">Hamısı</option>
              {sources.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </select></label>
            <label><span>Status</span><select aria-label="Status" value={query.status ?? ''} onChange={(event) => updateFilter('status', (event.target.value || undefined) as QuestionRevisionStatus | undefined)}>
              <option value="">Hamısı</option><option value="draft">Qaralama</option><option value="proposed">Təklif edilib</option><option value="approved">Təsdiqlənib</option><option value="rejected">Rədd edilib</option>
            </select></label>
            <label><span>Çətinlik</span><select aria-label="Çətinlik" value={query.difficulty ?? ''} onChange={(event) => updateFilter('difficulty', (event.target.value || undefined) as QuestionDifficulty | undefined)}>
              <option value="">Hamısı</option><option value="easy">Asan</option><option value="medium">Orta</option><option value="hard">Çətin</option>
            </select></label>
            <label><span>Təyinat</span><select aria-label="Təyinat" value={query.purpose_id ?? ''} onChange={(event) => updateFilter('purpose_id', event.target.value || undefined)} disabled={catalogLoading}>
              <option value="">Hamısı</option>
              {purposes.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </select></label>
            <label><span>Sıralama</span><select aria-label="Sıralama" value={query.sort ?? 'updated_desc'} onChange={(event) => onQueryChange({ ...query, sort: event.target.value as QuestionBankSort, page: 1 })}>
              <option value="updated_desc">Son yenilənənlər</option><option value="created_desc">Son yaradılanlar</option>
            </select></label>
            <button className="admin-question-bank-reset" type="button" onClick={resetFilters}>
              <RotateCcw size={16} /> Filtrləri sıfırla
            </button>
          </div>
          {catalogError && <div className="admin-question-bank-catalog-error" role="alert">Filtr məlumatlarını yükləmək mümkün olmadı. <button type="button" onClick={() => setCatalogReloadKey((value) => value + 1)}>Yenidən cəhd et</button></div>}
        </section>

        <section className={`admin-question-bank-results${isLoading && page ? ' is-pending' : ''}`} aria-busy={isLoading}>
          {!firstLoad && !error && (
            <div className="admin-question-bank-summary">
              <strong>{new Intl.NumberFormat('az-AZ').format(page?.total ?? 0)} sual tapıldı</strong>
              <label>Səhifədə: <select value={query.page_size ?? 25} onChange={(event) => onQueryChange({ ...query, page_size: Number(event.target.value), page: 1 })} disabled={isLoading}>
                <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
              </select></label>
            </div>
          )}

          <div className="admin-question-bank-surface">
            {firstLoad && <div className="admin-question-bank-skeleton" aria-label="Suallar yüklənir">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>}

            {error && !firstLoad && (
              <div className="admin-question-bank-state" role="alert">
                <AlertCircle size={36} /><h2>Sualları yükləmək mümkün olmadı</h2>
                <p>Bağlantını yoxlayın və yenidən cəhd edin.</p>
                <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Yenidən cəhd et</button>
              </div>
            )}

            {!firstLoad && !error && items.length === 0 && (
              <div className="admin-question-bank-state">
                <FileText size={38} />
                <h2>{hasFilters ? 'Uyğun sual tapılmadı' : 'Sual bazası hələ boşdur'}</h2>
                <p>{hasFilters ? 'Axtarış sözünü və ya seçilmiş filtrləri dəyişin.' : 'İlk sualı hazırlamaq üçün “Yeni sual tərtib et” düyməsindən istifadə edin.'}</p>
                <button type="button" onClick={hasFilters ? resetFilters : onCreateQuestion}>{hasFilters ? 'Filtrləri sıfırla' : 'Yeni sual tərtib et'}</button>
              </div>
            )}

            {!firstLoad && !error && items.length > 0 && (
              <div className="admin-question-bank-table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Sual (önizləmə)</th><th>Mənbə</th><th>Tip</th><th>Mövzu</th><th>Çətinlik</th><th>Status</th><th>Son yenilənmə</th><th>Əməliyyat</th></tr></thead>
                  <tbody>{items.map((item, index) => <QuestionRow key={item.question_form_id} item={item} number={((page?.page ?? 1) - 1) * (page?.page_size ?? 25) + index + 1} disabled={isLoading} onOpen={() => onOpenQuestion(item.revision_id)} />)}</tbody>
                </table>
              </div>
            )}
            {isLoading && page && <div className="admin-question-bank-loading"><LoaderCircle size={17} /> Yenilənir…</div>}
          </div>

          {!firstLoad && !error && page && (
            <footer className="admin-question-bank-footer">
              <strong>Cəmi: {new Intl.NumberFormat('az-AZ').format(page.total)} sual</strong>
              {page.total_pages > 1 ? (
                <nav className="admin-question-bank-pagination" aria-label="Sual bazası səhifələri">
                  <button type="button" disabled={isLoading || page.page <= 1} onClick={() => onQueryChange({ ...query, page: page.page - 1 })}><ChevronLeft size={16} /> Əvvəlki</button>
                  <span>{pageNumbers(page.page, page.total_pages).map((value) => typeof value === 'number' ? <button type="button" aria-current={value === page.page ? 'page' : undefined} disabled={isLoading || value === page.page} onClick={() => onQueryChange({ ...query, page: value })} key={value}>{value}</button> : <i key={value}>…</i>)}</span>
                  <button type="button" disabled={isLoading || page.page >= page.total_pages} onClick={() => onQueryChange({ ...query, page: page.page + 1 })}>Növbəti <ChevronRight size={16} /></button>
                </nav>
              ) : <span aria-hidden="true" />}
              <label>
                <select value={query.page_size ?? 25} onChange={(event) => onQueryChange({ ...query, page_size: Number(event.target.value), page: 1 })} disabled={isLoading} aria-label="Səhifədə sual sayı">
                  <option value={25}>25 / səhifə</option><option value={50}>50 / səhifə</option><option value={100}>100 / səhifə</option>
                </select>
              </label>
            </footer>
          )}
        </section>
      </div>
    </main>
  )
}
