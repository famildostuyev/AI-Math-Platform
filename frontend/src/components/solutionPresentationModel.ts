import type { StructuredContent } from '../api/questionExtraction'
import type { SolutionBlockRead, SolutionPresentationRole } from '../api/questionEditor'

export type SolutionPresentationItem = {
  key: string
  type: 'text' | 'math'
  text?: string
  latex?: string
  sourceText?: string
  displayMode?: boolean
  stepIndex: number | null
  role: SolutionPresentationRole
}

export type SolutionGroup = { key: string; stepIndex: number | null; items: SolutionPresentationItem[] }

export function groupSolutionItems(items: SolutionPresentationItem[]): SolutionGroup[] {
  const groups: SolutionGroup[] = []
  for (const item of items) {
    const previous = groups.at(-1)
    if (previous && previous.stepIndex === item.stepIndex) previous.items.push(item)
    else groups.push({ key: `${item.stepIndex ?? 'unscoped'}-${groups.length}`, stepIndex: item.stepIndex, items: [item] })
  }
  return groups
}

export function solutionBlocksToPresentationItems(blocks: SolutionBlockRead[]): SolutionPresentationItem[] {
  return blocks.map((block) => ({
    key: block.id,
    type: block.block_type === 'text' ? 'text' : 'math',
    text: block.block_type === 'text' ? block.source_text : undefined,
    latex: block.block_type === 'formula' ? block.source_latex : undefined,
    sourceText: block.block_type === 'formula' ? block.source_latex : undefined,
    displayMode: block.block_type === 'formula',
    stepIndex: block.step_index,
    role: block.presentation_role,
  }))
}

export function structuredExplanationToPresentationItems(content: StructuredContent): SolutionPresentationItem[] {
  return content.segments.map((segment, index) => ({
    key: `segment-${index}`,
    type: segment.type,
    text: segment.type === 'text' ? segment.text : undefined,
    latex: segment.type === 'math' ? segment.latex : undefined,
    sourceText: segment.type === 'math' ? segment.source_text : undefined,
    displayMode: segment.type === 'math' ? segment.display_mode : undefined,
    stepIndex: segment.step_index ?? null,
    role: segment.presentation_role ?? 'reasoning',
  }))
}
