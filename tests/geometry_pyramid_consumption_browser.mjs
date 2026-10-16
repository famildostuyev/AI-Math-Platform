import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {runScenePyramidAcceptance} from './geometry_scene_pyramid_browser.mjs'
export async function runPyramidConsumptionAcceptance(api){
  await runScenePyramidAcceptance(api)
  const {evaluate,until,textButton,click,pointer,send}=api,frame='[data-frame-id="frame-1"]',editor=`${frame} .geometry-3d-editor`,viewport=`${frame} .geometry-3d-viewport`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
  const fixtures=JSON.parse(await fs.readFile(new URL('./geometry_3d_pyramid_consumption_canonical.json',import.meta.url),'utf8')),source=fixtures.find(f=>f.name==='preserved-5').source
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  await evaluate(`window.consumptionPrevious=document.querySelector('${frame}');savedRevision.blocks[0].payload.source_data=${JSON.stringify(source)};reloadEditor()`)
  await until(`document.querySelector('${frame}')!==consumptionPrevious&&document.querySelector('${frame} svg')`)
  await evaluate(`document.querySelector('${frame}').focus()`);await key('F10','F10',8);await until(`document.querySelector('[data-frame-menu-owner="frame-1"] button')?.disabled===false`);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()==='3D ▾');if(!d.open)d.querySelector('summary').click()})()`)
  await click('[data-solid-3d="pyramid"]')
  assert.equal(await evaluate('!!document.querySelector(".geometry-3d-solid-properties")'),false)
  const point=await evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),s=scenePyramidScene,f=s.faces.find(f=>f.id==='source'),center=f.boundary.reduce((sum,id)=>sum.map((v,i)=>v+s.points.find(p=>p.id===id).position[i]/f.boundary.length),[0,0,0]),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),v=p.screen(p.view(center));return {x:b.x+v[0],y:b.y+v[1]}})()`)
  await pointer('mousePressed',point.x,point.y,{button:'left',buttons:1});await pointer('mouseReleased',point.x,point.y,{button:'left',buttons:0});await settle()
  const created=await evaluate('structuredClone(scenePyramidScene)')
  assert.equal(created.solids[0].parameters.base.kind,'face');assert.equal(created.solids[0].parameters.base.face_id,'source')
  for(const group of ['points','faces','linear_objects','annotations'])for(const object of source[group])assert.deepEqual(created[group].find(o=>o.id===object.id),object)
  assert.ok(await evaluate('document.body.innerText.includes("Mənbə poliqon paylaşılır və ya təhlükəsiz ayrıla bilmir; saxlanıldı.")'))
  await key('z','KeyZ',2);assert.deepEqual(await evaluate('scenePyramidScene'),source);await key('z','KeyZ',10);assert.deepEqual(await evaluate('scenePyramidScene'),created)
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),created)
  console.log('PASS: real Edge temporary polygon consumed atomically, owned base remains through M5 edits/reload, and externally attached face safely preserved with an explicit status message and stable Undo/Redo')
}
