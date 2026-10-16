import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

export async function runBaseVertexAcceptance({evaluate,until,textButton,click,pointer,send}){
  const fixtures=JSON.parse(await fs.readFile(new URL('./geometry_3d_base_vertex_canonical.json',import.meta.url),'utf8'))
  const frame='[data-frame-id="frame-1"]',editor=`${frame} .geometry-3d-editor`,viewport=`${frame} .geometry-3d-viewport`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const scene=()=>evaluate('structuredClone(baseVertexScene)')
  const svg=()=>evaluate(`document.querySelector('${viewport} .geometry-3d-static').innerHTML`)
  const key=async(key,code,vk,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers});await settle()}
  const reopen=async()=>{await evaluate(`document.querySelector('${frame}').focus({preventScroll:true})`);await key('F10','F10',121,8);await until('document.querySelector(\'[data-frame-menu-owner="frame-1"] .visual-frame__actions button\')?.disabled===false');await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)}
  const plan=async()=>{
    await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center',behavior:'instant'})`);await settle()
    return evaluate(`(async()=>{const {pyramidBaseDrag3D}=await import('/src/components/geometry3dSolidAuthoring.ts'),{planePoint3D}=await import('/src/components/geometry3dAuthoring.ts'),{createProjection3D,add,sub,unit,scale}=await import('/src/components/geometry3dProjection.ts');const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=JSON.parse(e.dataset.editingCamera),p=createProjection3D(c,b.width,b.height),d=pyramidBaseDrag3D(baseVertexScene,'py_v_1'),screen=pos=>{const s=p.screen(p.view(pos));return {x:b.x+s[0],y:b.y+s[1]}},start=screen(d.position);start.x+=3;start.y+=2;const hit=planePoint3D(c,{x:start.x-b.x,y:start.y-b.y,width:b.width,height:b.height},d.normal,d.position),grab=sub(hit,d.position),target=add(d.position,scale(unit(sub(d.base[2],d.position)),-.4)),bad=add(d.base[3],sub(d.base[3],d.base[1]));return {start,end:screen(add(target,grab)),bad:screen(add(bad,grab)),target,id:'py_v_1'}})()`)
  }
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`);await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  let lastSaved
  for(const [name,projection] of [['template_flat','orthographic'],['face_tilted','perspective'],['face_coincident','orthographic']]){
    const original=structuredClone(fixtures.find(f=>f.name===name).source);original.print_camera.projection=projection
    await evaluate(`globalThis.basePreviousFrame=document.querySelector('${frame}');savedRevision.blocks[0].payload.source_data=${JSON.stringify(original)};reloadEditor()`);await until(`document.querySelector('${frame}')!==basePreviousFrame&&document.querySelector('${frame} svg')`);await reopen();await click('[data-tool-3d="select"]')
    if(await evaluate('!!document.querySelector(".geometry-properties-dialog[open]")'))await click('.geometry-properties-dialog[open] header button')
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="3D iş müstəvisi"]');e.value='XZ';e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    const d=await plan(),beforeSVG=await svg(),cameraBefore=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
    const begin=async()=>{await pointer('mouseMoved',d.start.x,d.start.y);await pointer('mousePressed',d.start.x,d.start.y,{button:'left',buttons:1});await settle();assert.equal(await evaluate(`document.querySelector('${editor}').dataset.selectedId`),d.id)}
    const move=async()=>{for(let i=1;i<=8;i++)await pointer('mouseMoved',d.start.x+(d.end.x-d.start.x)*i/8,d.start.y+(d.end.y-d.start.y)*i/8,{button:'left',buttons:1});await settle()}
    await begin();await pointer('mouseReleased',d.start.x,d.start.y,{button:'left',buttons:0});await settle();assert.deepEqual(await scene(),original,'click does not convert')
    await begin();await move();assert.notEqual(await svg(),beforeSVG,'semantic preview renders live');assert.deepEqual(await scene(),original,'live preview is not persisted')
    await key('Escape','Escape',27);await pointer('mouseReleased',d.end.x,d.end.y,{button:'left',buttons:0});await settle();assert.equal(await svg(),beforeSVG);assert.deepEqual(await scene(),original)
    await begin();await move();await evaluate(`document.querySelector('${viewport}').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true}))`);await pointer('mouseReleased',d.end.x,d.end.y,{button:'left',buttons:0});await settle();assert.deepEqual(await scene(),original)
    await begin();await pointer('mouseMoved',d.bad.x,d.bad.y,{button:'left',buttons:1});await pointer('mouseReleased',d.bad.x,d.bad.y,{button:'left',buttons:0});await settle();assert.deepEqual(await scene(),original,'invalid drag cannot convert')
    await begin();await move();await pointer('mouseReleased',d.end.x,d.end.y,{button:'left',buttons:0});await settle()
    const edited=await scene();assert.equal(edited.solids[0].parameters.base.kind,'polygon')
    for(const point of original.points){const actual=edited.points.find(p=>p.id===point.id);if(point.id===d.id)assert.ok(Math.hypot(...actual.position.map((v,i)=>v-d.target[i]))<1e-5);else assert.ok(Math.hypot(...actual.position.map((v,i)=>v-point.position[i]))<1e-8,'unselected base vertices, source polygon and apex stay fixed');assert.equal(actual.label,point.label)}
    assert.deepEqual(edited.solids[0].features,original.solids[0].features);assert.deepEqual(edited.edges,original.edges);assert.deepEqual(edited.faces,original.faces)
    assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraBefore)
    if(name.startsWith('face'))assert.ok(await evaluate('document.body.innerText.includes("Piramida mənbə poliqondan ayrıldı")'))
    await click('[aria-label="Geri al"]');await settle();assert.deepEqual(await scene(),original);assert.equal(await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled'),true,'one undo restores original representation')
    if(name.startsWith('face'))assert.equal(await evaluate('document.body.innerText.includes("Piramida mənbə poliqondan ayrıldı")'),false,'Undo clears detachment status')
    await click('[aria-label="Yenidən et"]');await settle();assert.deepEqual(await scene(),edited)
    // Right-click uses the same stable semantic vertex and Properties receives its coordinates.
    const at=await evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts');const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),s=p.screen(p.view(baseVertexScene.points.find(p=>p.id==='py_v_1').position));return {x:b.x+s[0],y:b.y+s[1]}})()`)
    await pointer('mousePressed',at.x,at.y,{button:'right',buttons:2});await pointer('mouseReleased',at.x,at.y,{button:'right',buttons:0});await textButton('Xassələr');await settle()
    assert.equal(await evaluate('document.querySelector(\'[aria-label="3D obyekt seç"]\').value'),'py_v_1')
    const coords=await evaluate(`['X','Y','Z'].map(axis=>Number(document.querySelector('[aria-label="3D nöqtə '+axis+'"]').value))`);assert.deepEqual(coords,edited.points.find(p=>p.id==='py_v_1').position)
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="3D obyekt seç"]');e.value='py';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await settle()
    assert.equal(await evaluate('document.querySelector(\'[aria-label="Cisim əsas rejimi"]\').value'),'polygon');assert.equal(await evaluate('document.querySelector(\'[aria-label="Cisim radius"]\')'),null)
    await textButton('Cismə tətbiq et');await settle();assert.deepEqual(await scene(),edited,'Properties never converts polygon back to template')
    await click('.geometry-properties-dialog[open] header button')
    await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),edited)
    assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraBefore,'Apply preserves screen camera')
    await evaluate(`globalThis.basePreviousFrame=document.querySelector('${frame}');reloadEditor()`);await until(`document.querySelector('${frame}')!==basePreviousFrame&&document.querySelector('${frame} svg')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),edited)
    await reopen();await click('[data-tool-3d="select"]');const again=await plan();await pointer('mousePressed',again.start.x,again.start.y,{button:'left',buttons:1});await pointer('mouseMoved',again.end.x,again.end.y,{button:'left',buttons:1});await pointer('mouseReleased',again.end.x,again.end.y,{button:'left',buttons:0});await settle();assert.notDeepEqual(await scene(),edited)
    await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),edited)
    lastSaved=edited;console.log('BASE BROWSER',name,projection,'PASS')
  }
  // The edited polygon remains a semantic pyramid with both accepted apex gestures.
  await evaluate(`openUnframedScene(${JSON.stringify(lastSaved)})`);await until('document.querySelector(".geometry-3d-viewport canvas")')
  for(const heightMode of [false,true]){
    const before=await evaluate('structuredClone(unframedScene)')
    const d=await evaluate(`(async()=>{const {pyramidApexDrag3D}=await import('/src/components/geometry3dSolidAuthoring.ts'),{createProjection3D,add,sub,unit,scale}=await import('/src/components/geometry3dProjection.ts'),a=pyramidApexDrag3D(unframedScene,'py_v_4'),e=document.querySelector('.geometry-3d-viewport'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),direction=${heightMode?'scale(a.normal,-.3)':'scale(unit(sub(unframedScene.points.find(p=>p.id===\'py_v_1\').position,unframedScene.points.find(p=>p.id===\'py_v_0\').position)),.3)'},end=add(a.position,direction),screen=pos=>{const s=p.screen(p.view(pos));return {x:b.x+s[0],y:b.y+s[1]}};return {start:screen(a.position),end:screen(end),target:end}})()`)
    await pointer('mousePressed',d.start.x,d.start.y,{button:'left',buttons:1,modifiers:heightMode?8:0});await pointer('mouseMoved',d.end.x,d.end.y,{button:'left',buttons:1});await pointer('mouseReleased',d.end.x,d.end.y,{button:'left',buttons:0});await settle()
    const after=await evaluate('structuredClone(unframedScene)');assert.ok(Math.hypot(...after.points.find(p=>p.id==='py_v_4').position.map((v,i)=>v-d.target[i]))<1e-5);assert.deepEqual(after.solids[0].parameters.base,before.solids[0].parameters.base)
  }
  console.log('PASS: real Edge independent base drag, template/face snapshots, source/apex/other vertices/IDs/labels, both projections/tilted base, live preview, invalid/cancel/no-op, one Undo/Redo, Properties, Apply/Cancel/reload, right-click/camera continuity and polygon apex gestures (fixture API)')
}
