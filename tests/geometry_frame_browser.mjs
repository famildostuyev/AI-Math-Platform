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
import { runGeometryAltitudeAcceptance } from './geometry_altitude_browser.mjs'
import { runGeometryMedianAcceptance } from './geometry_median_browser.mjs'
import { runGeometryCapacityAcceptance } from './geometry_capacity_browser.mjs'
import { runGeometryReliabilityAcceptance } from './geometry_reliability_browser.mjs'
import { runGeometryShapesAcceptance } from './geometry_shapes_browser.mjs'
import { runGeometryAnnotationsAcceptance } from './geometry_annotations_browser.mjs'
import { runPointOnSegmentAcceptance, runFinalPointOnSegmentAcceptance } from './geometry_point_on_segment_browser.mjs'
import { runGeometryAttachmentAcceptance } from './geometry_attachments_browser.mjs'
import { runPointOnLineAcceptance } from './geometry_point_on_line_browser.mjs'
import { runGeometry3DM1Acceptance } from './geometry_3d_m1_browser.mjs'
import { runGeometry3DM2Acceptance } from './geometry_3d_m2_browser.mjs'
import { runGeometry3DM3Acceptance } from './geometry_3d_m3_browser.mjs'
import { runGeometry3DM4Acceptance } from './geometry_3d_m4_browser.mjs'
import { runUnifiedGeometryMenuAcceptance } from './geometry_unified_menu_browser.mjs'
import { runGeometryFrameControlsAcceptance } from './geometry_frame_controls_browser.mjs'
import { runGeometryFrameContextAcceptance } from './geometry_frame_context_browser.mjs'
import { runGeometryPropertiesAcceptance } from './geometry_properties_browser.mjs'
import { runCameraSyncAcceptance } from './geometry_camera_sync_browser.mjs'
import { runContextPickingAcceptance } from './geometry_context_picking_browser.mjs'
import { runMenuPlacementAcceptance } from './geometry_menu_placement_browser.mjs'
import { runApexDragAcceptance } from './geometry_apex_drag_browser.mjs'
import { runApexHeightAcceptance } from './geometry_apex_height_browser.mjs'
import { runApexApplyAcceptance } from './geometry_apex_apply_browser.mjs'
import { runBaseVertexAcceptance } from './geometry_base_vertex_browser.mjs'
import { runPlanarAcceptance } from './geometry_planar_browser.mjs'
import { runScenePyramidAcceptance } from './geometry_scene_pyramid_browser.mjs'
import { runBaseAlignmentAcceptance } from './geometry_base_alignment_browser.mjs'
import { runPyramidConsumptionAcceptance } from './geometry_pyramid_consumption_browser.mjs'
import { runEdgeVisibilityAcceptance } from './geometry_edge_visibility_browser.mjs'
import { runSolidRotationAcceptance } from './geometry_solid_rotation_browser.mjs'
import { runSolidTranslationAcceptance } from './geometry_solid_translation_browser.mjs'
import { runSolidScaleAcceptance } from './geometry_solid_scale_browser.mjs'
import { runM5RealAcceptance } from './geometry_m5_real_browser.mjs'

const root = path.resolve(import.meta.dirname, '..')
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'geometry-frame-edge-'))
const realContext=process.argv.includes('--m5-real')?JSON.parse(process.env.M5_REAL_CONTEXT??'null'):null
if(process.argv.includes('--m5-real'))assert.ok(realContext&&/^http:\/\/127\.0\.0\.1:\d+$/.test(realContext.backend)&&/^[a-f0-9-]{36}$/.test(realContext.revision_id))
delete process.env.M5_REAL_CONTEXT
let fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MathfieldElement} from 'mathlive';
MathfieldElement.fontsDirectory='/node_modules/mathlive/fonts';
import AdminQuestionEditor from '/src/components/AdminQuestionEditor.tsx';
import GeometryEditor from '/src/components/GeometryEditor.tsx';
import GeometrySceneEditor from '/src/components/GeometrySceneEditor.tsx';
import GeometrySceneViewport from '/src/components/GeometrySceneViewport.tsx';
import {useUniversalEditorSession,UniversalEditorSessionContext} from '/src/components/universalEditorSession.ts';
import '/src/index.css'; import '/src/App.css';
import '/src/components/UniversalEditor.css';
const root=createRoot(document.getElementById('root'));
const revision={question_family_id:'family',question_form_id:'form',revision_id:'revision',revision_number:1,status:'draft',question_type_id:'type',source_id:null,source_display_name:null,source_detail:null,difficulty:null,updated_at:'2026-01-01T00:00:00Z',primary_topic_id:null,related_topic_ids:[],purpose_ids:[],blocks:[],answer_policy:'unsupported',answer_options:[],accepted_answers:[],solution:null};
window.savedRevision=revision;window.requests=[];let serial=0,mount=0;
${process.argv.includes('--camera-sync') ? `
window.openCameraSyncFixture=source=>{
 function CameraFixture(){
  const [update,setUpdate]=React.useState({camera:source.print_camera}),[generation,setGeneration]=React.useState(0);
  const pending=React.useRef([]);window.cameraSyncPending=pending.current;
  window.cameraSyncApply=i=>setUpdate(pending.current[i]);
  window.cameraSyncExternal=camera=>setUpdate({camera});
  window.cameraSyncRemount=()=>setGeneration(n=>n+1);
  return React.createElement('div',{style:{width:520,height:400}},React.createElement(GeometrySceneViewport,{key:generation,scene:source,camera:update.camera,cameraOrigin:update.origin,interactive:true,onNavigate:(camera,origin)=>pending.current.push({camera,origin})}));
 }
 root.render(React.createElement(CameraFixture,{key:++mount}));
};` : ''}
window.openUnframedScene=source=>{
 function UnframedScene(){
  const [scene,setScene]=React.useState(source),session=useUniversalEditorSession();window.unframedScene=scene;
  return React.createElement(UniversalEditorSessionContext.Provider,{value:session},React.createElement('div',{style:{width:700,height:500}},React.createElement(GeometrySceneEditor,{value:scene,onChange:setScene,targetId:'unframed-3d',disabled:false})));
 }
 root.render(React.createElement(UnframedScene,{key:++mount}));
};
${['--ribbon', '--lines', '--triangles', '--quadrilaterals', '--regular', '--complete', '--circles', '--arcs', '--midpoint', '--linear-constructions', '--angle-bisector', '--altitude', '--median', '--capacity', '--reliability'].some(flag => process.argv.includes(flag)) ? `revision.blocks.push({id:'text-fixture',block_type:'text',sort_order:0,payload:{source_text:'Triangle exercise',format_version:1,document:{type:'document',content:[{type:'paragraph',content:[{type:'text',text:'Triangle exercise ',marks:[]},{type:'inline_math',latex:'a^2+b^2=c^2'},{type:'text',text:' — construct below.',marks:[]}]}]}}});` : ''}
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
 if(method==='DELETE'&&String(url).includes('/blocks/')){
  const id=new URL(String(url),window.location.origin).pathname.split('/').at(-1);revision.blocks=revision.blocks.filter(b=>b.id!==id);
  revision.updated_at=new Date(Date.parse(revision.updated_at)+1000).toISOString();
  return new Response(null,{status:204});
 }
 throw Error('Unexpected request '+method+' '+url);
};
window.reloadEditor=()=>root.render(${process.argv.includes('--reliability') ? 'React.createElement(React.StrictMode,null,' : ''}React.createElement(AdminQuestionEditor,{key:++mount,initialRevisionId:'revision',authenticatedRequest:fn=>fn('fixture'),onBack:()=>{}})${process.argv.includes('--reliability') ? ')' : ''});
window.reloadEditor();
${process.argv.includes('--point-on-segment-final') || process.argv.includes('--point-on-line') || process.argv.includes('--attachments') ? `
window.openUnframedGeometry=source=>{
 ${process.argv.includes('--point-on-line') ? `
 function Unframed(){
   const [geometry,setGeometry]=React.useState(source),session=useUniversalEditorSession();
   window.unframedGeometry=geometry;
   window.unframedUndo=()=>session.getActiveContext()?.history?.undo();
   window.unframedRedo=()=>session.getActiveContext()?.history?.redo();
   return React.createElement(UniversalEditorSessionContext.Provider,{value:session},React.createElement(GeometryEditor,{value:geometry,disabled:false,onChange:setGeometry,targetId:'unframed'}));
 }
 ` : `
 function Unframed(){const [geometry,setGeometry]=React.useState(source);window.unframedGeometry=geometry;return React.createElement(GeometryEditor,{value:geometry,disabled:false,onChange:setGeometry})}
 `}
 root.render(React.createElement(Unframed,{key:++mount}));
};` : ''}
`
if(realContext){
  const start=fixture.indexOf('window.fetch=async'),end=fixture.indexOf('window.reloadEditor=',start)
  assert.ok(start>0&&end>start)
  fixture=fixture.slice(0,start)+`
const realFetch=window.fetch.bind(window);window.realResponses=[];
window.fetch=async(url,init={})=>{
 const response=await realFetch(url,init),data=await response.clone().json().catch(()=>null),method=init.method||'GET';
 window.realResponses.push({url:String(url),method,status:response.status,data});
 if(method==='GET'&&String(url).endsWith('/revisions/'+${JSON.stringify(realContext.revision_id)}))window.savedRevision=data;
 return response;
};
window.realRevision=()=>window.fetch('/api/v1/question-editor/revisions/'+${JSON.stringify(realContext.revision_id)},{headers:{Authorization:'Bearer '+${JSON.stringify(realContext.token)}}}).then(r=>{if(!r.ok)throw Error('Real revision GET '+r.status);return r.json()});
`+fixture.slice(end)
  fixture=fixture.replace("initialRevisionId:'revision'",`initialRevisionId:${JSON.stringify(realContext.revision_id)}`).replace("fn=>fn('fixture')",`fn=>fn(${JSON.stringify(realContext.token)})`)
}
const server = await createServer({ root: path.join(root, 'frontend'), ...(realContext?{define:{'import.meta.env.VITE_API_BASE_URL':'""'}}:{}), server: { host: '127.0.0.1', port: 0, ...(realContext?{proxy:{'/api':{target:realContext.backend,changeOrigin:true}}}:{}) }, plugins: [{
  name: 'geometry-frame-fixture', enforce: 'pre',
  transform(code,id) {
    if((realContext||process.argv.includes('--solid-scale')||process.argv.includes('--solid-rotation')||process.argv.includes('--solid-translation'))&&id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).rotationScene=structuredClone(value);(globalThis as any).solidGestureState={selected:state.selected,dragging:state.dragging,message:state.message}; return <div className="geometry-3d-editor"')
    if(process.argv.includes('--edge-visibility')&&id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).visibilityScene=structuredClone(value);(globalThis as any).visibilityNavigate=navigate; return <div className="geometry-3d-editor"')
    if(process.argv.includes('--edge-visibility')&&id.endsWith('/GeometrySceneViewport.tsx'))return code.replace('renderer!.render(world,view);','renderer!.render(world,view);(globalThis as any).visibilityDraw={camera:structuredClone(current),lines:group!.children.filter(o=>o.type==="Line").map(o=>({id:o.userData.semanticId,hidden:(o as THREE.Line<THREE.BufferGeometry,THREE.LineDashedMaterial>).material.isLineDashedMaterial===true}))};')
    if(process.argv.includes('--base-alignment')&&id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).baseAlignmentScene=structuredClone(value); return <div className="geometry-3d-editor"')
    if(process.argv.includes('--base-alignment')&&id.endsWith('/GeometrySceneViewport.tsx'))return code.replace('renderer!.render(world,view);','renderer!.render(world,view);(globalThis as any).baseAlignmentDraw=group!.children.map(o=>({id:o.userData.semanticId,type:o.type,positions:Array.from((o as THREE.Mesh).geometry?.getAttribute("position")?.array??[])}));')
    if((process.argv.includes('--scene-pyramid')||process.argv.includes('--pyramid-consumption'))&&id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).scenePyramidScene=structuredClone(value); return <div className="geometry-3d-editor"')
    if(process.argv.includes('--planar')&&id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).planarScene=structuredClone(value); return <div className="geometry-3d-editor"')
    if(process.argv.includes('--base-vertex')&&id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).baseVertexScene=structuredClone(value); return <div className="geometry-3d-editor"')
    if(process.argv.includes('--apex-apply')&&id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).apexApplyScene=structuredClone(value); return <div className="geometry-3d-editor"')
    if(!process.argv.includes('--camera-sync')||!id.endsWith('/GeometrySceneViewport.tsx'))return
    // Observational instrumentation only: exercise the production synchronization paths.
    return code.replace('const draw=()=>{ frame=0;', 'const draw=()=>{ const started=performance.now(); frame=0;')
      .replace('renderer!.render(world,view);','renderer!.render(world,view);window.cameraSyncLog?.push({kind:"draw",time:performance.now(),ms:performance.now()-started,position:view.position.toArray()});')
      .replace('current=structuredClone(next)','window.cameraSyncLog?.push({kind:"apply",position:view.position.toArray(),next:next.position});current=structuredClone(next)')
      .replace('if(next) {current=next;', 'if(next) {window.cameraSyncLog?.push({kind:"navigate",position:next.position});current=next;')
  },
  resolveId(id) { if (id === '/__frame.jsx') return id },
  load(id) { if (id === '/__frame.jsx') return fixture },
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/__frame') return next()
    res.setHeader('Content-Type', 'text/html')
    res.end(await server.transformIndexHtml('/__frame', '<!doctype html><div id="root"></div><script type="module" src="/__frame.jsx"></script>'))
  }) },
}] })
await server.listen()
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', ...(realContext||process.argv.includes('--solid-scale')||process.argv.includes('--solid-translation')||process.argv.includes('--solid-rotation')||process.argv.includes('--edge-visibility')||process.argv.includes('--pyramid-consumption')||process.argv.includes('--base-alignment')||process.argv.includes('--scene-pyramid')||process.argv.includes('--planar')||process.argv.includes('--base-vertex')||process.argv.includes('--apex-apply')||process.argv.includes('--apex-height')||process.argv.includes('--apex-drag')||process.argv.includes('--menu-placement')||process.argv.includes('--context-picking')||process.argv.includes('--camera-sync')||process.argv.includes('--scene-3d-m2')||process.argv.includes('--scene-3d-m3')||process.argv.includes('--scene-3d-m4')||process.argv.includes('--unified-menu')||process.argv.includes('--frame-controls')||process.argv.includes('--frame-context')||process.argv.includes('--geometry-properties') ? ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] : ['--disable-gpu']), '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
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
  const pointer = async (type, x, y, extra = {}) => {
    // Only the document drawer is modal; the geometry properties panel stays open on canvas interaction.
    if(type==='mousePressed')await evaluate(`(()=>{const d=document.querySelector('.universal-editor-document-drawer[open]');if(!d)return;const b=d.getBoundingClientRect();if(${x}<b.left||${x}>b.right||${y}<b.top||${y}>b.bottom)d.querySelector('header button')?.click()})()`)
    return send('Input.dispatchMouseEvent', { type, x, y, ...extra })
  }
  const box = selector => evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`)
  const click = async selector => {
    // Frame actions are now portaled into the keyboard-accessible context menu.
    if(selector.includes('.visual-frame__actions'))selector=selector.replace(/\[data-frame-id="?([^"\]]+)"?\]/,'[data-frame-menu-owner="$1"]')
    // Inspector fields are portaled outside VisualFrame without changing their editor ownership.
    if(selector.includes('.geometry-3d-inspector'))selector=selector.slice(selector.indexOf('.geometry-3d-inspector'))
    await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),d=document.querySelector('.universal-editor-document-drawer[open]');if(b&&d&&!d.contains(b))d.querySelector('header button')?.click()})()`)
    await until(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),d=document.querySelector('.universal-editor-document-drawer[open]');return !d||d.contains(b)})()`)
    const closedPanel=await evaluate(`(()=>{const d=document.querySelector(${JSON.stringify(selector)})?.closest('.geometry-properties-dialog');return d&&!d.open?{owner:d.dataset.geometryPropertiesOwner}:null})()`)
    if(closedPanel){
      if(closedPanel.owner&&await evaluate(`!!document.querySelector('[data-frame-id="${closedPanel.owner}"]')`))await click(`[data-frame-menu-owner="${closedPanel.owner}"] .geometry-frame-menu__items > button`)
      else await evaluate(`(()=>{const d=document.querySelector('.geometry-editor-local-chrome details');d.open=true;d.querySelector('button').click()})()`)
      await until(`document.querySelector(${JSON.stringify(selector)}).closest('.geometry-properties-dialog').open`)
    }
    const owner=await evaluate(`document.querySelector(${JSON.stringify(selector)})?.closest('[data-frame-menu-owner]')?.dataset.frameMenuOwner`)
    if(owner&&await evaluate(`document.querySelector('[data-frame-menu-owner="${owner}"]').hidden`)){
      await evaluate(`document.querySelector('[data-frame-id="${owner}"]').focus({preventScroll:true})`)
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8,windowsVirtualKeyCode:121});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',windowsVirtualKeyCode:121})
      await until(`!document.querySelector('[data-frame-menu-owner="${owner}"]').hidden`)
    }
    await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw Error('Missing '+${JSON.stringify(selector)});const dialog=b.closest('dialog');if(dialog&&!dialog.open)document.querySelector('header button[aria-haspopup="dialog"]').click();const ancestors=[];for(let n=b.parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS'&&!(b.tagName==='SUMMARY'&&b.parentElement===n))ancestors.unshift(n);ancestors.forEach(d=>{if(!d.open)d.querySelector('summary').click()})})()`)
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const b = await box(selector), x = b.x + b.width / 2, y = b.y + b.height / 2
    if(selector==='[data-test-click="yes"]')assert.ok(await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${x},${y});return b===hit||b.contains(hit)})()`),'Text action is reachable: '+await evaluate(`document.elementFromPoint(${x},${y})?.outerHTML`))
    await pointer('mouseMoved', x, y); await pointer('mousePressed', x, y, { button: 'left', clickCount: 1 }); await pointer('mouseReleased', x, y, { button: 'left', clickCount: 1 })
  }
  const textButton = async text => {
    // Existing acceptance scripts explicitly create their old dimension through the new menu.
    if(text==='Çərçivə əlavə et'||text==='3D səhnə əlavə et'){
      await until(`document.querySelector('.universal-editor-geometry-ribbon > details > summary')?.getAttribute('aria-disabled')==='false'`)
      await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.includes('Çərçivə əlavə et'));if(!d.open)d.querySelector('summary').click()})()`)
      await until(`document.querySelector('.universal-editor-geometry-ribbon > details').open`)
      text=text==='Çərçivə əlavə et'?'2D çərçivə':'3D çərçivə'
    }
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
  if (realContext) {
    await runM5RealAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--solid-scale')) {
    await runSolidScaleAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--solid-translation')) {
    await runSolidTranslationAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--solid-rotation')) {
    await runSolidRotationAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--edge-visibility')) {
    await runEdgeVisibilityAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--pyramid-consumption')) {
    await runPyramidConsumptionAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--base-alignment')) {
    await runBaseAlignmentAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--scene-pyramid')) {
    await runScenePyramidAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--planar')) {
    await runPlanarAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--base-vertex')) {
    await runBaseVertexAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--apex-apply')) {
    await runApexApplyAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--apex-height')) {
    await runApexHeightAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--apex-drag')) {
    await runApexDragAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--menu-placement')) {
    await runMenuPlacementAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--context-picking')) {
    await runContextPickingAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--camera-sync')) {
    await runCameraSyncAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--geometry-properties')) {
    await runGeometryPropertiesAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--frame-context')) {
    await runGeometryFrameContextAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--frame-controls')) {
    await runGeometryFrameControlsAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--unified-menu')) {
    await runUnifiedGeometryMenuAcceptance({evaluate,until,textButton,click,box,pointer,delay,send})
  } else if (process.argv.includes('--scene-3d-m4')) {
    await runGeometry3DM4Acceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--scene-3d-m3')) {
    await runGeometry3DM3Acceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--scene-3d-m2')) {
    await runGeometry3DM2Acceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--scene-3d-m1')) {
    await runGeometry3DM1Acceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--point-on-line')) {
    await runPointOnLineAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--attachments')) {
    await runGeometryAttachmentAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--point-on-segment-final')) {
    await runFinalPointOnSegmentAcceptance({evaluate,until,textButton,click,box,pointer,delay,send})
  } else if (process.argv.includes('--point-on-segment')) {
    await runPointOnSegmentAcceptance({evaluate,until,textButton,click,box,pointer,delay,send})
  } else if (process.argv.includes('--annotations')) {
    await runGeometryAnnotationsAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--shapes')) {
    await runGeometryShapesAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--reliability')) {
    await runGeometryReliabilityAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--capacity')) {
    await runGeometryCapacityAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--median')) {
    await runGeometryMedianAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--altitude')) {
    await runGeometryAltitudeAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag})
  } else if (process.argv.includes('--angle-bisector')) {
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
  assert.equal(await evaluate(`document.querySelectorAll('${frame} textarea,${frame} .geometry-editor__frame-controls').length`),0,'Properties are outside the frame')
  assert.equal(await evaluate(`document.querySelectorAll('${frame} .visual-frame__actions,${frame} .geometry-frame-menu').length`),0,'Frame actions are only in the context popup')
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
