import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  FileSearch,
  FileText,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { ApiError } from '../api/client'
import {
  createSourcePreAnalysisRun,
  getSourcePreAnalysisOverview,
  type SourcePreAnalysisOverviewRead,
  type SourcePreAnalysisRunStatus,
} from '../api/sourcePreAnalysis'
import {
  getSourceDocuments,
  type SourceDocumentRead,
} from '../api/sourceDocuments'

type AuthenticatedRequest = <T>(
  request: (accessToken: string) => Promise<T>,
) => Promise<T>

type AdminSourceDetailProps = {
  authenticatedRequest: AuthenticatedRequest
  sourceDocumentId: string
  onBack: () => void
  onOpenQuestionExtraction: () => void
}

const statusLabels: Record<SourcePreAnalysisRunStatus, string> = {
  pending: 'Gözləyir',
  running: 'Emal edilir',
  succeeded: 'Tamamlanıb',
  failed: 'Uğursuz',
}

function detailError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bu mənbəyə giriş icazəniz yoxdur.'
    if (error.status === 404) return 'Mənbə sənədi tapılmadı.'
    if (error.status === 409) return 'Bu mənbə üçün artıq aktiv pre-analiz mövcuddur.'
    if (error.status === 422) return 'Pre-analiz sorğusu qəbul edilmədi.'
    if (error.status === 503) {
      return 'Pre-analiz xidməti müvəqqəti əlçatan deyil.'
    }
  }
  if (error instanceof Error && error.message) return error.message
  return 'Mənbə məlumatları yüklənərkən gözlənilməz xəta baş verdi.'
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} bayt`
  const units = ['KB', 'MB', 'GB']
  let value = sizeBytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${new Intl.NumberFormat('az-AZ', {
    maximumFractionDigits: 1,
  }).format(value)} ${units[index]}`
}

function formatDate(value: string | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function AdminSourceDetail({
  authenticatedRequest,
  sourceDocumentId,
  onBack,
  onOpenQuestionExtraction,
}: AdminSourceDetailProps) {
  const runAuthenticatedRequest = useEffectEvent(authenticatedRequest)
  const requestGeneration = useRef(0)
  const [sourceDocument, setSourceDocument] =
    useState<SourceDocumentRead | null>(null)
  const [overview, setOverview] =
    useState<SourcePreAnalysisOverviewRead | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    const generation = ++requestGeneration.current

    const loadDetail = async () => {
      try {
        const loaded = await runAuthenticatedRequest(async (accessToken) => {
          const [documents, preAnalysisOverview] = await Promise.all([
            getSourceDocuments(accessToken),
            getSourcePreAnalysisOverview(accessToken, sourceDocumentId),
          ])
          return { documents, preAnalysisOverview }
        })
        if (requestGeneration.current !== generation) return

        const document = loaded.documents.find(
          (item) => item.id === sourceDocumentId,
        )
        if (!document) {
          setError('Mənbə sənədi tapılmadı.')
          setSourceDocument(null)
          setOverview(null)
          return
        }
        setSourceDocument(document)
        setOverview(loaded.preAnalysisOverview)
        setError(null)
      } catch (loadError: unknown) {
        if (requestGeneration.current !== generation) return
        setError(detailError(loadError))
      } finally {
        if (requestGeneration.current === generation) setIsLoading(false)
      }
    }

    void loadDetail()
    return () => {
      requestGeneration.current += 1
    }
  }, [sourceDocumentId, reloadKey])

  const latestRun = overview?.latest_run ?? null
  const activeRun = latestRun?.status === 'pending' || latestRun?.status === 'running'

  const startPreAnalysis = async () => {
    if (isStarting || activeRun) return
    setIsStarting(true)
    setStartError(null)
    try {
      await runAuthenticatedRequest((accessToken) =>
        createSourcePreAnalysisRun(accessToken, sourceDocumentId),
      )
      setIsLoading(true)
      setReloadKey((value) => value + 1)
    } catch (runError: unknown) {
      setStartError(detailError(runError))
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <section className="admin-page admin-source-detail">
      <div className="admin-page-header admin-source-detail__header">
        <div>
          <button type="button" onClick={onBack} className="admin-source-detail__back">
            <ArrowLeft aria-hidden="true" size={18} />
            Mənbələrə qayıt
          </button>
          <h1>Mənbənin pre-analizi</h1>
          <p>Mənbə sənədinin emal vəziyyətini və təsdiqlənmiş nəticələrini izləyin.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsLoading(true)
            setReloadKey((value) => value + 1)
          }}
          disabled={isLoading || isStarting}
        >
          <RefreshCw aria-hidden="true" size={17} />
          Yenilə
        </button>
      </div>

      {isLoading ? (
        <div className="admin-source-detail__state" role="status">
          <LoaderCircle aria-hidden="true" size={24} />
          <span>Mənbə məlumatları yüklənir...</span>
        </div>
      ) : error || sourceDocument === null || overview === null ? (
        <div className="admin-source-detail__state admin-source-detail__state--error" role="alert">
          <AlertCircle aria-hidden="true" size={24} />
          <div>
            <h2>Məlumatları göstərmək mümkün olmadı</h2>
            <p>{error ?? 'Mənbə məlumatları əlçatan deyil.'}</p>
          </div>
        </div>
      ) : (
        <>
          <article className="admin-source-detail__document">
            <FileText aria-hidden="true" size={24} />
            <div>
              <h2>{sourceDocument.media_asset.original_filename ?? 'Adsız fayl'}</h2>
              <dl>
                <div><dt>Fayl tipi</dt><dd>{sourceDocument.media_asset.mime_type}</dd></div>
                <div><dt>Fayl ölçüsü</dt><dd>{formatFileSize(sourceDocument.media_asset.size_bytes)}</dd></div>
                <div><dt>Yüklənmə tarixi</dt><dd>{formatDate(sourceDocument.created_at)}</dd></div>
                <div><dt>Question Source ID</dt><dd>{sourceDocument.question_source_id ?? '—'}</dd></div>
              </dl>
            </div>
            <button type="button" onClick={onOpenQuestionExtraction}>
              <FileSearch aria-hidden="true" size={18} />
              Sual çıxarılmasına bax
            </button>
          </article>

          <section className="admin-source-detail__analysis" aria-labelledby="pre-analysis-title">
            <div className="admin-source-detail__section-header">
              <div>
                <h2 id="pre-analysis-title">Pre-analiz vəziyyəti</h2>
                <p>
                  {latestRun
                    ? `Son run: №${latestRun.run_number}`
                    : 'Bu mənbə üçün hələ pre-analiz run yaradılmayıb.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void startPreAnalysis()}
                disabled={isStarting || activeRun}
              >
                {isStarting ? (
                  <><LoaderCircle aria-hidden="true" size={17} /> Yaradılır...</>
                ) : (
                  <><FileSearch aria-hidden="true" size={17} /> Pre-analizi başlat</>
                )}
              </button>
            </div>

            {startError && <p role="alert" className="admin-source-detail__error">{startError}</p>}

            {latestRun ? (
              <div className="admin-source-detail__run">
                <span className={`admin-source-detail__status status-${latestRun.status}`}>
                  {statusLabels[latestRun.status]}
                </span>
                <dl>
                  <div><dt>Başlama vaxtı</dt><dd>{formatDate(latestRun.started_at)}</dd></div>
                  <div><dt>Tamamlanma vaxtı</dt><dd>{formatDate(latestRun.completed_at)}</dd></div>
                </dl>
                {latestRun.failure_message && (
                  <p className="admin-source-detail__failure" role="alert">
                    {latestRun.failure_message}
                  </p>
                )}
              </div>
            ) : (
              <div className="admin-source-detail__empty">
                <FileSearch aria-hidden="true" size={28} />
                <p>Pre-analizə başlamaq üçün yuxarıdakı əməliyyatdan istifadə edin.</p>
              </div>
            )}
          </section>

          {overview.latest_successful_result && (
            <section className="admin-source-detail__result" aria-labelledby="pre-analysis-result-title">
              <h2 id="pre-analysis-result-title">Son uğurlu nəticə</h2>
              <dl className="admin-source-detail__result-summary">
                <div><dt>Səhifə sayı</dt><dd>{overview.latest_successful_result.page_count ?? '—'}</dd></div>
                <div><dt>Tapıntı sayı</dt><dd>{overview.latest_successful_result.finding_count}</dd></div>
                <div><dt>Məlumat</dt><dd>{overview.latest_successful_result.info_count}</dd></div>
                <div><dt>Xəbərdarlıq</dt><dd>{overview.latest_successful_result.warning_count}</dd></div>
                <div><dt>Xəta</dt><dd>{overview.latest_successful_result.error_count}</dd></div>
                <div><dt>Prosessor</dt><dd>{overview.latest_successful_result.processor_name ?? '—'}</dd></div>
              </dl>

              {overview.latest_successful_result.findings.length > 0 && (
                <div className="admin-source-detail__findings">
                  {overview.latest_successful_result.findings.map((finding) => (
                    <article key={finding.id}>
                      <div>
                        <strong>{finding.finding_code}</strong>
                        <span>{finding.severity}</span>
                      </div>
                      <p>{finding.message}</p>
                      <small>
                        {finding.page_number !== null ? `Səhifə ${finding.page_number}` : 'Sənəd səviyyəsi'}
                        {finding.confidence !== null ? ` · Etimad: ${finding.confidence}` : ''}
                      </small>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </section>
  )
}
