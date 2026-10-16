import assert from 'node:assert/strict'
import {runContextPickingAcceptance} from './geometry_context_picking_browser.mjs'
export async function runMenuPlacementAcceptance(api){
  await runContextPickingAcceptance(api)
  const {evaluate,until,click,box,pointer,send,drag}=api,frame='[data-frame-id="frame-2"]',viewport=`${frame} .geometry-3d-viewport`,menu='.geometry-frame-context-menu:not([hidden])'
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const key=async(key,code,vk,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});await settle()}
  // After reload neither frame is selected; select this owner through its keyboard menu.
  await evaluate(`document.querySelector('${frame}').focus({preventScroll:true})`);await key('F10','F10',121,8)
  await until('document.querySelector(\'[data-frame-menu-owner="frame-2"] .visual-frame__actions button\')')
  await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  const scene=await evaluate('structuredClone(savedRevision.blocks[1].payload.source_data)'),cameraBefore=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
  const screen=async p=>{await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center',inline:'center',behavior:'instant'})`);await settle();return evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts');const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),v=p.screen(p.view(${JSON.stringify(p.position)}));return {x:b.x+v[0],y:b.y+v[1]}})()`)}
  const right=async p=>{await pointer('mouseMoved',p.x,p.y);await pointer('mousePressed',p.x,p.y,{button:'right',buttons:2});await pointer('mouseReleased',p.x,p.y,{button:'right',buttons:0});await until(`document.querySelector('${menu}')`);await settle()}
  const fit=async p=>{const b=await box(menu),v=await evaluate('({width:innerWidth,height:innerHeight})');assert.ok(b.x>=7.9&&b.y>=7.9&&b.x+b.width<=v.width-7.9&&b.y+b.height<=v.height-7.9,'menu never clips');if(p)assert.ok(p.x+12<=b.x||p.x-12>=b.x+b.width||p.y+12<=b.y||p.y-12>=b.y+b.height,'clicked vertex has clearance');return b}
  for(const width of [1600,900,560,360]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await settle()
    for(const slot of ['v_4','v_0']){
      const vertex=scene.points.find(p=>p.id===scene.solids[0].features.find(f=>f.slot===slot).entity_id)
      const p=await screen(vertex);await right(p);await fit(p)
      assert.equal(await evaluate(`document.querySelector('${frame} .geometry-3d-editor').dataset.selectedId`),vertex.id,'placement preserves semantic selection')
      if(width===1600){const b=await box(menu),f=await box(frame);assert.ok(b.x+b.width<=f.x||b.x>=f.x+f.width||b.y+b.height<=f.y||b.y>=f.y+f.height,'wide viewport uses space outside geometry frame')}
      await key('Escape','Escape',27);assert.equal(await evaluate(`!!document.querySelector('${menu}')`),false)
    }
    await evaluate(`document.querySelector('${frame}').focus({preventScroll:true})`);await key('F10','F10',121,8);await fit();await key('Escape','Escape',27)
    await key('ContextMenu','ContextMenu',93);await fit();await key('Escape','Escape',27)
    // Visible portions of a wide frame exercise viewport-edge clicks in narrow layouts.
    const anchor=await screen(scene.points.at(-1))
    const visible=await evaluate(`(()=>{const xs=[];for(let x=8;x<innerWidth-8;x+=4)if(document.elementFromPoint(x,${anchor.y})?.closest('[data-frame-id]')?.dataset.frameId==='frame-2')xs.push(x);return xs})()`)
    assert.ok(visible.length,'fixture has physically visible geometry after keyboard invocation')
    for(const x of [visible[0],visible.at(-1)]){
      const p={x,y:anchor.y}
      await right(p);await fit();await key('Escape','Escape',27)
    }
    console.log('PLACEMENT VIEWPORT',width)
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1200,deviceScaleFactor:1,mobile:false});await settle()
  const p=await screen(scene.points.at(-1));await right(p);await click(`[data-frame-menu-owner="frame-2"] .geometry-frame-menu__items > button`)
  assert.equal(await evaluate('document.querySelector(\'[aria-label="3D obyekt seç"]\').value'),scene.points.at(-1).id,'Properties targets clicked vertex')
  await click('.geometry-properties-dialog[open] header button');await right(p)
  await pointer('mousePressed',20,20,{button:'left',buttons:1});await pointer('mouseReleased',20,20,{button:'left',buttons:0});await settle();assert.equal(await evaluate(`!!document.querySelector('${menu}')`),false,'outside dismissal')
  await click(frame);await drag(`${frame} .visual-frame__move`,10,10);await drag(`${frame} [data-handle="se"]`,20,20)
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraBefore,'placement/resize never changes camera')
  console.log('PASS: apex/base, wide/narrow viewport placement, boundary clicks, vertex clearance, no clipping, semantic/Properties targeting, keyboard/Escape/outside dismissal and frame move/resize')
}
