import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

/** Production frame/editor/ribbon. With --m5-real all HTTP uses PostgreSQL. */
export async function runCylinderAuthoringAcceptance({evaluate,until,textButton,click,pointer,send,delay}){
  const real=process.argv.includes('--m5-real'),centersOnly=process.argv.includes('--cylinder-centers'),statuses=[],settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until('document.querySelector(".geometry-3d-viewport canvas")')
  const frameId=await evaluate('document.querySelector("[data-frame-id]").dataset.frameId'),frame=`[data-frame-id="${frameId}"]`,viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const scene=()=>evaluate('structuredClone(rotationScene)'),camera=()=>evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`)
  const key=async(key,code,modifiers=0)=>{await evaluate(`document.querySelector('${viewport}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
  const undo=()=>key('z','KeyZ',2),redo=()=>key('z','KeyZ',10)
  const screen=world=>evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=JSON.parse(e.dataset.editingCamera),p=createProjection3D(c,b.width,b.height),v=p.screen(p.view(${JSON.stringify(world)}));return {x:b.x+v[0],y:b.y+v[1]}})()`)
  const press=async(point,button='left')=>{await pointer('mouseMoved',point.x,point.y);await pointer('mousePressed',point.x,point.y,{button,buttons:button==='left'?1:2,clickCount:1})}
  const release=async(point,button='left')=>{await pointer('mouseReleased',point.x,point.y,{button,buttons:0,clickCount:1});await settle()}
  const closeMenu=()=>key('Escape','Escape')
  async function setPlane(plane){
    await evaluate(`document.querySelector('${frame}').focus({preventScroll:true})`)
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',modifiers:8})
    await until(`!document.querySelector('[data-frame-menu-owner="${frameId}"]').hidden`)
    await evaluate(`(()=>{const e=document.querySelector('[data-frame-menu-owner="${frameId}"] [aria-label="3D iş müstəvisi"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'${plane}');e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await until(`document.querySelector('${editor}').dataset.workingPlane==='${plane}'`);await closeMenu()
  }
  async function create(plane,world){
    await setPlane(plane);await click('[data-geometry-action="cylinder"]')
    assert.equal(await evaluate(`!!document.querySelector('.geometry-3d-solid-properties')`),false,'no technical cylinder creation panel')
    const before=await scene(),point=await screen(world);await press(point);await release(point)
    await until(`rotationScene.solids.length===${before.solids.length+1}`)
    const after=await scene(),solid=after.solids.find(s=>!before.solids.some(v=>v.id===s.id))
    assert.equal(solid.kind,'cylinder');assert.deepEqual(solid.parameters,{radius:1,height:2});assert.equal(solid.features.length,3);for(const [slot,label] of [['v_0','O1'],['v_1','O2']]){const id=solid.features.find(f=>f.slot===slot)?.entity_id;assert.ok(id);assert.equal(after.points.find(p=>p.id===id)?.label,label)}
    assert.equal(await evaluate(`document.querySelector('${editor}').dataset.activeTool`),'select')
    assert.equal(await evaluate(`document.querySelector('${editor}').dataset.selectedId`),solid.id)
    return solid
  }
  async function select(solid,button='left'){
    await click('[data-geometry-action="select"]')
    const point=await evaluate(`(async()=>{const {pickGeometry3D}=await import('/src/components/geometry3dAuthoring.ts'),{analyticBounds3D}=await import('/src/components/geometry3dAnalytic.ts'),{createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=JSON.parse(e.dataset.editingCamera),project=createProjection3D(c,b.width,b.height),bounds=analyticBounds3D(rotationScene.solids.find(s=>s.id==='${solid.id}')),q=bounds.corners.map(v=>project.screen(project.view(v))),minX=Math.max(20,Math.min(...q.map(v=>v[0]))),maxX=Math.min(b.width-20,Math.max(...q.map(v=>v[0]))),minY=Math.max(20,Math.min(...q.map(v=>v[1]))),maxY=Math.min(b.height-20,Math.max(...q.map(v=>v[1])));const center=project.screen(project.view(bounds.pivot));if(center[0]>=20&&center[1]>=20&&center[0]<b.width-20&&center[1]<b.height-20&&pickGeometry3D(rotationScene,c,{x:center[0],y:center[1],width:b.width,height:b.height})?.id==='${solid.id}')return {x:b.x+center[0],y:b.y+center[1]};for(let y=minY;y<maxY;y+=6)for(let x=minX;x<maxX;x+=6)if(pickGeometry3D(rotationScene,c,{x,y,width:b.width,height:b.height})?.id==='${solid.id}')return {x:b.x+x,y:b.y+y};throw Error('Cylinder not selectable')})()`)
    await press(point,button);await release(point,button);await until(`document.querySelector('${editor}').dataset.selectedId==='${solid.id}'`)
  }
  async function reopen(){
    await evaluate(`document.querySelector('${frame}').focus()`)
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',modifiers:8})
    await until(`document.querySelector('[data-frame-menu-owner="${frameId}"] button')?.disabled===false`)
    await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  }
  async function applySaveReload(){
    const expected=await scene(),editing=await camera()
    await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
    await textButton('Yadda saxla')
    if(real){const loaded=await evaluate('realRevision()');assert.deepEqual(loaded.blocks.find(b=>b.id===frameId).payload.source_data,expected);statuses.push(...await evaluate('realResponses.filter(r=>r.method!=="GET").map(r=>({method:r.method,status:r.status,path:new URL(r.url,location.origin).pathname}))'))}
    else await until(`savedRevision.blocks.find(b=>b.id==='${frameId}').payload.source_data.solids.length===${expected.solids.length}`)
    if(real){
      const origin=await evaluate('performance.timeOrigin')
      await send('Page.reload',{ignoreCache:true})
      let ready=false
      for(let i=0;i<200;i++){
        try{ready=await evaluate(`performance.timeOrigin!==${origin}&&typeof realRevision==='function'&&!!document.querySelector('${frame} .geometry-3d-screen svg')`)}catch(error){if(!/context|navigat/i.test(error.message))throw error}
        if(ready)break
        await delay(100)
      }
      assert.ok(ready,'new document and real API bootstrap finish before reload verification')
    }else await evaluate('reloadEditor()')
    await until(`document.querySelector('${frame} .geometry-3d-screen svg')`)
    const loaded=real?await evaluate('realRevision()'):await evaluate('savedRevision')
    assert.deepEqual(loaded.blocks.find(b=>b.id===frameId).payload.source_data,expected)
    assert.ok(await evaluate(`(async()=>{const {geometrySceneSVG3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),d=document.createElement('div');d.innerHTML=geometrySceneSVG3D(${JSON.stringify(expected)},b.width,b.height);return e.querySelector('.geometry-3d-print').innerHTML===d.innerHTML&&!e.querySelector('[data-resize-handle]')})()`),'saved camera SVG matches print, with no editing handles')
    return {scene:expected,editing}
  }
  const initial=await scene(),initialCamera=await camera(),cancelPoint=await screen([-2,0,0])
  await click('[data-geometry-action="cylinder"]');await press(cancelPoint);await key('Escape','Escape');await release(cancelPoint);assert.deepEqual(await scene(),initial)
  const firstSolid=await create('XY',[-2,0,0]),created=await scene()
  await undo();assert.deepEqual(await scene(),initial);await redo();assert.deepEqual(await scene(),created)
  await select(firstSolid);assert.deepEqual(await camera(),initialCamera)
  await select(firstSolid,'right');await until(`!document.querySelector('[data-frame-menu-owner="${frameId}"]').hidden`)
  await click(`[data-frame-menu-owner="${frameId}"] .geometry-frame-menu__items > button`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="3D obyekt seç"]').value`),firstSolid.id)
  await closeMenu()
  for(const action of ['rotate_solid','translate_solid']){await click(`[data-geometry-action="${action}"]`);assert.deepEqual(await scene(),created);assert.equal(await evaluate(`document.querySelector('${editor}').dataset.activeTool`),action)}
  await click('[data-geometry-action="select"]')
  assert.ok(await evaluate(`['radius','height','uniform'].every(kind=>document.querySelector('${viewport} [data-resize-kind="'+kind+'"]'))`))
  await click('[data-geometry-action="delete"]');await until('rotationScene.solids.length===0');assert.equal((await scene()).surfaces.length,0)
  await undo();assert.deepEqual(await scene(),created);await redo();assert.equal((await scene()).solids.length,0);await undo();assert.deepEqual(await scene(),created)
  await textButton('Üst');await textButton('Sual üçün görünüşü təyin et');await textButton('İzometrik')
  async function transform(solid,modes=centersOnly?['rotate_solid','translate_solid','radius','height','scale']:['rotate_solid','translate_solid','radius','height','radius_down','height_down','scale']){
    await select(solid)
    const before=await scene(),cam=await camera()
    for(const mode of modes){
      const resizeKind=mode.replace('_down','')
      if(!['scale','radius','height'].includes(resizeKind))await click('[data-geometry-action="'+mode+'"]');else await click('[data-geometry-action="select"]')
      const old=await scene();await settle()
      const start=await evaluate(`(async()=>{const {solidPivot3D}=await import('/src/components/geometry3dSolidAuthoring.ts'),{createProjection3D}=await import('/src/components/geometry3dProjection.ts'),{projectedSolidBounds3D}=await import('/src/components/geometry3dSolidBounds.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=JSON.parse(e.dataset.editingCamera),p=createProjection3D(c,b.width,b.height);if(['scale','radius','height'].includes('${resizeKind}')){const h=projectedSolidBounds3D(rotationScene,c,b.width,b.height,'${solid.id}').handles.find(h=>h.kind===('${resizeKind}'==='scale'?'uniform':'${resizeKind}'));const q=p.screen(p.view(h.world.map((v,i)=>v+h.direction[i]*h.length*${resizeKind==='radius'?(mode.endsWith('_down')?-.15:.35):resizeKind==='height'?(mode.endsWith('_down')?-.1:.2):.25})));return {x:b.x+h.x,y:b.y+h.y,end:{x:b.x+h.x+q[0]-h.screen[0],y:b.y+h.y+q[1]-h.screen[1]}}}const v=p.screen(p.view(solidPivot3D(rotationScene,'${solid.id}')));return {x:b.x+v[0],y:b.y+v[1]}})()`)
      const end=start.end??{x:start.x+24,y:start.y+14}
      if(!centersOnly&&['radius','height'].includes(resizeKind)){
        const screenBefore=await evaluate(`document.querySelector('${viewport} .geometry-3d-shared-screen').innerHTML`)
        await press(start);await pointer('mouseMoved',end.x,end.y,{button:'left',buttons:1});await settle()
        assert.deepEqual(await scene(),old,'live preview does not commit')
        assert.notEqual(await evaluate(`document.querySelector('${viewport} .geometry-3d-shared-screen').innerHTML`),screenBefore,'live dimensions render')
        await key('Escape','Escape');await release(end);assert.deepEqual(await scene(),old,'Escape restores dimensions')
        assert.deepEqual(await camera(),cam,'Escape preserves camera')
        assert.ok(await evaluate(`(async()=>{const {geometrySceneSVG3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),expected=document.createElement('div');expected.innerHTML=geometrySceneSVG3D({...${JSON.stringify(old)},print_camera:${JSON.stringify(cam)}},b.width,b.height);const normalize=element=>{const d=element.cloneNode(true);for(const n of d.querySelectorAll('*'))for(const a of ['fill','stroke'])n.removeAttribute(a);return d.innerHTML},wanted=normalize(expected);for(let i=0;i<30;i++){if(normalize(e.querySelector('.geometry-3d-shared-screen'))===wanted)return true;await new Promise(r=>requestAnimationFrame(r))}return false})()`),'Escape restores semantic SVG geometry after redraw')
        await press(start);await pointer('mouseMoved',end.x,end.y,{button:'left',buttons:1});await settle()
        await evaluate(`document.querySelector('${viewport}').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,button:0,clientX:${end.x},clientY:${end.y}}))`);await release(end);assert.deepEqual(await scene(),old,'pointercancel restores dimensions')
      }
      await press(start);for(let k=1;k<=8;k++)await pointer('mouseMoved',start.x+(end.x-start.x)*k/8,start.y+(end.y-start.y)*k/8,{button:'left',buttons:1});await release(end)
      const next=await scene();assert.notDeepEqual(next,old,mode+' changes cylinder');assert.deepEqual(await camera(),cam)
      assert.ok(await evaluate(`(async()=>{const {analyticFeaturePositions3D}=await import('/src/components/geometry3dAnalytic.ts'),s=rotationScene.solids.find(s=>s.id==='${solid.id}'),positions=analyticFeaturePositions3D(s);return Object.entries(positions).every(([id,v])=>Math.hypot(...v.map((x,i)=>x-rotationScene.points.find(p=>p.id===id).position[i]))<1e-8)})()`),'centers follow every transform')
      if(resizeKind==='radius')assert.equal(next.solids.find(s=>s.id===solid.id).parameters.height,old.solids.find(s=>s.id===solid.id).parameters.height);if(resizeKind==='height')assert.equal(next.solids.find(s=>s.id===solid.id).parameters.radius,old.solids.find(s=>s.id===solid.id).parameters.radius)
      assert.deepEqual(next.solids.filter(s=>s.id!==solid.id),old.solids.filter(s=>s.id!==solid.id));assert.deepEqual(next.solids.find(s=>s.id===solid.id).features,solid.features)
      await undo();assert.deepEqual(await scene(),old,'one Undo restores full drag');await redo();assert.deepEqual(await scene(),next)
      await press(start);await release(start);assert.deepEqual(await scene(),next,'no-op preserves scene')
    }
    assert.notDeepEqual(await scene(),before)
    const resized=(await scene()).solids.find(s=>s.id===solid.id).parameters;assert.ok(Math.abs(resized.height/resized.radius-2)>1e-3,'unequal independent dimensions persist')
    console.log(centersOnly?'PASS: Edge center tracking through '+modes.join('/')+', independent camera/other solids, one Undo/Redo per drag and no-op':'PASS: Edge cylinder rotation/translation/uniform/radius/height, increase/decrease, independent camera/other solids, live preview, Escape/pointercancel, one Undo/Redo per drag, no-op')
  }
  for(const [view,slot,hiddenSlot,label] of [['top','v_1','v_0','O2'],['bottom','v_0','v_1','O1']]){
    await textButton(view==='top'?'Üst':'Alt')
    const current=await scene(),solid=current.solids.find(s=>s.id===firstSolid.id),id=solid.features.find(f=>f.slot===slot).entity_id,hiddenId=solid.features.find(f=>f.slot===hiddenSlot).entity_id
    await until(`document.querySelector('${viewport} .geometry-3d-shared-screen circle[data-id="${id}"]')`)
    assert.equal(await evaluate(`!!document.querySelector('${viewport} .geometry-3d-shared-screen circle[data-id="${hiddenId}"]')`),false,'opposite center is occluded')
    assert.ok(await evaluate(`[...document.querySelectorAll('${viewport} .geometry-3d-shared-screen text')].some(e=>e.textContent==='${label}')`))
    await click('[data-geometry-action="select"]');await closeMenu()
    let point=await screen(current.points.find(p=>p.id===id).position);await press(point);await release(point)
    assert.equal(await evaluate(`document.querySelector('${editor}').dataset.selectedId`),id)
    await press(point,'right');await release(point,'right');await until(`!document.querySelector('[data-frame-menu-owner="${frameId}"]').hidden`)
    await click(`[data-frame-menu-owner="${frameId}"] .geometry-frame-menu__items > button`)
    assert.equal(await evaluate(`document.querySelector('[aria-label="3D obyekt seç"]').value`),id)
    await closeMenu();await click('[data-geometry-action="point"]');point=await screen(current.points.find(p=>p.id===id).position);await press(point);await release(point);assert.deepEqual(await scene(),current,'center snapping never duplicates a point')
    await click('[data-geometry-action="select"]');point=await screen(current.points.find(p=>p.id===id).position);await press(point);await pointer('mouseMoved',point.x+18,point.y+10,{button:'left',buttons:1});await release({x:point.x+18,y:point.y+10});assert.deepEqual(await scene(),current,'solid center is not freely draggable')
  }
  await textButton('İzometrik')
  console.log('PASS: Edge O1/O2 semantic picking/Properties, opaque occlusion, labels, snapping reuse and locked center dragging')
  await transform(firstSolid)
  const first=await applySaveReload()
  await reopen();assert.deepEqual(await scene(),first.scene);await textButton('Həndəsə');await textButton('İzometrik')
  await create('XZ',[2,0,0])
  await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until(`!document.querySelector('${editor}')`)
  await reopen();assert.deepEqual(await scene(),first.scene,'frame Cancel rolls back new cylinder')
  await textButton('İzometrik');const secondSolid=await create('XZ',[2,0,0]);if(!centersOnly)await create('YZ',[0,3,0]);await transform(secondSolid,centersOnly?['radius','height']:undefined)
  const second=await applySaveReload()
  assert.equal(second.scene.solids.length,centersOnly?2:3);assert.deepEqual(second.scene.solids.find(s=>s.id===firstSolid.id),first.scene.solids.find(s=>s.id===firstSolid.id))
  assert.deepEqual(second.scene.print_camera,first.scene.print_camera)
  if(real){assert.ok(statuses.some(r=>r.method==='POST'&&r.status===201));assert.ok(statuses.some(r=>r.method==='PATCH'&&r.status===200));await fs.writeFile(process.env.M5_REAL_OUTPUT,JSON.stringify({frameId,first:first.scene,second:second.scene,statuses}))}
  console.log(`PASS: real Edge cylinder ribbon/${centersOnly?'XY-XZ':'XY-XZ-YZ'} creation, semantic selection/right-click Properties, transform activation, atomic creation/deletion Undo/Redo, Escape, frame Apply/Cancel, two ${real?'HTTP/PostgreSQL page':'fixture'} reloads, stable IDs and saved-camera SVG/print`)
}
