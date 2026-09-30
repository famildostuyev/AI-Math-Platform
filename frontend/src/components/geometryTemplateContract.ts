import type { GeometryPolygonTemplate } from '../api/questionEditor'
import limitsJson from '../../../backend/app/schemas/geometry_template_limits.json?raw'

// Shared with backend validation. Bounds per-vertex/edge JSXGraph work.
export const REGULAR_POLYGON_LIMITS: Readonly<{ minSides: number; maxSides: number }> = Object.freeze(JSON.parse(limitsJson))
export const validRegularSides = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= REGULAR_POLYGON_LIMITS.minSides && n <= REGULAR_POLYGON_LIMITS.maxSides
export const parseRegularSides = (text: string): number | null => /^\d+$/.test(text) && validRegularSides(Number(text)) ? Number(text) : null

export const MIN_TEMPLATE_CREATION_LENGTH = 2 // Local units; rejects effectively zero-area initial figures.
export const TEMPLATE_VERTEX_COUNTS = { triangle: 3, right_triangle: 3, rectangle: 4, square: 4, parallelogram: 4, rhombus: 4, trapezoid: 4 } as const
export type GeometryTemplateTool = keyof typeof TEMPLATE_VERTEX_COUNTS | 'regular_pentagon' | 'regular_hexagon' | 'regular_polygon'
export const isTemplateTool = (tool: string): tool is GeometryTemplateTool => Object.hasOwn(TEMPLATE_VERTEX_COUNTS, tool) || ['regular_pentagon', 'regular_hexagon', 'regular_polygon'].includes(tool)
export const regularSidesForTool = (tool: GeometryTemplateTool, n?: number): number | undefined => tool === 'regular_pentagon' ? 5 : tool === 'regular_hexagon' ? 6 : tool === 'regular_polygon' ? n : undefined
export function validPolygonTemplate(value: unknown, count: number): value is GeometryPolygonTemplate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const metadata = value as Record<string, unknown>
  if (metadata.kind === 'regular_polygon') return Object.keys(metadata).length === 2 && validRegularSides(metadata.n) && metadata.n === count
  return Object.keys(metadata).join(',') === 'kind' && typeof metadata.kind === 'string'
    && Object.hasOwn(TEMPLATE_VERTEX_COUNTS, metadata.kind) && TEMPLATE_VERTEX_COUNTS[metadata.kind as keyof typeof TEMPLATE_VERTEX_COUNTS] === count
}
