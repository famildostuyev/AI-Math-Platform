import {exerciseFacePoint} from './geometry_face_points_browser.mjs'
import {exerciseEdgePoint} from './geometry_edge_points_browser.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'

/** Production editor + native fetch through a local backend proxy. No fixture responses. */
export async function runM5RealAcceptance({evaluate,until,textButton,click,pointer,send}){
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until('document.querySelector(".geometry-3d-viewport canvas")')
  const frameId=await evaluate('document.querySelector("[data-frame-id]").dataset.frameId'),frame=`[data-frame-id="${frameId}"]`,viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const scene=()=>evaluate('structuredClone(rotationScene)'),camera=()=>evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`)
  const key=async(key,code,modifiers=0)=>{await evaluate(`document.querySelector('${viewport}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
  const undo=()=>key('z','KeyZ',2),redo=()=>key('z','KeyZ',10)
  await createScenePyramid({evaluate,until,click,pointer},[[-3,-1,0],[-1,-1,0],[-1,1,0],[-3,1,0]])
  const id=(await scene()).solids[0].id
  await createScenePyramid({evaluate,until,click,pointer},[[1,-1,0],[3,-1,0],[3,1,0],[1,1,0]])
  if(process.argv.includes('--edge-points'))await exerciseEdgePoint({evaluate,until,textButton,click,pointer,send})
  if(process.argv.includes('--face-points'))await exerciseFacePoint({evaluate,until,textButton,click,pointer,send})
  const original=await scene(),other=original.solids.find(s=>s.id!==id).id,initialCamera=await camera(),features=original.solids.find(s=>s.id===id).features
  const otherPoints=s=>s.points.filter(p=>s.solids.find(v=>v.id===other).features.some(f=>f.entity_id===p.id))
  const select=async()=>{
    await click('[data-geometry-action="select"]')
    const point=await evaluate(`(async()=>{const {pickGeometry3D}=await import('/src/components/geometry3dAuthoring.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=JSON.parse(e.dataset.editingCamera);for(let y=30;y<b.height-30;y+=7)for(let x=30;x<b.width-30;x+=7)if(pickGeometry3D(rotationScene,c,{x,y,width:b.width,height:b.height})?.id==='${id}')return {x:b.x+x,y:b.y+y};throw Error('solid unavailable')})()`)
    await pointer('mousePressed',point.x,point.y,{button:'left',buttons:1});await pointer('mouseReleased',point.x,point.y,{button:'left',buttons:0});await until(`document.querySelector('${editor}').dataset.selectedId==='${id}'`)
  }
  async function drag(mode,{cancel=false,noOp=false}={}){
    await click(`[data-geometry-action="${mode==='scale'?'select':mode+'_solid'}"]`)
    const path=await evaluate(`(async()=>{const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect();if('${mode}'!=='scale')return {x:b.x+b.width/2,y:b.y+b.height/2,dx:32,dy:12};const {projectedSolidBounds3D}=await import('/src/components/geometry3dSolidBounds.ts'),{createProjection3D,add,sub,scale}=await import('/src/components/geometry3dProjection.ts'),c=JSON.parse(e.dataset.editingCamera),q=projectedSolidBounds3D(rotationScene,c,b.width,b.height,'${id}'),p=createProjection3D(c,b.width,b.height),center=p.screen(p.view(q.pivot)),h=[...q.handles].sort((a,b)=>Math.hypot(b.screen[0]-center[0],b.screen[1]-center[1])-Math.hypot(a.screen[0]-center[0],a.screen[1]-center[1]))[0],target=p.screen(p.view(add(q.pivot,scale(sub(h.world,q.pivot),1.15)))),r=e.querySelector('[data-resize-handle="'+h.index+'"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,dx:target[0]-h.screen[0],dy:target[1]-h.screen[1]}})()`)
    await pointer('mousePressed',path.x,path.y,{button:'left',buttons:1});await settle();assert.equal(await evaluate('solidGestureState.dragging'),true)
    if(!noOp)for(let i=1;i<=6;i++)await pointer('mouseMoved',path.x+path.dx*i/6,path.y+path.dy*i/6,{button:'left',buttons:1})
    if(cancel)await key('Escape','Escape')
    await pointer('mouseReleased',path.x+(noOp?0:path.dx),path.y+(noOp?0:path.dy),{button:'left',buttons:0});await settle()
  }
  async function check(){
    const s=await scene();assert.deepEqual(otherPoints(s),otherPoints(original));assert.deepEqual(s.solids.find(s=>s.id===other),original.solids.find(s=>s.id===other));assert.deepEqual(s.solids.find(s=>s.id===id).features,features);assert.deepEqual(await camera(),initialCamera)
    assert.ok(await evaluate(`(async()=>{const {evaluateGeometryScene3D}=await import('/src/components/geometry3dModel.ts'),{projectedSolidBounds3D}=await import('/src/components/geometry3dSolidBounds.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),q=projectedSolidBounds3D(rotationScene,JSON.parse(e.dataset.editingCamera),b.width,b.height,'${id}');return evaluateGeometryScene3D(rotationScene).status==='ok'&&document.querySelectorAll('[data-solid-bounds]').length===1&&document.querySelector('[data-solid-bounds]').dataset.solidBounds==='${id}'&&q.handles.every(h=>{const r=e.querySelector('[data-resize-handle="'+h.index+'"]').getBoundingClientRect();return Math.hypot(r.x+r.width/2-b.x-h.x,r.y+r.height/2-b.y-h.y)<.1})})()`))
    return s
  }
  await select();const states=[original]
  for(const mode of ['rotate','translate','scale','rotate','translate']){
    const previous=await scene();await drag(mode,{cancel:true});assert.deepEqual(await scene(),previous);await drag(mode,{noOp:true});assert.deepEqual(await scene(),previous);await drag(mode);states.push(await check())
  }
  for(let i=4;i>=0;i--){await undo();assert.deepEqual(await scene(),states[i])}
  for(let i=1;i<=5;i++){await redo();assert.deepEqual(await scene(),states[i])}
  await undo();await drag('translate');const branch=await check();await redo();assert.deepEqual(await scene(),branch,'new edit invalidates Redo')
  // Save a view different from the interactive camera to prove print-camera separation.
  await textButton('Üst');await textButton('Sual üçün görünüşü təyin et');await textButton('İzometrik');await settle()
  async function applySaveReload(expectCreate=false){
    const expected=await scene();await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
    await textButton('Yadda saxla');const response=await evaluate('realRevision()');assert.deepEqual(response.blocks.find(b=>b.id===frameId).payload.source_data,expected)
    const statuses=await evaluate('realResponses.filter(r=>r.method!=="GET").map(r=>({method:r.method,status:r.status,path:new URL(r.url,location.origin).pathname}))');if(expectCreate)assert.ok(statuses.some(r=>r.method==='POST'&&r.status===201));assert.ok(statuses.some(r=>r.method==='PATCH'&&r.status===200))
    await send('Page.reload',{ignoreCache:true});await until(`document.querySelector('${frame} .geometry-3d-screen svg')`)
    const loaded=await evaluate('realRevision()');assert.deepEqual(loaded.blocks.find(b=>b.id===frameId).payload.source_data,expected)
    assert.ok(await evaluate(`(async()=>{const {geometrySceneSVG3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),s=savedRevision.blocks.find(b=>b.id==='${frameId}').payload.source_data,d=document.createElement('div');d.innerHTML=geometrySceneSVG3D(s,b.width,b.height);const paths=n=>[...n.querySelectorAll('path[data-id]')].map(p=>[p.dataset.id,p.getAttribute('d'),p.getAttribute('stroke-dasharray')]);return JSON.stringify(paths(d))===JSON.stringify(paths(e.querySelector('.geometry-3d-print')))&&JSON.stringify(paths(e.querySelector('.geometry-3d-screen')))===JSON.stringify(paths(d))&&!e.querySelector('[data-solid-bounds]')})()`))
    console.log('PASS: real HTTP Create/Update/GET and full browser reload; saved-camera SVG/print verified')
    return {scene:expected,statuses}
  }
  const first=await applySaveReload(true)
  await evaluate(`document.querySelector('${frame}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',modifiers:8});await until(`document.querySelector('[data-frame-menu-owner="${frameId}"] button')?.disabled===false`);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  assert.deepEqual(await scene(),first.scene);await textButton('Həndəsə');await select();await drag('translate');await drag('scale')
  assert.deepEqual(otherPoints(await scene()),otherPoints(original))
  // Print CSS must hide selection chrome even while actively editing.
  await send('Emulation.setEmulatedMedia',{media:'print'});assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-solid-bounds]")).display'),'none');await send('Emulation.setEmulatedMedia',{media:''})
  const second=await applySaveReload()
  const statuses=[...first.statuses,...second.statuses];await fs.writeFile(process.env.M5_REAL_OUTPUT,JSON.stringify({frameId,first:first.scene,second:second.scene,statuses}))
  console.log('PASS: real Edge five combined drags, per-operation isolation/IDs/validity/tight bounds, cancellations/no-op, exact history order and Redo invalidation, second edit/save/reload, print chrome exclusion')
}
