import { requestJson } from './client'
import type { IsoDateTime, UUID } from './questionEditor'

export type SourcePreAnalysisRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'

export type SourcePreAnalysisFindingSeverity = 'info' | 'warning' | 'error'

export type SourcePreAnalysisRunRead = {
  id: UUID
  source_document_id: UUID
  run_number: number
  status: SourcePreAnalysisRunStatus
  requested_by_user_id: UUID | null
  started_at: IsoDateTime | null
  completed_at: IsoDateTime | null
  failure_message: string | null
}

export type SourcePreAnalysisFindingRead = {
  id: UUID
  sequence_number: number
  finding_code: string
  severity: SourcePreAnalysisFindingSeverity
  confidence: string | null
  message: string
  source_document_page_id: UUID | null
  page_number: number | null
}

export type SourcePreAnalysisSuccessfulResultRead = {
  run: SourcePreAnalysisRunRead
  result_id: UUID
  schema_version: number
  page_count: number | null
  processor_name: string | null
  processor_version: string | null
  provider_name: string | null
  model_name: string | null
  prompt_version: string | null
  finding_count: number
  info_count: number
  warning_count: number
  error_count: number
  findings: SourcePreAnalysisFindingRead[]
}

export type SourcePreAnalysisOverviewRead = {
  source_document_id: UUID
  media_asset_id: UUID
  question_source_id: UUID | null
  uploaded_by_user_id: UUID | null
  latest_run: SourcePreAnalysisRunRead | null
  latest_successful_result: SourcePreAnalysisSuccessfulResultRead | null
}

export function getSourcePreAnalysisOverview(
  accessToken: string,
  sourceDocumentId: UUID,
): Promise<SourcePreAnalysisOverviewRead> {
  return requestJson<SourcePreAnalysisOverviewRead>(
    `/api/v1/sources/${encodeURIComponent(sourceDocumentId)}/pre-analysis`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}

export function createSourcePreAnalysisRun(
  accessToken: string,
  sourceDocumentId: UUID,
): Promise<SourcePreAnalysisRunRead> {
  return requestJson<SourcePreAnalysisRunRead>(
    `/api/v1/sources/${encodeURIComponent(sourceDocumentId)}/pre-analysis/runs`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}
