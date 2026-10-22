import type { CSSProperties, ReactNode } from 'react'
import type { InlineNode, ParagraphNode, StructuredTextDocument, TextMark } from '../api/questionEditor'
import type { PrintableSnapshot } from './printableRevisionSnapshot'
import { preparePrintableDocument, type PrintableBlock } from './printableDocumentModel'
import { FONT_STACKS, fontSizePoints } from './structuredTextTypography'
import MathContent from './MathContent'
import GeometryRenderer from './GeometryRenderer'
import 'katex/dist/katex.min.css'
import './PrintableDocument.css'

function Mathematics({ latex, display = false }: { latex: string; display?: boolean }) {
  return <MathContent fallbackText={latex} content={{ format_version: 1, segments: [{ type: 'math', latex, source_text: latex, display_mode: display }] }} />
}

function markedText(text: string, marks: TextMark[]): ReactNode {
  return marks.reduceRight<ReactNode>((content, mark, index) => {
    if (mark.type === 'bold') return <strong key={index}>{content}</strong>
    if (mark.type === 'italic') return <em key={index}>{content}</em>
    if (mark.type === 'underline') return <u key={index}>{content}</u>
    const style: CSSProperties = mark.type === 'font_family' ? { fontFamily: FONT_STACKS[mark.value] }
      : mark.type === 'font_size' ? { fontSize: `${fontSizePoints(mark.value)}pt` }
      : mark.type === 'foreground_color' ? { color: mark.value } : { backgroundColor: mark.value }
    return <span key={index} style={style}>{content}</span>
  }, text)
}

function Inline({ node }: { node: InlineNode }) {
  if (node.type === 'hard_break') return <br />
  if (node.type === 'inline_math') return <Mathematics latex={node.latex} />
  return <>{markedText(node.text, node.marks)}</>
}
function Paragraph({ node }: { node: ParagraphNode }) {
  return <p style={{ textAlign: node.attrs?.alignment }}>{node.content.map((inline, index) => <Inline node={inline} key={index} />)}</p>
}
function StructuredText({ document }: { document: StructuredTextDocument }) {
  return <>{document.content.map((block, index) => {
    if (block.type === 'paragraph') return <Paragraph node={block} key={index} />
    const List = block.type === 'ordered_list' ? 'ol' : 'ul'
    return <List key={index}>{block.content.map((item, itemIndex) => <li key={itemIndex}>{item.content.map((paragraph, paragraphIndex) => <Paragraph node={paragraph} key={paragraphIndex} />)}</li>)}</List>
  })}</>
}
function Block({ block }: { block: PrintableBlock }) {
  const node = block.node
  if (block.issue || !node) return <div className="printable-document__unsupported" role="alert" data-print-issue={block.issue?.code}>
    Çap üçün dəstəklənməyən məzmun ({block.id}): {block.issue?.message}
  </div>
  if (node.type === 'paragraph') return <StructuredText document={node.document} />
  if (node.type === 'display_formula') return <div className="printable-document__formula"><Mathematics latex={node.latex} display /></div>
  if (node.type === 'geometry') return <div className="printable-document__geometry" style={{
    position: block.placement ? 'absolute' : 'relative', left: block.placement?.position.x,
    top: block.placement?.position.y, width: block.size?.width, height: block.size?.height,
  }}>
    {node.geometryV1 && <GeometryRenderer geometry={node.geometryV1} blockId={block.scope} frameSize={block.size} />}
    {block.svg && <div dangerouslySetInnerHTML={{ __html: block.svg }} />}
  </div>
  return null // Every unsupported node is reported by preparePrintableDocument.
}

/** Static document only: no editor session, live camera, selection, history, or writes. */
export default function PrintableDocument({ snapshot, instanceId }: { snapshot: PrintableSnapshot; instanceId: string }) {
  const plan = preparePrintableDocument(snapshot, instanceId)
  return <section className="printable-document" data-printable-valid={plan.exportable} aria-label="Çap üçün sual sənədi">
    {plan.revisions.map((revision, index) => <article key={`${revision.revisionId}-${index}`} className="printable-document__question"
      data-revision-id={revision.revisionId} style={{ minWidth: revision.minWidth || undefined, minHeight: revision.minHeight || undefined }}>
      {revision.blocks.map((block, blockIndex) => <div key={`${block.id}-${blockIndex}`} data-block-id={block.id}><Block block={block} /></div>)}
    </article>)}
  </section>
}
