import type { StructuredTextFontFamily, StructuredTextFontSize } from './structuredContinuousTextEditorModel'

export const FONT_STACKS: Record<StructuredTextFontFamily, string> = {
  default: 'inherit', serif: 'Georgia, serif', sans: 'Arial, Helvetica, sans-serif',
  'math-compatible': 'Cambria, Georgia, serif',
  'times-new-roman': '"Times New Roman", Times, serif',
  arial: 'Arial, Helvetica, sans-serif', calibri: 'Calibri, "Segoe UI", sans-serif',
  cambria: 'Cambria, Georgia, serif', georgia: 'Georgia, serif',
  verdana: 'Verdana, Geneva, sans-serif',
}

// Legacy token meanings remain readable without rewriting stored documents.
export const LEGACY_SIZE_POINTS = { small: 10, normal: 12, large: 16, 'x-large': 20 } as const
export const TEXT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48] as const
export const fontSizePoints = (value: StructuredTextFontSize): number =>
  typeof value === 'number' ? value : LEGACY_SIZE_POINTS[value]
export const validFontSize = (value: unknown): value is StructuredTextFontSize =>
  (typeof value === 'number' && Number.isInteger(value) && value >= 8 && value <= 72)
  || (typeof value === 'string' && Object.hasOwn(LEGACY_SIZE_POINTS, value))
export const validFontFamily = (value: unknown): value is StructuredTextFontFamily =>
  typeof value === 'string' && Object.hasOwn(FONT_STACKS, value)
export const validTextColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value)
