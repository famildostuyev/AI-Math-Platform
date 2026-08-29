import { BadgeCheck, BookOpen, CheckCircle2, Info, Lightbulb, Sigma } from 'lucide-react'
import MathContent from './MathContent'
import { groupSolutionItems, type SolutionPresentationItem } from './solutionPresentationModel'
import './SolutionPresentation.css'

const roleDetails = {
  governing_formula: { label: 'Düstur / qayda', icon: Sigma },
  result: { label: 'Nəticə', icon: CheckCircle2 },
  final_answer: { label: 'Yekun cavab', icon: BadgeCheck },
  verification: { label: 'Yoxlama', icon: CheckCircle2 },
  note: { label: 'Qeyd', icon: Info },
  property: { label: 'Xassə / qayda', icon: BookOpen },
} as const


function PresentationItem({ item }: { item: SolutionPresentationItem }) {
  const detail = item.role === 'reasoning' ? null : roleDetails[item.role]
  const Icon = detail?.icon ?? Lightbulb
  return <div className={`solution-presentation__item solution-presentation__item--${item.role}`} data-presentation-role={item.role}>
    {detail && <div className="solution-presentation__role-label"><Icon aria-hidden="true" size={17} /><span>{detail.label}</span></div>}
    {item.type === 'text'
      ? <p className="solution-presentation__prose">{item.text}</p>
      : <div className="solution-presentation__formula"><MathContent content={{ format_version: 1, segments: [{ type: 'math', latex: item.latex ?? '', source_text: item.sourceText ?? '', display_mode: item.displayMode ?? true }] }} fallbackText={item.sourceText ?? 'Formula göstərilə bilmədi.'} /></div>}
  </div>
}

export default function SolutionPresentation({ items, ariaLabel = 'Həllin təqdimatı' }: { items: SolutionPresentationItem[]; ariaLabel?: string }) {
  return <section className="solution-presentation" aria-label={ariaLabel}>
    {groupSolutionItems(items).map((group) => <article className={`solution-presentation__group${group.stepIndex === null ? ' solution-presentation__group--unnumbered' : ''}`} key={group.key}>
      {group.stepIndex !== null && <header className="solution-presentation__step-heading"><span aria-hidden="true">{group.stepIndex}</span><h3>Addım {group.stepIndex}</h3></header>}
      <div className="solution-presentation__group-content">{group.items.map((item) => <PresentationItem item={item} key={item.key} />)}</div>
    </article>)}
  </section>
}
