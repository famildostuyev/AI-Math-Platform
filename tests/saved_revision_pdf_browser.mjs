// Opt-in production App + real HTTP/PostgreSQL acceptance; invoked by the Python wrapper.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js'
import { loadGeometryModule } from './geometry_test_modules.mjs'
import { auditQuestionBankLayout } from './question_bank_layout_browser.mjs'

if (process.argv.includes('--scene-fixture')) {
  const model = await loadGeometryModule('geometry3dModel'), author = await loadGeometryModule('geometry3dSolidAuthoring'), surface = await loadGeometryModule('geometry3dSurfacePoints')
  let scene = author.createCylinderAt3D(model.emptyGeometryScene3D(), [0, 0, 0], 'XY', 'C').scene
  scene = surface.createPointOnCylinderSurface3D(scene, 'C_surface', [0, .5], 'attached')
  scene = surface.editCylinderSurfacePointLabel3D(scene, 'attached', 'M₁ α')
  scene.print_camera = { ...scene.print_camera, position: [7, -7, 4], target: [0, 0, 1] }
  process.stdout.write(JSON.stringify(scene))
  process.exit(0)
}
assert.ok(process.env.SAVED_PDF_REAL_CONTEXT, 'Use the opt-in real-backend wrapper')
const context = JSON.parse(process.env.SAVED_PDF_REAL_CONTEXT)
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'saved-pdf-edge-'))
const server = await createServer({ root: path.resolve('frontend'), server: { host: '127.0.0.1', port: 0, proxy: { '/api': context.backend } } })
await server.listen()
const port = server.httpServer.address().port
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let debugPort
  for (let i = 0; i < 100; i++) { try { debugPort = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) } }
  assert.ok(debugPort, 'Edge debugging endpoint unavailable')
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/`)}`, { method: 'PUT' })).json()
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let serial = 0
  const pending = new Map()
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); pending.get(message.id)?.(message) })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 30000)
    pending.set(id, message => { clearTimeout(timer); pending.delete(id); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message) })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    assert.ok(!response.result?.exceptionDetails, JSON.stringify(response.result?.exceptionDetails))
    return response.result?.result.value
  }
  const until = async expression => {
    for (let i = 0; i < 160; i++) { if (await evaluate(`!!(${expression})`)) return; await delay(100) }
    throw new Error(`Browser timeout: ${expression}\n${await evaluate('document.body.innerText')}`)
  }
  const clickText = text => evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)throw Error('Button unavailable');button.click()})()`)
  const fill = (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false })
  await until('document.querySelector("#login-identifier")')
  await fill('#login-identifier', context.email); await fill('#login-password', context.password)
  await clickText('Sign in'); await until('document.querySelector(".sidebar--admin")')
  await clickText('Sual bazası'); await until('document.querySelector(".admin-question-bank") || document.body.innerText.includes("Saxlanmış sualların PDF hazırlığı")')
  if (process.argv.includes('--question-bank-layout')) await auditQuestionBankLayout({ send, evaluate, until, context, broken: process.argv.includes('--expect-broken') })
  await clickText('Saxlanmış sualların PDF hazırlığı'); await until('document.querySelector(".saved-pdf-workflow")')
  await fill('input', context.marker); await clickText('Axtar')
  await until(`document.querySelector('section[aria-label="Saxlanmış sualların PDF hazırlığı"]').innerText.includes(${JSON.stringify(context.revisionId)})`)
  await evaluate(`document.querySelector('input[type="checkbox"]').click()`)
  await clickText('Saxlanmış məzmunu yüklə')
  await until('document.body.innerText.includes("1 reviziya PDF hazırlığı üçün yükləndi")')
  await clickText('Çap / PDF görünüşü')
  await until('document.querySelector(".pdf-export-document [data-id=attached]")')
  await evaluate('document.fonts.ready'); await delay(500)
  const preview = await evaluate('document.querySelector(".pdf-export-document").innerHTML')
  assert.ok(preview.includes(context.marker)); assert.ok(preview.includes('M₁ α'))
  assert.ok(!/geometry-placeholder|geo-a|Müvəqqəti sual/.test(preview))
  await clickText('PDF ixracı'); await until('document.querySelector(".pdf-download-button")'); await delay(500)
  const exported = await evaluate('document.querySelector(".pdf-export-document").innerHTML')
  const scrub = html => html.replace(/print_[0-9a-f_]+_r\d+_b\d+/g, 'SCOPE')
  assert.equal(scrub(preview), scrub(exported), 'preview/export content including geometry must match')
  // Intercept the print invocation only; actual PDF is generated from this exact prepared DOM by Edge.
  await evaluate('window.savedPrintCalls=0;window.print=()=>{window.savedPrintCalls++;window.savedPrintAuthorized=document.querySelector(".saved-pdf-workflow").dataset.printAuthorized}')
  await clickText('PDF yüklə'); await until('window.savedPrintCalls===1')
  assert.equal(await evaluate('window.savedPrintAuthorized'), 'true')
  assert.equal(await evaluate('document.querySelectorAll(".saved-pdf-workflow [role=alert]").length'), 0)
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  const printIssues = await evaluate(`(async()=>{const {validateSavedRevisionLayout}=await import('/src/components/savedRevisionPdfModel.ts');return validateSavedRevisionLayout(document.querySelector('.pdf-export-document'))})()`)
  assert.deepEqual(printIssues, [], 'actual print-media A4 must not clip the saved question')
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })
  await fs.writeFile(context.pdfPath, Buffer.from(pdf.result.data, 'base64'))
  await send('Emulation.setEmulatedMedia', { media: '' })
  await evaluate('window.dispatchEvent(new Event("afterprint"));document.querySelector("details").open=true;document.querySelector("input[type=checkbox]").click()')
  await until('!document.querySelector(".pdf-export-document [data-revision-id]")')
  assert.equal(await evaluate('document.querySelector(".pdf-download-button").disabled'), true)
  assert.equal(await evaluate('document.querySelectorAll(".geometry-placeholder").length'), 0)
  if (process.argv.includes('--question-bank-layout') && !process.argv.includes('--expect-broken')) {
    await clickText('Sual bazasına qayıt')
    await auditQuestionBankLayout({ send, evaluate, until, context, phase: 'back-from-pdf' })
    await fill('#question-bank-search', context.marker)
    await evaluate('document.querySelector(".admin-question-bank-search button").click()')
    await until(`document.querySelector('.admin-question-bank-table-wrap tbody').innerText.includes(${JSON.stringify(context.marker)})`)
    await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Status"]');s.value='draft';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await until(`document.querySelector('.admin-question-bank-table-wrap tbody').innerText.includes(${JSON.stringify(context.marker)}) && !document.querySelector('.admin-question-bank-loading')`)
    assert.equal(await evaluate('document.querySelector("select[aria-label=Status]").value'), 'draft')
    await send('Page.reload')
    // Existing app authentication is in memory: reload correctly requires sign-in again.
    await until('document.querySelector("#login-identifier")')
    await fill('#login-identifier', context.email); await fill('#login-password', context.password)
    await clickText('Sign in'); await until('document.querySelector(".sidebar--admin")')
    await clickText('Sual bazası')
    await auditQuestionBankLayout({ send, evaluate, until, context, phase: 'after-refresh' })
    console.log('PASS: real Edge desktop layout at 1280/1440/1920, search/status filtering, PDF navigation/back and refresh/re-login')
  }
  console.log('PASS: real Edge production App login, PostgreSQL revision selection/load, matching preview/export, labeled saved-camera cylinder, print readiness, actual A4 PDF, selection invalidation and no mock fallback')
  console.log('PDF artifact:', context.pdfPath)
} finally {
  socket?.close(); browser.kill(); await server.close()
  // The isolated Edge profile is a temporary artifact, never a user browser profile.
}
