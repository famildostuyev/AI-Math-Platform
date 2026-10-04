// Real Edge/CDP interaction with production AdminQuestionEditor; API transport is a fixture.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js'
import { runGeometryRibbonAcceptance } from './geometry_ribbon_browser.mjs'
import { runGeometryLineAcceptance } from './geometry_line_browser.mjs'
import { runGeometryTriangleAcceptance } from './geometry_triangle_browser.mjs'
import { runGeometry2DAcceptance } from './geometry_2d_browser.mjs'
import { runGeometryCircleAcceptance } from './geometry_circle_browser.mjs'
import { runGeometryArcAcceptance } from './geometry_arc_browser.mjs'
import { runGeometryMidpointAcceptance } from './geometry_midpoint_browser.mjs'
import { runGeometryLinearConstructionAcceptance } from './geometry_linear_construction_browser.mjs'
import { runGeometryAngleBisectorAcceptance } from './geometry_angle_bisector_browser.mjs'

const root = path.resolve(import.meta.dirname, '..')
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'geometry-frame-edge-'))
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MathfieldElement} from 'mathlive';
MathfieldElement.fontsDirectory='/node_modules/mathlive/fonts';
import AdminQuestionEditor from '/src/components/AdminQuestionEditor.tsx';
import '/src/index.css'; import '/src/App.css';
import '/src/components/UniversalEditor.css';
const root=createRoot(document.getElementById('root'));
const revision={question_family_id:'family',question_form_id:'form',revision_id:'revision',revision_number:1,status:'draft',question_type_id:'type',source_id:null,source_display_name:null,source_detail:null,difficulty:null,updated_at:'2026-01-01T00:00:00Z',primary_topic_id:null,related_topic_ids:[],purpose_ids:[],blocks:[],answer_policy:'unsupported',answer_options:[],accepted_answers:[],solution:null};
window.savedRevision=revision;window.requests=[];let serial=0,mount=0;
${['--ribbon', '--lines', '--triangles', '--quadrilaterals', '--regular', '--complete', '--circles', '--arcs', '--midpoint', '--linear-constructions', '--angle-bisector'].some(flag => process.argv.includes(flag)) ? `revision.blocks.push({id:'text-fixture',block_type:'text',sort_order:0,payload:{source_text:'Triangle exercise',format_version:1,document:{type:'document',content:[{type:'paragraph',content:[{type:'text',text:'Triangle exercise ',marks:[]},{type:'inline_math',latex:'a^2+b^2=c^2'},{type:'text',text:' — construct below.',marks:[]}]}]}}});` : ''}
window.fetch=async(url,init={})=>{
 const method=init.method||'GET';const body=init.body?JSON.parse(init.body):null;
 if(method!=='GET')window.requests.push({url:String(url),method,body});
 if(String(url).endsWith('/catalog/question-types'))return new Response(JSON.stringify([{id:'type',name:'multiple_choice',display_name:'Test',sort_order:1}]));
 if(method==='GET'&&String(url).endsWith('/revisions/revision'))return new Response(JSON.stringify(revision));
 if(method==='POST'&&String(url).endsWith('/blocks/geometry')){
  await new Promise(r=>setTimeout(r,100));
  const block={id:'frame-'+(++serial),block_type:'geometry',sort_order:serial*1000,payload:body.payload,visual_placement:body.visual_placement};
  revision.blocks.push(block);revision.updated_at=new Date(Date.parse(revision.updated_at)+1000).toISOString();
  return new Response(JSON.stringify(block),{status:201});
 }
 if(method==='PATCH'){
  const id=String(url).split('/').at(-2);const block=revision.blocks.find(b=>b.id===id);
  if(!block)throw Error('Unknown block '+id);
  if(body.source_data)block.payload={source_data:body.source_data,format_version:1};
  if(body.visual_placement)block.visual_placement=body.visual_placement;
  revision.updated_at=new Date(Date.parse(revision.updated_at)+1000).toISOString();
  return new Response(JSON.stringify(block));
 }
 throw Error('Unexpected request '+method+' '+url);
};
window.reloadEditor=()=>root.render(React.createElement(AdminQuestionEditor,{key:++mount,initialRevisionId:'revision',authenticatedRequest:fn=>fn('fixture'),onBack:()=>{}}));
window.reloadEditor();
`
const server = await createServer({ root: path.join(root, 'frontend'), server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'geometry-frame-fixture', resolveId(id) { if (id === '/__frame.jsx') return id },
  load(id) { if (id === '/__frame.jsx') return fixture },
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/__frame') return next()
    res.setHeader('Content-Type', 'text/html')
    res.end(await server.transformIndexHtml('/__frame', '<!doctype html><div id="root"></div><script type="module" src="/__frame.jsx"></script>'))
  }) },
}] })
await server.listen()
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let debugPort
  for (let i = 0; i < 100; i++) { try { debugPort = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) } }
  assert.ok(debugPort, 'Edge started')
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${server.httpServer.address().port}/__frame`, { method: 'PUT' })).json()
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let serial = 0
  const pending = new Map()
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) } })
  const send = (method, params = {}) => new Promise(resolve => { const id = ++serial; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.result?.exceptionDetails, JSON.stringify(r.result?.exceptionDetails)); return r.result?.result.value }
  const until = async expression => { for (let i = 0; i < 160; i++) { if (await evaluate(`!!(${expression})`)) return; await delay(100) } throw Error('Timeout: ' + expression + '\n' + await evaluate('document.body.innerText')) }
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false })
  const pointer = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra })
  const box = selector => evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`)
  const click = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
    const b = await box(selector), x = b.x + b.width / 2, y = b.y + b.height / 2
    await pointer('mouseMoved', x, y); await pointer('mousePressed', x, y, { button: 'left', clickCount: 1 }); await pointer('mouseReleased', x, y, { button: 'left', clickCount: 1 })
  }
  const textButton = async text => {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled);if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.dataset.testClick='yes'})()`)
    await click('[data-test-click="yes"]'); await evaluate(`document.querySelector('[data-test-click="yes"]')?.removeAttribute('data-test-click')`)
  }
  const frame = '[data-frame-id="frame-1"]'
  const drag = async (selector, dx, dy) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
    const b = await box(selector), x = b.x + b.width / 2, y = b.y + b.height / 2
    await pointer('mouseMoved', x, y); await pointer('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 })
    await pointer('mouseMoved', x + dx, y + dy, { button: 'left', buttons: 1 }); await delay(120)
    await pointer('mouseReleased', x + dx, y + dy, { button: 'left', clickCount: 1 }); await delay(150)
  }
  await until('document.querySelector(".universal-question-canvas")')
  if (process.argv.includes('--angle-bisector')) {
    const source=await runGeometryAngleBisectorAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
    if(process.env.G2_ANGLE_BISECTOR_SOURCE_PATH)await fs.writeFile(process.env.G2_ANGLE_BISECTOR_SOURCE_PATH,JSON.stringify(source))
  } else if (process.argv.includes('--linear-constructions')) {
    const source=await runGeometryLinearConstructionAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
    if(process.env.G2F2_SOURCE_PATH)await fs.writeFile(process.env.G2F2_SOURCE_PATH,JSON.stringify(source))
  } else if (process.argv.includes('--midpoint')) {
    const source = await runGeometryMidpointAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag })
    if (process.env.G2F1_SOURCE_PATH) await fs.writeFile(process.env.G2F1_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--arcs')) {
    const source = await runGeometryArcAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag }, process.argv.includes('--family'))
    if (process.env.G2E2_SOURCE_PATH) await fs.writeFile(process.env.G2E2_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--circles')) {
    const source = await runGeometryCircleAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag })
    if (process.env.G2E1_SOURCE_PATH) await fs.writeFile(process.env.G2E1_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--complete')) {
    const source = await runGeometry2DAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag })
    if (process.env.G2D4_SOURCE_PATH) await fs.writeFile(process.env.G2D4_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--regular')) {
    const source = await runGeometryTriangleAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag }, false, true)
    if (process.env.G2D3_SOURCE_PATH) await fs.writeFile(process.env.G2D3_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--quadrilaterals')) {
    const source = await runGeometryTriangleAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag }, true)
    if (process.env.G2D2_SOURCE_PATH) await fs.writeFile(process.env.G2D2_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--triangles')) {
    const source = await runGeometryTriangleAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag })
    if (process.env.G2D1_SOURCE_PATH) await fs.writeFile(process.env.G2D1_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--lines')) {
    const source = await runGeometryLineAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag })
    if (process.env.G2C_SOURCE_PATH) await fs.writeFile(process.env.G2C_SOURCE_PATH, JSON.stringify(source))
  } else if (process.argv.includes('--ribbon')) {
    await runGeometryRibbonAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send })
  } else {
  await textButton('Həndəsə'); await textButton('Çərçivə əlavə et')
  await until('document.querySelector(".geometry-authoring-board svg")')
  assert.equal(await evaluate('requests.filter(r=>r.method==="POST").length'), 1)
  assert.equal(await evaluate('savedRevision.blocks.length'), 1)
  assert.equal(await evaluate(`document.querySelectorAll('${frame} [data-handle]').length`), 8)
  const frameBox = await box(frame), controlsBox = await box(`${frame} .geometry-editor__frame-controls`), actionsBox = await box(`${frame} .visual-frame__actions`)
  assert.ok(controlsBox.y >= frameBox.y + frameBox.height, 'Description controls stay outside drawing area')
  assert.ok(actionsBox.y + actionsBox.height <= frameBox.y, 'Save controls do not cover the description')
  assert.ok(await evaluate('savedRevision.blocks[0].payload.source_data.description.trim()'))
  await textButton('Nöqtə')
  const board = await box('.geometry-authoring-board')
  for (const [dx, dy] of [[80, 90], [180, 190]]) {
    await pointer('mousePressed', board.x + dx, board.y + dy, { button: 'left', clickCount: 1 })
    await pointer('mouseReleased', board.x + dx, board.y + dy, { button: 'left', clickCount: 1 }); await delay(160)
  }
  await until('document.querySelectorAll(".geometry-authoring-board svg ellipse").length>=2')
  const pointDistance = selector => evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].slice(0,2).map(e=>e.getBoundingClientRect());return {x:e[1].x-e[0].x,y:e[1].y-e[0].y,w:e[0].width}})()`)
  const boardBefore = await pointDistance('.geometry-authoring-board svg ellipse')
  await drag(`${frame} [data-handle="se"]`, 90, 70)
  assert.deepEqual(await pointDistance('.geometry-authoring-board svg ellipse'), boardBefore, 'Authoring does not scale')
  await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${frame} .geometry-points circle')`)
  assert.equal(await evaluate('savedRevision.blocks[0].payload.source_data.points.length'), 2)
  const source = await evaluate('JSON.stringify(savedRevision.blocks[0].payload.source_data)')
  const distance = await pointDistance(`${frame} .geometry-points circle`)
  const before = await box(frame)
  await drag(`${frame} [data-handle="e"]`, 80, 0)
  let after = await box(frame)
  assert.equal(after.width, before.width + 80); assert.equal(after.height, before.height)
  await drag(`${frame} [data-handle="s"]`, 0, 50)
  assert.equal((await box(frame)).height, before.height + 50)
  assert.deepEqual(await pointDistance(`${frame} .geometry-points circle`), distance, 'SVG does not scale')
  await drag(`${frame} .visual-frame__move`, 60, 40)
  await click(`${frame} .visual-frame__actions button:nth-child(2)`)
  await until('requests.some(r=>r.url.endsWith("/visual-placement"))')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0].payload.source_data)'), source, 'Layout-only save preserves source')
  const persisted = await evaluate('structuredClone(savedRevision.blocks[0].visual_placement)')
  await evaluate('reloadEditor()'); await until(`document.querySelector('${frame}')`)
  after = await box(frame)
  assert.equal(after.width, persisted.size.width); assert.equal(after.height, persisted.size.height)
  assert.equal(await evaluate(`parseFloat(document.querySelector('${frame}').style.left)`), persisted.position.x)
  assert.equal(await evaluate(`parseFloat(document.querySelector('${frame}').style.top)`), persisted.position.y)
  await pointer('mouseMoved', 0, 0)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame}')).outlineColor`), 'rgba(0, 0, 0, 0)')
  await evaluate(`document.querySelector('${frame}').scrollIntoView({block:'center'})`)
  let b = await box(frame); await pointer('mouseMoved', b.x + 30, b.y + 30)
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('${frame}')).outlineColor`), 'rgba(0, 0, 0, 0)')
  await pointer('mouseMoved', 0, 0)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame}')).outlineColor`), 'rgba(0, 0, 0, 0)')
  await click(frame); await pointer('mouseMoved', 0, 0)
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('${frame}')).outlineColor`), 'rgba(0, 0, 0, 0)')
  await drag(`${frame} [data-handle="se"]`, -1200, -1200)
  b = await box(frame)
  assert.ok(b.width >= 180 && b.height >= 190, 'Content bounds stop shrink')
  assert.deepEqual(await pointDistance(`${frame} .geometry-points circle`), distance)
  assert.equal(await evaluate(`document.querySelectorAll('${frame} .visual-content [data-frame-chrome]').length`), 0)
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame} [data-handle]')).display`), 'none')
  await send('Emulation.setEmulatedMedia', { media: '' })
  await textButton('Həndəsə'); await textButton('Çərçivə əlavə et')
  await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await drag('[data-frame-id=frame-2] [data-handle=se]', -1200, -1200)
  const empty = await box('[data-frame-id=frame-2]')
  assert.equal(empty.width, 160); assert.equal(empty.height, 120)
  await textButton('Nöqtə')
  b = await box('[data-frame-id=frame-2] .geometry-authoring-board')
  await pointer('mousePressed', b.x + 60, b.y + 60, { button: 'left', clickCount: 1 }); await pointer('mouseReleased', b.x + 60, b.y + 60, { button: 'left', clickCount: 1 })
  await delay(150); await click('[data-frame-id=frame-2] .visual-frame__actions button')
  await until('savedRevision.blocks[1].payload.source_data.points.length===1')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0].payload.source_data)'), source)
  assert.equal(await evaluate('requests.filter(r=>r.method==="POST").length'), 2)
  await evaluate('delete savedRevision.blocks[0].visual_placement;reloadEditor()')
  await until(`document.querySelector('${frame} .geometry-points circle')`)
  assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-points circle').length`), 2, 'Legacy V1 remains readable')
  await click(frame); await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${frame} .geometry-authoring-board')`)
  await textButton('Nöqtə')
  b = await box(`${frame} .geometry-authoring-board`)
  await pointer('mousePressed', b.x + 120, b.y + 70, { button: 'left', clickCount: 1 }); await pointer('mouseReleased', b.x + 120, b.y + 70, { button: 'left', clickCount: 1 })
  await delay(150)
  assert.equal(await evaluate(`document.querySelector('${frame}').style.position`), 'relative', 'Internal legacy edits do not invent floating placement')
  await click(`${frame} .visual-frame__actions button`)
  await until('savedRevision.blocks[0].payload.source_data.points.length===3')
  assert.equal(await evaluate('savedRevision.blocks[0].visual_placement===undefined'), true)
  // Long labels and annotations participate in the actual rendered minimum.
  await evaluate(`(()=>{const g=savedRevision.blocks[0].payload.source_data;g.points[0].label='Long point label';g.texts=[{id:'note',x:140,y:110,content:'Annotation with wide letters WWW'}];g.segments=[{id:'edge',start_point_id:g.points[0].id,end_point_id:g.points[1].id}];reloadEditor()})()`)
  await until(`document.querySelector('${frame} .geometry-annotations text')`)
  await click(frame); await drag(`${frame} [data-handle="se"]`, -1600, -1600)
  assert.ok(await evaluate(`(()=>{const f=document.querySelector('${frame}').getBoundingClientRect();return [...document.querySelectorAll('${frame} .geometry-points circle, ${frame} .geometry-points text, ${frame} .geometry-annotations text, ${frame} .geometry-segments line')].every(e=>{const r=e.getBoundingClientRect();return r.left>=f.left&&r.top>=f.top&&r.right<=f.right&&r.bottom<=f.bottom})})()`), 'Visible labels, text and segments remain inside the minimum')
  // Moving an open legacy editor uses layout-only Save, even without texts in raw V1.
  await evaluate('delete savedRevision.blocks[0].payload.source_data.texts;reloadEditor()')
  await until(`document.querySelector('${frame} .geometry-points circle')`)
  const legacySource = await evaluate('JSON.stringify(savedRevision.blocks[0].payload.source_data)')
  await click(frame); await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${frame} .geometry-authoring-board')`)
  await drag(`${frame} .visual-frame__move`, 20, 10)
  await click(`${frame} .visual-frame__actions button`)
  await until(`document.querySelector('${frame} .geometry-points circle')`)
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0].payload.source_data)'), legacySource)
  assert.ok((await evaluate('requests.at(-1).url')).endsWith('/visual-placement'))
  console.log('PASS: real Edge frame creation, hover, selection, 8 handles, move, width/height/corner resize, fixed SVG/board scale, bounds, fixture save/reload, two-frame targeting, print chrome and legacy V1')
  }
} finally {
  socket?.close(); browser.kill(); await server.close()
  await delay(300)
  if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('geometry-frame-edge-')) await fs.rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 })
}
