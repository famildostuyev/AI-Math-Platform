import { difficultyLabels, questionTypeLabel, statusLabels } from './questionPropertyLabels'
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  FileText,
  Save,
  X,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sparkles,
  Type,
  Sigma,
  Triangle,
  ChartLine,
  Table,
  ChartPie,
  Image,
  Network,
  Omega,
  type LucideIcon,
} from 'lucide-react'
import { ApiError } from '../api/client'
import {
  getQuestionTypes,
  type QuestionTypeCatalogResponse,
} from '../api/catalog'
import {
  createGeometryBlock,
  createQuestionDraft,
  createTextBlock,
  deleteBlock,
  getQuestionRevisionForEditor,
  reorderBlocks,
  updateFormulaBlock,
  updateGeometryBlock,
  updateVisualPlacement,
  type GeometryBlockRead,
  type PersistedVisualPlacement,
  updateTextBlock,
  updateQuestionMetadata,
  type QuestionMetadataRead,
  type QuestionMetadataUpdate,
  type QuestionDifficulty,
  type ContentBlockRead,
  type GeometrySourceDataV1,
  type QuestionRevisionEditorRead,
  type StructuredTextDocument,
} from '../api/questionEditor'
import AIAuthoringPanel from './AIAuthoringPanel'
import AnswerEditorSection from './AnswerEditorSection'
import { defaultGeometryPlacement } from './geometryFrameModel'
import SolutionEditorSection from './SolutionEditorSection'
import UniversalQuestionCanvas from './UniversalQuestionCanvas'
import { emptyGeometryV1, normalizeGeometrySourceDataV1 } from './geometryV1'
import {
  getUniversalEditorModule,
  UNIVERSAL_EDITOR_MODULES,
  type UniversalEditorModuleId,
} from './universalEditorModules'
import UniversalEditorRibbon from './UniversalEditorRibbon'
import UniversalEditorHistoryControls from './UniversalEditorHistoryControls'
import { fieldTraceState, traceContext } from './universalContextTrace'
import { UniversalEditorSessionContext, useUniversalEditorSession } from './universalEditorSession'
import './UniversalEditor.css'
import { adaptContentBlocksToUniversalDocument } from './universalEditorDocumentAdapter'

type AuthenticatedRequest = <T>(
  request: (accessToken: string) => Promise<T>,
) => Promise<T>

const MODULE_ICONS: Record<UniversalEditorModuleId, LucideIcon> = {
  text: Type, algebra: Sigma, geometry: Triangle, graph: ChartLine,
  table: Table, chart: ChartPie, image: Image, diagram: Network, symbols: Omega,
}

type AdminQuestionEditorProps = {
  authenticatedRequest: AuthenticatedRequest
  onBack: () => void
  initialRevisionId?: string
}

type MutationName = 'metadata' | 'text-create' | 'text-update' | 'formula-create'
  | 'formula-update' | 'geometry-create' | 'geometry-update' | 'delete' | 'reorder' | 'answer' | 'solution'

type EditorDocumentSectionId = 'question' | 'answer' | 'solution' | 'hint' | 'assessment' | 'history'

const EDITOR_DOCUMENT_SECTIONS: readonly {
  id: EditorDocumentSectionId
  label: string
  available: boolean
}[] = [
  { id: 'question', label: 'Sual', available: true },
  { id: 'answer', label: 'Cavab', available: true },
  { id: 'solution', label: 'Həll', available: true },
  { id: 'hint', label: 'İpucu', available: false },
  { id: 'assessment', label: 'Qiymətləndirmə', available: false },
  { id: 'history', label: 'Tarixçə', available: false },
] as const

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
  const [framePlacements, setFramePlacements] = useState<Record<string, PersistedVisualPlacement>>({})
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [selectedDocumentNodeId, setSelectedDocumentNodeId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [editingGeometry, setEditingGeometry] = useState<GeometrySourceDataV1 | null>(null)
  const [activeSection, setActiveSection] = useState<EditorDocumentSectionId>('question')
  const [activeModule, setActiveModule] = useState<UniversalEditorModuleId>('text')
  const restoreFormulaAfterModuleChange = useRef(false)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(true)
  const [documentDrawerOpen, setDocumentDrawerOpen] = useState(false)
  const documentDrawerRef = useRef<HTMLDialogElement>(null)
  const mutationInFlight = useRef(false)
  const documentButtonRef = useRef<HTMLButtonElement>(null)
  const session = useUniversalEditorSession()
  useLayoutEffect(() => {
    if (!restoreFormulaAfterModuleChange.current) return
    restoreFormulaAfterModuleChange.current = false
    traceContext('module-restore-formula-start', { module: activeModule, targetKind: session.getActiveContext()?.kind ?? null, field: fieldTraceState(session.math.current) })
    session.restoreMathTarget()
    traceContext('module-restore-formula-end', { module: activeModule, targetKind: session.getActiveContext()?.kind ?? null, field: fieldTraceState(session.math.current) })
  }, [activeModule, session])
  useEffect(() => {
    if (documentDrawerOpen) documentDrawerRef.current?.showModal()
    else documentDrawerRef.current?.close()
  }, [documentDrawerOpen])
  useLayoutEffect(() => {
    if (!documentDrawerOpen) return
    const drawer = documentDrawerRef.current
    const workspace = drawer?.parentElement?.querySelector('.universal-editor') ?? drawer?.parentElement
    if (!drawer || !workspace) return
    const positionDrawer = () => {
      const bounds = workspace.getBoundingClientRect()
      const top = Math.max(0, bounds.top)
      const right = Math.min(window.innerWidth, bounds.right)
      drawer.style.setProperty('--document-drawer-top', `${top}px`)
      drawer.style.setProperty('--document-drawer-right', `${Math.max(0, window.innerWidth - right)}px`)
      drawer.style.setProperty('--document-drawer-height', `${Math.max(0, Math.min(window.innerHeight, bounds.bottom) - top)}px`)
      drawer.style.setProperty('--document-drawer-width', `${Math.max(0, right - Math.max(0, bounds.left))}px`)
    }
    positionDrawer()
    const observer = new ResizeObserver(positionDrawer)
    observer.observe(workspace)
    window.addEventListener('resize', positionDrawer)
    window.addEventListener('scroll', positionDrawer, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', positionDrawer)
      window.removeEventListener('scroll', positionDrawer, true)
    }
  }, [documentDrawerOpen])
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
        setSelectedDocumentNodeId(null)
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
      setSelectedDocumentNodeId(null)
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
      setSelectedDocumentNodeId(null)
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
      || mutationInFlight.current
      || isLoading
      || isCreatingDraft
      || isStale
    ) return false
    setMutationPending(name)
    mutationInFlight.current = true
    setError(null)
    try {
      await authenticatedRequest((token) => operation(token, current))
      try {
        await fetchRevision(current.revision_id)
        afterReload?.()
        return true
      } catch (reloadError: unknown) {
        setIsStale(true)
        setError(`Əməliyyat tamamlandı, lakin yenilənmiş reviziya yüklənmədi. Redaktə bloklanıb: ${editorErrorMessage(reloadError)}`)
        return false
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
      return false
    } finally {
      setMutationPending(null)
      mutationInFlight.current = false
    }
  }

  const revisionReadOnly = revision !== null && revision.status !== 'draft'
  const mutationDisabled = mutationPending !== null
    || isLoading
    || isCreatingDraft
    || isStale
    || revisionReadOnly
  const universalDocument = useMemo(
    () => adaptContentBlocksToUniversalDocument(revision?.blocks ?? []),
    [revision?.blocks],
  )
  const applyMetadata = (result: QuestionMetadataRead) => {
    // Keep mounted content objects/history and unsaved structured text intact.
    setRevision((current) => current?.revision_id === result.revision_id ? {
      ...current, question_type_id: result.question_type_id, difficulty: result.difficulty,
      updated_at: result.updated_at, answer_policy: result.answer_policy,
    } : current)
  }
  const updateMetadata = async (change: Omit<QuestionMetadataUpdate, 'expected_revision_updated_at'>) => {
    if (!revision || mutationDisabled || mutationInFlight.current) return
    const current = revision
    mutationInFlight.current = true
    setMutationPending('metadata')
    setError(null)
    try {
      const persisted = await authenticatedRequest((token) => updateQuestionMetadata(token, current.revision_id, {
        ...change, expected_revision_updated_at: current.updated_at,
      }))
      applyMetadata(persisted)
    } catch (mutationError: unknown) {
      if (mutationError instanceof ApiError && mutationError.status === 409) {
        if (mutationError.detail === 'Question type is shared by other revisions.') {
          setError('Bu sual tipi digər reviziyalarla ortaqdır. Onu burada dəyişmək mümkün deyil.')
        } else {
          setIsStale(true)
          setError('Reviziya dəyişib. Son vəziyyəti sinxronlaşdırın və əməliyyatı yenidən başladın.')
        }
      } else {
        setError(editorErrorMessage(mutationError))
      }
    } finally {
      mutationInFlight.current = false
      setMutationPending(null)
    }
  }
  const blockForNode = (nodeId: string) => revision?.blocks.find((block) => block.id === nodeId) ?? null

  const startEditing = (block: ContentBlockRead) => {
    if (block.block_type === 'formula') setEditingValue(block.payload.source_latex)
    else if (block.block_type === 'geometry') {
      const geometry = normalizeGeometrySourceDataV1(block.payload.source_data)
      if (geometry === null) return
      setEditingGeometry(structuredClone(geometry))
      setActiveModule('geometry')
      session.activateGeometry(block.id)
    }
    else return
    setEditingBlockId(block.id)
  }

  const clearFrameDraft = (id: string) => setFramePlacements(current => {
    const next = { ...current }; delete next[id]; return next
  })
  const saveFrame = (id: string) => {
    const placement = framePlacements[id]
    if (!placement) return
    void runMutation('geometry-update', (token, current) => updateVisualPlacement(token, current.revision_id, id,
      placement, current.updated_at), () => clearFrameDraft(id))
  }
  const createGeometryFrame = () => {
    if (editingBlockId) { setError('Əvvəlcə cari redaktəni yadda saxlayın və ya ləğv edin.'); return }
    const geometry = { ...emptyGeometryV1(), description: 'Həndəsə təsviri' }
    const canvas = document.querySelector('.universal-question-canvas')
    const placement = defaultGeometryPlacement(geometry, canvas?.scrollHeight ?? 0)
    let created: GeometryBlockRead | null = null
    void runMutation('geometry-create', async (token, current) => {
      created = await createGeometryBlock(token, current.revision_id, {
        block_type: 'geometry', payload: { source_data: geometry, format_version: 1 },
        visual_placement: placement, expected_revision_updated_at: current.updated_at,
      })
    }, () => {
      if (!created) return
      setSelectedDocumentNodeId(created.id); startEditing(created)
      const id = created.id
      requestAnimationFrame(() => document.querySelector(`[data-frame-id="${id}"]`)?.scrollIntoView({ block: 'center' }))
    })
  }
  const saveEditing = (block: ContentBlockRead) => {
    if (block.block_type === 'formula') {
      void runMutation('formula-update', (token, current) =>
        updateFormulaBlock(token, current.revision_id, block.id, {
          source_latex: editingValue,
          format_version: 1,
          expected_revision_updated_at: current.updated_at,
        }), () => { setEditingBlockId(null); setEditingValue('') })
    } else if (block.block_type === 'geometry' && editingGeometry !== null) {
      // A frame-only gesture must not canonicalize or rewrite the Geometry payload,
      // including a legacy V1 payload with omitted optional fields.
      if (JSON.stringify(editingGeometry) === JSON.stringify(normalizeGeometrySourceDataV1(block.payload.source_data))) {
        const placement = framePlacements[block.id]
        if (placement) void runMutation('geometry-update', (token, current) => updateVisualPlacement(token,
          current.revision_id, block.id, placement, current.updated_at),
        () => { setEditingBlockId(null); setEditingGeometry(null); clearFrameDraft(block.id) })
        else { setEditingBlockId(null); setEditingGeometry(null) }
        return
      }
      void runMutation('geometry-update', (token, current) =>
        updateGeometryBlock(token, current.revision_id, block.id, {
          visual_placement: framePlacements[block.id],
          source_data: editingGeometry,
          format_version: 1,
          expected_revision_updated_at: current.updated_at,
        }), () => { setEditingBlockId(null); setEditingGeometry(null); clearFrameDraft(block.id) })
    }
  }

  const removeBlock = (block: ContentBlockRead) => {
    if (!window.confirm('Bu məzmunu silmək istədiyinizə əminsiniz?')) return
    void runMutation('delete', (token, current) =>
      deleteBlock(token, current.revision_id, block.id, {
        expected_revision_updated_at: current.updated_at,
      }), () => {
        if (editingBlockId === block.id) { setEditingBlockId(null); setEditingValue(''); setEditingGeometry(null) }
        if (selectedDocumentNodeId === block.id) setSelectedDocumentNodeId(null)
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

  const createDirectText = (document: StructuredTextDocument) =>
    runMutation('text-create', (token, current) => createTextBlock(token, current.revision_id, {
      block_type: 'text',
      payload: { document, format_version: 1 },
      expected_revision_updated_at: current.updated_at,
    }))

  const updateStructuredText = (blockId: string, document: StructuredTextDocument) =>
    runMutation('text-update', (token, current) => updateTextBlock(
      token,
      current.revision_id,
      blockId,
      {
        document,
        format_version: 1,
        expected_revision_updated_at: current.updated_at,
      },
    ))

  return (
    <UniversalEditorSessionContext.Provider value={session}>
    <main className="workspace admin-editor-workspace">
      <div className="content admin-editor-content">
        <header className="admin-editor-header">
          <button className="admin-editor-back" type="button" onClick={onBack}><ArrowLeft size={19} /> Sual bazası</button>
          <div className="admin-editor-header__identity"><h1>Universal Sual Redaktoru</h1></div>
          <div className="admin-editor-header__status" aria-label="Cari sənəd statusu">
            {revision ? <><span>{statusLabels[revision.status]}</span><small>Reviziya #{revision.revision_number}</small></> : <small>Sənəd açılmayıb</small>}
          </div>
          <UniversalEditorHistoryControls disabled={!revision || mutationDisabled || activeSection !== 'question'} />
          <button ref={documentButtonRef} data-editor-ribbon="" type="button" aria-haspopup="dialog" aria-expanded={documentDrawerOpen} onClick={() => setDocumentDrawerOpen(true)}><FileText size={16} /> Sənəd</button>
          <button type="button" data-editor-ribbon="" disabled={!revision || mutationDisabled || activeSection !== 'question'} onMouseDown={(event) => event.preventDefault()} onClick={() => {
            const block = editingBlockId ? blockForNode(editingBlockId) : null
            if (block) saveEditing(block)
            else if (selectedDocumentNodeId && framePlacements[selectedDocumentNodeId]) saveFrame(selectedDocumentNodeId)
            else void session.save.current?.()
          }}><Save size={16} /> Yadda saxla</button>
        </header>

        {!revision && <div className="admin-editor-entrybar" aria-label="Sual və reviziya əməliyyatları">
        <section className="admin-editor-create" aria-labelledby="draft-create-title">
          <div className="admin-editor-create__intro"><span className="admin-editor-create__icon"><Sparkles size={20} /></span><div><strong id="draft-create-title">Yeni sual qaralaması</strong><span>Aktiv sual tipini seçin və boş redaktor yaradın.</span></div></div>
          <div className="admin-editor-create__controls">
            <label><span>Sual tipi</span><select value={selectedQuestionTypeId} onChange={(event) => setSelectedQuestionTypeId(event.target.value)} disabled={questionTypesLoading || isCreatingDraft || mutationPending !== null || isStale}>
              {questionTypes.length === 0 && <option value="">{questionTypesLoading ? 'Yüklənir…' : 'Sual tipi yoxdur'}</option>}
              {questionTypes.map((type) => <option value={type.id} key={type.id}>{questionTypeLabel(type)}</option>)}
            </select></label>
            <button type="button" onClick={() => void createDraft()} disabled={questionTypesLoading || isCreatingDraft || isLoading || mutationPending !== null || isStale || !selectedQuestionTypeId}>
              {isCreatingDraft && <LoaderCircle className="admin-editor-spinner" size={18} />}{isCreatingDraft ? 'Yaradılır…' : 'Qaralama yarat'}
            </button>
          </div>
          {questionTypesError && <p className="admin-editor-create__error" role="alert">Sual tiplərini yükləmək mümkün olmadı: {questionTypesError}</p>}
        </section>

        </div>}

        {error && <div className={`admin-editor-error${isStale ? ' admin-editor-error--stale' : ''}`} role="alert">{error}</div>}
        {mutationPending && <div className="admin-editor-pending"><LoaderCircle className="admin-editor-spinner" size={17} /> Dəyişiklik saxlanılır və reviziya yenilənir…</div>}

        <dialog ref={documentDrawerRef} data-editor-ribbon="" className="universal-editor-document-drawer" aria-label="Sənəd" onCancel={() => setDocumentDrawerOpen(false)} onClose={() => { setDocumentDrawerOpen(false); documentButtonRef.current?.focus() }} onClick={(event) => { if (event.target === event.currentTarget) setDocumentDrawerOpen(false) }}>
          <section aria-label="Sənəd paneli">
            <header><h2>Sənəd</h2><button type="button" aria-label="Sənədi bağla" onClick={() => setDocumentDrawerOpen(false)}><X size={18} /></button></header>
            <div className="universal-editor-document-properties">
            {revision && <dl>
              <div><dt>Reviziya</dt><dd>#{revision.revision_number}</dd></div>
              <div><dt>Status</dt><dd>{statusLabels[revision.status]}</dd></div>
              <div><dt><label htmlFor="document-question-type">Sual tipi</label></dt><dd>
                <select id="document-question-type" value={revision.question_type_id} disabled={mutationDisabled || questionTypesLoading || !questionTypes.some((type) => type.id === revision.question_type_id)} onChange={(event) => void updateMetadata({ question_type_id: event.target.value })}>
                  {!questionTypes.some((type) => type.id === revision.question_type_id) && <option value={revision.question_type_id}>{questionTypesLoading ? 'Yüklənir…' : 'Cari sual tipi yüklənmədi'}</option>}
                  {questionTypes.map((type) => <option key={type.id} value={type.id}>{questionTypeLabel(type)}</option>)}
                </select>
              </dd></div>
              <div><dt>Mənbə</dt><dd>{revision.source_display_name ?? 'Təyin edilməyib'}</dd></div>
              <div><dt>Mənbə detalı</dt><dd>{revision.source_detail ?? 'Təyin edilməyib'}</dd></div>
              <div><dt><label htmlFor="document-difficulty">Çətinlik</label></dt><dd>
                <select id="document-difficulty" value={revision.difficulty ?? ''} disabled={mutationDisabled} onChange={(event) => void updateMetadata({ difficulty: (event.target.value || null) as QuestionDifficulty | null })}>
                  <option value="">Təyin edilməyib</option>
                  {Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </dd></div>
              <div><dt>Yenilənib</dt><dd>{formatUpdatedAt(revision.updated_at)}</dd></div>
            </dl>}
            {error && <p role="alert">{error}</p>}
            {isStale && <button type="button" disabled={isLoading} onClick={() => void loadRevision()}>Sinxronlaşdır</button>}
            </div>
          </section>
        </dialog>
        {isStale && <button type="button" onClick={() => void loadRevision()} disabled={isLoading}><RefreshCw size={16} /> Sinxronlaşdır</button>}
        {revision && <>
          <section className="universal-editor" aria-label="Universal sual redaktoru">
            <nav className="universal-editor-sections" aria-label="Sənəd bölmələri">
              {EDITOR_DOCUMENT_SECTIONS.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  disabled={!section.available}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                  title={section.available ? `${section.label} bölməsini aç` : 'Növbəti mərhələ'}
                  onClick={section.available ? () => { session.history.activate(null); session.showAI(false); setActiveSection(section.id) } : undefined}
                >{section.label}{!section.available && <small>Sonra</small>}</button>
              ))}
            </nav>
          <div className="universal-editor-modules" role="tablist" aria-label="Redaktor modulları" data-active-module={activeModule}>
            {UNIVERSAL_EDITOR_MODULES.map((module) => {
              const Icon = MODULE_ICONS[module.id]
              return (
              <button
                className="universal-editor-module-tab"
                type="button"
                role="tab"
                aria-selected={activeModule === module.id}
                key={module.id}
                disabled={!module.available || activeSection !== 'question'}
                title={module.description}
                onPointerDown={() => traceContext('module-pointerdown', { previousModule: activeModule, nextModule: module.id, targetKind: session.activeContext.current?.kind ?? null, field: fieldTraceState(session.math.current) })}
                onClick={() => {
                  traceContext('module-click', { previousModule: activeModule, nextModule: module.id, targetKind: session.activeContext.current?.kind ?? null, field: fieldTraceState(session.math.current) })
                  restoreFormulaAfterModuleChange.current = module.id !== activeModule && session.getActiveContext()?.kind === 'formula'
                  setActiveModule(module.id)
                }}
              ><Icon size={15} aria-hidden="true" />{module.label}</button>
              )
            })}
          </div>
          {activeSection === 'question' && <UniversalEditorRibbon module={activeModule} disabled={mutationDisabled} onCreateGeometryFrame={createGeometryFrame} />}
          <div className={`admin-authoring-workspace-grid universal-editor-layout${leftPanelCollapsed ? ' is-left-collapsed' : ''}`}>
            <aside className="admin-authoring-source universal-editor-sidebar universal-editor-sidebar--left" aria-label="Sənəd naviqasiyası">
              <div className="universal-editor-pages-header">
              {!leftPanelCollapsed && <strong>Səhifələr</strong>}
              <button
                className="universal-editor-collapse"
                type="button"
                onClick={() => setLeftPanelCollapsed((collapsed) => !collapsed)}
                title={leftPanelCollapsed ? 'Səhifələr panelini genişləndir' : 'Səhifələr panelini yığ'}
                aria-label={leftPanelCollapsed ? 'Səhifələr panelini genişləndir' : 'Səhifələr panelini yığ'}
                aria-expanded={!leftPanelCollapsed}
              >{leftPanelCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button>
              </div>
              {!leftPanelCollapsed && <ol className="universal-editor-pages-list" aria-label="Səhifələr">
                {/* The loaded revision has one continuous document surface, not a paginated page collection. */}
                <li className="universal-editor-page-item" aria-current="page" data-document-id={revision.revision_id}>
                  <span className="universal-editor-page-preview" aria-hidden="true" />
                  <span>Səhifə 1</span>
                </li>
              </ol>}
            </aside>
            <section className="admin-authoring-editor-column universal-editor-canvas" aria-label="Manual sual redaktoru">
          {activeSection === 'question' ? <>
          {revisionReadOnly && (
            <div className="admin-editor-read-only" role="status">
              Bu reviziya qaralama statusunda deyil və yalnız baxış üçün açılıb.
            </div>
          )}

          {!getUniversalEditorModule(activeModule).available && <div className="universal-editor-future-module">
            <strong>{getUniversalEditorModule(activeModule).label} modulu</strong>
            <p>Bu modulun alətləri ayrıca tətbiq mərhələsində qoşulacaq. Cari reviziya və bloklar dəyişməz qalır.</p>
          </div>}

          <UniversalQuestionCanvas
            key={revision.revision_id}
            document={universalDocument}
            framePlacements={framePlacements}
            onFramePlacementChange={(id, placement) => setFramePlacements(current => ({ ...current, [id]: placement }))}
            onSaveFrame={saveFrame}
            selectedNodeId={selectedDocumentNodeId}
            editingNodeId={editingBlockId}
            editingValue={editingValue}
            editingGeometry={editingGeometry}
            textAuthoringEnabled={activeModule === 'text' || activeModule === 'algebra'}
            disabled={mutationDisabled}
            onSelectNode={(nodeId) => {
              if (editingGeometry && editingBlockId && nodeId && nodeId !== editingBlockId) {
                setError('Əvvəlcə cari həndəsə redaktəsini yadda saxlayın və ya ləğv edin.'); return
              }
              setSelectedDocumentNodeId(nodeId)
              const node = universalDocument.nodes.find((item) => item.id === nodeId)
              if (node?.type !== 'paragraph' && node?.type !== 'geometry') session.history.activate(null)
              if (node?.type === 'geometry') session.activateGeometry(node.id)
            }}
            onEditingValueChange={setEditingValue}
            onEditingGeometryChange={setEditingGeometry}
            onCreateText={createDirectText}
            onUpdateText={updateStructuredText}
            onStartEdit={(nodeId) => {
              const block = blockForNode(nodeId)
              if (block) { setSelectedDocumentNodeId(nodeId); startEditing(block) }
            }}
            onCancelEdit={() => { if (editingBlockId) clearFrameDraft(editingBlockId); setEditingBlockId(null); setEditingValue(''); setEditingGeometry(null) }}
            onSaveEdit={(nodeId) => {
              const block = blockForNode(nodeId)
              if (block) saveEditing(block)
            }}
            onDelete={(nodeId) => {
              const block = blockForNode(nodeId)
              if (block) removeBlock(block)
            }}
            onMove={(nodeId, direction) => {
              const index = universalDocument.nodes.findIndex((node) => node.id === nodeId)
              if (index >= 0) moveBlock(index, direction)
            }}
          />
          </> : activeSection === 'answer' ? <AnswerEditorSection
            revision={revision}
            disabled={mutationDisabled}
            runMutation={(operation, afterReload, conflictMessage) => {
              void runMutation('answer', operation, afterReload, conflictMessage)
            }}
          /> : activeSection === 'solution' ? <SolutionEditorSection
            revision={revision}
            disabled={mutationDisabled}
            runMutation={(operation, afterReload, conflictMessage) => {
              void runMutation('solution', operation, afterReload, conflictMessage)
            }}
          /> : <div className="universal-editor-future-section">Bu sənəd bölməsi növbəti tətbiq mərhələsi üçün hazırlanıb.</div>}
            </section>


            {activeSection === 'question' && <div className="universal-editor-ai" hidden={session.bottomPanel === 'keyboard'} onFocusCapture={() => session.history.activate(null)}>
              <AIAuthoringPanel embedded expanded={session.bottomPanel === 'ai'} onExpandedChange={session.showAI} contextLabel={session.mathContext ? `Sual › Formula: ${session.mathContext}` : 'Sual'} key={revision.revision_id} authenticatedRequest={authenticatedRequest} revisionId={revision.revision_id} onAccepted={() => fetchRevision(revision.revision_id).then(() => undefined)} onOpenRevision={(revisionId) => fetchRevision(revisionId).then(() => undefined)} />
            </div>}
          </div>
          </section>
        </>}
      </div>
    </main>
    </UniversalEditorSessionContext.Provider>
  )
}
