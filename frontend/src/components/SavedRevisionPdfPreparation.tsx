import { Component, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import PrintableRevisionPreparation from './PrintableRevisionPreparation'
import SavedRevisionPrintPages from './SavedRevisionPrintPages'
import type { SnapshotState } from './printableRevisionSnapshot'
import { distributeSavedAnswerSpace, printSavedRevisionPdf, validateSavedRevisionLayout, validateSavedRevisionPdf, waitForSavedRevisionPrint } from './savedRevisionPdfModel'
import './SavedRevisionPdf.css'

class PrintRenderBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <p role="alert" data-printable-render-error>Məzmun göstərilə bilmədi. Reviziyanı redaktorda yoxlayın və yenidən yükləyin.</p> : this.props.children
  }
}

export default function SavedRevisionPdfPreparation({ authenticatedRequest, state, onChange, onBack }: {
  authenticatedRequest: <T>(request: (token: string) => Promise<T>) => Promise<T>
  state: SnapshotState; onChange: (state: SnapshotState) => void; onBack: () => void
}) {
  const [stage, setStage] = useState<'selection' | 'preview' | 'export'>('selection')
  const [pageCount, setPageCount] = useState(2)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const root = useRef<HTMLDivElement>(null), workflow = useRef<HTMLElement>(null)
  const generation = useRef(0), printing = useRef(false)
  const validation = useMemo(() => validateSavedRevisionPdf(state), [state])
  const valid = !!validation.snapshot && !validation.issues.length
  const snapshotKey = validation.snapshot?.revisions.map(revision => `${revision.revision_id}:${revision.updated_at}`).join('|')

  useLayoutEffect(() => {
    const current = ++generation.current
    const host = root.current, shell = workflow.current
    if (shell) shell.dataset.printAuthorized = 'false'
    const reset = () => { if (shell) shell.dataset.printAuthorized = 'false' }
    window.addEventListener('afterprint', reset)
    if (host && valid && stage !== 'selection') {
      void waitForSavedRevisionPrint(host, { isCurrent: () => current === generation.current })
        .then(() => { distributeSavedAnswerSpace(host); setErrors(validateSavedRevisionLayout(host)) })
        .catch(error => { if (current === generation.current) setErrors([error instanceof Error ? error.message : 'Çap hazırlığı uğursuz oldu.']) })
    }
    return () => { generation.current = current + 1; reset(); window.removeEventListener('afterprint', reset) }
  }, [state, pageCount, stage, valid])

  async function print() {
    if (printing.current || !valid || stage !== 'export' || !root.current) return
    printing.current = true
    setBusy(true); setErrors([])
    const current = generation.current, host = root.current
    try {
      await printSavedRevisionPdf(state, host, {
        isCurrent: () => current === generation.current,
        authorize: () => { if (workflow.current) workflow.current.dataset.printAuthorized = 'true' },
        print: () => window.print(),
      })
    } catch (error) {
      if (workflow.current) workflow.current.dataset.printAuthorized = 'false'
      if (current === generation.current) setErrors([error instanceof Error ? error.message : 'Çap uğursuz oldu.'])
    } finally { printing.current = false; setBusy(false) }
  }

  return <main className="workspace builder-workspace saved-pdf-workflow" ref={workflow} data-print-authorized="false">
    <div className="builder-content refined-builder">
      <div className="no-print">
        <button type="button" onClick={onBack}>Sual bazasına qayıt</button>
        <details open={stage === 'selection'}><summary>Saxlanmış reviziyaların seçimi</summary>
          <PrintableRevisionPreparation authenticatedRequest={authenticatedRequest} state={state} onChange={onChange} />
        </details>
        <div className="pdf-export-toolbar">
          <button type="button" disabled={!validation.snapshot || busy} onClick={() => { setErrors([]); setStage('preview') }}>Çap / PDF görünüşü</button>
          <label>Səhifə sayı <select value={pageCount} disabled={busy} onChange={event => { setErrors([]); setPageCount(Number(event.target.value)) }}>
            {Array.from({ length: 8 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
          </select></label>
          <button type="button" disabled={!valid || busy} onClick={() => { setErrors([]); setStage('export') }}>PDF ixracı</button>
          {stage === 'export' && <div className="pdf-export-actions">
            <button className="primary-action pdf-download-button" type="button" disabled={!valid || busy} onClick={() => void print()}>PDF yüklə</button>
            <button className="secondary-action pdf-print-button" type="button" disabled={!valid || busy} onClick={() => void print()}>Çap et</button>
          </div>}
        </div>
        <p role="status">{busy ? 'Sənəd və şriftlər hazırlanır…' : stage === 'export' ? 'PDF ixracı — saxlanmış suallar' : 'Saxlanmış suallar — A4, 2 sütun'}</p>
        <p>Sıra seçiminizə uyğundur. Bal mövcud qayda ilə 100 üzərindən bərabər bölünür. Cavab açarları və həllər daxil edilmir.</p>
        <p>Səhifələr sual sayına görə bölünür. Sütuna sığmayan məzmunun çapı dayandırılır; səhifə sayını və ya redaktorda vizual ölçüləri dəyişin.</p>
        {[...validation.issues, ...errors].length > 0 && <ul role="alert">{[...validation.issues, ...errors].map((message, index) => <li key={index}>{message}</li>)}</ul>}
      </div>
      <div className="saved-print-blocked">PDF çapı dayandırılıb. Tətbiqdə “PDF yüklə” düyməsini istifadə edin və göstərilən xətaları düzəldin.</div>
      <div className="pdf-export-document" ref={root}>
        {stage !== 'selection' && validation.snapshot && <PrintRenderBoundary key={snapshotKey}>
          <SavedRevisionPrintPages snapshot={validation.snapshot} pageCount={pageCount} instanceId={`saved-${stage}`} />
        </PrintRenderBoundary>}
      </div>
    </div>
  </main>
}
