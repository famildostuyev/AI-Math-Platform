import assert from 'node:assert/strict'
import { FORMULA_CLIPBOARD_MIME, formulaClipboardHtml, parseFormulaClipboard, parseFormulaClipboardHtml, writeFormulaClipboard } from '../frontend/src/components/formulaClipboard.ts'

const content = new Map()
const transfer = { setData: (type, value) => content.set(type, value) }
assert.equal(writeFormulaClipboard(transfer, String.raw`\textcolor{red}{\sqrt{x^2+1}}`), true)
const payload = JSON.parse(content.get(FORMULA_CLIPBOARD_MIME))
assert.deepEqual(Object.keys(payload).sort(), ['latex', 'type', 'version'])
assert.deepEqual(payload, { version: 1, type: 'inline_math', latex: String.raw`\textcolor{red}{\sqrt{x^2+1}}` })
assert.equal(content.get('application/x-latex'), payload.latex)
assert.equal(content.get('text/plain'), payload.latex)
assert.deepEqual(parseFormulaClipboard(content.get(FORMULA_CLIPBOARD_MIME)), payload)
assert.deepEqual(parseFormulaClipboardHtml(content.get('text/html')), payload)
assert.deepEqual(parseFormulaClipboardHtml(`<html><head></head><body>${content.get('text/html')}</body></html>`), payload)
assert.deepEqual(parseFormulaClipboardHtml(formulaClipboardHtml('a&"<b>')), { version: 1, type: 'inline_math', latex: 'a&"<b>' })
for (const html of ['<script>alert(1)</script>', '<span data-universal-editor-inline-math="1" data-latex="x" onclick="evil()"></span>', '<span data-universal-editor-inline-math="1" data-latex="x"><img></span>']) assert.equal(parseFormulaClipboardHtml(html), null)

for (const invalid of [
  '', '{', 'null', '[]',
  JSON.stringify({ version: 2, type: 'inline_math', latex: 'x' }),
  JSON.stringify({ version: 1, type: 'text', latex: 'x' }),
  JSON.stringify({ version: 1, type: 'inline_math', latex: '' }),
  JSON.stringify({ version: 1, type: 'inline_math', latex: 'x', revision_id: 'private' }),
  JSON.stringify({ version: 1, type: 'inline_math', latex: 'x\0' }),
  JSON.stringify({ version: 1, type: 'inline_math', latex: 'x'.repeat(20_001) }),
]) assert.equal(parseFormulaClipboard(invalid), null)

assert.equal(writeFormulaClipboard(transfer, ''), false)
console.log('PASS: minimal versioned formula clipboard payload, fallbacks, and untrusted-payload rejection')
