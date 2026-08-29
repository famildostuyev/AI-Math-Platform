import { requestJson } from './client'
import type { UUID } from './questionEditor'
import type { StructuredContent } from './questionExtraction'

export type AdminAIResultKind = 'informational' | 'mutation_proposal' | 'unsupported'
export type AdminAICapabilityClassification = 'read_only' | 'mutation_preparation'
export type AdminAIEffectScope = 'none' | 'revision' | 'new_question'

export type AdminAIQueryRequest = {
  instruction: string
  current_revision_id?: UUID | null
  conversation_context?: {
    turns: Array<{ role: 'admin' | 'assistant'; content: string }>
    referenced_draft?: AdminAIGeneratedDraft | null
  } | null
}

export type AdminAIInspectBlock = {
  block_type: 'text' | 'formula' | 'image' | 'geometry'
  source_text?: string
}

export type AdminAIInspectPayload = {
  revision_number: number
  revision_status: string
  difficulty: string | null
  source: { display_name: string | null }
  blocks: AdminAIInspectBlock[]
  answer_policy: string
  answer_options: unknown[]
  accepted_answers: unknown[]
  solution: { blocks: unknown[] } | null
}

export type AdminAIQuestionSearchItem = {
  revision_id: UUID
  revision_number: number
  status: string
  question_type_name: string
  question_type_display_name: string
  difficulty: string | null
  primary_topic_display_name: string | null
  source_display_name: string | null
  block_count: number
  text_preview: string | null
}

export type AdminAISearchPayload = {
  total: number
  page: number
  page_size: number
  total_pages: number
  deterministic_order: string
  items: AdminAIQuestionSearchItem[]
}

export type AdminAIStatisticsGroup = {
  key: string
  label: string
  count: number
}

export type AdminAIStatisticsPayload = {
  total: number
  grouping_dimension: 'question_type' | 'primary_topic' | 'difficulty' | 'status' | 'source'
  groups: AdminAIStatisticsGroup[]
  groups_truncated: boolean
}

export type AdminAICapabilityResult = {
  capability_name: string
  capability_version: number
  classification: AdminAICapabilityClassification
  effect_scope: AdminAIEffectScope
  payload: Record<string, unknown>
}

export type AdminAIResultEnvelope = {
  schema_version: 1
  result_kind: AdminAIResultKind
  capability_results: AdminAICapabilityResult[]
  source_snapshots: Array<{
    entity_type: string
    entity_id: UUID
    updated_at: string | null
  }>
  warnings: Array<{ code: string; message: string }>
  unsupported_reason: string | null
}

export type AdminAICallExecutionTrace = {
  call_id: string
  capability_name: string
  capability_version: number
  outcome: 'succeeded' | 'failed'
  result_item_count: number | null
}

export type AdminAIOrchestrationResult = {
  response_kind: 'direct_answer' | 'tool_assisted_answer' | 'mutation_proposal' | 'unsupported'
  assistant_text: string
  assistant_content: StructuredContent | null
  generated_draft: AdminAIGeneratedDraft | null
  limitation_code: 'capability_unavailable' | null
  envelope: AdminAIResultEnvelope
  execution_trace: AdminAICallExecutionTrace[]
  proposal_id: UUID | null
  proposal_status: 'pending' | 'accepted' | 'rejected' | 'obsolete' | null
  persistent_draft_id: UUID | null
  persistent_draft_status: 'active' | 'promoted' | 'discarded' | null
}

export type AdminAIDraftAnswerOption = {
  label: string
  text: string
  content: StructuredContent | null
}

export type AdminAIGeneratedDraft = {
  draft_kind: 'question' | 'explanation' | 'solution' | 'lesson_fragment' | 'other'
  format_hint: 'free_form' | 'multiple_choice'
  title: string | null
  content: StructuredContent
  answer_options: AdminAIDraftAnswerOption[]
  correct_option_labels: string[]
  explanation: StructuredContent | null
  is_canonical: false
}

export type AdminAIReplacementProposalRequest = {
  current_revision_id: UUID
  generated_draft: AdminAIGeneratedDraft
}

export type AdminAIReplacementProposalResponse = {
  proposal_id: UUID
  proposal_status: 'pending'
}

export type AdminAIQuestionDraftPromotionResponse = {
  draft_id: UUID
  draft_status: 'promoted'
  question_family_id: UUID
  question_form_id: UUID
  revision_id: UUID
}

export type AdminAISimilarQuestionGenerationRequest = {
  source_revision_id: UUID
  requested_count: number
  admin_constraints: string
}

export type AdminAISimilarQuestionDraftRead = {
  generated_draft: AdminAIGeneratedDraft
  persistent_draft_id: UUID
  persistent_draft_status: 'active'
}

export type AdminAISimilarQuestionGenerationResponse = {
  requested_count: number
  items: AdminAISimilarQuestionDraftRead[]
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

export function queryAdminAI(
  accessToken: string,
  request: AdminAIQueryRequest,
): Promise<AdminAIOrchestrationResult> {
  return requestJson('/api/v1/admin-ai/query', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(request),
  })
}

export function createAdminAIReplacementProposal(
  accessToken: string,
  request: AdminAIReplacementProposalRequest,
): Promise<AdminAIReplacementProposalResponse> {
  return requestJson('/api/v1/admin-ai/replacement-proposals', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(request),
  })
}

export function promoteAdminAIQuestionDraft(
  accessToken: string,
  draftId: UUID,
): Promise<AdminAIQuestionDraftPromotionResponse> {
  return requestJson(`/api/v1/admin-ai/question-drafts/${encodeURIComponent(draftId)}/promote`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  })
}

export function generateAdminAISimilarQuestionDrafts(
  accessToken: string,
  request: AdminAISimilarQuestionGenerationRequest,
): Promise<AdminAISimilarQuestionGenerationResponse> {
  return requestJson('/api/v1/admin-ai/similar-question-drafts', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(request),
  })
}
