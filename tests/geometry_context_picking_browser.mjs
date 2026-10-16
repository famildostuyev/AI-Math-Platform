import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
import assert from 'node:assert/strict'

export async function runContextPickingAcceptance({evaluate,until,textButton,click,box,pointer,send,drag}) {
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})}
  const right=async p=>{await pointer('mouseMoved',p.x,p.y);await pointer('mousePressed',p.x,p.y,{button:'right',buttons:2});await pointer('mouseReleased',p.x,p.y,{button:'right',buttons:0});await until('document.querySelector(".geometry-frame-context-menu:not([hidden])")');await settle()}
  const left=async p=>{await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1});await pointer('mouseReleased',p.x,p.y,{button:'left',buttons:0});await settle()}
  await textButton('Həndəsə');await textButton('Çərçivə əlavə et');await until('document.querySelector(".geometry-authoring-board svg")')
  await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-authoring-board")')
  await evaluate(`(()=>{const g=savedRevision.blocks[0].payload.source_data;g.points=[{id:'a',x:20,y:20,label:'A'},{id:'b',x:60,y:20,label:'B'},{id:'overlap',x:20,y:20,label:'C'}];g.segments=[{id:'ab',start_point_id:'a',end_point_id:'b'}];g.texts=[{id:'note',x:20,y:45,content:'Note'}];reloadEditor()})()`)
  await until('document.querySelector("[data-frame-id=frame-1]")');await click('[data-frame-id="frame-1"]');await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('document.querySelector("[data-geometry-point-id=a]")')
  const source2=await evaluate('JSON.stringify(savedRevision.blocks[0].payload.source_data)'),undo2=await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled')
  await click('[data-geometry-action="select"]')
  const a=await box('[data-geometry-point-id="a"]'),p={x:a.x+a.width/2,y:a.y+a.height/2}
  await right(p);await textButton('Xassələr');assert.equal(await evaluate('document.querySelector(".geometry-editor__label input").value'),'C','explicit vertex wins boundary; overlapping vertices follow existing JSXGraph handler order')
  await click('.geometry-properties-dialog header button');await right(p);await escape();await right(p);await textButton('Xassələr');assert.equal(await evaluate('document.querySelector(".geometry-editor__label input").value'),'C','overlap selection is deterministic')
  await click('.geometry-properties-dialog header button');await left(p);assert.equal(await evaluate('document.querySelector(".geometry-editor__label input").value'),'C','left selection still works')
  const board=await box('.geometry-authoring-board');await right({x:board.x+board.width-40,y:board.y+board.height-40});await textButton('Xassələr');assert.equal(await evaluate('document.querySelector(".geometry-editor__label")'),null,'empty space clears selection')
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled'),undo2,'2D selection does not change history')
  await click('.geometry-properties-dialog header button');await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-authoring-board")');assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0].payload.source_data)'),source2,'2D identities/data survive Apply')

  await textButton('3D səhnə əlavə et');await until('document.querySelector(".geometry-3d-viewport canvas")');await createScenePyramid({evaluate,until,click,pointer});await click('[data-tool-3d="camera"]')
  const frame='[data-frame-id="frame-2"]',viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  const source3=await evaluate('structuredClone(savedRevision.blocks[1].payload.source_data)')
  await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`);await click('[data-tool-3d="camera"]');await settle()
  if(await evaluate('!!document.querySelector(".geometry-properties-dialog[open]")'))await click('.geometry-properties-dialog[open] header button')
  await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center'})`);await settle()
  const initialCamera=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),initialFrame=await box(frame),undo3=await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled')
  const screen=async position=>{await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center'})`);await settle();return evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts');const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),v=p.screen(p.view(${JSON.stringify(position)}));return {x:b.x+v[0],y:b.y+v[1]}})()`)}
  const selected=()=>evaluate(`document.querySelector('${editor}').dataset.selectedId`)
  const vertex=source3.points.at(-1);await right(await screen(vertex.position));assert.equal(await selected(),vertex.id,'vertex uses its stable feature ID')
  await textButton('Xassələr');assert.equal(await evaluate('document.querySelector(\'[aria-label="3D nöqtə X"]\').value'),String(vertex.position[0]),'properties targets right-click vertex');await click('.geometry-properties-dialog header button')
  // Face-based pyramids retain coincident source points; existing M5 picking prefers owned vertices.
  const ownedIds=new Set(source3.solids[0].features.filter(f=>f.slot.startsWith('v_')).map(f=>f.entity_id))
  const projected=await Promise.all(source3.points.filter(p=>ownedIds.has(p.id)).map(async point=>({...await screen(point.position),id:point.id})))
  const outer=projected.reduce((a,b)=>a.x<b.x?a:b),empty={x:outer.x-18,y:outer.y}
  const rightFrom=async(start,end)=>{
    await pointer('mouseMoved',start.x,start.y);await pointer('mousePressed',start.x,start.y,{button:'right',buttons:2})
    await pointer('mouseMoved',end.x,end.y,{button:'right',buttons:2});await pointer('mouseReleased',end.x,end.y,{button:'right',buttons:0});await settle()
    await until('document.querySelector(".geometry-frame-context-menu:not([hidden])")')
  }
  await rightFrom(outer,empty);assert.equal(await selected(),outer.id,'18 px release drift keeps the pointerdown vertex');await escape()
  await rightFrom(empty,outer);assert.equal(await selected(),'','empty press followed by vertex release stays empty');await escape()
  await right(outer);assert.equal(await selected(),outer.id,'new interaction does not reuse the empty capture')
  const popup=await box('.geometry-frame-context-menu:not([hidden])'),covered=projected.find(p=>p.id!==outer.id)
  assert.ok(!(outer.x>=popup.x&&outer.x<=popup.x+popup.width&&outer.y>=popup.y&&outer.y<=popup.y+popup.height),'menu leaves the clicked vertex uncovered')
  await right({x:popup.x+popup.width/2,y:popup.y+20});assert.equal(await selected(),outer.id,'popup events never pick underlying geometry');await escape()
  await right(covered);assert.equal(await selected(),covered.id,'different vertex updates after closing the menu')
  await textButton('Xassələr');await settle();assert.equal(await selected(),covered.id,'menu/focus changes keep selection')
  await right(outer);assert.equal(await selected(),outer.id,'right click works with Properties open')
  await textButton('Xassələr');assert.equal(await evaluate('document.querySelector(\'[aria-label="3D obyekt seç"]\').value'),outer.id,'open Properties updates to captured target')
  await click('.geometry-properties-dialog header button')
  await right(empty);assert.equal(await selected(),'');await escape()
  await click('[data-tool-3d="select"]')
  const beginDelayed=async(start,end)=>{
    await evaluate('document.addEventListener("pointerdown",e=>{window.contextOrigin={pointerId:e.pointerId,pointerType:e.pointerType}},{capture:true,once:true});document.addEventListener("contextmenu",e=>e.stopImmediatePropagation(),{capture:true,once:true})')
    await pointer('mouseMoved',start.x,start.y);await pointer('mousePressed',start.x,start.y,{button:'right',buttons:2})
    await pointer('mouseMoved',end.x,end.y,{button:'right',buttons:2});await pointer('mouseReleased',end.x,end.y,{button:'right',buttons:0});await settle()
    // Deliberately cross a browser event-loop task before delivering the matching event.
    await evaluate('new Promise(r=>setTimeout(r,0))')
  }
  const deliverDelayed=async(end,origin='contextOrigin')=>{
    await evaluate(`document.querySelector('${viewport} canvas').dispatchEvent(new PointerEvent('contextmenu',{...${origin},bubbles:true,cancelable:true,button:2,clientX:${end.x},clientY:${end.y}}))`);await settle()
  }
  const apex=await screen(vertex.position)
  await beginDelayed(apex,apex)
  assert.equal(await selected(),'','hovering/picking apex has not yet committed selection')
  assert.equal(await evaluate('document.querySelector(\'[aria-label="3D obyekt seç"]\').value'),'','hover orange must not be mistaken for Properties selection')
  await pointer('mouseMoved',empty.x,empty.y);await settle()
  await deliverDelayed(apex);assert.equal(await selected(),vertex.id,'later-task contextmenu applies original apex after hover has moved away')
  // Change through the existing object selector without a new pointer/keyboard boundary.
  // A duplicate contextmenu must not apply the consumed apex capture again.
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="3D obyekt seç"]');e.value='${covered.id}';e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await settle()
  await deliverDelayed(apex);assert.equal(await selected(),covered.id,'capture consumed exactly once');await escape()
  await beginDelayed(empty,apex);await deliverDelayed(apex);assert.equal(await selected(),'','empty press stays empty with delayed vertex release');await escape()
  await beginDelayed(outer,empty);await deliverDelayed(empty);assert.equal(await selected(),outer.id,'18 px movement does not retarget delayed contextmenu')
  await textButton('Xassələr');assert.equal(await evaluate('document.querySelector(\'[aria-label="3D obyekt seç"]\').value'),outer.id,'Properties shows the committed semantic ID');await settle();assert.equal(await selected(),outer.id,'Properties focus preserves actual selection')
  await click('.geometry-properties-dialog header button')
  await right(empty);await escape()
  await beginDelayed(outer,outer)
  await pointer('mousePressed',empty.x,empty.y,{button:'left',buttons:1});await pointer('mouseReleased',empty.x,empty.y,{button:'left',buttons:0});await settle()
  await deliverDelayed(outer);assert.equal(await selected(),'','new unrelated pointer interaction invalidates old capture');await escape()
  await beginDelayed(outer,outer)
  await deliverDelayed(outer,'{...contextOrigin,pointerId:contextOrigin.pointerId+10}');assert.equal(await selected(),'','different pointer cannot consume the right-button capture')
  await deliverDelayed(outer);assert.equal(await selected(),outer.id,'matching event still consumes its own capture after an unrelated context event');await escape()
  await right(empty);await escape()
  await pointer('mousePressed',outer.x,outer.y,{button:'right',buttons:2})
  await evaluate(`document.querySelector('${viewport} canvas').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}))`)
  await pointer('mouseReleased',empty.x,empty.y,{button:'right',buttons:0});await settle()
  assert.equal(await selected(),'','cancelled right press cannot leak its vertex into contextmenu');await escape()
  console.log('TIMING MEASUREMENT',JSON.stringify({laterTaskApex:'selected',laterTaskEmpty:'empty',laterTaskDriftPx:18,consumedOnce:true,unrelatedPointerRejected:true,hoverMistakenForSelection:false,popupForwarding:false,cancelledCaptureReused:false}))
  // A lateral edge tests solid selection without the source polygon's coincident segment.
  const edge=source3.edges.find(e=>e.start===vertex.id||e.end===vertex.id),coords=id=>source3.points.find(p=>p.id===id).position,mid=coords(edge.start).map((v,i)=>(v+coords(edge.end)[i])/2)
  await right(await screen(mid));assert.equal(await selected(),source3.solids[0].id,'owned edge retains existing solid selection');await escape()
  const face=source3.faces.find(f=>f.boundary.length===3),center=[0,1,2].map(i=>face.boundary.reduce((sum,id)=>sum+coords(id)[i],0)/face.boundary.length)
  await right(await screen(center));assert.equal(await selected(),source3.solids[0].id,'owned face retains existing solid selection');await textButton('Xassələr');assert.ok(await evaluate('!!document.querySelector(".geometry-3d-solid-properties")'),'solid properties remain accessible');await click('.geometry-properties-dialog header button')
  const b=await box(viewport);await right({x:b.x+25,y:b.y+25});assert.equal(await selected(),'','3D empty space clears selection');await escape()
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),initialCamera,'right-click never moves camera')
  assert.deepEqual(await box(frame),initialFrame,'right-click never moves/resizes frame')
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled'),undo3,'3D selection creates no history entry')
  await click('[data-tool-3d="select"]');await left(await screen(vertex.position));assert.equal(await selected(),vertex.id,'3D left selection still works')
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[1].payload.source_data'),source3,'no construction or geometry changes')
  await evaluate('reloadEditor()');await until('document.querySelectorAll("[data-frame-id]").length===2');assert.deepEqual(await evaluate('savedRevision.blocks[1].payload.source_data'),source3,'save/reload preserves stable identities')
  console.log('PASS: pointerdown capture/18 px drift, empty press, cancellation, no popup forwarding, open Properties/focus, preserved 2D/3D picking, history/camera/frame isolation, left-click and mixed save/reload')
}
