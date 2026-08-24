import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AlertCircle,
  FileText,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react'
import { ApiError } from '../api/client'
import {
  getQuestionSources,
  type QuestionSourceCatalogResponse,
} from '../api/catalog'
import {
  getSourceDocuments,
  uploadSourceDocument,
  type SourceDocumentRead,
} from '../api/sourceDocuments'

type AuthenticatedRequest = <T>(
  request: (accessToken: string) => Promise<T>,
) => Promise<T>

type AdminSourcesProps = {
  authenticatedRequest: AuthenticatedRequest
  onOpenSource: (sourceDocumentId: string) => void
}

function sourceDocumentsError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'Mənbələrə giriş icazəniz yoxdur.'
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Mənbələr yüklənərkən gözlənilməz xəta baş verdi.'
}

function sourceUploadError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Mənbə sənədi yükləmək üçün icazəniz yoxdur.'
    }
    if (error.status === 413) {
      return 'Seçilmiş fayl icazə verilən ölçüdən böyükdür.'
    }
    if (error.status === 422) {
      return 'Fayl və ya mənbə məlumatı qəbul edilmədi. Seçiminizi yoxlayın.'
    }
    if (error.status === 503) {
      return 'Mənbə yaddaşı müvəqqəti əlçatan deyil. Bir qədər sonra yenidən cəhd edin.'
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Mənbə sənədi yüklənərkən gözlənilməz xəta baş verdi.'
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} bayt`

  const units = ['KB', 'MB', 'GB']
  let value = sizeBytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${new Intl.NumberFormat('az-AZ', {
    maximumFractionDigits: 1,
  }).format(value)} ${units[unitIndex]}`
}

function formatUploadedAt(value: string): string {
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

export default function AdminSources({
  authenticatedRequest,
  onOpenSource,
}: AdminSourcesProps) {
  const runAuthenticatedRequest = useEffectEvent(authenticatedRequest)
  const requestGeneration = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sourceDocuments, setSourceDocuments] = useState<
    SourceDocumentRead[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedQuestionSourceId, setSelectedQuestionSourceId] = useState('')
  const [questionSources, setQuestionSources] = useState<
    QuestionSourceCatalogResponse[]
  >([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  useEffect(() => {
    const generation = ++requestGeneration.current

    const loadSourceDocuments = async () => {
      try {
        const loaded = await runAuthenticatedRequest((accessToken) =>
          getSourceDocuments(accessToken),
        )

        if (requestGeneration.current !== generation) return
        setSourceDocuments(loaded)
      } catch (loadError: unknown) {
        if (requestGeneration.current !== generation) return
        setError(sourceDocumentsError(loadError))
      } finally {
        if (requestGeneration.current === generation) {
          setIsLoading(false)
        }
      }
    }

    void loadSourceDocuments()

    return () => {
      requestGeneration.current += 1
    }
  }, [reloadKey])

  useEffect(() => {
    let current = true

    const loadQuestionSources = async () => {
      try {
        const loaded = await runAuthenticatedRequest((accessToken) =>
          getQuestionSources(accessToken),
        )
        if (!current) return
        setQuestionSources(loaded)
      } catch (loadError: unknown) {
        if (!current) return
        setCatalogError(sourceDocumentsError(loadError))
      } finally {
        if (current) setCatalogLoading(false)
      }
    }

    void loadQuestionSources()

    return () => {
      current = false
    }
  }, [])

  const resetUploadForm = () => {
    setSelectedFile(null)
    setSelectedQuestionSourceId('')
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const closeUploadForm = () => {
    if (isUploading) return
    resetUploadForm()
    setIsUploadOpen(false)
  }

  const handleUpload = async () => {
    if (selectedFile === null || isUploading) return

    setIsUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    try {
      await runAuthenticatedRequest((accessToken) =>
        uploadSourceDocument(
          accessToken,
          selectedFile,
          selectedQuestionSourceId || undefined,
        ),
      )
      resetUploadForm()
      setIsUploadOpen(false)
      setUploadSuccess('Mənbə sənədi uğurla yükləndi.')
      setError(null)
      setIsLoading(true)
      setReloadKey((value) => value + 1)
    } catch (uploadFailure: unknown) {
      setUploadError(sourceUploadError(uploadFailure))
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <section className="admin-page admin-sources">
      <div className="admin-page-header admin-sources__header">
        <div>
          <h1>Mənbələr</h1>
          <p>Yüklənmiş mənbə sənədlərinə baxın.</p>
        </div>
        <button
          className="admin-sources__upload-toggle"
          type="button"
          onClick={() => {
            setUploadSuccess(null)
            setIsUploadOpen(true)
          }}
          disabled={isUploadOpen}
        >
          <Upload aria-hidden="true" size={18} />
          Mənbə yüklə
        </button>
      </div>

      {isUploadOpen && (
        <section className="admin-sources__upload" aria-labelledby="source-upload-title">
          <div className="admin-sources__upload-header">
            <div>
              <h2 id="source-upload-title">Mənbə yüklə</h2>
              <p>PDF, Word sənədi və ya şəkil faylı seçin.</p>
            </div>
            <button
              type="button"
              onClick={closeUploadForm}
              disabled={isUploading}
              aria-label="Yükləmə formasını bağla"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="admin-sources__upload-fields">
            <label className="admin-sources__file-field">
              <span>Fayl seç</span>
              <input
                ref={fileInputRef}
                type="file"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null)
                  setUploadError(null)
                }}
                disabled={isUploading}
              />
            </label>

            <label>
              <span>Mənbə (istəyə bağlı)</span>
              <select
                value={selectedQuestionSourceId}
                onChange={(event) => setSelectedQuestionSourceId(event.target.value)}
                disabled={catalogLoading || isUploading}
              >
                <option value="">Mənbə seçilməyib</option>
                {questionSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.display_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedFile && (
            <div className="admin-sources__selected-file">
              <FileText aria-hidden="true" size={20} />
              <div>
                <strong>{selectedFile.name}</strong>
                <span>{formatFileSize(selectedFile.size)}</span>
              </div>
            </div>
          )}

          {catalogError && (
            <p className="admin-sources__catalog-error" role="status">
              Mənbə siyahısını yükləmək mümkün olmadı. Faylı mənbə seçmədən yükləyə bilərsiniz.
            </p>
          )}

          {uploadError && (
            <p className="admin-sources__upload-error" role="alert">
              {uploadError}
            </p>
          )}

          <div className="admin-sources__upload-actions">
            <button
              type="button"
              onClick={closeUploadForm}
              disabled={isUploading}
            >
              Ləğv et
            </button>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={selectedFile === null || isUploading}
            >
              {isUploading ? (
                <>
                  <LoaderCircle aria-hidden="true" size={17} />
                  Yüklənir...
                </>
              ) : (
                'Yüklə'
              )}
            </button>
          </div>
        </section>
      )}

      {uploadSuccess && (
        <p className="admin-sources__upload-success" role="status">
          {uploadSuccess}
        </p>
      )}

      {isLoading ? (
        <div className="admin-sources__state" role="status">
          <LoaderCircle
            className="admin-sources__spinner"
            aria-hidden="true"
            size={24}
          />
          <span>Mənbələr yüklənir...</span>
        </div>
      ) : error ? (
        <div className="admin-sources__state admin-sources__state--error" role="alert">
          <AlertCircle aria-hidden="true" size={24} />
          <div>
            <h2>Mənbələri yükləmək mümkün olmadı</h2>
            <p>{error}</p>
          </div>
        </div>
      ) : sourceDocuments.length === 0 ? (
        <div className="admin-sources__state admin-sources__state--empty">
          <FileText aria-hidden="true" size={28} />
          <div>
            <h2>Mənbə sənədi yoxdur</h2>
            <p>Hazırda göstəriləcək aktiv mənbə sənədi mövcud deyil.</p>
          </div>
        </div>
      ) : (
        <div className="admin-sources__surface">
          <div className="admin-sources__table-wrap">
            <table className="admin-sources__table">
              <thead>
                <tr>
                  <th scope="col">Fayl adı</th>
                  <th scope="col">Fayl tipi</th>
                  <th scope="col">Fayl ölçüsü</th>
                  <th scope="col">Yüklənmə tarixi</th>
                  <th scope="col">Question Source ID</th>
                  <th scope="col">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {sourceDocuments.map((sourceDocument) => (
                  <tr key={sourceDocument.id}>
                    <td data-label="Fayl adı">
                      <span className="admin-sources__file">
                        <FileText aria-hidden="true" size={18} />
                        <strong>
                          {sourceDocument.media_asset.original_filename ?? 'Adsız fayl'}
                        </strong>
                      </span>
                    </td>
                    <td data-label="Fayl tipi">
                      {sourceDocument.media_asset.mime_type}
                    </td>
                    <td data-label="Fayl ölçüsü">
                      {formatFileSize(sourceDocument.media_asset.size_bytes)}
                    </td>
                    <td data-label="Yüklənmə tarixi">
                      <time dateTime={sourceDocument.created_at}>
                        {formatUploadedAt(sourceDocument.created_at)}
                      </time>
                    </td>
                    <td data-label="Question Source ID">
                      {sourceDocument.question_source_id ?? '—'}
                    </td>
                    <td data-label="Əməliyyat">
                      <button
                        className="admin-sources__open"
                        type="button"
                        onClick={() => onOpenSource(sourceDocument.id)}
                      >
                        Aç
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
