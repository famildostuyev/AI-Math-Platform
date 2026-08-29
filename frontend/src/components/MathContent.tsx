import katex from 'katex'
import type { MathSegment, StructuredContent } from '../api/questionExtraction'

type MathContentProps = {
  content?: StructuredContent | null
  fallbackText: string
}

function renderMath(segment: MathSegment): string | null {
  try {
    return katex.renderToString(segment.latex, {
      displayMode: segment.display_mode,
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: true,
      trust: false,
    })
  } catch {
    return null
  }
}

function RenderedMath({ segment }: { segment: MathSegment }) {
  const html = renderMath(segment)
  if (html === null) {
    return <span className={`math-content__fallback${segment.display_mode ? ' math-content__math--display' : ''}`}>{segment.source_text}</span>
  }
  return <span className={`math-content__math${segment.display_mode ? ' math-content__math--display' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
}

export default function MathContent({ content, fallbackText }: MathContentProps) {
  if (!content) return <>{fallbackText}</>

  return <span className="math-content">{content.segments.map((segment, index) => (
    segment.type === 'text'
      ? <span className="math-content__text" key={index}>{segment.text}</span>
      : <RenderedMath key={index} segment={segment} />
  ))}</span>
}
