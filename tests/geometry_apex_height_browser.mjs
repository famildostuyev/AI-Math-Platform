import assert from 'node:assert/strict'
import {runApexDragAcceptance} from './geometry_apex_drag_browser.mjs'

export async function runApexHeightAcceptance(api){
  await runApexDragAcceptance(api,true)
  const {evaluate,until,pointer,send}=api,viewport='.geometry-3d-viewport'
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const source=await evaluate(`(async()=>{const {emptyGeometryScene3D}=await import('/src/components/geometry3dModel.ts'),{defaultSolid3D,createSolid3D,solidFrame3D}=await import('/src/components/geometry3dSolidAuthoring.ts');const d=defaultSolid3D('pyramid','tilted');d.parameters.height=-2;d.parameters.apex_offset=[.4,-.3];d.frame=solidFrame3D([0,0,0],[25,30,10]);const s=createSolid3D(emptyGeometryScene3D(),d).scene;s.print_camera.projection='perspective';return s})()`)
  await evaluate(`openUnframedScene(${JSON.stringify(source)})`);await until(`document.querySelector('${viewport} canvas')`)
  const positions=await evaluate(`(async()=>{const {pyramidApexDrag3D}=await import('/src/components/geometry3dSolidAuthoring.ts');const a=pyramidApexDrag3D(unframedScene,'tilted_v_4');return {start:a.position,end:a.position.map((v,i)=>v-.6*a.normal[i])}})()`)
  const screen=position=>evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),v=p.screen(p.view(${JSON.stringify(position)}));return {x:b.x+v[0],y:b.y+v[1]}})()`)
  const start=await screen(positions.start),end=await screen(positions.end),cameraBefore=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
  await pointer('mousePressed',start.x,start.y,{button:'left',buttons:1,modifiers:8})
  for(let i=1;i<=10;i++)await pointer('mouseMoved',start.x+(end.x-start.x)*i/10,start.y+(end.y-start.y)*i/10,{button:'left',buttons:1})
  await settle();assert.deepEqual(await evaluate('unframedScene'),source,'live draft does not mutate document')
  await pointer('mouseReleased',end.x,end.y,{button:'left',buttons:0});await settle()
  const result=await evaluate('structuredClone(unframedScene)')
  assert.ok(Math.abs(result.solids[0].parameters.height+2.6)<1e-5)
  assert.deepEqual(result.solids[0].parameters.apex_offset,source.solids[0].parameters.apex_offset)
  assert.deepEqual(result.points.filter(p=>p.id!=='tilted_v_4'),source.points.filter(p=>p.id!=='tilted_v_4'))
  assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),cameraBefore)
  // One keyboard Undo reverts the complete perspective drag.
  await evaluate(`document.querySelector('${viewport}').focus()`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90});await settle()
  assert.deepEqual(await evaluate('unframedScene'),source)
  console.log('PASS: real Edge perspective/rotated-base negative height, exact offset/base preservation, fixed Shift mode, camera isolation and keyboard Undo')
}
