import { requestJson } from './client'

export type GradeCatalogResponse = {
  id: string
  name: string
  display_name: string
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
