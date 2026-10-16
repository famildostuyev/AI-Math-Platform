import assert from 'node:assert/strict'
import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
export async function runScenePyramidAcceptance({evaluate,until,textButton,click,pointer,send}){
  const frame='[data-frame-id="frame-1"]',editor=`${frame} .geometry-3d-editor`,viewport=`${frame} .geometry-3d-viewport`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const scene=()=>evaluate('structuredClone(scenePyramidScene)')
  const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
  const activate=async()=>{await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()==='3D ▾');if(!d.open)d.querySelector('summary').click()})()`);await click('[data-solid-3d="pyramid"]');await until(`document.querySelector('${editor}').dataset.activeTool==='pyramid'`)}
  const screen=async position=>evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),s=p.screen(p.view(${JSON.stringify(position)}));return {x:b.x+s[0],y:b.y+s[1]}})()`)
  const at=async pos=>{const p=await screen(pos);await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1});await pointer('mouseReleased',p.x,p.y,{button:'left',buttons:0});await settle()}
  const drag=async(slot,mode)=>{
    const positions=await evaluate(`(async()=>{const {pyramidApexDrag3D,pyramidBaseDrag3D}=await import('/src/components/geometry3dSolidAuthoring.ts'),s=scenePyramidScene,solid=s.solids[0],id=solid.features.find(f=>f.slot==='${slot}').entity_id,d=${mode==='base'?'pyramidBaseDrag3D':'pyramidApexDrag3D'}(s,id),end=${mode==='height'?'d.position.map((v,i)=>v+d.normal[i]*.5)':mode==='base'?'d.position.map((v,i)=>v+(d.base[0][i]-v)*.15)':'d.position.map((v,i)=>v+(i===0?.35:0))'};return {id,start:d.position,end}})()`)
    const start=await screen(positions.start),end=await screen(positions.end)
    await pointer('mouseMoved',start.x,start.y);await pointer('mousePressed',start.x,start.y,{button:'left',buttons:1,modifiers:mode==='height'?8:0})
    for(let i=1;i<=6;i++)await pointer('mouseMoved',start.x+(end.x-start.x)*i/6,start.y+(end.y-start.y)*i/6,{button:'left',buttons:1})
    await pointer('mouseReleased',end.x,end.y,{button:'left',buttons:0});await settle()
    assert.equal(await evaluate(`document.querySelector('${editor}').dataset.selectedId`),positions.id)
  }
  const reopen=async()=>{await evaluate(`document.querySelector('${frame}').focus()`);await key('F10','F10',8);await until(`document.querySelector('[data-frame-menu-owner="frame-1"] button')?.disabled===false`);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)}
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  await activate();assert.equal(await evaluate('!!document.querySelector(".geometry-3d-solid-properties")'),false);assert.equal(await evaluate('!!document.querySelector(".geometry-properties-dialog[open]")'),false)
  const camera=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
  await at([0,0,0]);assert.equal((await scene()).solids.length,0,'miss does not fall back to template')
  await createScenePyramid({evaluate,until,click,pointer})
  const created=await scene(),solid=created.solids[0],base=solid.parameters.base
  assert.equal(base.kind,'polygon');assert.equal(base.vertices.length,4);assert.equal(solid.parameters.height,2)
  assert.equal(created.faces.length,5);assert.equal(created.points.length,5);assert.equal(created.linear_objects.length,0)
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),camera)
  await key('z','KeyZ',2);assert.equal((await scene()).solids.length,0);assert.equal((await scene()).faces.length,1);assert.equal((await scene()).points.length,4)
  await key('z','KeyZ',10);assert.deepEqual(await scene(),created)
  await drag('v_4','horizontal');const horizontal=await scene();assert.notDeepEqual(horizontal.solids[0].parameters.apex_offset,[0,0]);assert.equal(horizontal.solids[0].parameters.height,2)
  await drag('v_4','height');const height=(await scene()).solids[0].parameters.height;assert.ok(Math.abs(height-2.5)<1e-5,`CDP height drag: ${height}`)
  await drag('v_1','base');const edited=await scene();assert.equal(edited.solids[0].parameters.base.kind,'polygon');assert.deepEqual(edited.solids[0].features,solid.features)
  assert.equal(edited.faces.length,5);assert.equal(edited.points.length,5);assert.equal(edited.linear_objects.length,0)
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),camera)
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),edited)
  await evaluate(`window.previousPyramidFrame=document.querySelector('${frame}');reloadEditor()`);await until(`document.querySelector('${frame}')!==previousPyramidFrame&&document.querySelector('${frame} svg')`);await reopen()
  assert.deepEqual(await scene(),edited)
  await drag('v_4','height');await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),edited,'Frame Cancel restores saved geometry')
  // Actual viewport picking on a non-XY source, without changing the working plane.
  const tilted=await evaluate(`(async()=>{const {createPlanarPath3D}=await import('/src/components/geometry3dAuthoring.ts'),{emptyGeometryScene3D}=await import('/src/components/geometry3dModel.ts');return createPlanarPath3D(emptyGeometryScene3D(),[[-2,-2],[2,-2],[2,2],[-2,2]].map(([x,y],i)=>({id:'tilted_'+i,position:[x,.8*y,.6*y+1]})),true,'tilted_face').scene})()`)
  await evaluate(`window.previousPyramidFrame=document.querySelector('${frame}');savedRevision.blocks[0].payload.source_data=${JSON.stringify(tilted)};reloadEditor()`);await until(`document.querySelector('${frame}')!==previousPyramidFrame&&document.querySelector('${frame} svg')`);await reopen();await activate();await at([0,0,1])
  assert.deepEqual((await scene()).solids[0].parameters.base,{kind:'polygon',vertices:tilted.faces[0].boundary.map(id=>tilted.points.find(p=>p.id===id).position)})
  assert.ok(!(await scene()).faces.some(f=>f.id==='tilted_face'))
  console.log('PASS: real Edge no legacy creation form, direct polygon consumption, missed click, editable owned base, tilted plane picking, single Undo/Redo, apex/Shift/base editing without a duplicate polygon, camera isolation, Apply/Cancel and reload (fixture HTTP)')
}
