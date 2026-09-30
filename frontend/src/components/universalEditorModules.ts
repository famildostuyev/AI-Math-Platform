export type UniversalEditorModuleId =
  | 'text'
  | 'algebra'
  | 'geometry'
  | 'graph'
  | 'table'
  | 'chart'
  | 'image'
  | 'diagram'
  | 'symbols'

export type UniversalEditorModule = {
  id: UniversalEditorModuleId
  label: string
  description: string
  available: boolean
}

export const UNIVERSAL_EDITOR_MODULES: readonly UniversalEditorModule[] = [
  { id: 'text', label: 'Mətn', description: 'Sual mətnini birbaşa sənəddə yazın', available: true },
  { id: 'algebra', label: 'Cəbr', description: 'Riyazi formulalar əlavə edin', available: true },
  { id: 'geometry', label: 'Həndəsə', description: 'Geometry V1 vizualları yaradın', available: true },
  { id: 'graph', label: 'Qrafik', description: 'Qrafik alətləri üçün təməl', available: false },
  { id: 'table', label: 'Cədvəl', description: 'Cədvəl alətləri üçün təməl', available: false },
  { id: 'chart', label: 'Diaqram', description: 'Diaqram alətləri üçün təməl', available: false },
  { id: 'image', label: 'Şəkil', description: 'Şəkil alətləri üçün təməl', available: false },
  { id: 'diagram', label: 'Sxem', description: 'Sxem alətləri üçün təməl', available: false },
  { id: 'symbols', label: 'Simvollar', description: 'Simvol alətləri üçün təməl', available: false },
] as const

export function getUniversalEditorModule(id: UniversalEditorModuleId): UniversalEditorModule {
  return UNIVERSAL_EDITOR_MODULES.find((module) => module.id === id) ?? UNIVERSAL_EDITOR_MODULES[0]
}
