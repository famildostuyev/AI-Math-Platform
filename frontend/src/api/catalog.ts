import { requestJson } from './client'

export type GradeCatalogResponse = {
  id: string
  name: string
  display_name: string
  sort_order: number
}

export type PurposeCatalogResponse = {
  id: string
  name: string
  display_name: string
  description: string | null
  sort_order: number
  parent_id: string | null
}

export type QuestionTypeCatalogResponse = {
  id: string
  name: string
  display_name: string
  description: string | null
  sort_order: number
}

export function getGrades(
  accessToken: string,
): Promise<GradeCatalogResponse[]> {
  return requestJson<GradeCatalogResponse[]>('/api/v1/catalog/grades', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export function getPurposes(
  accessToken: string,
): Promise<PurposeCatalogResponse[]> {
  return requestJson<PurposeCatalogResponse[]>('/api/v1/catalog/purposes', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export function getQuestionTypes(
  accessToken: string,
): Promise<QuestionTypeCatalogResponse[]> {
  return requestJson<QuestionTypeCatalogResponse[]>(
    '/api/v1/catalog/question-types',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
}
