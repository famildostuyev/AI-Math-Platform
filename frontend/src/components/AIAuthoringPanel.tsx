import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, Check, LoaderCircle, Send, X } from 'lucide-react'
import { ApiError } from '../api/client'
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

type AuthenticatedRequest = <T>(request: (accessToken: string) => Promise<T>) => Promise<T>

type AIAuthoringPanelProps = {
  authenticatedRequest: AuthenticatedRequest
  revisionId: string
  onAccepted: () => Promise<void>
}

const warningLabels: Record<PreviewWarningCode, string> = {
  stale_revision: 'Sual dəyişdirilib',
  destructive_delete: 'Blok silinəcək',
  formula_changed: 'Formula dəyişəcək',
  multiple_actions: 'Bir neçə dəyişiklik',
  answer_option_deleted: 'Cavab variantı silinəcək',
  correct_answer_changed: 'Düzgün cavab dəyişəcək',
  multiple_answer_changes: 'Bir neçə cavab dəyişikliyi',
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
  if (value.block_type === 'text') return <p>{value.source_text || 'Boş mətn'}</p>
  if (value.block_type === 'formula') {
    return <MathContent content={{ format_version: 1, segments: [{ type: 'math', latex: value.source_latex, source_text: value.source_latex, display_mode: false }] }} fallbackText={value.source_latex} />
  }
  if (value.block_type === 'image') return <p>Şəkil: {value.alt_text || value.media_asset_id}</p>
  return <pre>{JSON.stringify(value.source_data, null, 2)}</pre>
}

export default function AIAuthoringPanel({ authenticatedRequest, revisionId, onAccepted }: AIAuthoringPanelProps) {
  const [conversation, setConversation] = useState<ConversationRead | null>(null)
  const [messages, setMessages] = useState<MessageRead[]>([])
  const [instruction, setInstruction] = useState('')
  const [proposal, setProposal] = useState<ProposalRead | null>(null)
  const [preview, setPreview] = useState<ProposalPreviewRead | null>(null)
  const [hasStaleConflict, setHasStaleConflict] = useState(false)
  const [pending, setPending] = useState<'submit' | 'preview' | 'accept' | 'reject' | 'close' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setConversation(null)
    setMessages([])
    setInstruction('')
    setProposal(null)
    setPreview(null)
    setHasStaleConflict(false)
    setPending(null)
    setError(null)
  }, [revisionId])

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
