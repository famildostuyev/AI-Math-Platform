// Real Edge with production GeometrySceneEditor/Viewport and saved-camera SVG.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js'
const diagnose=process.argv.includes('--diagnose'),artifacts=await fs.mkdtemp(path.join(os.tmpdir(),'cone-silhouette-'))
const entry=`import React from 'react';import{createRoot}from'react-dom/client';
import'/src/index.css';import'/src/App.css';import Editor from'/src/components/GeometrySceneEditor.tsx';
import{emptyGeometryScene3D}from'/src/components/geometry3dModel.ts';import{createConeAt3D}from'/src/components/geometry3dSolidAuthoring.ts';
import{coneRenderGeometry3D}from'/src/components/geometry3dRenderGeometry.ts';import{analyticFrame3D,evaluateAnalyticSurface3D}from'/src/components/geometry3dAnalytic.ts';
import{geometrySceneSVG3D,createProjection3D}from'/src/components/geometry3dProjection.ts';
import{projectedSolidBounds3D}from'/src/components/geometry3dSolidBounds.ts';
const root=createRoot(document.getElementById('root'));let serial=0;window.emptyScene=emptyGeometryScene3D;
window.openFixture=(mode='orthographic',diameter=false,restored=null)=>{let scene=restored??createConeAt3D(emptyGeometryScene3D(),[0,0,0],'XY','C').scene;
if(mode!=='textbook')scene.print_camera={...scene.print_camera,projection:mode,vertical_span:5};
if(diameter){scene.points.push({id:'D_left',position:[-.6,.8,0],label:null},{id:'D_right',position:[.6,-.8,0],label:null});scene.linear_objects.push({id:'teacher_diameter',kind:'segment',a:'D_left',b:'D_right'})}
function Fixture(){const[value,setValue]=React.useState(scene);window.browserScene=value;window.setBrowserScene=setValue;
return React.createElement('div',null,React.createElement('h2',null,mode+(diameter?' — test-created world diameter':' — new cone, automatic references')),
React.createElement('div',{style:{display:'grid',gridTemplateColumns:'700px 520px',gap:24}},React.createElement('div',{style:{width:700}},React.createElement(Editor,{value,onChange:setValue,targetId:'cone',disabled:false})),React.createElement('div',null,React.createElement('h3',null,'Saved camera SVG'),React.createElement('div',{id:'saved-svg',dangerouslySetInnerHTML:{__html:geometrySceneSVG3D(value,520,400)}}))))}
root.render(React.createElement(Fixture,{key:++serial}));};
window.dimensionGesture=(kind)=>{const host=document.querySelector('.geometry-3d-viewport'),box=host.getBoundingClientRect(),camera=JSON.parse(host.dataset.editingCamera),solid=browserScene.solids[0],bounds=projectedSolidBounds3D(browserScene,camera,box.width,box.height,solid.id),h=bounds.handles.find(h=>h.kind===kind),q=createProjection3D(camera,box.width,box.height),target=h.world.map((x,i)=>x+h.direction[i]*h.length*.2),screen=q.screen(q.view(target));return{start:{x:box.x+h.x,y:box.y+h.y},end:{x:box.x+screen[0]+h.x-h.screen[0],y:box.y+screen[1]+h.y-h.screen[1]}}};
window.surfacePointer=(uv,local=null)=>{const host=document.querySelector('.geometry-3d-viewport'),box=host.getBoundingClientRect(),camera=JSON.parse(host.dataset.editingCamera),solid=browserScene.solids[0],q=createProjection3D(camera,box.width,box.height),world=local?analyticFrame3D(solid.frame).toWorld(local):evaluateAnalyticSurface3D(solid,uv),screen=q.screen(q.view(world));return{x:box.x+screen[0],y:box.y+screen[1]}};
window.coneMetrics=()=>{const scene=window.browserScene,solid=scene.solids[0],camera=scene.print_camera,render=coneRenderGeometry3D(solid,camera),rim=render.curves.find(c=>c.role==='rim'),silhouettes=render.curves.filter(c=>c.role==='silhouette'),frame=analyticFrame3D(solid.frame),eye=frame.toLocal(camera.position),v=frame.vectorToLocal(camera.position.map((x,i)=>x-camera.target[i])),k=solid.parameters.radius/solid.parameters.height;
return {projection:camera.projection,diameterCount:scene.linear_objects.length,contacts:silhouettes.map(c=>{const p=frame.toLocal(c.vertices[0]),q=p.map(x=>x/solid.parameters.radius);return{position:p,rimVertexGap:Math.min(...rim.vertices.map(x=>Math.hypot(...x.map((a,i)=>a-c.vertices[0][i])))),tangentResidual:camera.projection==='perspective'?q[0]*eye[0]+q[1]*eye[1]+k*eye[2]-solid.parameters.radius:q[0]*v[0]+q[1]*v[1]+k*v[2]}})};};window.openFixture();`
const server=await createServer({root:path.resolve('frontend'),server:{host:'127.0.0.1',port:0},plugins:[{
 name:'cone-silhouette-fixture',resolveId(id){if(id==='/__cone_entry.js')return '\0cone-entry'},load(id){if(id==='\0cone-entry')return entry},
 configureServer(server){server.middlewares.use('/__cone',async(req,res,next)=>{if(req.url!=='/'&&req.url!==''){next();return}res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__cone','<html><body style="margin:20px"><div id="root"></div><script type="module" src="/__cone_entry.js"></script></body></html>'))})}
}]})
await server.listen()
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'cone-edge-profile-'))
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
let socket;const delay=ms=>new Promise(r=>setTimeout(r,ms))
try{
 let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await delay(100)}}assert.ok(port)
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.httpServer.address().port}/__cone`)}`,{method:'PUT'})).json()
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let serial=0;const pending=new Map()
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data);pending.get(message.id)?.(message)})
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},30000);pending.set(id,m=>{clearTimeout(timer);pending.delete(id);m.error?reject(Error(JSON.stringify(m.error))):resolve(m)});socket.send(JSON.stringify({id,method,params}))})
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.result.exceptionDetails,JSON.stringify(r.result.exceptionDetails));return r.result.result.value}
 const until=async expression=>{for(let i=0;i<180;i++){if(await evaluate(`!!(${expression})`))return;await delay(100)}throw Error('Browser timeout: '+expression)}
 await send('Emulation.setDeviceMetricsOverride',{width:1380,height:900,deviceScaleFactor:1,mobile:false});await until('window.coneMetrics && document.querySelector(".geometry-3d-shared-screen svg")')
 const reports=[]
 for(const mode of ['orthographic','perspective'])for(const diameter of [false,true]){
  await evaluate(`openFixture('${mode}',${diameter})`);await until('document.querySelector(".geometry-3d-shared-screen svg")');await delay(250)
  const report=await evaluate('coneMetrics()');reports.push(report)
  if(process.argv.includes('--cone-surface')&&!diameter){
   const original=await evaluate('JSON.stringify(browserScene)'),start=await evaluate('surfacePointer([.96,.35])'),end=await evaluate('surfacePointer([.04,.6])')
   const click=async at=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',...at,buttons:0});await send('Input.dispatchMouseEvent',{type:'mousePressed',...at,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...at,button:'left',clickCount:1});await delay(100)}
   await evaluate("document.querySelector('[data-tool-3d=\"point\"]').click()")
   await click(start);await until('browserScene.constructions.length===1')
   const id=await evaluate('browserScene.constructions[0].output_point_id'),created=await evaluate('JSON.stringify(browserScene)')
   assert.equal(await evaluate(`browserScene.points.find(p=>p.id==='${id}').label`),null)
   await click(start);assert.equal(await evaluate('browserScene.points.length'),5)
   await click(await evaluate('surfacePointer([0,1])'));assert.equal(await evaluate('browserScene.points.length'),5,'apex click reuses S')
   await evaluate("document.querySelector('[data-tool-3d=\"select\"]').click()")
   await click(start);assert.equal(await evaluate('JSON.stringify(browserScene)'),created)
   for(const cancel of [true,false]){
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...start,buttons:0});await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});await delay(70);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...end,button:'left',buttons:1});await delay(100)
    assert.equal(await evaluate('JSON.stringify(browserScene)'),created,'drag preview does not commit')
    if(cancel){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})}
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',clickCount:1});await delay(150)
    if(cancel)assert.equal(await evaluate('JSON.stringify(browserScene)'),created)
   }
   await until('browserScene.constructions[0].uv[0]<.1')
   const dragged=await evaluate('JSON.stringify(browserScene)')
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))");await until(`JSON.stringify(browserScene)===${JSON.stringify(created)}`)
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true}))");await until(`JSON.stringify(browserScene)===${JSON.stringify(dragged)}`)
   await evaluate("document.querySelector('.geometry-frame-menu__items > button').click()")
   await until("document.querySelector('dialog[open] input[aria-label=\"3D nöqtə etiketi\"]')")
   await evaluate("(()=>{const input=document.querySelector('input[aria-label=\"3D nöqtə etiketi\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'M₁ α');input.dispatchEvent(new Event('input',{bubbles:true}))})()")
   await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Nöqtəyə tətbiq et').click()")
   await until(`browserScene.points.find(p=>p.id==='${id}').label==='M₁ α'`)
   await evaluate("document.querySelector('dialog[open] header button').click()")
   const labeled=await evaluate('JSON.stringify(browserScene)');await fs.writeFile(path.join(artifacts,`surface-${mode}.json`),labeled)
   await evaluate(`openFixture('${mode}',false,JSON.parse(${JSON.stringify(labeled)}))`);await until('browserScene.constructions.length===1')
   assert.ok(await evaluate("document.querySelector('#saved-svg').textContent.includes('M₁ α')"))
   // Verify a strictly interior base-cap click without snapping to O or A/B.
   await evaluate(`(()=>{const scene=JSON.parse(${JSON.stringify(original)});scene.print_camera={...scene.print_camera,position:[.2,.2,-6],target:[0,0,0],up:[0,1,0]};openFixture('${mode}',false,scene)})()`)
   await until('browserScene.constructions.length===0');await evaluate("document.querySelector('[data-tool-3d=\"point\"]').click()")
   await click(await evaluate('surfacePointer([0,0],[.3,.2,0])'));assert.equal(await evaluate('browserScene.points.length'),4);assert.equal(await evaluate('browserScene.constructions.length'),0)
   await evaluate(`openFixture('${mode}',false,JSON.parse(${JSON.stringify(labeled)}))`);await until('browserScene.constructions.length===1')
   console.log('PASS real Edge: cone lateral create/reuse, apex reuse, seam drag/Escape/Undo/Redo, label editing, canonical reopen and base-cap rejection; '+mode)
  }
  if(process.argv.includes('--dimensions')&&!diameter){
   await evaluate("document.querySelector('.geometry-frame-menu__items > button').click()")
   await until("document.querySelector('dialog[open] select[aria-label=\"3D obyekt seç\"]')")
   await evaluate("(()=>{const s=document.querySelector('select[aria-label=\"3D obyekt seç\"]');s.value='C';s.dispatchEvent(new Event('change',{bubbles:true}))})()")
   await until("document.querySelector('.geometry-3d-editor').dataset.selectedId==='C'")
   await evaluate("document.querySelector('dialog[open] header button').click()")
   for(const kind of ['radius','height']){
    await delay(150);const before=await evaluate('JSON.stringify(browserScene)'),dimensions=await evaluate('browserScene.solids[0].parameters'),camera=await evaluate('JSON.stringify(browserScene.print_camera)'),gesture=await evaluate(`dimensionGesture('${kind}')`)
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...gesture.start,buttons:0});await delay(80);await send('Input.dispatchMouseEvent',{type:'mousePressed',...gesture.start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...gesture.start,button:'left',clickCount:1})
    await delay(150);assert.equal(await evaluate('JSON.stringify(browserScene)'),before,'no-op drag changes nothing')
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...gesture.start,buttons:0});await delay(80);await send('Input.dispatchMouseEvent',{type:'mousePressed',...gesture.start,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',...gesture.end,button:'left',buttons:1})
    assert.equal(await evaluate('JSON.stringify(browserScene)'),before,'draft is not committed mid-drag')
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...gesture.end,button:'left',clickCount:1})
    await delay(150);assert.equal(await evaluate('JSON.stringify(browserScene)'),before,'Escape restores source')
    await delay(100);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...gesture.start,buttons:0});await delay(80);await send('Input.dispatchMouseEvent',{type:'mousePressed',...gesture.start,button:'left',clickCount:1});await delay(80);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...gesture.end,button:'left',buttons:1});await delay(100);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...gesture.end,button:'left',clickCount:1})
    await until(`Math.abs(browserScene.solids[0].parameters.${kind}-${dimensions[kind]})>0.01`)
    const after=await evaluate('JSON.stringify(browserScene)'),other=kind==='radius'?'height':'radius'
    assert.equal(await evaluate(`browserScene.solids[0].parameters.${other}`),dimensions[other]);assert.equal(await evaluate('JSON.stringify(browserScene.print_camera)'),camera)
    await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))");await until(`JSON.stringify(browserScene)===${JSON.stringify(before)}`)
    await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true}))");await until(`JSON.stringify(browserScene)===${JSON.stringify(after)}`)
   }
   const resized=await evaluate('JSON.stringify(browserScene)');await fs.writeFile(path.join(artifacts,`dimensions-${mode}.json`),resized)
   console.log('PASS real Edge: independent R/H pointer drags, no-op/Escape, single-step Undo/Redo, unchanged camera; '+mode)
  }

  if(process.argv.includes('--label-backgrounds')){
   const styles=await evaluate("Array.from(document.querySelectorAll('#saved-svg text[data-cone-point-label],.geometry-3d-shared-screen text[data-cone-point-label]')).map(t=>({label:t.textContent,background:getComputedStyle(t).backgroundColor,fill:getComputedStyle(t).fill,selection:getComputedStyle(t).userSelect}))")
   assert.equal(styles.length,8);assert.ok(styles.every(s=>s.background==='rgba(0, 0, 0, 0)'&&s.fill==='rgb(23, 32, 51)'&&s.selection==='none'))
   for(const selector of ['#saved-svg','.geometry-3d-shared-screen']){
    await evaluate(`(()=>{const texts=document.querySelectorAll('${selector} text[data-cone-point-label]'),range=document.createRange();range.setStart(texts[0].firstChild,0);range.setEnd(texts[texts.length-1].firstChild,1);getSelection().removeAllRanges();getSelection().addRange(range)})()`)
    assert.equal(await evaluate('getSelection().toString()'),'','cone labels must not produce native selection rectangles')
    assert.equal(await evaluate(`document.querySelectorAll('${selector} circle[fill="#2563eb"]').length`),diameter?6:4)
   }
   console.log('PASS real Edge: transparent, dark, non-selectable cone labels and unchanged blue markers; '+mode)
  }
  if(process.argv.includes('--generators')&&!diameter){
   const original=await evaluate('JSON.stringify(browserScene)')
   for(const id of ['C_generator_sa','C_generator_sb']){
    const marker=await evaluate(`(()=>{const p=document.querySelector('.geometry-3d-shared-screen path[data-id="${id}"]').getBoundingClientRect();return{x:p.x+p.width/2,y:p.y+p.height/2}})()`)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...marker,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...marker,button:'left',clickCount:1})
    await until(`document.querySelector('.geometry-3d-editor').dataset.selectedId==='${id}'`)
   }
   await evaluate("document.querySelector('.geometry-frame-menu__items > button').click()")
   await until("document.querySelector('dialog[open] select[aria-label=\"3D obyekt seç\"]')")
   for(const [index,id] of ['C_generator_sa','C_generator_sb'].entries()){
    await evaluate(`(()=>{const select=document.querySelector('select[aria-label="3D obyekt seç"]');select.value='${id}';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await until(`document.querySelector('.geometry-3d-editor').dataset.selectedId==='${id}'`)
    await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='3D seçiləni sil').click()")
    await until(`!browserScene.linear_objects.some(l=>l.id==='${id}')`)
    assert.equal(await evaluate('browserScene.points.length'),4)
    assert.ok(await evaluate("browserScene.linear_objects.some(l=>l.id==='C_height')&&browserScene.linear_objects.some(l=>l.id==='C_diameter')"))
    if(index===0)assert.ok(await evaluate("browserScene.linear_objects.some(l=>l.id==='C_generator_sb')"))
    await fs.writeFile(path.join(artifacts,`generators-${mode}-${index+1}-deleted.json`),JSON.stringify(await evaluate('browserScene')))
    await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))")
    await until(`browserScene.linear_objects.some(l=>l.id==='${id}')`)
    await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true}))")
    await until(`!browserScene.linear_objects.some(l=>l.id==='${id}')`)
   }
   const deleted=await evaluate('JSON.stringify(browserScene)')
   await evaluate(`openFixture('${mode}',false,JSON.parse(${JSON.stringify(deleted)}))`)
   await until('browserScene.linear_objects.length===2')
   assert.equal(await evaluate('JSON.stringify(browserScene)'),deleted)
   await evaluate(`openFixture('${mode}',false,JSON.parse(${JSON.stringify(original)}))`)
   await until('browserScene.linear_objects.length===4')
   console.log('PASS real Edge: SA/SB pointer selection, independent deletion, Undo/Redo, canonical reopen; '+mode)
  }
  if(process.argv.includes('--height')&&!diameter){
   await until("document.querySelector('.geometry-3d-shared-screen circle[data-id=\"C_v_1\"]')")
   assert.equal(await evaluate("browserScene.points.find(p=>p.id==='C_v_1').label"),'S')
   assert.equal(await evaluate("browserScene.points.find(p=>p.id==='C_v_0').label"),'O')
   assert.equal(await evaluate("browserScene.linear_objects.filter(l=>l.id==='C_height'&&l.a==='C_v_1'&&l.b==='C_v_0').length"),1)
   assert.ok(await evaluate("!!document.querySelector('#saved-svg path[data-id=\"C_height\"][stroke-dasharray]')"))
   const marker=await evaluate("(()=>{const p=document.querySelector('.geometry-3d-shared-screen circle[data-id=\"C_v_1\"]').getBoundingClientRect();return{x:p.x+p.width/2,y:p.y+p.height/2}})()")
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...marker,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...marker,button:'left',clickCount:1})
   await until("document.querySelector('.geometry-3d-editor').dataset.selectedId==='C_v_1'")
   await evaluate("document.querySelector('.geometry-frame-menu__items > button').click()")
   await until("document.querySelector('dialog[open] input[aria-label=\"3D nöqtə etiketi\"]')")
   await evaluate("(()=>{const input=document.querySelector('input[aria-label=\"3D nöqtə etiketi\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'T₁ α');input.dispatchEvent(new Event('input',{bubbles:true}))})()")
   await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Nöqtəyə tətbiq et').click()")
   await until("browserScene.points.find(p=>p.id==='C_v_1').label==='T₁ α'")
   await evaluate("(()=>{const select=document.querySelector('select[aria-label=\"3D obyekt seç\"]');select.value='C_height';select.dispatchEvent(new Event('change',{bubbles:true}))})()")
   await until("document.querySelector('.geometry-3d-editor').dataset.selectedId==='C_height'")
   await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='3D seçiləni sil').click()")
   await until("!browserScene.linear_objects.some(l=>l.id==='C_height')")
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))")
   await until("browserScene.linear_objects.some(l=>l.id==='C_height')")
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true}))")
   await until("!browserScene.linear_objects.some(l=>l.id==='C_height')")
   assert.equal(await evaluate('browserScene.points.length'),4)
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))")
   await until("browserScene.linear_objects.some(l=>l.id==='C_height')")
   await fs.writeFile(path.join(artifacts,`height-${mode}.json`),JSON.stringify(await evaluate('browserScene')))
   await evaluate("document.querySelector('dialog[open] header button').click()")
   console.log('PASS real Edge: apex pointer selection, Unicode rename, height selection/removal, Undo/Redo; '+mode)
  }
  if(process.argv.includes('--diameter-ui')&&!diameter){
   await until("document.querySelector('.geometry-3d-shared-screen circle[data-id=\"C_v_2\"]')")
   assert.equal(await evaluate("browserScene.points.find(p=>p.id==='C_v_2').label"),'A')
   assert.equal(await evaluate("browserScene.points.find(p=>p.id==='C_v_0').label"),'O')
   assert.equal(await evaluate("browserScene.linear_objects.filter(l=>l.id==='C_diameter'&&l.a==='C_v_2'&&l.b==='C_v_3').length"),1)
   assert.ok(await evaluate("!!document.querySelector('#saved-svg path[data-id=\"C_diameter\"][stroke-dasharray]')"))
   const marker=await evaluate("(()=>{const p=document.querySelector('.geometry-3d-shared-screen circle[data-id=\"C_v_2\"]').getBoundingClientRect();return{x:p.x+p.width/2,y:p.y+p.height/2}})()")
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...marker,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...marker,button:'left',clickCount:1})
   await until("document.querySelector('.geometry-3d-editor').dataset.selectedId==='C_v_2'")
   await evaluate("document.querySelector('.geometry-frame-menu__items > button').click()")
   await until("document.querySelector('dialog[open] input[aria-label=\"3D nöqtə etiketi\"]')")
   await evaluate("(()=>{const input=document.querySelector('input[aria-label=\"3D nöqtə etiketi\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'T₁ α');input.dispatchEvent(new Event('input',{bubbles:true}))})()")
   await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Nöqtəyə tətbiq et').click()")
   await until("browserScene.points.find(p=>p.id==='C_v_2').label==='T₁ α'")
   await evaluate("(()=>{const select=document.querySelector('select[aria-label=\"3D obyekt seç\"]');select.value='C_diameter';select.dispatchEvent(new Event('change',{bubbles:true}))})()")
   await until("document.querySelector('.geometry-3d-editor').dataset.selectedId==='C_diameter'")
   await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='3D seçiləni sil').click()")
   await until("!browserScene.linear_objects.some(l=>l.id==='C_diameter')")
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))")
   await until("browserScene.linear_objects.some(l=>l.id==='C_diameter')")
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true}))")
   await until("!browserScene.linear_objects.some(l=>l.id==='C_diameter')")
   assert.equal(await evaluate('browserScene.points.length'),4)
   await evaluate("document.querySelector('.geometry-3d-editor').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))")
   await until("browserScene.linear_objects.some(l=>l.id==='C_diameter')")
   await fs.writeFile(path.join(artifacts,`diameter-${mode}.json`),JSON.stringify(await evaluate('browserScene')))
   await evaluate("document.querySelector('dialog[open] header button').click()")
   console.log('PASS real Edge: diameter endpoint pointer selection, Unicode rename, diameter selection/removal, Undo/Redo; '+mode)
  }
  assert.ok(report.contacts.every(c=>Math.abs(c.tangentResidual)<1e-8),'analytic tangency is correct')
  if(!diagnose)assert.ok(report.contacts.every(c=>c.rimVertexGap<1e-12),'rim must contain exact silhouette endpoints')
  const shot=await send('Page.captureScreenshot',{format:'png'}),file=path.join(artifacts,`${diagnose?'before':'after'}-${mode}-${diameter?'diameter':'new-cone'}.png`)
  await fs.writeFile(file,Buffer.from(shot.result.data,'base64'));console.log('Screenshot:',file)
 }
 if(process.argv.includes('--textbook'))for(const plane of ['XY','XZ','YZ']){
  await evaluate("openFixture('textbook',false,emptyScene())");await until('browserScene.solids.length===0')
  await evaluate(`(()=>{const select=document.querySelector('select[aria-label="3D iş müstəvisi"]');select.value='${plane}';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-tool-3d="cone"]').click()})()`)
  await until("document.querySelector('.geometry-3d-editor').dataset.activeTool==='cone'")
  const pointer=await evaluate("(()=>{const b=document.querySelector('.geometry-3d-viewport').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()")
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...pointer,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pointer,button:'left',clickCount:1})
  await until("browserScene.solids.length===1&&JSON.parse(document.querySelector('.geometry-3d-viewport').dataset.editingCamera).projection==='perspective'")
  const saved=await evaluate('JSON.stringify(browserScene)'),camera=await evaluate('browserScene.print_camera')
  assert.deepEqual(await evaluate("JSON.parse(document.querySelector('.geometry-3d-viewport').dataset.editingCamera)"),camera)
  assert.equal(await evaluate("document.querySelectorAll('.geometry-3d-shared-screen path[data-render-curve=\"silhouette\"]').length"),0)
  const emptyCorner=await evaluate("(()=>{const b=document.querySelector('.geometry-3d-viewport').getBoundingClientRect();return{x:b.x+12,y:b.y+12}})()")
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...emptyCorner,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...emptyCorner,button:'left',clickCount:1})
  await until("document.querySelector('.geometry-3d-editor').dataset.selectedId===''")
  const boxes=await evaluate("Array.from(document.querySelectorAll('#saved-svg text')).map(t=>{const b=t.getBBox();return{label:t.textContent,x:b.x,y:b.y,width:b.width,height:b.height}})")
  assert.equal(boxes.length,4);assert.ok(boxes.every(b=>b.x>0&&b.y>0&&b.x+b.width<520&&b.y+b.height<400),'labels fit saved viewport')
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(artifacts,`textbook-${plane}.png`),Buffer.from(shot.result.data,'base64'))
  await evaluate("document.querySelector('[data-tool-3d=\"camera\"]').click()")
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...pointer,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x+100,y:pointer.y-35,buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pointer.x+100,y:pointer.y-35,button:'left',clickCount:1})
  await until(`JSON.stringify(JSON.parse(document.querySelector('.geometry-3d-viewport').dataset.editingCamera))!==JSON.stringify(${JSON.stringify(camera)})`)
  assert.equal(await evaluate('JSON.stringify(browserScene)'),saved,'orbit must not change geometry or saved camera')
  await evaluate(`openFixture('textbook',false,JSON.parse(${JSON.stringify(saved)}))`);await until('browserScene.solids.length===1')
  assert.deepEqual(await evaluate("JSON.parse(document.querySelector('.geometry-3d-viewport').dataset.editingCamera)"),camera)
  console.log('PASS real Edge: pointer-created textbook cone '+plane+', live/saved camera agreement, label bounds, orbit and canonical reopen')
 }
 if(process.argv.includes('--generators')){
  await evaluate("openFixture('perspective',false)");await until('browserScene.points.length===4')
  await evaluate("(()=>{const scene=structuredClone(browserScene);scene.print_camera={...scene.print_camera,position:[4,3,2],target:[0,0,0]};openFixture('perspective',false,scene)})()")
  await until("browserScene.print_camera.position[2]===2");await delay(250)
  assert.equal(await evaluate("document.querySelectorAll('#saved-svg path[data-render-curve=\"silhouette\"]').length"),0)
  assert.equal(await evaluate("document.querySelectorAll('.geometry-3d-shared-screen path[data-render-curve=\"silhouette\"]').length"),0)
  for(const id of ['C_generator_sa','C_generator_sb'])assert.ok(await evaluate(`!!document.querySelector('#saved-svg path[data-id="${id}"]')`))
  const shot=await send('Page.captureScreenshot',{format:'png'}),file=path.join(artifacts,'generators-aligned-silhouette.png');await fs.writeFile(file,Buffer.from(shot.result.data,'base64'));console.log('PASS real Edge: aligned generators replace automatic silhouette strokes; Screenshot:',file)
 }
 await fs.writeFile(path.join(artifacts,'measurements.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));console.log('Artifacts:',artifacts)
}finally{socket?.close();browser.kill();await server.close()}
