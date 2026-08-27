import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Braces,
  FileImage,
  FileText,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  SquareFunction,
  Trash2,
  X,
} from 'lucide-react'
import { ApiError } from '../api/client'
import {
  getQuestionTypes,
  type QuestionTypeCatalogResponse,
} from '../api/catalog'
import {
  createFormulaBlock,
  createQuestionDraft,
  createTextBlock,
  deleteBlock,
  getQuestionRevisionForEditor,
  reorderBlocks,
  updateFormulaBlock,
  updateTextBlock,
  type ContentBlockRead,
  type QuestionRevisionEditorRead,
  type StructuredTextDocument,
} from '../api/questionEditor'
import AIAuthoringPanel from './AIAuthoringPanel'
import AnswerEditorSection from './AnswerEditorSection'
import MathContent from './MathContent'
import SolutionEditorSection from './SolutionEditorSection'
import VisualMathInput from './VisualMathInput'

type AuthenticatedRequest = <T>(
  request: (accessToken: string) => Promise<T>,
) => Promise<T>

type AdminQuestionEditorProps = {
  authenticatedRequest: AuthenticatedRequest
  onBack: () => void
  initialRevisionId?: string
}

type MutationName = 'text-create' | 'text-update' | 'formula-create'
  | 'formula-update' | 'delete' | 'reorder' | 'answer' | 'solution'

function editorErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Bu redaktora giriş icazəniz yoxdur.'
    if (error.status === 404) return 'Sual reviziyası və ya blok tapılmadı.'
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return 'Əməliyyatı tamamlamaq mümkün olmadı.'
}

function solutionErrorMessage(error: ApiError): string {
  const detail = typeof error.detail === 'string' ? error.detail : ''
  if (detail.includes('already exists')) return 'Bu reviziya üçün həll artıq mövcuddur.'
  if (detail.includes('not editable')) return 'Bu reviziya redaktə edilə bilməz.'
  if (detail.includes('type does not match')) return 'Həll blokunun tipi əməliyyata uyğun deyil.'
  if (detail.includes('not found')) return 'Həll və ya həll bloku tapılmadı.'
  if (detail.includes('order does not match')) return 'Həll bloklarının sırası mövcud bloklarla uyğun deyil.'
  return 'Həll əməliyyatını icra etmək mümkün olmadı.'
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('az-AZ')
}

function simpleTextDocument(text: string): StructuredTextDocument {
  return {
    type: 'document',
    content: [{
      type: 'paragraph',
      attrs: null,
      content: text ? [{ type: 'text', text, marks: [] }] : [],
    }],
  }
}

type BlockCardProps = {
  block: ContentBlockRead
  index: number
  blockCount: number
  disabled: boolean
  editingBlockId: string | null
  editingValue: string
  onEditingValueChange: (value: string) => void
  onStartEdit: (block: ContentBlockRead) => void
  onCancelEdit: () => void
  onSaveEdit: (block: ContentBlockRead) => void
  onDelete: (block: ContentBlockRead) => void
  onMove: (index: number, direction: -1 | 1) => void
}

function BlockCard({
  block,
  index,
  blockCount,
  disabled,
  editingBlockId,
  editingValue,
  onEditingValueChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onMove,
}: BlockCardProps) {
  const isEditable = block.block_type === 'text' || block.block_type === 'formula'
  const isEditing = editingBlockId === block.id

  return (
    <article className={`admin-editor-block admin-editor-block--${block.block_type}`}>
      <header>
        <span>
          {block.block_type === 'text' && <FileText size={18} />}
          {block.block_type === 'formula' && <SquareFunction size={18} />}
          {block.block_type === 'image' && <FileImage size={18} />}
          {block.block_type === 'geometry' && <Braces size={18} />}
          {block.block_type === 'text' && 'Mətn bloku'}
          {block.block_type === 'formula' && 'Formula bloku'}
          {block.block_type === 'image' && 'Şəkil bloku'}
          {block.block_type === 'geometry' && 'Həndəsə bloku'}
        </span>
        <small>Sıra: {block.sort_order}</small>
      </header>

      {isEditing ? (
        <div className="admin-editor-inline-edit">
          {block.block_type === 'text' ? <textarea
            value={editingValue}
            onChange={(event) => onEditingValueChange(event.target.value)}
            disabled={disabled}
            aria-label="Mətn bloku"
          /> : <VisualMathInput value={editingValue} onChange={onEditingValueChange} disabled={disabled} ariaLabel="Formula blokunu redaktə et" />}
          <div>
            <button type="button" onClick={() => onSaveEdit(block)} disabled={disabled}>
              Yadda saxla
            </button>
            <button type="button" className="secondary" onClick={onCancelEdit}>
              <X size={15} /> Ləğv et
            </button>
          </div>
        </div>
      ) : (
        <>
          {block.block_type === 'text' && (
            <p className="admin-editor-block__text">
              {block.payload.source_text || 'Boş mətn bloku'}
            </p>
          )}
          {block.block_type === 'formula' && (
            block.payload.source_latex
              ? <div className="admin-editor-formula-preview"><MathContent content={{ format_version: 1, segments: [{ type: 'math', latex: block.payload.source_latex, source_text: block.payload.source_latex, display_mode: false }] }} fallbackText="Formula göstərilə bilmədi" /></div>
              : <span>Boş formula</span>
          )}
          {block.block_type === 'image' && (
            <>
              <dl className="admin-editor-block__details">
                <div><dt>Media asset ID</dt><dd>{block.payload.media_asset_id}</dd></div>
                {block.payload.alt_text !== null && (
                  <div><dt>Alternativ mətn</dt><dd>{block.payload.alt_text || 'Boşdur'}</dd></div>
                )}
              </dl>
              <p className="admin-editor-block__note">Şəkil müəllifliyi hələ mövcud deyil.</p>
            </>
          )}
          {block.block_type === 'geometry' && (
            <>
              <p className="admin-editor-block__note">Yalnız oxuma rejimi · vizual renderer mövcud deyil</p>
              <pre>{JSON.stringify(block.payload.source_data, null, 2)}</pre>
            </>
          )}
        </>
      )}

      <div className="admin-editor-block__actions">
        {isEditable && !isEditing && (
          <button type="button" onClick={() => onStartEdit(block)} disabled={disabled}>
            <Pencil size={15} /> Redaktə et
          </button>
        )}
        <button type="button" onClick={() => onMove(index, -1)} disabled={disabled || index === 0}>
          <ArrowUp size={15} /> Yuxarı
        </button>
        <button type="button" onClick={() => onMove(index, 1)} disabled={disabled || index === blockCount - 1}>
          <ArrowDown size={15} /> Aşağı
        </button>
        <button type="button" className="danger" onClick={() => onDelete(block)} disabled={disabled}>
          <Trash2 size={15} /> Sil
        </button>
      </div>
    </article>
  )
}

export default function AdminQuestionEditor({
  authenticatedRequest,
  onBack,
  initialRevisionId,
}: AdminQuestionEditorProps) {
  const [revisionInput, setRevisionInput] = useState('')
  const [revision, setRevision] = useState<QuestionRevisionEditorRead | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isStale, setIsStale] = useState(false)
  const [questionTypes, setQuestionTypes] = useState<QuestionTypeCatalogResponse[]>([])
  const [selectedQuestionTypeId, setSelectedQuestionTypeId] = useState('')
  const [questionTypesLoading, setQuestionTypesLoading] = useState(true)
  const [questionTypesError, setQuestionTypesError] = useState<string | null>(null)
  const [isCreatingDraft, setIsCreatingDraft] = useState(false)
  const [mutationPending, setMutationPending] = useState<MutationName | null>(null)
  const [newText, setNewText] = useState('')
  const [newFormula, setNewFormula] = useState('')
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [activeSection, setActiveSection] = useState<'question' | 'solution'>('question')
  const runAuthenticatedRequest = useEffectEvent(authenticatedRequest)
  const initialRevisionLoadId = useRef<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    const loadQuestionTypes = async () => {
      setQuestionTypesLoading(true)
      setQuestionTypesError(null)
      try {
        const loaded = await authenticatedRequest((token) => getQuestionTypes(token))
        if (!isCurrent) return
        setQuestionTypes(loaded)
        setSelectedQuestionTypeId((current) => current || loaded[0]?.id || '')
      } catch (loadError: unknown) {
        if (!isCurrent) return
        setQuestionTypes([])
        setQuestionTypesError(editorErrorMessage(loadError))
      } finally {
        if (isCurrent) setQuestionTypesLoading(false)
      }
    }
    void loadQuestionTypes()
    return () => { isCurrent = false }
  }, [authenticatedRequest])

  useEffect(() => {
    if (!initialRevisionId || initialRevisionLoadId.current === initialRevisionId) return
    initialRevisionLoadId.current = initialRevisionId
    let isCurrent = true
    let completed = false
    setRevisionInput(initialRevisionId)
    setIsLoading(true)
    setError(null)

    const loadInitialRevision = async () => {
      try {
        const loaded = await runAuthenticatedRequest((token) =>
          getQuestionRevisionForEditor(token, initialRevisionId),
        )
        if (!isCurrent) return
        setRevision(loaded)
        setRevisionInput(loaded.revision_id)
        setIsStale(false)
        setEditingBlockId(null)
        setEditingValue('')
      } catch (loadError: unknown) {
        if (!isCurrent) return
        setRevision(null)
        setError(editorErrorMessage(loadError))
      } finally {
        if (isCurrent) {
          completed = true
          setIsLoading(false)
        }
      }
    }

    void loadInitialRevision()
    return () => {
      isCurrent = false
      if (!completed && initialRevisionLoadId.current === initialRevisionId) {
        initialRevisionLoadId.current = null
      }
    }
  }, [initialRevisionId])

  const fetchRevision = async (revisionId: string) => {
    const loaded = await authenticatedRequest((token) =>
      getQuestionRevisionForEditor(token, revisionId),
    )
    setRevision(loaded)
    setRevisionInput(loaded.revision_id)
    setIsStale(false)
    return loaded
  }

  const loadRevision = async () => {
    const revisionId = revisionInput.trim()
    if (!revisionId || isLoading || isCreatingDraft || mutationPending) return
    setIsLoading(true)
    setError(null)
    try {
      await fetchRevision(revisionId)
      setEditingBlockId(null)
      setEditingValue('')
    } catch (loadError: unknown) {
      if (!isStale) setRevision(null)
      setError(editorErrorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }

  const createDraft = async () => {
    if (!selectedQuestionTypeId || isCreatingDraft || isLoading || mutationPending || isStale) return
    setIsCreatingDraft(true)
    setError(null)
    try {
      const draft = await authenticatedRequest((token) =>
        createQuestionDraft(token, {
          question_type_id: selectedQuestionTypeId,
          primary_topic_id: null,
          related_topic_ids: [],
          purpose_ids: [],
        }),
      )
      setRevisionInput(draft.revision_id)
      await fetchRevision(draft.revision_id)
      setEditingBlockId(null)
      setEditingValue('')
    } catch (createError: unknown) {
      setRevision(null)
      setError(editorErrorMessage(createError))
    } finally {
      setIsCreatingDraft(false)
    }
  }

  const runMutation = async (
    name: MutationName,
    operation: (token: string, current: QuestionRevisionEditorRead) => Promise<unknown>,
    afterReload?: () => void,
    conflictMessage?: string,
  ) => {
    const current = revision
    if (
      current === null
      || current.status !== 'draft'
      || mutationPending
      || isLoading
      || isCreatingDraft
      || isStale
    ) return
    setMutationPending(name)
    setError(null)
    try {
      await authenticatedRequest((token) => operation(token, current))
      try {
        await fetchRevision(current.revision_id)
        afterReload?.()
      } catch (reloadError: unknown) {
        setIsStale(true)
        setError(`Əməliyyat tamamlandı, lakin yenilənmiş reviziya yüklənmədi. Redaktə bloklanıb: ${editorErrorMessage(reloadError)}`)
      }
    } catch (mutationError: unknown) {
      if (mutationError instanceof ApiError && mutationError.status === 409 && conflictMessage) {
        setError(conflictMessage)
      } else if (
        name === 'solution'
        && mutationError instanceof ApiError
        && !(mutationError.status === 409 && typeof mutationError.detail === 'string' && mutationError.detail.includes('modified by another request'))
      ) {
        setError(solutionErrorMessage(mutationError))
      } else if (mutationError instanceof ApiError && mutationError.status === 409) {
        setIsStale(true)
        setError('Reviziya başqa sorğu tərəfindən dəyişdirilib. Son vəziyyət yüklənir; əməliyyatı yenidən özünüz başladın.')
        try {
          await fetchRevision(current.revision_id)
        } catch (reloadError: unknown) {
          setIsStale(true)
          setError(`Reviziya konflikti yarandı və son vəziyyət yüklənmədi. Redaktə bloklanıb: ${editorErrorMessage(reloadError)}`)
        }
      } else {
        setError(editorErrorMessage(mutationError))
      }
    } finally {
      setMutationPending(null)
    }
  }

  const revisionReadOnly = revision !== null && revision.status !== 'draft'
  const mutationDisabled = mutationPending !== null
    || isLoading
    || isCreatingDraft
    || isStale
    || revisionReadOnly

  const startEditing = (block: ContentBlockRead) => {
    if (block.block_type === 'text') setEditingValue(block.payload.source_text)
    else if (block.block_type === 'formula') setEditingValue(block.payload.source_latex)
    else return
    setEditingBlockId(block.id)
  }

  const saveEditing = (block: ContentBlockRead) => {
    if (block.block_type === 'text') {
      void runMutation('text-update', (token, current) =>
        updateTextBlock(token, current.revision_id, block.id, {
          document: simpleTextDocument(editingValue),
          format_version: 1,
          expected_revision_updated_at: current.updated_at,
        }), () => { setEditingBlockId(null); setEditingValue('') })
    } else if (block.block_type === 'formula') {
      void runMutation('formula-update', (token, current) =>
        updateFormulaBlock(token, current.revision_id, block.id, {
          source_latex: editingValue,
          format_version: 1,
          expected_revision_updated_at: current.updated_at,
        }), () => { setEditingBlockId(null); setEditingValue('') })
    }
  }

  const removeBlock = (block: ContentBlockRead) => {
    if (!window.confirm('Bu kontent blokunu silmək istədiyinizə əminsiniz?')) return
    void runMutation('delete', (token, current) =>
      deleteBlock(token, current.revision_id, block.id, {
        expected_revision_updated_at: current.updated_at,
      }), () => {
        if (editingBlockId === block.id) { setEditingBlockId(null); setEditingValue('') }
      })
  }

  const moveBlock = (index: number, direction: -1 | 1) => {
    if (revision === null) return
    const target = index + direction
    if (target < 0 || target >= revision.blocks.length) return
    const blockIds = revision.blocks.map((block) => block.id)
    ;[blockIds[index], blockIds[target]] = [blockIds[target], blockIds[index]]
    void runMutation('reorder', (token, current) =>
      reorderBlocks(token, current.revision_id, {
        block_ids: blockIds,
        expected_revision_updated_at: current.updated_at,
      }))
  }

  return (
    <main className="workspace admin-editor-workspace">
      <div className="content admin-editor-content">
        <header className="admin-editor-header">
          <button className="admin-editor-back" type="button" onClick={onBack}><ArrowLeft size={19} /> Geri</button>
          <div><span className="admin-editor-eyebrow">Admin iş sahəsi</span><h1>Sual redaktoru</h1><p>Sual reviziyalarını yaradın, yoxlayın və əsas kontent bloklarını idarə edin.</p></div>
        </header>

        <section className="admin-editor-create" aria-labelledby="draft-create-title">
          <div className="admin-editor-create__intro"><span className="admin-editor-create__icon"><Sparkles size={20} /></span><div><strong id="draft-create-title">Yeni sual qaralaması</strong><span>Aktiv sual tipini seçin və boş redaktor yaradın.</span></div></div>
          <div className="admin-editor-create__controls">
            <label><span>Sual tipi</span><select value={selectedQuestionTypeId} onChange={(event) => setSelectedQuestionTypeId(event.target.value)} disabled={questionTypesLoading || isCreatingDraft || mutationPending !== null || isStale}>
              {questionTypes.length === 0 && <option value="">{questionTypesLoading ? 'Yüklənir…' : 'Sual tipi yoxdur'}</option>}
              {questionTypes.map((type) => <option value={type.id} key={type.id}>{type.display_name} ({type.name})</option>)}
            </select></label>
            <button type="button" onClick={() => void createDraft()} disabled={questionTypesLoading || isCreatingDraft || isLoading || mutationPending !== null || isStale || !selectedQuestionTypeId}>
              {isCreatingDraft && <LoaderCircle className="admin-editor-spinner" size={18} />}{isCreatingDraft ? 'Yaradılır…' : 'Qaralama yarat'}
            </button>
          </div>
          {questionTypesError && <p className="admin-editor-create__error" role="alert">Sual tiplərini yükləmək mümkün olmadı: {questionTypesError}</p>}
        </section>

        <section className="admin-editor-loader" aria-labelledby="revision-loader-title">
          <div><strong id="revision-loader-title">Reviziyanı açın</strong><span>Sual reviziyasının UUID dəyərini daxil edin.</span></div>
          <form onSubmit={(event) => { event.preventDefault(); void loadRevision() }}>
            <input value={revisionInput} onChange={(event) => setRevisionInput(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" aria-label="Sual reviziyası UUID" disabled={isLoading || isCreatingDraft || mutationPending !== null} />
            <button type="submit" disabled={isLoading || isCreatingDraft || mutationPending !== null || !revisionInput.trim()}>
              {isLoading ? <LoaderCircle className="admin-editor-spinner" size={18} /> : isStale ? <RefreshCw size={18} /> : <Search size={18} />}{isLoading ? 'Yüklənir…' : isStale ? 'Sinxronlaşdır' : 'Reviziyanı aç'}
            </button>
          </form>
        </section>

        {error && <div className={`admin-editor-error${isStale ? ' admin-editor-error--stale' : ''}`} role="alert">{error}</div>}
        {mutationPending && <div className="admin-editor-pending"><LoaderCircle className="admin-editor-spinner" size={17} /> Dəyişiklik saxlanılır və reviziya yenilənir…</div>}

        {revision && <>
          <nav className="admin-editor-tabs" aria-label="Müəlliflik bölmələri">
            <button type="button" aria-current={activeSection === 'question' ? 'page' : undefined} onClick={() => setActiveSection('question')}>Sual</button>
            <button type="button" aria-current={activeSection === 'solution' ? 'page' : undefined} onClick={() => setActiveSection('solution')}>Həll</button>
            {['İpucu', 'Qiymətləndirmə', 'Tarixçə'].map((label) => <button type="button" disabled key={label}>{label}<small>Sonrakı mərhələ</small></button>)}
          </nav>
          <div className="admin-authoring-workspace-grid">
            <aside className="admin-authoring-source" aria-labelledby="source-panel-title">
              <span>Mənbə</span>
              <h2 id="source-panel-title">{revision.source_display_name ?? 'Təyin edilməyib'}</h2>
              <dl>
                <div><dt>Mənbə ID</dt><dd>{revision.source_id ?? 'Yoxdur'}</dd></div>
                <div><dt>Detal / səhifə</dt><dd>{revision.source_detail ?? 'Yoxdur'}</dd></div>
                <div><dt>Reviziya</dt><dd>#{revision.revision_number} · {revision.status}</dd></div>
              </dl>
              <div className="admin-authoring-source__placeholder">Orijinal mənbə görünüşü növbəti mərhələdə əlavə olunacaq.</div>
            </aside>
            <section className="admin-authoring-editor-column" aria-label="Manual sual redaktoru">
          {activeSection === 'question' ? <>
          <section className="admin-editor-metadata" aria-label="Reviziya məlumatları">
            <div><span>Reviziya</span><strong>#{revision.revision_number}</strong></div><div><span>Status</span><strong>{revision.status}</strong></div><div><span>Sual tipi ID</span><strong title={revision.question_type_id}>{revision.question_type_id}</strong></div><div><span>Mənbə</span><strong>{revision.source_display_name ?? 'Təyin edilməyib'}</strong></div><div><span>Mənbə ID</span><strong title={revision.source_id ?? undefined}>{revision.source_id ?? 'Təyin edilməyib'}</strong></div><div><span>Mənbə detalı</span><strong>{revision.source_detail ?? 'Təyin edilməyib'}</strong></div><div><span>Çətinlik</span><strong>{revision.difficulty ?? 'Təyin edilməyib'}</strong></div><div><span>Yenilənib</span><strong>{formatUpdatedAt(revision.updated_at)}</strong></div>
          </section>

          {revisionReadOnly && (
            <div className="admin-editor-read-only" role="status">
              Bu reviziya qaralama statusunda deyil və yalnız baxış üçün açılıb.
            </div>
          )}

          <section className="admin-editor-authoring" aria-label="Yeni kontent bloku">
            <form onSubmit={(event) => { event.preventDefault(); void runMutation('text-create', (token, current) => createTextBlock(token, current.revision_id, { block_type: 'text', payload: { document: simpleTextDocument(newText), format_version: 1 }, expected_revision_updated_at: current.updated_at }), () => setNewText('')) }}>
              <label><span><FileText size={17} /> Mətn əlavə et</span><textarea value={newText} onChange={(event) => setNewText(event.target.value)} placeholder="Mətn blokunun məzmunu" disabled={mutationDisabled} /></label>
              <button type="submit" disabled={mutationDisabled}><Plus size={16} /> Mətn əlavə et</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); if (!newFormula.trim()) return; void runMutation('formula-create', (token, current) => createFormulaBlock(token, current.revision_id, { block_type: 'formula', payload: { source_latex: newFormula, format_version: 1 }, expected_revision_updated_at: current.updated_at }), () => setNewFormula('')) }}>
              <label><span><SquareFunction size={17} /> Formula əlavə et</span><VisualMathInput value={newFormula} onChange={setNewFormula} disabled={mutationDisabled} ariaLabel="Yeni formula" /></label>
              <button type="submit" disabled={mutationDisabled || !newFormula.trim()}><Plus size={16} /> Formula əlavə et</button>
            </form>
          </section>

          <section className="admin-editor-blocks" aria-labelledby="revision-blocks-title">
            <div className="admin-editor-section-heading"><div><span>Kontent strukturu</span><h2 id="revision-blocks-title">Bloklar</h2></div><b>{revision.blocks.length}</b></div>
            {revision.blocks.length === 0 ? <div className="admin-editor-empty"><FileText size={34} /><strong>Bu reviziyada hələ kontent bloku yoxdur</strong><p>Yuxarıdakı sahələrdən ilk Mətn və ya Formula blokunu əlavə edin.</p></div> :
              <div className="admin-editor-block-list">{revision.blocks.map((block, index) => <BlockCard key={block.id} block={block} index={index} blockCount={revision.blocks.length} disabled={mutationDisabled} editingBlockId={editingBlockId} editingValue={editingValue} onEditingValueChange={setEditingValue} onStartEdit={startEditing} onCancelEdit={() => { setEditingBlockId(null); setEditingValue('') }} onSaveEdit={saveEditing} onDelete={removeBlock} onMove={moveBlock} />)}</div>}
          </section>
          <AnswerEditorSection
            revision={revision}
            disabled={mutationDisabled}
            runMutation={(operation, afterReload, conflictMessage) => {
              void runMutation('answer', operation, afterReload, conflictMessage)
            }}
          />
          </> : <SolutionEditorSection
            revision={revision}
            disabled={mutationDisabled}
            runMutation={(operation, afterReload, conflictMessage) => {
              void runMutation('solution', operation, afterReload, conflictMessage)
            }}
          />}
            </section>
            {activeSection === 'question' && <AIAuthoringPanel authenticatedRequest={authenticatedRequest} revisionId={revision.revision_id} onAccepted={() => fetchRevision(revision.revision_id).then(() => undefined)} />}
          </div>
        </>}
      </div>
    </main>
  )
}
