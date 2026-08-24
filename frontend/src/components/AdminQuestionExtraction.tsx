import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Eye, LoaderCircle, Play, RotateCcw } from 'lucide-react'
import { ApiError } from '../api/client'
import { createQuestionExtractionRun, getQuestionExtractionOverview, type QuestionExtractionOverviewRead } from '../api/questionExtraction'
import { getSourceDocuments } from '../api/sourceDocuments'

type AuthenticatedRequest = <T>(request: (accessToken: string) => Promise<T>) => Promise<T>
type Props = { authenticatedRequest: AuthenticatedRequest; sourceDocumentId: string; onBack: () => void }

const statusLabels: Record<string, string> = { pending: 'Gözləyir', running: 'Emal edilir', succeeded: 'Tamamlanıb', failed: 'Uğursuz' }
const languageLabel = (value: string | null) => value === 'az' ? 'Azərbaycan dili' : value ?? 'Müəyyən edilməyib'

function extractionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Sual çıxarılmasına giriş icazəniz yoxdur.'
    if (error.status === 404) return 'Mənbə sənədi tapılmadı.'
    if (error.status === 409) return 'Bu mənbə üçün artıq aktiv sual çıxarılması mövcuddur.'
    if (error.status === 422) return 'Sual çıxarılması sorğusu qəbul edilmədi.'
    if (error.status === 503) return 'Sual çıxarılması xidməti müvəqqəti əlçatan deyil.'
  }
  return error instanceof Error && error.message ? error.message : 'Gözlənilməz xəta baş verdi.'
}

export default function AdminQuestionExtraction({ authenticatedRequest, sourceDocumentId, onBack }: Props) {
  const runAuthenticatedRequest = useEffectEvent(authenticatedRequest)
  const generationRef = useRef(0)
  const [overview, setOverview] = useState<QuestionExtractionOverviewRead | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [variant, setVariant] = useState('all')

  useEffect(() => {
    const generation = ++generationRef.current
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [loaded, sources] = await Promise.all([
          runAuthenticatedRequest((token) => getQuestionExtractionOverview(token, sourceDocumentId)),
          runAuthenticatedRequest((token) => getSourceDocuments(token)),
        ])
        if (generationRef.current !== generation) return
        setOverview(loaded)
        setFilename(sources.find((source) => source.id === sourceDocumentId)?.media_asset.original_filename ?? null)
      } catch (caught: unknown) {
        if (generationRef.current === generation) setError(extractionError(caught))
      } finally {
        if (generationRef.current === generation) setLoading(false)
      }
    }
    void load()
    return () => { generationRef.current += 1 }
  }, [sourceDocumentId, reloadKey])

  const latestRun = overview?.latest_run
  const result = overview?.latest_successful_result?.analysis_result
  const analysis = result?.analysis
  const activeRun = latestRun?.status === 'pending' || latestRun?.status === 'running'
  const answerOptionCount = useMemo(() => analysis?.questions.reduce((sum, question) => sum + question.answer_options.length, 0) ?? 0, [analysis])
  const effectiveVariant = analysis?.blocks.some((block) => block.name === variant) ? variant : 'all'
  const questions = analysis?.questions.filter((question) => effectiveVariant === 'all' || question.variant === effectiveVariant) ?? []

  const startExtraction = async () => {
    if (starting || activeRun) return
    setStarting(true)
    setStartError(null)
    try {
      await runAuthenticatedRequest((token) => createQuestionExtractionRun(token, sourceDocumentId))
      setReloadKey((value) => value + 1)
    } catch (caught: unknown) {
      setStartError(extractionError(caught))
    } finally {
      setStarting(false)
    }
  }

  const header = <div className="admin-page-header"><div><button className="admin-question-extraction-back" type="button" onClick={onBack}><ArrowLeft size={18} /> Mənbə detalına qayıt</button><h1>AI sual analizi</h1><p>{filename ?? `Mənbə sənədi: ${sourceDocumentId}`}</p></div>{latestRun && <span className={`admin-question-extraction-status admin-question-extraction-status--${latestRun.status}`}>{statusLabels[latestRun.status] ?? latestRun.status}</span>}</div>

  if (loading) return <section className="admin-page">{header}<div className="admin-question-extraction-state"><LoaderCircle className="admin-question-extraction-spinner" size={22} /> AI analiz nəticəsi yüklənir...</div></section>
  if (error) return <section className="admin-page">{header}<div className="admin-question-extraction-error" role="alert"><AlertCircle size={22} /><span>{error}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}><RotateCcw size={16} /> Yenilə</button></div></section>

  return <section className="admin-page">
    {header}
    <div className="admin-question-extraction-toolbar"><button type="button" onClick={() => setReloadKey((value) => value + 1)}><RotateCcw size={17} /> Yenilə</button><button type="button" disabled={starting || activeRun} onClick={() => void startExtraction()}>{starting ? <><LoaderCircle size={17} /> Yaradılır...</> : <><Play size={17} /> Sual çıxarılmasını başlat</>}</button></div>
    {startError && <p className="admin-question-extraction-error" role="alert">{startError}</p>}
    {result && analysis ? <>
      <div className="admin-question-extraction-summary"><div><span>Ümumi sual</span><strong>{analysis.total_questions}</strong></div>{analysis.blocks.map((block) => <div key={block.name}><span>{block.name}</span><strong>{block.question_count}</strong></div>)}<div><span>Review tələb edən</span><strong>{analysis.needs_review_count}</strong></div><div><span>Cavab variantları</span><strong>{answerOptionCount}</strong></div><div><span>Dil</span><strong>{languageLabel(analysis.detected_language)}</strong></div></div>
      <section className="admin-question-extraction-provenance"><h2>Analiz məlumatları</h2><dl><div><dt>Provider</dt><dd>{result.provider_name ?? '—'}</dd></div><div><dt>Model</dt><dd>{result.model_name ?? '—'}</dd></div><div><dt>Processor</dt><dd>{result.processor_name} / {result.processor_version}</dd></div><div><dt>Processing version</dt><dd>{result.processing_version}</dd></div><div><dt>Schema version</dt><dd>{result.schema_version}</dd></div><div><dt>Prompt version</dt><dd>{result.prompt_version ?? '—'}</dd></div></dl></section>
      <div className="admin-question-extraction-variants" role="group" aria-label="Variant filtri"><button type="button" className={effectiveVariant === 'all' ? 'active' : ''} onClick={() => setVariant('all')}>Hamısı ({analysis.total_questions})</button>{analysis.blocks.map((block) => <button type="button" key={block.name} className={effectiveVariant === block.name ? 'active' : ''} onClick={() => setVariant(block.name)}>{block.name} ({block.question_count})</button>)}</div>
      <div className="admin-question-extraction-list">{questions.map((question) => <article className={`admin-question-extraction-question${question.needs_review ? ' admin-question-extraction-question--review' : ''}`} key={question.id}><header><div><strong>{question.question_number ?? `Sual ${question.sequence_number}`}</strong>{question.variant && <span>{question.variant}</span>}</div>{question.needs_review && <strong className="admin-question-extraction-review"><AlertCircle size={15} /> Yoxlama tələb edir</strong>}</header><p className="admin-question-extraction-question-text">{question.question_text}</p>{question.answer_options.length > 0 && <ol className="admin-question-extraction-options">{question.answer_options.map((option, index) => <li key={`${question.id}-option-${index}`}><strong>{option.label ? `${option.label})` : `${index + 1}.`}</strong> {option.text}</li>)}</ol>}<div className="admin-question-extraction-question-meta"><span>Səhifə: {question.source_pages.map((page) => page.page_number).join(', ')}</span><span>Etimad: {question.confidence}</span>{question.visual_required && <span><Eye size={15} /> Vizual material tələb olunur</span>}{question.corrections.length > 0 && <span>Düzəliş: {question.corrections.length}</span>}</div>{question.corrections.length > 0 && <details><summary>AI düzəlişləri</summary><ul>{question.corrections.map((correction, index) => <li key={`${question.id}-correction-${index}`}><del>{correction.original_value}</del> → <ins>{correction.normalized_value}</ins> — {correction.reason}</li>)}</ul></details>}</article>)}</div>
    </> : <div className="admin-question-extraction-empty"><strong>Bu mənbə üçün uğurlu AI analiz nəticəsi yoxdur.</strong>{latestRun && <span> Cari status: {statusLabels[latestRun.status] ?? latestRun.status}.</span>}</div>}
  </section>
}
