import { requestJson } from './client'
import type {
  IsoDateTime,
  JsonObject,
  StructuredTextDocument,
  UUID,
} from './questionEditor'

export type ConversationStatus = 'active' | 'closed'
export type MessageRole = 'user' | 'assistant' | 'system'
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'obsolete'
export type PreviewChangeKind = 'created' | 'updated' | 'deleted' | 'reordered'
export type PreviewWarningCode =
  | 'stale_revision'
  | 'destructive_delete'
  | 'formula_changed'
  | 'multiple_actions'
  | 'answer_option_deleted'
  | 'correct_answer_changed'
  | 'multiple_answer_changes'
  | 'solution_created'
  | 'solution_deleted'
  | 'solution_block_deleted'
  | 'multiple_solution_changes'

export type ConversationRead = {
  id: UUID
  active_revision_id: UUID
  created_by_user_id: UUID | null
  status: ConversationStatus
  created_at: IsoDateTime
  updated_at: IsoDateTime
}

export type MessageRead = {
  id: UUID
  conversation_id: UUID
  role: MessageRole
  sequence_number: number
  content: string
  created_by_user_id: UUID | null
  created_at: IsoDateTime
}

export type AuthoringAction = {
  action_type: string
  block_id?: UUID
  ordered_block_ids?: UUID[]
  payload?: JsonObject
}

export type ProposalRead = {
  id: UUID
  source_revision_id: UUID
  source_revision_updated_at: IsoDateTime
  status: ProposalStatus
  action_envelope: { schema_version: 1; actions: AuthoringAction[] }
  provider_name: string
  model_name: string
  prompt_version: string
  provider_schema_version: number
  requested_by_user_id: UUID | null
  request_message_id: UUID | null
  accepted_by_user_id: UUID | null
  rejected_by_user_id: UUID | null
  accepted_at: IsoDateTime | null
  rejected_at: IsoDateTime | null
  created_at: IsoDateTime
}

export type TextPreviewValue = {
  block_type: 'text'
  block_id: UUID
  order: number
  source_text: string
  document: StructuredTextDocument
  format_version: 1
}

export type FormulaPreviewValue = {
  block_type: 'formula'
  block_id: UUID
  order: number
  source_latex: string
  format_version: 1
}

export type ImagePreviewValue = {
  block_type: 'image'
  block_id: UUID
  order: number
  media_asset_id: UUID
  alt_text: string | null
}

export type GeometryPreviewValue = {
  block_type: 'geometry'
  block_id: UUID
  order: number
  source_data: JsonObject
  format_version: 1
}

export type OrderPreviewValue = { ordered_block_ids: UUID[] }
export type AnswerOptionPreviewValue = { option_id: UUID; label: string | null; order: number; source_text: string; document: StructuredTextDocument; format_version: 1; is_correct: boolean }
export type AcceptedAnswerPreviewValue = { answer_id: UUID; order: number; source_text: string; document: StructuredTextDocument; format_version: 1 }
export type AnswerOrderPreviewValue = { ordered_answer_ids: UUID[] }
export type CorrectAnswerOptionPreviewValue = { option_id: UUID; label: string | null; source_text: string | null }
export type CorrectAnswerPreviewValue = { correct_options: CorrectAnswerOptionPreviewValue[] }
export type SolutionStatePreviewValue = { exists: boolean }
export type SolutionBlockPreviewValue = {
  block_type: 'text' | 'formula'; block_id: UUID; order: number
  source_text?: string; document?: StructuredTextDocument
  source_latex?: string; format_version: 1
}
export type SolutionOrderPreviewValue = { blocks: SolutionBlockPreviewValue[] }
export type PreviewValue = TextPreviewValue | FormulaPreviewValue
  | ImagePreviewValue | GeometryPreviewValue | OrderPreviewValue
  | AnswerOptionPreviewValue | AcceptedAnswerPreviewValue
  | AnswerOrderPreviewValue | CorrectAnswerPreviewValue
  | SolutionStatePreviewValue | SolutionBlockPreviewValue | SolutionOrderPreviewValue

export type ProposalPreviewChange = {
  action_index: number
  action_type: string
  change_kind: PreviewChangeKind
  block_id: UUID | null
  before: PreviewValue | null
  after: PreviewValue | null
}

export type ProposalPreviewRead = {
  proposal_id: UUID
  source_revision_id: UUID
  source_revision_updated_at: IsoDateTime
  current_revision_updated_at: IsoDateTime
  proposal_status: ProposalStatus
  is_stale: boolean
  action_count: number
  changes: ProposalPreviewChange[]
  warnings: PreviewWarningCode[]
}

export type SubmitUserTurnResponse = {
  user_message: MessageRead
  proposal: ProposalRead
  preview_url: string
}

export type ProposalDecisionResponse = {
  proposal_id: UUID
  status: ProposalStatus
  accepted_by_user_id: UUID | null
  rejected_by_user_id: UUID | null
  accepted_at: IsoDateTime | null
  rejected_at: IsoDateTime | null
}

function authHeaders(accessToken: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

export function createConversation(accessToken: string, revisionId: UUID): Promise<ConversationRead> {
  return requestJson(`/api/v1/questions/revisions/${encodeURIComponent(revisionId)}/ai-authoring/conversations`, {
    method: 'POST', headers: authHeaders(accessToken),
  })
}

export function getConversation(accessToken: string, conversationId: UUID): Promise<ConversationRead> {
  return requestJson(`/api/v1/ai-authoring/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'GET', headers: authHeaders(accessToken),
  })
}

export function listMessages(accessToken: string, conversationId: UUID): Promise<MessageRead[]> {
  return requestJson(`/api/v1/ai-authoring/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'GET', headers: authHeaders(accessToken),
  })
}

export function submitUserTurn(accessToken: string, conversationId: UUID, instruction: string): Promise<SubmitUserTurnResponse> {
  return requestJson(`/api/v1/ai-authoring/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST', headers: authHeaders(accessToken, true), body: JSON.stringify({ instruction }),
  })
}

export function getProposal(accessToken: string, proposalId: UUID): Promise<ProposalRead> {
  return requestJson(`/api/v1/ai-authoring/proposals/${encodeURIComponent(proposalId)}`, {
    method: 'GET', headers: authHeaders(accessToken),
  })
}

export function getProposalPreview(accessToken: string, proposalId: UUID): Promise<ProposalPreviewRead> {
  return requestJson(`/api/v1/ai-authoring/proposals/${encodeURIComponent(proposalId)}/preview`, {
    method: 'GET', headers: authHeaders(accessToken),
  })
}

export function acceptProposal(accessToken: string, proposalId: UUID): Promise<ProposalDecisionResponse> {
  return requestJson(`/api/v1/ai-authoring/proposals/${encodeURIComponent(proposalId)}/accept`, {
    method: 'POST', headers: authHeaders(accessToken),
  })
}

export function rejectProposal(accessToken: string, proposalId: UUID): Promise<ProposalDecisionResponse> {
  return requestJson(`/api/v1/ai-authoring/proposals/${encodeURIComponent(proposalId)}/reject`, {
    method: 'POST', headers: authHeaders(accessToken),
  })
}

export function closeConversation(accessToken: string, conversationId: UUID): Promise<ConversationRead> {
  return requestJson(`/api/v1/ai-authoring/conversations/${encodeURIComponent(conversationId)}/close`, {
    method: 'POST', headers: authHeaders(accessToken),
  })
}
