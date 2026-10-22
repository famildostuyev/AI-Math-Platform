// Production App, real Question Bank and real HTTP. Instrumentation only reads scene props.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createServer} from '../frontend/node_modules/vite/dist/node/index.js'
const context=JSON.parse(process.env.CONE_E2E_CONTEXT??'null');assert.ok(context)
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'cone-e2e-edge-'))
const server=await createServer({root:path.resolve('frontend'),server:{host:'127.0.0.1',port:0,proxy:{'/api':context.backend}},plugins:[{name:'cone-readonly-observer',enforce:'pre',transform(code,id){if(id.endsWith('/GeometrySceneEditor.tsx'))return code.replace('return <div className="geometry-3d-editor"',';(globalThis as any).coneObservedScene=structuredClone(value); return <div className="geometry-3d-editor"')}}]})
await server.listen()
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
const delay=ms=>new Promise(r=>setTimeout(r,ms)),stages=[],responses=[],requests=new Map();let socket,frameId,failureScreenshot
try{
 let port;for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await delay(100)}}assert.ok(port)
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.httpServer.address().port}/`)}`,{method:'PUT'})).json()
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let serial=0;const pending=new Map()
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);pending.get(m.id)?.(m);if(m.method==='Network.requestWillBeSent'&&m.params.request.url.includes('/question-editor/'))requests.set(m.params.requestId,{method:m.params.request.method,path:new URL(m.params.request.url).pathname});if(m.method==='Network.responseReceived'&&requests.has(m.params.requestId))responses.push({...requests.get(m.params.requestId),status:m.params.response.status})})
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},30000);pending.set(id,m=>{clearTimeout(timer);pending.delete(id);m.error?reject(Error(JSON.stringify(m.error))):resolve(m)});socket.send(JSON.stringify({id,method,params}))})
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.result.exceptionDetails,JSON.stringify(r.result.exceptionDetails));return r.result.result.value}
 const until=async expression=>{for(let i=0;i<220;i++){try{if(await evaluate(`!!(${expression})`))return}catch(e){if(!/context|navigat/i.test(e.message))throw e}await delay(100)}throw Error('Browser timeout: '+expression+'\n'+await evaluate('document.body.innerText'))}
 const click=selector=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b||b.disabled)throw Error('Unavailable UI control '+${JSON.stringify(selector)});b.click()})()`)
 const text=async(label,scope='document')=>{await until(`Array.from(${scope}.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`);return evaluate(`(()=>{const b=Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled);b.click()})()`)}

 const fill=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 const scene=()=>evaluate('structuredClone(coneObservedScene)'),vp=()=>`[data-frame-id="${frameId}"] .geometry-3d-viewport`
 const camera=()=>evaluate(`JSON.parse(document.querySelector('${vp()}').dataset.editingCamera)`)
 const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 const mark=stage=>{stages.push({stage,result:'PASS'});console.log('PASS:',stage)}
 const screenshot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(context.artifacts,name+'.png'),Buffer.from(r.result.data,'base64'))}
 failureScreenshot=()=>screenshot('failure')
 const pointerClick=async at=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',...at,buttons:0});await send('Input.dispatchMouseEvent',{type:'mousePressed',...at,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...at,button:'left',buttons:0,clickCount:1});await settle()}
 const drag=async(start,end)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',...start,buttons:0});await send('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',buttons:1,clickCount:1});await delay(80);for(let i=1;i<=5;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+(end.x-start.x)*i/5,y:start.y+(end.y-start.y)*i/5,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...end,button:'left',buttons:0,clickCount:1});await settle();await delay(100)}
 const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
 const openFrameMenu=async()=>{await evaluate(`document.querySelector('[data-frame-id="${frameId}"]').focus({preventScroll:true})`);await key('F10','F10',8);await until(`!document.querySelector('[data-frame-menu-owner="${frameId}"]').hidden`)}
 const properties=async()=>{await openFrameMenu();await text('Xassələr',`document.querySelector('[data-frame-menu-owner="${frameId}"]')`);await until("document.querySelector('dialog[open] select[aria-label=\"3D obyekt seç\"]')")}
 const select=async id=>{await properties();await evaluate(`(()=>{const e=document.querySelector('select[aria-label="3D obyekt seç"]');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await until(`document.querySelector('.geometry-3d-editor').dataset.selectedId===${JSON.stringify(id)}`);await click('dialog[open] header button');await settle()}
 const rename=async(id,label)=>{await select(id);await properties();await fill('input[aria-label="3D nöqtə etiketi"]',label);await text('Nöqtəyə tətbiq et');await until(`coneObservedScene.points.find(p=>p.id===${JSON.stringify(id)}).label===${JSON.stringify(label)}`);await click('dialog[open] header button')}
 const screen=async({world,uv})=>evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),{evaluateAnalyticSurface3D}=await import('/src/components/geometry3dAnalytic.ts'),host=document.querySelector('${vp()}'),b=host.getBoundingClientRect(),c=JSON.parse(host.dataset.editingCamera),q=createProjection3D(c,b.width,b.height),world=${world?JSON.stringify(world):`evaluateAnalyticSurface3D(coneObservedScene.solids[0],${JSON.stringify(uv)})`},v=q.screen(q.view(world));return{x:b.x+v[0],y:b.y+v[1]}})()`)
 const tool=action=>click(`[data-geometry-action="${action}"]`)
 const login=async()=>{await until('document.querySelector("#login-identifier")||document.querySelector(".sidebar--admin")');if(await evaluate('!!document.querySelector("#login-identifier")')){await fill('#login-identifier',context.email);await fill('#login-password',context.password);await text('Sign in');await until('document.querySelector(".sidebar--admin")')}}
 const openBankQuestion=async()=>{await text('Sual bazası');await until('document.querySelector("#question-bank-search")');await fill('#question-bank-search',context.marker);await text('Axtar');await settle();await delay(100);await until(`Array.from(document.querySelectorAll('.admin-question-bank-table-wrap tbody tr')).some(r=>r.textContent.includes(${JSON.stringify(context.marker)})&&!r.querySelector('.admin-question-bank-open').disabled)`);await evaluate(`(()=>{const row=Array.from(document.querySelectorAll('.admin-question-bank-table-wrap tbody tr')).find(r=>r.textContent.includes(${JSON.stringify(context.marker)}));if(row.querySelector('.admin-question-bank-open').disabled)throw Error('Question row still loading');row.querySelector('.admin-question-bank-open').click()})()`);await until('document.querySelector(".universal-question-canvas")')}
 const reopenGeometry=async()=>{await until(`document.querySelector('[data-frame-id="${frameId}"] .geometry-3d-screen svg')`);await evaluate(`document.querySelector('[data-frame-id="${frameId}"]').scrollIntoView({block:'center'})`);await pointerClick(await evaluate(`(()=>{const b=document.querySelector('[data-frame-id="${frameId}"]').getBoundingClientRect();return{x:b.x+b.width*.75,y:b.y+b.height*.4}})()`));await openFrameMenu();await text('Redaktə et',`document.querySelector('[data-frame-menu-owner="${frameId}"]')`);await until('document.querySelector(".geometry-3d-editor")')}
 const verify=expected=>evaluate(`(async()=>{const {evaluateGeometryScene3D}=await import('/src/components/geometry3dModel.ts'),{evaluateAnalyticSurface3D,analyticFeaturePositions3D}=await import('/src/components/geometry3dAnalytic.ts');const actual=coneObservedScene,expected=${JSON.stringify(expected)};if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Reopened semantic scene differs');const result=evaluateGeometryScene3D(actual);if(result.status!=='ok')throw Error('Evaluation failed');const cone=actual.solids[0],positions=analyticFeaturePositions3D(cone);for(const[id,position]of Object.entries(positions)){const point=actual.points.find(p=>p.id===id);if(Math.hypot(...point.position.map((x,i)=>x-position[i]))>1e-8)throw Error('Owned reference mismatch')}for(const c of actual.constructions)if(c.kind==='point_on_surface'){const world=evaluateAnalyticSurface3D(cone,c.uv),point=actual.points.find(p=>p.id===c.output_point_id);if(Math.hypot(...point.position.map((x,i)=>x-world[i]))>1e-8)throw Error('Surface position mismatch')}return true})()`)
 const verifyPrint=async expected=>{assert.ok(await evaluate(`(async()=>{const{geometrySceneSVG3D}=await import('/src/components/geometry3dProjection.ts'),host=document.querySelector('${vp()}'),b=host.getBoundingClientRect(),d=document.createElement('div');d.innerHTML=geometrySceneSVG3D(${JSON.stringify(expected)},b.width,b.height);return host.querySelector('.geometry-3d-print').innerHTML===d.innerHTML})()`));mark('Saved-camera SVG matches reopened canonical scene')}
 const saveRefreshReopen=async(expected,round)=>{
  await openFrameMenu();await text('Tətbiq et',`document.querySelector('[data-frame-menu-owner="${frameId}"] .visual-frame__actions')`);await until('!document.querySelector(".geometry-3d-editor")&&!document.querySelector(".admin-editor-pending")');mark(`Round ${round}: UI Apply`)
  await text('Yadda saxla');await until('!document.querySelector(".admin-editor-pending")');await settle();mark(`Round ${round}: UI Save`)
  const origin=await evaluate('performance.timeOrigin');await send('Page.reload',{ignoreCache:true});await until(`performance.timeOrigin!==${origin}&&(document.querySelector('#login-identifier')||document.querySelector('.sidebar--admin'))`);mark(`Round ${round}: real page refresh`)
  await login();await openBankQuestion();await reopenGeometry();assert.ok(await verify(expected));mark(`Round ${round}: bank reopen, exact IDs/labels/UV/dimensions/transform/deletion/camera equality`);await verifyPrint(expected);await screenshot(`round-${round}-reopened`)
 }
 await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1200,deviceScaleFactor:1,mobile:false})
 await login();await openBankQuestion();mark('Real Edge login and Question Bank editable-question open')
 await text('Həndəsə');await text('3D çərçivə');await until('document.querySelector(".geometry-3d-editor canvas")')
 frameId=await evaluate('document.querySelector(".geometry-3d-editor").closest("[data-frame-id]").dataset.frameId')
 await tool('cone');await pointerClick(await screen({world:[0,0,0]}));await until('coneObservedScene.solids.length===1')
 const created=await scene(),cone=created.solids[0],ids=Object.fromEntries(cone.features.map(f=>[f.slot,f.entity_id]))
 assert.equal(created.points.length,4);assert.equal(created.linear_objects.length,4);assert.equal(created.print_camera.projection,'perspective');assert.deepEqual(created.points.map(p=>p.label).sort(),['A','B','O','S']);assert.deepEqual(await camera(),created.print_camera);mark('UI cone creation: S/O/A/B, SO/AB/SA/SB and textbook camera')
 await rename(ids.v_1,'T');mark('Owned point renamed through Properties')
 await tool('point');await pointerClick(await screen({uv:[.96,.35]}));await until('coneObservedScene.constructions.length===1')
 const pointId=(await scene()).constructions[0].output_point_id;assert.equal((await scene()).points.find(p=>p.id===pointId).label,null)
 await rename(pointId,'M');await tool('select');await select(pointId);await drag(await screen({uv:[.96,.35]}),await screen({uv:[.04,.6]}));await until('coneObservedScene.constructions[0].uv[0]<.1');mark('Unnamed cone surface point created, labeled M and dragged across seam')
 await select(cone.id)
 for(const kind of ['radius','height']){
  const before=(await scene()).solids[0].parameters
  const gesture=await evaluate(`(async()=>{const{projectedSolidBounds3D}=await import('/src/components/geometry3dSolidBounds.ts'),{createProjection3D}=await import('/src/components/geometry3dProjection.ts'),host=document.querySelector('${vp()}'),b=host.getBoundingClientRect(),c=JSON.parse(host.dataset.editingCamera),bounds=projectedSolidBounds3D(coneObservedScene,c,b.width,b.height,${JSON.stringify(cone.id)}),h=bounds.handles.find(h=>h.kind==='${kind}'),q=createProjection3D(c,b.width,b.height),v=q.screen(q.view(h.world.map((x,i)=>x+h.direction[i]*h.length*.12)));return{start:{x:b.x+h.x,y:b.y+h.y},end:{x:b.x+v[0]+h.x-h.screen[0],y:b.y+v[1]+h.y-h.screen[1]}}})()`)
  await drag(gesture.start,gesture.end);await until(`Math.abs(coneObservedScene.solids[0].parameters.${kind}-${before[kind]})>.01`);assert.equal((await scene()).solids[0].parameters[kind==='radius'?'height':'radius'],before[kind==='radius'?'height':'radius'])
 }mark('Real R/H handle drags change dimensions independently')
 const center=await evaluate(`(()=>{const b=document.querySelector('${vp()}').getBoundingClientRect();return{x:b.x+b.width*.5,y:b.y+b.height*.45}})()`)
 await tool('rotate_solid');const frameBefore=(await scene()).solids[0].frame;await drag(center,{x:center.x+18,y:center.y+8});assert.notDeepEqual((await scene()).solids[0].frame.x_axis,frameBefore.x_axis)
 await tool('translate_solid');await drag(center,{x:center.x+12,y:center.y+6});assert.notDeepEqual((await scene()).solids[0].frame.origin,frameBefore.origin);await tool('select');mark('Cone rotated and translated through editor tools')
 const diameter=(await scene()).linear_objects.find(l=>l.a===ids.v_2&&l.b===ids.v_3).id
 await select(diameter);await tool('delete');await until(`!coneObservedScene.linear_objects.some(l=>l.id===${JSON.stringify(diameter)})`);assert.equal((await scene()).points.length,5);assert.equal((await scene()).linear_objects.length,3);mark('AB independently removed; endpoints and other segments retained')
 // Frame the edited cone through real camera controls, then explicitly save that view.
 // Resizing/translation never automatically reset a teacher's camera.
 await tool('camera')
 for(let attempt=0;attempt<8;attempt++){
  const fits=await evaluate(`(async()=>{const{createProjection3D}=await import('/src/components/geometry3dProjection.ts'),{evaluateAnalyticSurface3D}=await import('/src/components/geometry3dAnalytic.ts'),host=document.querySelector('${vp()}'),b=host.getBoundingClientRect(),c=JSON.parse(host.dataset.editingCamera),q=createProjection3D(c,b.width,b.height),solid=coneObservedScene.solids[0],world=[...Array.from({length:64},(_,i)=>evaluateAnalyticSurface3D(solid,[i/64,0])),evaluateAnalyticSurface3D(solid,[0,1])];return world.every(w=>{const p=q.screen(q.view(w));return q.visible(w)&&p[0]>24&&p[0]<b.width-24&&p[1]>24&&p[1]<b.height-24})})()`)
  if(fits)break
  assert.ok(attempt<7,'camera framing did not converge')
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',...center,deltaX:0,deltaY:240});await delay(150);await settle()
 }
 const intendedCamera=await camera();await openFrameMenu();await text('Sual üçün görünüşü təyin et',`document.querySelector('[data-frame-menu-owner="${frameId}"]')`);await settle();assert.deepEqual((await scene()).print_camera,intendedCamera);mark('Teacher camera framing and explicit saved question view')
 const first=await scene()
 await saveRefreshReopen(first,1)
 await rename(pointId,'M₂');const final=await scene(),expectedFinal=structuredClone(first);expectedFinal.points.find(p=>p.id===pointId).label='M₂';assert.deepEqual(final,expectedFinal);await saveRefreshReopen(final,2);mark('Continued editability after reopening confirmed')
 assert.ok(responses.some(r=>r.method==='PATCH'&&r.path.endsWith('/geometry')&&r.status===200));assert.ok(!responses.some(r=>r.status>=400))
 await fs.writeFile(path.join(context.artifacts,'result.json'),JSON.stringify({frameId,first,final,stages,responses},null,2));console.log('PASS: complete production UI Apply → Save → refresh → Question Bank reopen, twice');console.log('Artifacts:',context.artifacts)
}catch(error){try{await failureScreenshot?.()}catch{}throw error}
finally{socket?.close();browser.kill();await server.close()}
