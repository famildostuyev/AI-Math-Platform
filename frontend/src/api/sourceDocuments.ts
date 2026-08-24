import { requestJson } from './client'
import type { IsoDateTime, UUID } from './questionEditor'

export type SourceDocumentMediaAssetRead = {
  id: UUID
  original_filename: string | null
  mime_type: string
  size_bytes: number
  width_px: number | null
  height_px: number | null
  created_at: IsoDateTime
}

export type SourceDocumentRead = {
  id: UUID
  media_asset_id: UUID
  question_source_id: UUID | null
  uploaded_by_user_id: UUID | null
  created_at: IsoDateTime
  media_asset: SourceDocumentMediaAssetRead
}

export function getSourceDocuments(
  accessToken: string,
): Promise<SourceDocumentRead[]> {
  return requestJson<SourceDocumentRead[]>(
    '/api/v1/sources',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}

export function uploadSourceDocument(
  accessToken: string,
  file: File,
  questionSourceId?: UUID | null,
): Promise<SourceDocumentRead> {
  const formData = new FormData()
  formData.append('file', file)

  if (questionSourceId) {
    formData.append('question_source_id', questionSourceId)
  }

  return requestJson<SourceDocumentRead>('/api/v1/sources', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  })
}
