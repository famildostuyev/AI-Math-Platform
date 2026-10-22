import PrintableDocument from './PrintableDocument'
import type { PrintableSnapshot } from './printableRevisionSnapshot'
import { savedRevisionPdfPages } from './savedRevisionPdfModel'

/** Shared preview/export body in the existing KSQ A4 print shell. */
export default function SavedRevisionPrintPages({ snapshot, pageCount, instanceId }: {
  snapshot: PrintableSnapshot; pageCount: number; instanceId: string
}) {
  const pages = savedRevisionPdfPages(snapshot, pageCount)
  return <div className="print-pages export-print-pages saved-revision-pages">
    {pages.map((page, pageIndex) => <article className="ksq-paper" key={pageIndex}>
      <div className="ksq-watermark">AI Riyaziyyat Platforması</div>
      {pageIndex === 0 ? <header className="ksq-paper-header">
        <div className="ksq-header-side"><label>Ad <span /></label><label>Soyad <span /></label><label>KSQ № <span /></label></div>
        <div className="ksq-header-center"><strong>Riyaziyyat</strong><span>A variantı</span></div>
        <div className="ksq-header-side right"><label>Mövzu <span /></label><label>Tarix <span /></label><label>Topladığı bal <span /> / 100</label></div>
      </header> : <div className="ksq-continuation-top" />}
      <div className={`ksq-columns ${pageIndex ? 'continuation-page' : ''}`}>
        {[page.left, page.right].map((column, columnIndex) => <div className="ksq-column" key={columnIndex}>
          {column.map(question => <div className="print-question-wrap" key={question.number}>
            <div className="print-question keep-together">
              <strong>{question.number}.</strong>
              <div data-saved-question={question.number}>
                <PrintableDocument snapshot={question.snapshot} instanceId={`${instanceId}-q${question.number}`} />
              </div>
              <div className="solution-space medium measured-solution-space"><span>Həll üçün yer</span></div>
              <div className="print-question-score">{question.score} bal</div>
            </div>
          </div>)}
        </div>)}
      </div>
      <footer className="ksq-paper-footer"><span>AI Riyaziyyat Platforması</span><strong>{pageIndex + 1} / {pages.length}</strong></footer>
    </article>)}
  </div>
}
