import type { PrintableSnapshot, SnapshotState } from './printableRevisionSnapshot'
import { preparePrintableDocument } from './printableDocumentModel'

export function validateSavedRevisionPdf(state: SnapshotState): { snapshot: PrintableSnapshot | null; issues: string[] } {
  if (state.status !== 'ready') return { snapshot: null, issues: [state.status === 'error' ? state.message : 'Saxlanmış reviziyaları seçin və məzmunu yükləyin.'] }
  if (!state.snapshot.revisions.length || state.snapshot.revisions.some(revision => !revision.blocks.length)) return { snapshot: null, issues: ['Seçilmiş reviziyada məzmun yoxdur.'] }
  try {
    const plan = preparePrintableDocument(state.snapshot, 'saved-pdf-validation')
    return { snapshot: state.snapshot, issues: plan.issues.map(issue => `${issue.revisionId} / ${issue.blockId}: ${issue.message} Məzmunu redaktorda düzəldin və yenidən yükləyin.`) }
  } catch (error) {
    return { snapshot: null, issues: [error instanceof Error ? error.message : 'Məzmun hazırlana bilmədi.'] }
  }
}

/** Retains TestBuilder's existing equal-count, two-column allocation; no adaptive pagination. */
export function savedRevisionPdfPages(snapshot: PrintableSnapshot, pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 8) throw new Error('A4 səhifə sayı 1–8 olmalıdır.')
  const count = snapshot.revisions.length
  const questions = snapshot.revisions.map((revision, index) => ({
    number: index + 1,
    score: Math.floor(100 / count) + (index < 100 % count ? 1 : 0),
    snapshot: Object.freeze({ version: 1 as const, revisions: Object.freeze([revision]) }) as PrintableSnapshot,
  }))
  const perColumn = Math.ceil(count / (pageCount * 2))
  return Array.from({ length: pageCount }, (_, index) => ({
    left: questions.slice(index * 2 * perColumn, (index * 2 + 1) * perColumn),
    right: questions.slice((index * 2 + 1) * perColumn, (index * 2 + 2) * perColumn),
  })).filter(page => page.left.length || page.right.length)
}

type ReadinessOptions = { isCurrent: () => boolean; timeoutMs?: number }
function nextFrame(document: Document): Promise<void> {
  return new Promise(resolve => document.defaultView!.requestAnimationFrame(() => resolve()))
}
function assertCurrent(root: HTMLElement, isCurrent: () => boolean) {
  if (!isCurrent() || !root.isConnected) throw new Error('Seçim və ya görünüş dəyişdi. Cari məzmun üçün PDF əməliyyatını yenidən başladın.')
}

/** Wait for static React SVG/KaTeX layout and the fonts actually used by this document. */
export async function waitForSavedRevisionPrint(root: HTMLElement, { isCurrent, timeoutMs = 15000 }: ReadinessOptions) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const work = async () => {
    const document = root.ownerDocument
    assertCurrent(root, isCurrent)
    await nextFrame(document)
    await nextFrame(document)
    assertCurrent(root, isCurrent)
    if (root.querySelector('[data-printable-valid="false"], [data-printable-render-error]')) throw new Error('Məzmunun göstərilməsində xəta var. İşarələnmiş blokları düzəldin.')
    if (!root.querySelector('[data-revision-id]')) throw new Error('Çap üçün göstərilmiş reviziya yoxdur.')
    if (!document.fonts) throw new Error('Brauzer şriftlərin hazır olmasını yoxlaya bilmir.')
    const fonts = new Map<string, string>()
    for (const element of root.querySelectorAll<HTMLElement>('p, span, strong, em, text, .katex')) {
      const style = document.defaultView!.getComputedStyle(element)
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      fonts.set(font, (fonts.get(font) ?? '') + (element.textContent ?? ''))
    }
    await Promise.all([...fonts].map(([font, text]) => document.fonts.load(font, text || ' ')))
    await document.fonts.ready
    assertCurrent(root, isCurrent)
    for (const [font, text] of fonts) if (!document.fonts.check(font, text || ' ')) throw new Error('Sənədin şriftləri yüklənmədi. Yenidən cəhd edin.')
    for (const image of root.querySelectorAll('img')) {
      await image.decode()
      if (!image.naturalWidth) throw new Error('Şəkil yüklənmədi.')
    }
    await nextFrame(document)
    await nextFrame(document)
    assertCurrent(root, isCurrent)
  }
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Çap hazırlığı vaxt həddini aşdı. Yenidən cəhd edin.')), timeoutMs) })])
  } finally { clearTimeout(timeout) }
}

/** Reject clipping with the existing fixed A4 allocation; never silently drop content. */
export function validateSavedRevisionLayout(root: HTMLElement): string[] {
  const issues: string[] = []
  for (const content of root.querySelectorAll<HTMLElement>('[data-saved-question]')) {
    if (content.scrollWidth > content.clientWidth + 1) issues.push(`Sual ${content.dataset.savedQuestion}: məzmun sütundan enlidir. Redaktorda vizual çərçivəni kiçildin.`)
  }
  for (const column of root.querySelectorAll<HTMLElement>('.ksq-column')) {
    if (column.scrollHeight > column.clientHeight + 1) issues.push('Məzmun A4 sütununa sığmır. Səhifə sayını artırın və ya sualın ölçüsünü azaldın.')
  }
  return [...new Set(issues)]
}

/** Existing answer-space behavior, with equal weights for metadata-only revision types. */
export function distributeSavedAnswerSpace(root: HTMLElement) {
  for (const column of root.querySelectorAll<HTMLElement>('.ksq-column')) {
    const spaces = [...column.querySelectorAll<HTMLElement>('.measured-solution-space')]
    spaces.forEach(space => { space.style.height = '18px' })
    const style = root.ownerDocument.defaultView!.getComputedStyle(column)
    const occupied = [...column.querySelectorAll<HTMLElement>('.print-question-wrap')].reduce((sum, question) => {
      const questionStyle = root.ownerDocument.defaultView!.getComputedStyle(question)
      return sum + question.getBoundingClientRect().height + (parseFloat(questionStyle.marginTop) || 0) + (parseFloat(questionStyle.marginBottom) || 0)
    }, 0)
    const spare = Math.max(0, column.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - occupied - 4)
    spaces.forEach(space => { space.style.height = `${18 + Math.floor(spare / spaces.length)}px` })
  }
}

/** Single gate shared by both application print actions. */
export async function printSavedRevisionPdf(state: SnapshotState, root: HTMLElement, options: {
  isCurrent: () => boolean; authorize: () => void; print: () => void; timeoutMs?: number
}) {
  const validation = validateSavedRevisionPdf(state)
  if (!validation.snapshot || validation.issues.length) throw new Error(validation.issues.join('\n'))
  await waitForSavedRevisionPrint(root, options)
  distributeSavedAnswerSpace(root)
  const issues = validateSavedRevisionLayout(root)
  if (issues.length) throw new Error(issues.join('\n'))
  assertCurrent(root, options.isCurrent)
  options.authorize()
  options.print()
}
