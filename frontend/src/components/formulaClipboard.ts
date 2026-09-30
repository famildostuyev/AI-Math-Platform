export const FORMULA_CLIPBOARD_MIME = 'application/x-universal-editor-inline-math+json'
export const FORMULA_WEB_CLIPBOARD_MIME = `web ${FORMULA_CLIPBOARD_MIME}`
const HTML_MARKER = 'data-universal-editor-inline-math'
const MAX_LATEX_LENGTH = 20_000

export type FormulaClipboardPayload = {
  version: 1
  type: 'inline_math'
  latex: string
}

export function parseFormulaClipboard(value: string): FormulaClipboardPayload | null {
  if (!value || value.length > MAX_LATEX_LENGTH + 100) return null
  try {
    const payload: unknown = JSON.parse(value)
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
    const fields = payload as Record<string, unknown>
    if (Object.keys(fields).sort().join(',') !== 'latex,type,version') return null
    if (fields.version !== 1 || fields.type !== 'inline_math') return null
    if (typeof fields.latex !== 'string' || !fields.latex || fields.latex.length > MAX_LATEX_LENGTH || fields.latex.includes('\0')) return null
    return { version: 1, type: 'inline_math', latex: fields.latex }
  } catch {
    return null
  }
}

export function writeFormulaClipboard(transfer: DataTransfer, latex: string): boolean {
  const payload = parseFormulaClipboard(JSON.stringify({ version: 1, type: 'inline_math', latex }))
  if (!payload) return false
  transfer.setData(FORMULA_CLIPBOARD_MIME, JSON.stringify(payload))
  transfer.setData('text/html', formulaClipboardHtml(latex))
  transfer.setData('application/x-latex', latex)
  transfer.setData('text/plain', latex)
  return true
}

export function formulaClipboardHtml(latex: string): string {
  const escaped = latex.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<span ${HTML_MARKER}="1" data-latex="${escaped}"></span>`
}

export function parseFormulaClipboardHtml(html: string): FormulaClipboardPayload | null {
  if (!html || html.length > MAX_LATEX_LENGTH * 6 + 200) return null
  const cleaned = html.replace(/^<!--StartFragment-->/, '').replace(/<!--EndFragment-->$/, '').trim()
  const fragment = cleaned.startsWith('<html><head></head><body>') && cleaned.endsWith('</body></html>')
    ? cleaned.slice('<html><head></head><body>'.length, -'</body></html>'.length) : cleaned
  const match = /^<span data-universal-editor-inline-math="1" data-latex="([^"]*)"><\/span>$/.exec(fragment)
  if (!match) return null
  const latex = match[1].replace(/&(amp|quot|lt|gt);/g, (_, entity: string) => ({ amp: '&', quot: '"', lt: '<', gt: '>' })[entity as 'amp' | 'quot' | 'lt' | 'gt'])
  if (formulaClipboardHtml(latex) !== fragment) return null
  return parseFormulaClipboard(JSON.stringify({ version: 1, type: 'inline_math', latex }))
}
