import { useRef, useState } from 'react'
import { AlertTriangle, Bot, Check, LoaderCircle, Send, X } from 'lucide-react'
import { ApiError } from '../api/client'
import {
  createAdminAIReplacementProposal,
  generateAdminAISimilarQuestionDrafts,
  promoteAdminAIQuestionDraft,
  queryAdminAI,
  type AdminAICapabilityResult,
  type AdminAIInspectPayload,
  type AdminAIGeneratedDraft,
  type AdminAIOrchestrationResult,
  type AdminAIQuestionDraftPromotionResponse,
  type AdminAISimilarQuestionDraftRead,
  type AdminAISearchPayload,
  type AdminAIStatisticsPayload,
} from '../api/adminAI'
import type { StructuredContent } from '../api/questionExtraction'
import {
  acceptProposal,
  closeConversation,
  createConversation,
  getProposal,
  getProposalPreview,
  rejectProposal,
  submitUserTurn,
  type ConversationRead,
  type MessageRead,
  type PreviewValue,
  type PreviewWarningCode,
  type ProposalPreviewRead,
  type ProposalRead,
} from '../api/aiAuthoring'
import MathContent from './MathContent'
import SolutionPresentation from './SolutionPresentation'
import { structuredExplanationToPresentationItems } from './solutionPresentationModel'

type AuthenticatedRequest = <T>(request: (accessToken: string) => Promise<T>) => Promise<T>

type AIAuthoringPanelProps = {
  authenticatedRequest: AuthenticatedRequest
  revisionId: string
  onAccepted: () => Promise<void>
  onOpenRevision: (revisionId: string) => Promise<void>
}

type AdminAIHistoryItem = {
  id: number
  instruction: string
  result: AdminAIOrchestrationResult
  promotion: AdminAIQuestionDraftPromotionResponse | null
}

type SimilarQuestionDraftItem = Omit<AdminAISimilarQuestionDraftRead, 'persistent_draft_status'> & {
  persistent_draft_status: 'active' | 'promoted'
  promotion: AdminAIQuestionDraftPromotionResponse | null
}

function canPromotePersistentQuestionDraft(result: AdminAIOrchestrationResult): boolean {
  return result.generated_draft?.draft_kind === 'question'
    && result.persistent_draft_id !== null
    && result.persistent_draft_status === 'active'
}

const ADMIN_AI_HISTORY_TURN_LIMIT = 8
const ADMIN_AI_HISTORY_TURN_CHAR_LIMIT = 4_000
const ADMIN_AI_HISTORY_TOTAL_CHAR_LIMIT = 24_000

function visibleGeneratedDraftContext(draft: AdminAIGeneratedDraft): string {
  const segments = draft.content.segments
    .map((segment) => segment.type === 'text' ? segment.text : segment.source_text)
    .join(' ')
  const options = draft.answer_options
    .map((option) => `${option.label}: ${option.text}`)
    .join('\n')
  const correct = draft.correct_option_labels.length > 0
    ? `Düzgün cavab: ${draft.correct_option_labels.join(', ')}`
    : ''
  const explanation = draft.explanation?.segments
    .map((segment) => segment.type === 'text' ? segment.text : segment.source_text)
    .join(' ') ?? ''
  return [draft.title ?? '', segments, options, correct, explanation].filter(Boolean).join('\n')
}

function boundedConversationContext(history: AdminAIHistoryItem[]) {
  const referencedDraft = [...history].reverse().find((item) => item.result.generated_draft)?.result.generated_draft ?? null
  const turns = history.flatMap((item) => [
    { role: 'admin' as const, content: item.instruction },
    {
      role: 'assistant' as const,
      content: item.result.generated_draft
        ? `${item.result.assistant_text}\n${visibleGeneratedDraftContext(item.result.generated_draft)}`
        : item.result.assistant_text,
    },
  ]).map((turn) => ({ ...turn, content: turn.content.slice(0, ADMIN_AI_HISTORY_TURN_CHAR_LIMIT) }))
    .slice(-ADMIN_AI_HISTORY_TURN_LIMIT)
  while (turns.reduce((total, turn) => total + turn.content.length, 0) > ADMIN_AI_HISTORY_TOTAL_CHAR_LIMIT) {
    turns.shift()
  }
  return turns.length > 0 ? { turns, referenced_draft: referencedDraft } : null
}

const statusLabels: Record<string, string> = {
  draft: 'Qaralama',
  approved: 'Təsdiqlənib',
  archived: 'Arxivlənib',
}

const universalProposalStatusLabels: Record<string, string> = {
  pending: 'Təklif təsdiq gözləyir.',
  accepted: 'Admin tərəfindən təsdiqlənmiş dəyişiklik tətbiq edildi.',
  rejected: 'Təklif ləğv edildi; canonical sual dəyişdirilmədi.',
  obsolete: 'Təklif köhnəlib və tətbiq edilə bilməz.',
}

const difficultyLabels: Record<string, string> = {
  easy: 'Asan',
  medium: 'Orta',
  hard: 'Çətin',
}

const dimensionLabels: Record<AdminAIStatisticsPayload['grouping_dimension'], string> = {
  question_type: 'Sual növü',
  primary_topic: 'Əsas mövzu',
  difficulty: 'Çətinlik',
  status: 'Status',
  source: 'Mənbə',
}

function readOnlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sessiya etibarlı deyil. Yenidən daxil olun.'
    if (error.status === 403) return 'Admin AI üçün icazəniz yoxdur.'
    if (error.status === 422) return 'Sorğu icra edilə bilmədi. Təlimatı dəqiqləşdirin.'
    if (error.status === 429) return 'Admin AI hazırda çox yüklənib. Bir az sonra yenidən yoxlayın.'
    if (error.status === 502) return 'Admin AI etibarlı nəticə qaytara bilmədi.'
    if (error.status === 503) return 'Admin AI hazırda əlçatan deyil.'
    if (error.status === 504) return 'Admin AI sorğusu vaxt limitini keçdi.'
  }
  return 'Admin AI sorğusunu icra etmək mümkün olmadı. Şəbəkə bağlantısını yoxlayın.'
}

function isInspectPayload(payload: Record<string, unknown>): payload is AdminAIInspectPayload {
  return typeof payload.revision_number === 'number'
    && typeof payload.revision_status === 'string'
    && Array.isArray(payload.blocks)
    && Array.isArray(payload.answer_options)
    && Array.isArray(payload.accepted_answers)
}

function isSearchPayload(payload: Record<string, unknown>): payload is AdminAISearchPayload {
  return typeof payload.total === 'number'
    && typeof payload.page === 'number'
    && typeof payload.page_size === 'number'
    && Array.isArray(payload.items)
}

function isStatisticsPayload(payload: Record<string, unknown>): payload is AdminAIStatisticsPayload {
  return typeof payload.total === 'number'
    && typeof payload.grouping_dimension === 'string'
    && Array.isArray(payload.groups)
    && typeof payload.groups_truncated === 'boolean'
}

function InspectResult({ payload }: { payload: Record<string, unknown> }) {
  if (!isInspectPayload(payload)) return <p>Nəticə göstərilə bilmədi.</p>
  const summary = payload.blocks.find((block) => block.block_type === 'text' && block.source_text)?.source_text
  const answerCount = payload.answer_options.length + payload.accepted_answers.length
  return <section className="admin-ai-result-section">
    <h4>Sual haqqında</h4>
    {summary && <p className="admin-ai-question-summary">{summary}</p>}
    <dl className="admin-ai-metadata">
      <div><dt>Status</dt><dd>{statusLabels[payload.revision_status] ?? payload.revision_status}</dd></div>
      <div><dt>Çətinlik</dt><dd>{payload.difficulty ? (difficultyLabels[payload.difficulty] ?? payload.difficulty) : 'Göstərilməyib'}</dd></div>
      <div><dt>Bloklar</dt><dd>{payload.blocks.length}</dd></div>
      <div><dt>Cavablar</dt><dd>{answerCount > 0 ? `${answerCount} cavab` : 'Yoxdur'}</dd></div>
      <div><dt>Həll</dt><dd>{payload.solution ? `${payload.solution.blocks.length} addım` : 'Yoxdur'}</dd></div>
      <div><dt>Mənbə</dt><dd>{payload.source?.display_name ?? 'Göstərilməyib'}</dd></div>
    </dl>
  </section>
}

function SearchResult({ payload }: { payload: Record<string, unknown> }) {
  if (!isSearchPayload(payload)) return <p>Nəticə göstərilə bilmədi.</p>
  return <section className="admin-ai-result-section">
    <h4>Tapılan suallar</h4>
    <p>{payload.total} uyğun sual · bu səhifədə {payload.items.length}</p>
    {payload.items.length > 0
      ? <div className="admin-ai-search-results">{payload.items.map((item) => <article key={item.revision_id} data-revision-id={item.revision_id}>
        <strong>{item.question_type_display_name}</strong>
        <p>{item.text_preview || 'Mətn önizləməsi yoxdur.'}</p>
        <small>{statusLabels[item.status] ?? item.status}{item.difficulty ? ` · ${difficultyLabels[item.difficulty] ?? item.difficulty}` : ''}{item.primary_topic_display_name ? ` · ${item.primary_topic_display_name}` : ''}</small>
      </article>)}</div>
      : <p>Uyğun sual tapılmadı.</p>}
  </section>
}

function StatisticsResult({ payload }: { payload: Record<string, unknown> }) {
  if (!isStatisticsPayload(payload)) return <p>Nəticə göstərilə bilmədi.</p>
  const dimension = dimensionLabels[payload.grouping_dimension] ?? payload.grouping_dimension
  return <section className="admin-ai-result-section">
    <h4>Statistika · {dimension}</h4>
    <p>Ümumi: {payload.total}</p>
    <ul className="admin-ai-statistics">{payload.groups.map((group) => <li key={group.key}><span>{group.label}</span><strong>{group.count}</strong></li>)}</ul>
    {payload.groups_truncated && <p className="admin-ai-result-note">Qrupların yalnız bir hissəsi göstərilir.</p>}
  </section>
}

function CapabilityResultView({ result }: { result: AdminAICapabilityResult }) {
  if (result.capability_name === 'admin_ai.inspect_current_question') return <InspectResult payload={result.payload} />
  if (result.capability_name === 'admin_ai.search_questions') return <SearchResult payload={result.payload} />
  if (result.capability_name === 'admin_ai.aggregate_question_statistics') return <StatisticsResult payload={result.payload} />
  return <section className="admin-ai-result-section"><p>Bu nəticə növü hələ göstərilmir.</p></section>
}

function AssistantContentView({ content, fallbackText }: { content: StructuredContent | null; fallbackText: string }) {
  return <div className="admin-ai-answer-text"><MathContent content={content} fallbackText={fallbackText} /></div>
}

function GeneratedDraftView({ draft, proposalPreview = false, persistent = false }: { draft: AdminAIGeneratedDraft; proposalPreview?: boolean; persistent?: boolean }) {
  const correct = new Set(draft.correct_option_labels)
  return <section className="admin-ai-result-section admin-ai-generated-draft">
    <h4>{draft.title ?? 'Hazırlanmış qaralama'}</h4>
    <AssistantContentView content={draft.content} fallbackText="Qaralama göstərilə bilmədi." />
    {draft.answer_options.length > 0 && <ol className="admin-ai-draft-options">
      {draft.answer_options.map((option) => <li key={option.label}>
        <strong>{option.label}</strong>{' — '}
        <MathContent content={option.content} fallbackText={option.text} />
        {correct.has(option.label) && <span className="admin-ai-correct-option"> · düzgün cavab</span>}
      </li>)}
    </ol>}
    {draft.explanation && <div><h5>İzah</h5><SolutionPresentation items={structuredExplanationToPresentationItems(draft.explanation)} ariaLabel="AI qaralamasının həlli" /></div>}
    <p className="admin-ai-result-note">{proposalPreview
      ? 'Bu dəyişiklik pending təklif kimi saxlanılıb və yalnız Admin təsdiqindən sonra tətbiq ediləcək.'
      : persistent
        ? 'Bu qeyri-kanonik qaralama saxlanılıb; canonical sual yalnız Admin təsdiqi ilə yaradıla bilər.'
        : 'Bu qaralama sistemdə saxlanılmayıb.'}</p>
  </section>
}

function AdminAIResponse({ result }: { result: AdminAIOrchestrationResult }) {
  if (result.response_kind === 'mutation_proposal') {
    return <div className="admin-ai-capability-results">
      <AssistantContentView content={result.assistant_content} fallbackText={result.assistant_text} />
      {result.generated_draft && <GeneratedDraftView draft={result.generated_draft} proposalPreview />}
      <p className="admin-ai-result-note">Dəyişiklik yalnız ayrıca təklif, önizləmə və Admin təsdiqindən sonra tətbiq oluna bilər.</p>
    </div>
  }
  if (result.envelope.result_kind === 'unsupported') {
    return <p>{result.envelope.unsupported_reason ?? 'Bu əməliyyat hazırda mövcud deyil.'}</p>
  }
  return <div className="admin-ai-capability-results">
    <AssistantContentView content={result.assistant_content} fallbackText={result.assistant_text} />
    {result.generated_draft && <GeneratedDraftView draft={result.generated_draft} persistent={result.persistent_draft_id !== null} />}
    {result.envelope.capability_results.map((capability, index) => <CapabilityResultView
      key={`${capability.capability_name}-${index}`}
      result={capability}
    />)}
    {result.envelope.warnings.length > 0 && <ul className="ai-authoring-warnings">
      {result.envelope.warnings.map((warning) => <li key={warning.code}><AlertTriangle size={14} /> {warning.message}</li>)}
    </ul>}
  </div>
}

export default function AIAuthoringPanel({ authenticatedRequest, revisionId, onAccepted, onOpenRevision }: AIAuthoringPanelProps) {
  const [instruction, setInstruction] = useState('')
  const [history, setHistory] = useState<AdminAIHistoryItem[]>([])
  const [similarCount, setSimilarCount] = useState('3')
  const [similarConstraints, setSimilarConstraints] = useState('')
  const [similarDrafts, setSimilarDrafts] = useState<SimilarQuestionDraftItem[]>([])
  const [similarGenerationPending, setSimilarGenerationPending] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestInFlight = useRef(false)
  const replacementRequestsInFlight = useRef(new Set<number>())
  const promotionRequestsInFlight = useRef(new Set<string>())
  const similarGenerationInFlight = useRef(false)
  const proposalDecisionInFlight = useRef(false)
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null)
  const [pendingReplacementItemId, setPendingReplacementItemId] = useState<number | null>(null)
  const [pendingPromotionKey, setPendingPromotionKey] = useState<string | null>(null)

  const submit = async () => {
    const value = instruction.trim()
    if (!value || value.length > 10_000 || pending || requestInFlight.current) return
    requestInFlight.current = true
    setPending(true)
    setError(null)
    try {
      const result = await authenticatedRequest((token) => queryAdminAI(token, {
        instruction: value,
        current_revision_id: revisionId,
        conversation_context: boundedConversationContext(history),
      }))
      setHistory((current) => [...current, { id: Date.now(), instruction: value, result, promotion: null }])
      setInstruction('')
    } catch (submitError: unknown) {
      setError(readOnlyErrorMessage(submitError))
    } finally {
      requestInFlight.current = false
      setPending(false)
    }
  }

  const canSubmit = instruction.trim().length > 0 && instruction.length <= 10_000 && !pending

  const prepareReplacementProposal = async (item: AdminAIHistoryItem) => {
    const draft = item.result.generated_draft
    if (!draft || !revisionId || item.result.proposal_id || replacementRequestsInFlight.current.has(item.id)) return
    replacementRequestsInFlight.current.add(item.id)
    setPendingReplacementItemId(item.id)
    setError(null)
    try {
      const proposal = await authenticatedRequest((token) => createAdminAIReplacementProposal(token, {
        current_revision_id: revisionId,
        generated_draft: draft,
      }))
      setHistory((current) => current.map((historyItem) => historyItem.id === item.id
        ? { ...historyItem, result: {
          ...historyItem.result,
          proposal_id: proposal.proposal_id,
          proposal_status: proposal.proposal_status,
        } }
        : historyItem))
    } catch (replacementError: unknown) {
      setError(readOnlyErrorMessage(replacementError))
    } finally {
      replacementRequestsInFlight.current.delete(item.id)
      setPendingReplacementItemId(null)
    }
  }

  const promotePersistentDraft = async (
    promotionKey: string,
    draftId: string,
    onSuccess: (promotion: AdminAIQuestionDraftPromotionResponse) => void,
  ) => {
    if (promotionRequestsInFlight.current.has(promotionKey)) return
    promotionRequestsInFlight.current.add(promotionKey)
    setPendingPromotionKey(promotionKey)
    setError(null)
    try {
      const promotion = await authenticatedRequest((token) =>
        promoteAdminAIQuestionDraft(token, draftId),
      )
      onSuccess(promotion)
    } catch (promotionError: unknown) {
      setError(readOnlyErrorMessage(promotionError))
    } finally {
      promotionRequestsInFlight.current.delete(promotionKey)
      setPendingPromotionKey(null)
    }
  }

  const promoteQuestionDraft = async (item: AdminAIHistoryItem) => {
    if (!canPromotePersistentQuestionDraft(item.result) || !item.result.persistent_draft_id) return
    await promotePersistentDraft(
      `history:${item.id}`,
      item.result.persistent_draft_id,
      (promotion) => setHistory((current) => current.map((historyItem) => historyItem.id === item.id
        ? {
          ...historyItem,
          result: { ...historyItem.result, persistent_draft_status: promotion.draft_status },
          promotion,
        }
        : historyItem)),
    )
  }

  const promoteSimilarQuestionDraft = async (draftId: string) => {
    const item = similarDrafts.find((draft) => draft.persistent_draft_id === draftId)
    if (!item || item.persistent_draft_status !== 'active') return
    await promotePersistentDraft(
      `similar:${draftId}`,
      draftId,
      (promotion) => setSimilarDrafts((current) => current.map((draft) =>
        draft.persistent_draft_id === draftId
          ? { ...draft, persistent_draft_status: promotion.draft_status, promotion }
          : draft,
      )),
    )
  }

  const parsedSimilarCount = Number(similarCount)
  const similarCountIsValid = Number.isInteger(parsedSimilarCount)
    && parsedSimilarCount >= 1
    && parsedSimilarCount <= 20
  const canGenerateSimilar = similarCountIsValid
    && similarConstraints.trim().length > 0
    && !similarGenerationPending

  const generateSimilarQuestions = async () => {
    const constraints = similarConstraints.trim()
    if (!canGenerateSimilar || similarGenerationInFlight.current) return
    similarGenerationInFlight.current = true
    setSimilarGenerationPending(true)
    setError(null)
    try {
      const response = await authenticatedRequest((token) =>
        generateAdminAISimilarQuestionDrafts(token, {
          source_revision_id: revisionId,
          requested_count: parsedSimilarCount,
          admin_constraints: constraints,
        }),
      )
      setSimilarDrafts(response.items.map((item) => ({ ...item, promotion: null })))
    } catch (generationError: unknown) {
      setError(readOnlyErrorMessage(generationError))
    } finally {
      similarGenerationInFlight.current = false
      setSimilarGenerationPending(false)
    }
  }

  const decideUniversalProposal = async (itemId: number, proposalId: string, decision: 'accept' | 'reject') => {
    if (proposalDecisionInFlight.current) return
    proposalDecisionInFlight.current = true
    setPendingProposalId(proposalId)
    setError(null)
    try {
      const outcome = await authenticatedRequest((token) => decision === 'accept'
        ? acceptProposal(token, proposalId)
        : rejectProposal(token, proposalId))
      setHistory((current) => current.map((item) => item.id === itemId
        ? { ...item, result: { ...item.result, proposal_status: outcome.status } }
        : item))
      if (decision === 'accept') await onAccepted()
    } catch (decisionError: unknown) {
      setError(safeErrorMessage(decisionError, decision))
    } finally {
      proposalDecisionInFlight.current = false
      setPendingProposalId(null)
    }
  }

  return <aside className="ai-authoring-panel" aria-labelledby="ai-authoring-title">
    <header><div><Bot size={20} /><div><h2 id="ai-authoring-title">Admin AI</h2><span>Read-only köməkçi</span></div></div></header>
    <div className="ai-authoring-messages" aria-live="polite">
      {history.length === 0 && <p>Sual, axtarış və statistika haqqında təbii dildə soruşun.</p>}
      {history.map((item) => <div className="admin-ai-exchange" key={item.id}>
        <article><strong>Admin</strong><p>{item.instruction}</p></article>
        <article className="admin-ai-response"><strong>Admin AI</strong><AdminAIResponse result={item.result} /></article>
        {canPromotePersistentQuestionDraft(item.result) && <section className="ai-authoring-decisions">
          <button type="button" onClick={() => void promoteQuestionDraft(item)} disabled={pendingPromotionKey === `history:${item.id}`}>
            {pendingPromotionKey === `history:${item.id}` && <LoaderCircle className="admin-editor-spinner" size={16} />} Yeni sual kimi saxla
          </button>
        </section>}
        {item.promotion && <section className="ai-authoring-decisions">
          <button type="button" onClick={() => void onOpenRevision(item.promotion!.revision_id)}>Redaktorda aç</button>
        </section>}
        {item.result.generated_draft && revisionId && !item.result.proposal_id && <section className="ai-authoring-decisions">
          <button type="button" onClick={() => void prepareReplacementProposal(item)} disabled={pendingReplacementItemId === item.id}>
            {pendingReplacementItemId === item.id && <LoaderCircle className="admin-editor-spinner" size={16} />} Cari sualla əvəz et
          </button>
        </section>}
        {item.result.proposal_id && <section className="ai-authoring-decisions" aria-label="Admin AI təklif qərarı">
          <span>{universalProposalStatusLabels[item.result.proposal_status ?? 'pending']}</span>
          <button type="button" onClick={() => void decideUniversalProposal(item.id, item.result.proposal_id!, 'accept')} disabled={item.result.proposal_status !== 'pending' || pendingProposalId !== null}><Check size={16} /> Təsdiqlə və tətbiq et</button>
          <button type="button" className="secondary" onClick={() => void decideUniversalProposal(item.id, item.result.proposal_id!, 'reject')} disabled={item.result.proposal_status !== 'pending' || pendingProposalId !== null}><X size={16} /> Ləğv et</button>
        </section>}
      </div>)}
    </div>
    <section className="admin-ai-result-section" aria-labelledby="similar-question-title">
      <h3 id="similar-question-title">Bənzər suallar</h3>
      <label htmlFor="admin-ai-similar-count">Sual sayı</label>
      <input id="admin-ai-similar-count" type="number" min="1" max="20" step="1" value={similarCount} onChange={(event) => setSimilarCount(event.target.value)} disabled={similarGenerationPending} />
      <small>Bir sorğu üçün texniki aralıq: 1–20.</small>
      <label htmlFor="admin-ai-similar-constraints">Şərtlər</label>
      <textarea id="admin-ai-similar-constraints" maxLength={10_000} value={similarConstraints} onChange={(event) => setSimilarConstraints(event.target.value)} placeholder="Məsələn: bucaq əmsalı da n-dən asılı olsun" disabled={similarGenerationPending} />
      {!similarCountIsValid && <p className="admin-ai-result-note">Sual sayı 1–20 aralığında tam ədəd olmalıdır.</p>}
      <button type="button" onClick={() => void generateSimilarQuestions()} disabled={!canGenerateSimilar}>
        {similarGenerationPending && <LoaderCircle className="admin-editor-spinner" size={16} />} Bənzər suallar yarat
      </button>
      {similarDrafts.map((item) => <article className="admin-ai-exchange" key={item.persistent_draft_id}>
        <GeneratedDraftView draft={item.generated_draft} persistent />
        {item.persistent_draft_status === 'active' && <section className="ai-authoring-decisions">
          <button type="button" onClick={() => void promoteSimilarQuestionDraft(item.persistent_draft_id)} disabled={pendingPromotionKey === `similar:${item.persistent_draft_id}`}>
            {pendingPromotionKey === `similar:${item.persistent_draft_id}` && <LoaderCircle className="admin-editor-spinner" size={16} />} Yeni sual kimi saxla
          </button>
        </section>}
        {item.promotion && <section className="ai-authoring-decisions">
          <button type="button" onClick={() => void onOpenRevision(item.promotion!.revision_id)}>Redaktorda aç</button>
        </section>}
      </article>)}
    </section>
    <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label htmlFor="ai-authoring-instruction">Təlimat</label>
      <textarea id="ai-authoring-instruction" maxLength={10_000} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Məsələn: Bu sual haqqında məlumat ver" disabled={pending} />
      <div><small>{instruction.length}/10 000</small><button type="submit" disabled={!canSubmit}>{pending ? <LoaderCircle className="admin-editor-spinner" size={16} /> : <Send size={16} />} Göndər</button></div>
    </form>
    {error && <div className="ai-authoring-error" role="alert">{error}</div>}
  </aside>
}

const warningLabels: Record<PreviewWarningCode, string> = {
  stale_revision: 'Sual dəyişdirilib',
  destructive_delete: 'Blok silinəcək',
  formula_changed: 'Formula dəyişəcək',
  multiple_actions: 'Bir neçə dəyişiklik',
  answer_option_deleted: 'Cavab variantı silinəcək',
  correct_answer_changed: 'Düzgün cavab dəyişəcək',
  multiple_answer_changes: 'Bir neçə cavab dəyişikliyi',
  solution_created: 'Əsas həll yaradılacaq',
  solution_deleted: 'Əsas həll silinəcək',
  solution_block_deleted: 'Həll addımı silinəcək',
  multiple_solution_changes: 'Bir neçə həll dəyişikliyi',
}

const answerActionLabels: Record<string, string> = {
  create_answer_option: 'Cavab variantı yaradılacaq',
  update_answer_option: 'Cavab variantı dəyişəcək',
  delete_answer_option: 'Cavab variantı silinəcək',
  reorder_answer_options: 'Cavab variantlarının sırası dəyişəcək',
  set_correct_answers: 'Düzgün cavab dəyişəcək',
  create_accepted_answer: 'Qəbul edilən cavab yaradılacaq',
  update_accepted_answer: 'Qəbul edilən cavab dəyişəcək',
  delete_accepted_answer: 'Qəbul edilən cavab silinəcək',
  reorder_accepted_answers: 'Qəbul edilən cavabların sırası dəyişəcək',
  create_solution: 'Əsas həll yaradılacaq',
  delete_solution: 'Əsas həll silinəcək',
  create_solution_text_block: 'Mətn addımı yaradılacaq',
  update_solution_text_block: 'Mətn addımı dəyişəcək',
  create_solution_formula_block: 'Formula addımı yaradılacaq',
  update_solution_formula_block: 'Formula dəyişəcək',
  delete_solution_block: 'Həll addımı silinəcək',
  reorder_solution_blocks: 'Həll addımlarının sırası dəyişəcək',
}

const proposalStatusLabels: Record<ProposalRead['status'], string> = {
  pending: 'Gözləyir',
  accepted: 'Qəbul edilib',
  rejected: 'Rədd edilib',
  obsolete: 'Köhnəlib',
}

function safeErrorMessage(error: unknown, operation: 'create' | 'submit' | 'preview' | 'accept' | 'reject' | 'close'): string {
  if (error instanceof ApiError) {
    if (error.status === 504) return 'AI xidməti vaxt limitini keçdi. Bir az sonra yenidən yoxlayın.'
    if (error.status === 502 || error.status === 503) return 'AI xidməti hazırda əlçatan deyil.'
    if (error.status === 409) {
      if (operation === 'accept') return 'Təklif artıq aktual deyil. Yeni AI təklifi istəyin.'
      if (operation === 'reject') return 'Təklif haqqında qərar artıq verilib.'
      return 'AI söhbətinin vəziyyəti dəyişib. Yeni söhbət başladın.'
    }
  }
  if (operation === 'create') return 'AI söhbətini yaratmaq mümkün olmadı.'
  if (operation === 'submit') return 'Təlimatı AI köməkçisinə göndərmək mümkün olmadı.'
  if (operation === 'preview') return 'Təklif önizləməsini yükləmək mümkün olmadı.'
  if (operation === 'accept') return 'Təklifi qəbul etmək mümkün olmadı.'
  if (operation === 'reject') return 'Təklifi rədd etmək mümkün olmadı.'
  return 'AI söhbətini bağlamaq mümkün olmadı.'
}

function PreviewValueView({ value }: { value: PreviewValue | null }) {
  if (!value) return <span className="ai-authoring-empty-value">Yoxdur</span>
  if ('ordered_block_ids' in value) return <code>{value.ordered_block_ids.join(' → ')}</code>
  if ('ordered_answer_ids' in value) return <code>{value.ordered_answer_ids.join(' → ')}</code>
  if ('correct_options' in value) return value.correct_options.length > 0
    ? <ul>{value.correct_options.map((option) => <li key={option.option_id}>{option.label && option.source_text ? `${option.label} — ${option.source_text}` : 'Variant tapılmadı'}</li>)}</ul>
    : <span>Seçilməyib</span>
  if ('option_id' in value) return <p>Variant {value.label ?? '—'}: {value.source_text}{value.is_correct ? ' · düzgün' : ''}</p>
  if ('answer_id' in value) return <p>{value.source_text}</p>
  if ('exists' in value) return <p>{value.exists ? 'Əsas həll' : 'Həll yoxdur'}</p>
  if ('blocks' in value) return value.blocks.length > 0 ? <ol>{value.blocks.map((block) => <li key={block.block_id}>{block.block_type === 'text' ? (block.source_text || 'Boş mətn') : <MathContent content={{ format_version: 1, segments: [{ type: 'math', latex: block.source_latex ?? '', source_text: 'Formula göstərilə bilmədi', display_mode: false }] }} fallbackText="Formula göstərilə bilmədi" />}</li>)}</ol> : <span>Həll addımı yoxdur</span>
  if (value.block_type === 'text') return <p>{value.source_text || 'Boş mətn'}</p>
  if (value.block_type === 'formula') {
    return <MathContent content={{ format_version: 1, segments: [{ type: 'math', latex: value.source_latex ?? '', source_text: 'Formula göstərilə bilmədi', display_mode: false }] }} fallbackText="Formula göstərilə bilmədi" />
  }
  if (value.block_type === 'image') return <p>Şəkil: {value.alt_text || value.media_asset_id}</p>
  if ('source_data' in value) return <pre>{JSON.stringify(value.source_data, null, 2)}</pre>
  return <span>Önizləmə mövcud deyil</span>
}

function AIAuthoringMutationPanelSession({ authenticatedRequest, revisionId, onAccepted }: AIAuthoringPanelProps) {
  const [conversation, setConversation] = useState<ConversationRead | null>(null)
  const [messages, setMessages] = useState<MessageRead[]>([])
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState<ProposalRead | null>(null)
  const [preview, setPreview] = useState<ProposalPreviewRead | null>(null)
  const [hasStaleConflict, setHasStaleConflict] = useState(false)
  const [pending, setPending] = useState<'submit' | 'preview' | 'accept' | 'reject' | 'close' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const value = instruction.trim()
    if (!value || value.length > 10_000 || pending || conversation?.status === 'closed') return
    setPending('submit')
    setError(null)
    try {
      let activeConversation = conversation
      if (!activeConversation) {
        activeConversation = await authenticatedRequest((token) => createConversation(token, revisionId))
        setConversation(activeConversation)
      }
      const result = await authenticatedRequest((token) => submitUserTurn(token, activeConversation.id, value))
      setMessages((current) => [...current, result.user_message])
      setInstruction('')
      setProposal(result.proposal)
      setPreview(null)
      setHasStaleConflict(false)
      setPending('preview')
      try {
        const loadedPreview = await authenticatedRequest((token) => getProposalPreview(token, result.proposal.id))
        setPreview(loadedPreview)
      } catch (previewError: unknown) {
        setError(safeErrorMessage(previewError, 'preview'))
      }
    } catch (submitError: unknown) {
      setError(safeErrorMessage(submitError, conversation ? 'submit' : 'create'))
    } finally {
      setPending(null)
    }
  }

  const decide = async (decision: 'accept' | 'reject') => {
    if (!proposal || proposal.status !== 'pending' || pending || (decision === 'accept' && (preview?.is_stale || hasStaleConflict))) return
    setPending(decision)
    setError(null)
    try {
      const result = await authenticatedRequest((token) => decision === 'accept'
        ? acceptProposal(token, proposal.id)
        : rejectProposal(token, proposal.id))
      setProposal((current) => current ? { ...current, status: result.status } : current)
      setPreview((current) => current ? { ...current, proposal_status: result.status } : current)
      if (decision === 'accept') await onAccepted()
    } catch (decisionError: unknown) {
      if (decision === 'accept' && decisionError instanceof ApiError && decisionError.status === 409) {
        setHasStaleConflict(true)
        setProposal((current) => current ? { ...current, status: 'obsolete' } : current)
        setPreview((current) => current ? {
          ...current,
          proposal_status: 'obsolete',
          is_stale: true,
          warnings: current.warnings.includes('stale_revision')
            ? current.warnings
            : ['stale_revision', ...current.warnings],
        } : current)
        try {
          const [authoritativeProposal, authoritativePreview] = await Promise.all([
            authenticatedRequest((token) => getProposal(token, proposal.id)),
            authenticatedRequest((token) => getProposalPreview(token, proposal.id)),
          ])
          setProposal(authoritativeProposal)
          setPreview(authoritativePreview)
        } catch {
          // The conservative local stale state remains authoritative for UI safety.
        }
      }
      setError(safeErrorMessage(decisionError, decision))
    } finally {
      setPending(null)
    }
  }

  const close = async () => {
    if (!conversation || conversation.status === 'closed' || pending) return
    setPending('close')
    setError(null)
    try {
      setConversation(await authenticatedRequest((token) => closeConversation(token, conversation.id)))
    } catch (closeError: unknown) {
      setError(safeErrorMessage(closeError, 'close'))
    } finally {
      setPending(null)
    }
  }

  const isStale = preview?.is_stale === true || hasStaleConflict
  const canSubmit = instruction.trim().length > 0 && instruction.length <= 10_000 && !pending && conversation?.status !== 'closed'

  return (
    <aside className="ai-authoring-panel" aria-labelledby="ai-authoring-title">
      <header>
        <div><Bot size={20} /><div><h2 id="ai-authoring-title">AI köməkçi</h2><span>{conversation ? `Söhbət: ${conversation.status}` : 'Söhbət başlanmayıb'}</span></div></div>
        {conversation?.status === 'active' && <button type="button" onClick={() => void close()} disabled={pending !== null}>Bağla</button>}
      </header>

      <div className="ai-authoring-messages" aria-live="polite">
        {messages.length === 0 && <p>Reviziya haqqında təlimat yazın. Söhbət ilk göndərişdə yaradılacaq.</p>}
        {messages.map((message) => <article key={message.id}><strong>{message.role === 'user' ? 'Siz' : message.role}</strong><p>{message.content}</p></article>)}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label htmlFor="ai-authoring-instruction">Təlimat</label>
        <textarea id="ai-authoring-instruction" maxLength={10_000} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Məsələn: Ədədləri dəyiş, həll prinsipini saxla" disabled={pending !== null || conversation?.status === 'closed'} />
        <div><small>{instruction.length}/10 000</small><button type="submit" disabled={!canSubmit}>{pending === 'submit' ? <LoaderCircle className="admin-editor-spinner" size={16} /> : <Send size={16} />} Göndər</button></div>
      </form>

      {error && <div className="ai-authoring-error" role="alert">{error}</div>}

      {proposal && (
        <section className="ai-authoring-proposal" aria-labelledby="ai-proposal-title">
          <div className="ai-authoring-proposal__heading"><div><span>AI təklifi</span><h3 id="ai-proposal-title">{proposalStatusLabels[proposal.status]}{hasStaleConflict && proposal.status === 'pending' ? ' · köhnə' : ''}</h3></div><small>{proposal.model_name} · {proposal.prompt_version}</small></div>
          {pending === 'preview' && <p><LoaderCircle className="admin-editor-spinner" size={16} /> Önizləmə yüklənir…</p>}
          {preview && <>
            {preview.warnings.length > 0 && <ul className="ai-authoring-warnings">{preview.warnings.map((warning) => <li key={warning}><AlertTriangle size={14} /> {warningLabels[warning]}</li>)}</ul>}
            {isStale && <div className="ai-authoring-stale" role="alert">Sual dəyişdirilib. Bu təklifi qəbul etməyin; yeni AI təklifi istəyin.</div>}
            <div className="ai-authoring-changes">{preview.changes.map((change) => <article key={change.action_index}>
              <header><strong>{answerActionLabels[change.action_type] ?? change.action_type}</strong><span>{change.change_kind}</span></header>
              <div><section><small>Əvvəl</small><PreviewValueView value={change.before} /></section><section><small>Sonra</small><PreviewValueView value={change.after} /></section></div>
            </article>)}</div>
          </>}
          <div className="ai-authoring-decisions">
            <button type="button" onClick={() => void decide('accept')} disabled={proposal.status !== 'pending' || pending !== null || isStale}><Check size={16} /> Qəbul et</button>
            <button type="button" className="secondary" onClick={() => void decide('reject')} disabled={proposal.status !== 'pending' || pending !== null}><X size={16} /> Rədd et</button>
          </div>
        </section>
      )}
    </aside>
  )
}

export function AIAuthoringMutationPanel(props: AIAuthoringPanelProps) {
  return <AIAuthoringMutationPanelSession key={props.revisionId} {...props} />
}
