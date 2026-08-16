import { requestJson } from './client'
import type {
  IsoDateTime,
  QuestionDifficulty,
  QuestionRevisionStatus,
  UUID,
} from './questionEditor'

export type QuestionBankSort = 'updated_desc' | 'created_desc'

export type QuestionBankListQuery = {
  q?: string
  question_type_id?: UUID
  status?: QuestionRevisionStatus
  difficulty?: QuestionDifficulty
  purpose_id?: UUID
  page?: number
  page_size?: number
  sort?: QuestionBankSort
}

export type QuestionBankQuestionTypeRead = {
  id: UUID
  name: string
  display_name: string
}

export type QuestionBankPrimaryTopicRead = {
  id: UUID
  name: string
  display_name: string
}

export type QuestionBankItemRead = {
  question_family_id: UUID
  question_form_id: UUID
  revision_id: UUID
  revision_number: number
  status: QuestionRevisionStatus
  is_current_approved: boolean
  question_type: QuestionBankQuestionTypeRead
  difficulty: QuestionDifficulty | null
  primary_topic: QuestionBankPrimaryTopicRead | null
  block_count: number
  text_preview: string | null
  updated_at: IsoDateTime
}

export type QuestionBankPageRead = {
  items: QuestionBankItemRead[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

function buildQuestionBankQueryString(query: QuestionBankListQuery): string {
  const parameters = new URLSearchParams()

  if (query.q !== undefined) parameters.set('q', query.q)
  if (query.question_type_id !== undefined) {
    parameters.set('question_type_id', query.question_type_id)
  }
  if (query.status !== undefined) parameters.set('status', query.status)
  if (query.difficulty !== undefined) {
    parameters.set('difficulty', query.difficulty)
  }
  if (query.purpose_id !== undefined) {
    parameters.set('purpose_id', query.purpose_id)
  }
  if (query.page !== undefined) parameters.set('page', String(query.page))
  if (query.page_size !== undefined) {
    parameters.set('page_size', String(query.page_size))
  }
  if (query.sort !== undefined) parameters.set('sort', query.sort)

  const serialized = parameters.toString()
  return serialized ? `?${serialized}` : ''
}

export function getQuestionBankQuestions(
  accessToken: string,
  query: QuestionBankListQuery = {},
): Promise<QuestionBankPageRead> {
  const queryString = buildQuestionBankQueryString(query)

  return requestJson<QuestionBankPageRead>(
    `/api/v1/question-bank/questions${queryString}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}
