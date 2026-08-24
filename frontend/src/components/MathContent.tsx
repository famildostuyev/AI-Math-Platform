import katex from 'katex'
import type { MathSegment, StructuredContent } from '../api/questionExtraction'

type MathContentProps = {
  content?: StructuredContent | null
  fallbackText: string
}

function RenderedMath({ segment }: { segment: MathSegment }) {
  try {
    const html = katex.renderToString(segment.latex, {
      displayMode: segment.display_mode,
      output: 'htmlAndMathml',
      strict: 'warn',
      throwOnError: true,
      trust: false,
    })
    const Element = segment.display_mode ? 'div' : 'span'
    return <Element className={`math-content__math${segment.display_mode ? ' math-content__math--display' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  } catch {
    const Element = segment.display_mode ? 'div' : 'span'
    return <Element className="math-content__fallback">{segment.source_text}</Element>
  }
}

export default function MathContent({ content, fallbackText }: MathContentProps) {
  if (!content) return <>{fallbackText}</>

  return <>{content.segments.map((segment, index) => (
    segment.type === 'text'
      ? <span key={index}>{segment.text}</span>
      : <RenderedMath key={index} segment={segment} />
  ))}</>
}
