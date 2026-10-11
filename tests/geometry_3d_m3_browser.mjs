import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function runGeometry3DM3Acceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}) {
  const frame='[data-frame-id="frame-1"]',viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const input=async(selector,value)=>{await click(selector);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:String(value)})}
  const selected=()=>evaluate(`document.querySelector('${editor}').dataset.selectedId`)
  const tool=async(name)=>{await click(`[data-tool-3d="${name}"]`);await until(`document.querySelector('${editor}').dataset.activeTool==='${name}'`)}
  const plane=async(name)=>{await evaluate(`(()=>{const s=document.querySelector('[aria-label="3D iş müstəvisi"]');s.value='${name}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await until(`document.querySelector('${editor}').dataset.workingPlane==='${name}'`)}
  const screen=async(position)=>{
    await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center'})`)
    return evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts');const el=document.querySelector('${viewport}'),b=el.getBoundingClientRect(),c=JSON.parse(el.dataset.editingCamera),p=createProjection3D(c,b.width,b.height),v=p.screen(p.view(${JSON.stringify(position)}));return {x:b.x+v[0],y:b.y+v[1]}})()`)
  }
  const pointClick=async(position)=>{const p=await screen(position);await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseReleased',p.x,p.y,{button:'left',clickCount:1});await delay(80)}
  const dragPoint=async(a,b,cancel=false)=>{
    const start=await screen(a),end=await screen(b)
    await pointer('mousePressed',start.x,start.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',end.x,end.y,{button:'left',buttons:1});await delay(100)
    if(cancel){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})}
    await pointer('mouseReleased',end.x,end.y,{button:'left',clickCount:1});await delay(100)
  }
  const objectCount=()=>evaluate('document.querySelector(\'[aria-label="3D obyekt seç"]\').options.length-1')
  const action=async()=>{const editing=await evaluate(`!!document.querySelector('${editor}')`);await click(`${frame} .visual-frame__actions button`);await until(`${editing?'!':''}document.querySelector('${editor}')`)}
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.webglFallback`),'false')
  await tool('point')
  await pointClick([1,1,0]);const xy=await selected();assert.ok(xy)
  await plane('XZ');await pointClick([-1,0,1]);const xz=await selected();assert.notEqual(xz,xy)
  await plane('YZ');await pointClick([0,-1,1]);const yz=await selected();assert.notEqual(yz,xz)
  assert.equal(await objectCount(),3)
  await plane('XY');await tool('select');await click(`${frame} .geometry-3d-inspector summary`)
  const coordinatePoint=async(position,label)=>{
    for(let i=0;i<3;i++)await input(`[aria-label="3D nöqtə ${['X','Y','Z'][i]}"]`,position[i])
    await input('[aria-label="3D nöqtə etiketi"]',label);await textButton('Koordinatla nöqtə yarat');return selected()
  }
  const a=await coordinatePoint([0,0,0],'A'),b=await coordinatePoint([3,0,0],'B'),c=await coordinatePoint([0,3,0],'C')
  assert.equal(await objectCount(),6)
  assert.equal(await coordinatePoint([0,0,0],'duplicate'),a);assert.equal(await objectCount(),6,'no duplicate point')
  await input('[aria-label="3D nöqtə X"]','1000000000001');await textButton('Koordinatla nöqtə yarat');await until('document.querySelector("[role=alert]")');assert.equal(await objectCount(),6)
  await input('[aria-label="3D nöqtə X"]','0')
  for(const kind of ['segment','line','ray','vector']){
    await tool(kind);await pointClick([0,0,0]);await until('document.body.innerText.includes("Nöqtə 2/2")');await pointClick([3,0,0]);await until(`document.querySelector('${editor}').dataset.selectedId && document.querySelector('${editor}').dataset.selectedId!=='${a}'`)
  }
  assert.equal(await objectCount(),10)
  await tool('plane');await pointClick([0,0,0]);await pointClick([3,0,0]);await pointClick([0,3,0]);assert.equal(await objectCount(),11)
  const planeId=await selected();assert.ok(planeId.startsWith('plane_'))
  await tool('segment');await pointClick([0,0,0]);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.equal(await objectCount(),11)
  await pointClick([0,0,0]);await pointClick([0,0,0]);assert.equal(await objectCount(),11);assert.ok(await evaluate('document.body.innerText.includes("Fərqli nöqtələr")'))
  await tool('select');await pointClick([0,0,0]);assert.equal(await selected(),a)
  const cameraBefore=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
  await dragPoint([0,0,0],[.5,0,0],true);assert.equal(Number(await evaluate('document.querySelector(\'[aria-label="3D nöqtə X"]\').value')),0)
  await dragPoint([0,0,0],[.5,0,0]);await until('Math.abs(Number(document.querySelector(\'[aria-label="3D nöqtə X"]\').value)-.5)<.05')
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraBefore,'point drag does not orbit')
  await click('[aria-label="Geri al"]');await until('Number(document.querySelector(\'[aria-label="3D nöqtə X"]\').value)===0')
  await click('[aria-label="Yenidən et"]');await until('Math.abs(Number(document.querySelector(\'[aria-label="3D nöqtə X"]\').value)-.5)<.05')
  const actualPosition=await evaluate('["X","Y","Z"].map(a=>Number(document.querySelector(`[aria-label="3D nöqtə ${a}"]`).value))')
  await dragPoint(actualPosition,[3,0,0]);assert.deepEqual(await evaluate('["X","Y","Z"].map(a=>Number(document.querySelector(`[aria-label="3D nöqtə ${a}"]`).value))'),actualPosition,'invalid/colliding drag rejected')
  assert.equal(await evaluate('[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="3D seçiləni sil").every(b=>b.disabled)'),true,'referenced point deletion disabled')
  await tool('camera');await drag(`${viewport} canvas`,25,20);assert.notEqual(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraBefore)
  await tool('select')
  await evaluate(`(()=>{const s=document.querySelector('[aria-label="3D obyekt seç"]');s.value='${c}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  assert.equal(await selected(),c)
  const cameraAfterOrbit=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
  await drag(`${frame} .visual-frame__move`,10,10)
  assert.equal(await objectCount(),11);assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraAfterOrbit,'frame movement does not edit geometry or orbit')
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(os.tmpdir(),'geometry-3d-m3-acceptance.png'),Buffer.from(screenshot.result.data,'base64'))
  await action();const saved=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)')
  assert.equal(saved.points.length,6);assert.equal(saved.linear_objects.length,4);assert.equal(saved.planes.length,1)
  assert.deepEqual(saved.points.find(p=>p.id===a).position,actualPosition);assert.equal(saved.points.find(p=>p.id===b).label,'B')
  for(const [id,axis] of [[xy,2],[xz,1],[yz,0]])assert.equal(saved.points.find(p=>p.id===id).position[axis],0)
  assert.equal(saved.linear_objects.every(l=>l.a===a&&l.b===b),true)
  await textButton('Çərçivə əlavə et');await until('document.querySelector(".geometry-authoring-board svg")');await click('[data-frame-id="frame-2"] .visual-frame__actions button');await until('!document.querySelector(".geometry-authoring-board")')
  await evaluate('reloadEditor()');await until(`document.querySelector('${frame} svg [data-id="${a}"]')`)
  assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved);assert.equal(await evaluate('savedRevision.blocks[1].payload.source_data.schema_version'),1)
  // Authored graph plus a supported dependency; real pointer edit must evaluate its output.
  const lineId=saved.linear_objects.find(l=>l.kind==='line').id
  const fixture=structuredClone(saved);fixture.points.push({id:'dependent',position:actualPosition.map((v,i)=>(v+[3,0,0][i])/2),label:'D'},{id:'constrained',position:actualPosition.map((v,i)=>2*[3,0,0][i]-v),label:'E'});fixture.constructions.push({id:'midpoint_dep',kind:'midpoint',a,b,output_point_id:'dependent'},{id:'on_line_dep',kind:'point_on_linear',linear_id:lineId,t:2,output_point_id:'constrained'});fixture.linear_objects.push({id:'downstream_segment',kind:'segment',a:'constrained',b:c})
  await evaluate(`window.openUnframedScene(${JSON.stringify(fixture)})`)
  await until('document.querySelector(".geometry-3d-viewport canvas")')
  await click('[data-tool-3d="select"]');await click('.geometry-3d-inspector summary')
  await evaluate(`(()=>{const s=document.querySelector('[aria-label="3D obyekt seç"]');s.value='${b}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await input('[aria-label="3D nöqtə X"]','4');await textButton('Nöqtəyə tətbiq et')
  await until(`Math.abs(unframedScene.points.find(p=>p.id==='dependent').position[0]-${(actualPosition[0]+4)/2})<1e-8`)
  const selectUnframed=async(id)=>evaluate(`(()=>{const s=document.querySelector('[aria-label="3D obyekt seç"]');s.value='${id}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await selectUnframed('constrained');assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Nöqtəyə tətbiq et").disabled'),true)
  const lastPosition=await evaluate('structuredClone(unframedScene.points.find(p=>p.id==="constrained").position)')
  await selectUnframed(lineId);await textButton('3D seçiləni sil')
  await until(`!unframedScene.linear_objects.some(l=>l.id==='${lineId}')`)
  assert.deepEqual(await evaluate('unframedScene.points.find(p=>p.id==="constrained").position'),lastPosition)
  assert.ok(await evaluate('unframedScene.linear_objects.some(l=>l.id==="downstream_segment")'))
  assert.ok(await evaluate('document.body.innerText.includes("İtirilmiş əlaqələr: constrained")'))
  const undo=async(modifiers)=>{await evaluate('document.querySelector(".geometry-3d-viewport").focus({preventScroll:true})');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers,windowsVirtualKeyCode:90});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers,windowsVirtualKeyCode:90})}
  await undo(2);await until('unframedScene.constructions.some(c=>c.id==="on_line_dep")')
  await undo(10);await until('!unframedScene.constructions.some(c=>c.id==="on_line_dep")') // CDP Ctrl=2, Shift=8.
  await click('[data-tool-3d="point"]');const unf=await box('.geometry-3d-viewport canvas');await pointer('mousePressed',unf.x+unf.width*.8,unf.y+unf.height*.7,{button:'left',buttons:1});await pointer('mouseReleased',unf.x+unf.width*.8,unf.y+unf.height*.7,{button:'left'});await until('unframedScene.points.length===9')
  const leaf=await evaluate('document.querySelector(".geometry-3d-editor").dataset.selectedId')
  await textButton('3D seçiləni sil');await until('unframedScene.points.length===8')
  await undo(2);await until(`unframedScene.points.some(p=>p.id==='${leaf}')`)
  console.log('PASS: real Edge M3 XY/XZ/YZ pointer creation, exact coordinates/labels/reuse/rejection, six primitive tools, step feedback/cancel, semantic selection, atomic point drag/Undo/Redo/invalid rejection, safe deletion disablement, camera coexistence, framed mixed V1/V2 save/reload and unframed authoring/dependency editing (fixture API)')
}
