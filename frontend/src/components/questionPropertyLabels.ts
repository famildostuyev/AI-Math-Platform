import type { QuestionTypeCatalogResponse } from '../api/catalog'
import type { QuestionDifficulty, QuestionRevisionStatus } from '../api/questionEditor'

// Display translations only. Available types and persistence IDs come from the catalog.
export function questionTypeLabel(type: QuestionTypeCatalogResponse): string {
  if (type.name === 'multiple_choice') return 'Qapalı'
  if (type.name === 'open_response') return 'Açıq'
  return 'Tərcüməsi olmayan sual tipi'
}

export const statusLabels: Record<QuestionRevisionStatus, string> = {
  draft: 'Qaralama',
  proposed: 'Təklif edilib',
  approved: 'Təsdiqlənib',
  rejected: 'Rədd edilib',
}

export const difficultyLabels: Record<QuestionDifficulty, string> = {
  easy: 'Asan',
  medium: 'Orta',
  hard: 'Çətin',
}
