import assert from 'node:assert/strict'
export async function runPlanarAcceptance({evaluate,until,textButton,click,box,pointer,send}){
  const frame='[data-frame-id="frame-1"]',viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
  const scene=()=>evaluate('structuredClone(planarScene)')
  const tool=async(code,menu)=>{
    if(menu)await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.includes(${JSON.stringify(menu)}));if(!d.open)d.querySelector('summary').click()})()`)
    await click(`.universal-editor-geometry-ribbon [data-geometry-action="${code}"]`)
    await until(`document.querySelector('${editor}').dataset.activeTool==='${code}'`)
  }
  const screen=pos=>evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),s=p.screen(p.view(${JSON.stringify(pos)}));return {x:b.x+s[0],y:b.y+s[1]}})()`)
  const at=async(pos,offset=0)=>{const p=await screen(pos);await pointer('mouseMoved',p.x+offset,p.y);await pointer('mousePressed',p.x+offset,p.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseReleased',p.x+offset,p.y,{button:'left',buttons:0,clickCount:1});await settle()}
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  const camera=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
  await tool('polygon','Müstəvi fiqurları')
  for(const pos of [[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]])await at(pos)
  assert.equal((await scene()).points.length,0,'unfinished draft does not mutate geometry')
  let p=await screen([-2,-2,0]);await pointer('mouseMoved',p.x+4,p.y);await settle()
  assert.equal(await evaluate(`document.querySelectorAll('${viewport} .geometry-3d-construction-preview circle').length`),5)
  await at([-2,-2,0],4)
  let saved=await scene();assert.equal(saved.faces.length,1);assert.equal(saved.points.length,4);assert.equal(saved.linear_objects.length,4)
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),camera,'construction never moves camera')
  await key('z','KeyZ',2);assert.equal((await scene()).points.length,0)
  await key('z','KeyZ',10);assert.deepEqual(await scene(),saved,'one redo restores whole polygon')
  await tool('triangle','Müstəvi fiqurları');for(const pos of [[-1,-1,0],[1,-1,0],[0,1,0]])await at(pos)
  assert.equal((await scene()).faces.length,2)
  await tool('polygon','Müstəvi fiqurları');const before=await scene()
  for(const pos of [[-1,-1,0],[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0]])await at(pos)
  assert.deepEqual(await scene(),before,'crossed polygon rejected without partial points or segments')
  await key('Escape','Escape');assert.equal(await evaluate(`!!document.querySelector('${viewport} .geometry-3d-construction-preview')`),false)
  await tool('polyline','Xətt');for(const pos of [[-3,0,0],[0,0,0],[3,0,0]])await at(pos)
  await key('Enter','Enter');assert.equal((await scene()).faces.length,2);assert.equal((await scene()).linear_objects.length,9)
  await tool('segment','Xətt');await at([-3,-3,0]);await at([3,3,0]);assert.equal((await scene()).linear_objects.length,10)
  // Existing frame menu is the only working-plane control; keep semantic right-click selection.
  for(const plane of ['XZ','YZ']){
    await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
    await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
    await evaluate(`(()=>{const e=document.querySelector('${viewport}');e.focus();e.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}))})()`)
    await until(`document.querySelector('[aria-label="3D iş müstəvisi"]')`)
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="3D iş müstəvisi"]');e.value='${plane}';e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await key('Escape','Escape');await tool('triangle','Müstəvi fiqurları')
    const points=plane==='XZ'?[[-1,0,-1],[1,0,-1],[0,0,1]]:[[0,-1,-1],[0,1,-1],[0,0,1]]
    for(const pos of points)await at(pos)
    const s=await scene(),id=await evaluate(`document.querySelector('${editor}').dataset.selectedId`),face=s.faces.find(f=>f.id===id)
    assert.ok(face);for(const id of face.boundary)assert.ok(Math.abs(s.points.find(p=>p.id===id).position[plane==='XZ'?1:0])<1e-9)
  }
  saved=await scene();assert.equal(saved.faces.length,4)
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved)
  await evaluate(`window.previousPlanarFrame=document.querySelector('${frame}');reloadEditor()`)
  await until(`document.querySelector('${frame}')!==previousPlanarFrame&&document.querySelector('${frame} .geometry-3d-screen svg')`)
  assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved)
  // A 3D tool in a 2D frame offers an explicit separate frame and cannot discard an edit.
  await textButton('Həndəsə');await evaluate(`(()=>{const d=document.querySelector('.universal-editor-geometry-ribbon > details');if(!d.open)d.querySelector('summary').click()})()`);await textButton('2D çərçivə')
  await until(`document.querySelector('[data-frame-id="frame-2"] .geometry-authoring-board')`)
  await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()==='3D ▾');if(!d.open)d.querySelector('summary').click()})()`);await click('.universal-editor-geometry-ribbon [data-geometry-action="cube"]')
  await until('document.querySelector("[data-geometry-scene-request]")')
  assert.equal(await evaluate('[...document.querySelectorAll("[data-geometry-scene-request] button")][0].disabled'),true)
  assert.equal(await evaluate('savedRevision.blocks.length'),2)
  await click('[data-frame-id="frame-2"] .visual-frame__actions button')
  await until('![...document.querySelectorAll("[data-geometry-scene-request] button")][0].disabled')
  await textButton('3D çərçivə yarat');await until(`document.querySelector('[data-frame-id="frame-3"] .geometry-3d-viewport canvas')`)
  assert.deepEqual(await evaluate('savedRevision.blocks.map(b=>b.payload.source_data.schema_version)'),[2,1,2])
  console.log('PASS: real Edge direct polygon/triangle/polyline/segment, live preview, snap closure, invalid rejection, Escape, atomic Undo/Redo, XY/XZ/YZ, camera isolation, Apply/reload and safe 2D → separate 3D frame (fixture HTTP)')
}
