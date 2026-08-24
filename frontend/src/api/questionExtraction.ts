import { requestJson } from './client'
import type { IsoDateTime, UUID } from './questionEditor'

export type QuestionExtractionRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type QuestionExtractionRunRead = { id: UUID; source_document_id: UUID; run_number: number; status: QuestionExtractionRunStatus; requested_by_user_id: UUID | null; started_at: IsoDateTime | null; completed_at: IsoDateTime | null; failure_message: string | null }
export type QuestionCandidateRead = { id: UUID; sequence_number: number; extracted_text: string; confidence: string | null; source_document_page_id: UUID | null; page_number: number | null }
export type QuestionExtractionAnalysisPageRead = { source_document_page_id: UUID; page_number: number }
export type QuestionExtractionAnalysisOptionRead = { label: string | null; text: string }
export type QuestionExtractionAnalysisCorrectionRead = { original_value: string; normalized_value: string; reason: string }
export type QuestionExtractionAnalysisQuestionRead = { id: UUID; sequence_number: number; question_number: string | null; variant: string | null; source_pages: QuestionExtractionAnalysisPageRead[]; question_text: string; answer_options: QuestionExtractionAnalysisOptionRead[]; confidence: string; needs_review: boolean; corrections: QuestionExtractionAnalysisCorrectionRead[]; visual_required: boolean }
export type QuestionExtractionAnalysisBlockRead = { name: string; question_count: number }
export type QuestionExtractionAnalysisRead = { detected_language: string | null; total_questions: number; blocks: QuestionExtractionAnalysisBlockRead[]; needs_review_count: number; corrections_count: number; visual_required_count: number; multi_page_question_count: number; questions: QuestionExtractionAnalysisQuestionRead[] }
export type QuestionExtractionAnalysisResultRead = { run_id: UUID; schema_version: number; processor_name: string; processor_version: string; provider_name: string | null; model_name: string | null; prompt_version: string | null; processing_version: string; analysis: QuestionExtractionAnalysisRead }
export type QuestionExtractionSuccessfulResultRead = { run: QuestionExtractionRunRead; candidate_count: number; candidates: QuestionCandidateRead[]; analysis_result: QuestionExtractionAnalysisResultRead | null }
export type QuestionExtractionOverviewRead = { source_document_id: UUID; media_asset_id: UUID; question_source_id: UUID | null; uploaded_by_user_id: UUID | null; latest_run: QuestionExtractionRunRead | null; latest_successful_result: QuestionExtractionSuccessfulResultRead | null }

export function getQuestionExtractionOverview(accessToken: string, sourceDocumentId: UUID): Promise<QuestionExtractionOverviewRead> {
  return requestJson<QuestionExtractionOverviewRead>(`/api/v1/sources/${sourceDocumentId}/question-extraction`, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
}

export function createQuestionExtractionRun(accessToken: string, sourceDocumentId: UUID): Promise<QuestionExtractionRunRead> {
  return requestJson<QuestionExtractionRunRead>(`/api/v1/sources/${sourceDocumentId}/question-extraction/runs`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } })
}
