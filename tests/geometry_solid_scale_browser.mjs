import assert from 'node:assert/strict'
import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
export async function runSolidScaleAcceptance({evaluate,until,textButton,click,pointer,send}){
  const frame='[data-frame-id="frame-1"]',viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const key=async(key,code,modifiers=0)=>{await evaluate(`document.querySelector('${viewport}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
  const scene=()=>evaluate('structuredClone(rotationScene)')
  const camera=()=>evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`)
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  await createScenePyramid({evaluate,until,click,pointer},[[-3,-1,0],[-1,-1,0],[-1,1,0],[-3,1,0]])
  await createScenePyramid({evaluate,until,click,pointer},[[1,-1,0],[3,-1,0],[3,1,0],[1,1,0]])
  const original=await scene(),ids=original.solids.map(s=>s.id);assert.equal(ids.length,2);assert.equal(original.faces.length,10)
  const vertices=(s,id)=>s.points.filter(p=>s.solids.find(v=>v.id===id).features.some(f=>f.entity_id===p.id))
  const select=async id=>{
    await click('[data-geometry-action="select"]')
    const point=await evaluate(`(async()=>{const {pickGeometry3D}=await import('/src/components/geometry3dAuthoring.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=JSON.parse(e.dataset.editingCamera);for(let y=30;y<b.height-30;y+=7)for(let x=30;x<b.width-30;x+=7){const h=pickGeometry3D(rotationScene,c,{x,y,width:b.width,height:b.height});if(h?.id===${JSON.stringify(id)})return {x:x+b.x,y:y+b.y}}throw Error('solid pick unavailable')})()`)
    await pointer('mousePressed',point.x,point.y,{button:'left',buttons:1});await pointer('mouseReleased',point.x,point.y,{button:'left',buttons:0});await until(`document.querySelector('${editor}').dataset.selectedId===${JSON.stringify(id)}`)
  }
  const drag=async(cancel=false,mode='resize')=>{
    if(mode!=='resize')await click(`[data-geometry-action="${mode}"]`);else await click('[data-geometry-action="select"]')
    const path=await evaluate(`(async()=>{const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect();if('${mode}'!=='resize')return {x:b.x+b.width/2,y:b.y+b.height/2,dx:48,dy:18};const {projectedSolidBounds3D}=await import('/src/components/geometry3dSolidBounds.ts'),{createProjection3D,add,sub,scale}=await import('/src/components/geometry3dProjection.ts'),c=JSON.parse(e.dataset.editingCamera),id=document.querySelector('${editor}').dataset.selectedId,q=projectedSolidBounds3D(rotationScene,c,b.width,b.height,id),p=createProjection3D(c,b.width,b.height),center=p.screen(p.view(q.pivot)),h=[...q.handles].sort((a,b)=>Math.hypot(b.screen[0]-center[0],b.screen[1]-center[1])-Math.hypot(a.screen[0]-center[0],a.screen[1]-center[1]))[0],target=p.screen(p.view(add(q.pivot,scale(sub(h.world,q.pivot),1.2)))),actual=e.querySelector('[data-resize-handle="'+h.index+'"]')?.getBoundingClientRect();if(!actual)throw Error('missing resize handle');return {x:actual.x+actual.width/2,y:actual.y+actual.height/2,dx:target[0]-h.screen[0],dy:target[1]-h.screen[1]}})()`)
    await pointer('mousePressed',path.x,path.y,{button:'left',buttons:1});await settle();assert.equal(await evaluate('solidGestureState.dragging'),true,JSON.stringify({path,state:await evaluate('solidGestureState')}));if(mode==='resize')assert.match(await evaluate('solidGestureState.message'),/Ölçünü/,JSON.stringify({path,state:await evaluate('solidGestureState')}));for(let i=1;i<=8;i++)await pointer('mouseMoved',path.x+path.dx*i/8,path.y+path.dy*i/8,{button:'left',buttons:1})
    if(mode==='resize')assert.ok(Math.hypot(path.dx,path.dy)>3,'resize test must cross the existing drag threshold')
    if(cancel)await key('Escape','Escape')
    await pointer('mouseReleased',path.x+path.dx,path.y+path.dy,{button:'left',buttons:0});await settle()
  }
  await select(ids[0]);assert.equal(await evaluate(`document.querySelectorAll('[data-solid-bounds]').length`),1);assert.equal(await evaluate(`document.querySelector('[data-solid-bounds]').dataset.solidBounds`),ids[0]);const cam=await camera();await drag(true);assert.deepEqual(await scene(),original)
  await drag();let first=await scene();assert.notDeepEqual(vertices(first,ids[0]),vertices(original,ids[0]));assert.deepEqual(vertices(first,ids[1]),vertices(original,ids[1]));assert.deepEqual(await camera(),cam)
  const lengths=s=>s.edges.filter(e=>e.id.startsWith(ids[0])).map(e=>Math.hypot(...s.points.find(p=>p.id===e.start).position.map((v,i)=>v-s.points.find(p=>p.id===e.end).position[i]))),ratios=lengths(first).map((v,i)=>v/lengths(original)[i]);assert.ok(ratios.every(r=>Math.abs(r-ratios[0])<1e-6));assert.ok(ratios[0]>1);
  await key('z','KeyZ',2);assert.deepEqual(await scene(),original);await key('z','KeyZ',10);assert.deepEqual(await scene(),first)
  await drag(false,'rotate_solid');const rotated=await scene();assert.deepEqual(vertices(rotated,ids[1]),vertices(first,ids[1]));assert.notDeepEqual(rotated.solids[0].frame.x_axis,first.solids[0].frame.x_axis);assert.deepEqual(await camera(),cam);first=rotated;await drag(false,'translate_solid');await drag();first=await scene();
  await select(ids[1]);await drag();const second=await scene();assert.deepEqual(vertices(second,ids[0]),vertices(first,ids[0]));assert.notDeepEqual(vertices(second,ids[1]),vertices(first,ids[1]));assert.deepEqual(await camera(),cam)
  await click('[data-tool-3d="camera"]');const b=await evaluate(`(()=>{const b=document.querySelector('${viewport}').getBoundingClientRect();return {x:b.x+b.width*.3,y:b.y+b.height*.5}})()`)
  await pointer('mousePressed',b.x,b.y,{button:'left',buttons:1});for(let i=1;i<=20;i++)await pointer('mouseMoved',b.x+i*3,b.y,{button:'left',buttons:1});await pointer('mouseReleased',b.x+60,b.y,{button:'left',buttons:0});await settle();assert.deepEqual(await scene(),second);assert.notDeepEqual(await camera(),cam)
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),second)
  await evaluate('reloadEditor()');await until(`document.querySelector('${frame} .geometry-3d-screen svg')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),second)
  const equal=await evaluate(`(()=>{const e=document.querySelector('${viewport}'),paths=c=>[...e.querySelectorAll(c+' path[data-id]')].map(p=>[p.dataset.id,p.getAttribute('d'),p.getAttribute('stroke-dasharray')]);return JSON.stringify(paths('.geometry-3d-screen'))===JSON.stringify(paths('.geometry-3d-print'))})()`);assert.equal(equal,true)
  await evaluate(`document.querySelector('${frame}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',modifiers:8})
  await until(`document.querySelector('[data-frame-menu-owner="frame-1"] button')?.disabled===false`);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  await select(ids[0]);await drag();assert.notDeepEqual((await scene()).solids[0].frame,second.solids[0].frame)
  await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),second)
  console.log('PASS: real Edge two consumed-base pyramids, actual solid picking, tight selected-only OBB, uniform A/B scaling, resize after rotation/translation, fixed camera, Escape, atomic Undo/Redo, camera orbit isolation, Apply/Cancel/reload and SVG/print parity')
}
