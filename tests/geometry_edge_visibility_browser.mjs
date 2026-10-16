import assert from 'node:assert/strict'
import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
export async function runEdgeVisibilityAcceptance({evaluate,until,textButton,click,pointer,send}){
  const frame='[data-frame-id="frame-1"]',viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const key=async(modifiers)=>{await evaluate(`document.querySelector('${viewport}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers});await settle()}
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  await createScenePyramid({evaluate,until,click,pointer},[[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]])
  const original=await evaluate('structuredClone(visibilityScene)')
  const check=async()=>{
    await settle()
    const result=await evaluate(`(async()=>{const {projectScene3D,projectedEdgeStrokes3D,geometrySceneSVG3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=visibilityDraw.camera,q=projectScene3D(visibilityScene,c,b.width,b.height,true),strokes=projectedEdgeStrokes3D(q,c.projection),d=document.createElement('div');d.innerHTML=geometrySceneSVG3D({...visibilityScene,print_camera:c},b.width,b.height);return {actual:visibilityDraw.lines.map(l=>({id:l.id,hidden:l.hidden})),expected:strokes.filter(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>1e-6).map(s=>({id:s.id,hidden:s.hidden})),svg:[...d.querySelectorAll('path[data-id]')].map(p=>({id:p.dataset.id,hidden:p.hasAttribute('stroke-dasharray')})),all:strokes.map(s=>({id:s.id,hidden:s.hidden})),hidden:[...new Set(visibilityDraw.lines.filter(l=>l.hidden).map(l=>l.id))].sort()}})()`)
    assert.deepEqual(result.actual,result.expected,'actual Three.js materials match occlusion intervals')
    assert.deepEqual(result.svg,result.all,'SVG uses identical visible/hidden partitions')
    return result.hidden
  }
  for(const projection of ['orthographic','perspective'])for(const position of [[4,3,1],[-4,-3,1],[4,3,5]]){
    await evaluate(`visibilityNavigate({...visibilityScene.print_camera,projection:'${projection}',position:${JSON.stringify(position)},target:[0,0,0]})`)
    await until(`visibilityDraw?.camera.projection==='${projection}'&&visibilityDraw.camera.position.every((v,i)=>Math.abs(v-${JSON.stringify(position)}[i])<1e-8)`)
    const hidden=await check();if(position[2]===1)assert.ok(hidden.length>0)
    console.log('VISIBILITY',JSON.stringify({projection,position,hidden}))
    assert.deepEqual(await evaluate('visibilityScene'),original,'navigation does not mutate geometry or print camera')
  }
  // Derive the grazing direction from the actual clicked face, including pointer rounding.
  const grazing=await evaluate(`(async()=>{const {cross,sub,unit,dot,scale,add}=await import('/src/components/geometry3dProjection.ts'),s=visibilityScene,solid=s.solids[0],ids=new Map(solid.features.map(f=>[f.slot,f.entity_id])),f=s.faces.find(f=>f.id===ids.get('f_1')),v=f.boundary.map(id=>s.points.find(p=>p.id===id).position),normal=unit(cross(sub(v[1],v[0]),sub(v[2],v[0]))),center=v.reduce((sum,p)=>add(sum,scale(p,1/3)),[0,0,0]),dir=sub([4,3,3],scale(normal,dot([4,3,3],normal)));return {camera:{...s.print_camera,position:add(center,add(dir,scale(normal,1e-12))),target:center},edge:ids.get('e_5')}})()`)
  await evaluate(`visibilityNavigate(${JSON.stringify(grazing.camera)})`);await settle();await check()
  assert.equal(await evaluate(`visibilityDraw.lines.some(l=>l.id==='${grazing.edge}'&&l.hidden)`),false,'incident grazing face cannot hide a front-facing apex edge')
  await evaluate(`visibilityNavigate({...visibilityScene.print_camera,position:[4,3,1],target:[0,0,0]})`);await settle();await click('[data-tool-3d="camera"]')
  const before=await check(),box=await evaluate(`(()=>{const b=document.querySelector('${viewport} canvas').getBoundingClientRect();return {x:b.x+b.width*.3,y:b.y+b.height*.5}})()`)
  await pointer('mousePressed',box.x,box.y,{button:'left',buttons:1});for(let i=1;i<=80;i++)await pointer('mouseMoved',box.x+2*i,box.y,{button:'left',buttons:1});await pointer('mouseReleased',box.x+160,box.y,{button:'left',buttons:0})
  const after=await check();assert.notDeepEqual(after,before,'orbit changes actual dashed materials');assert.deepEqual(await evaluate('visibilityScene'),original)
  await key(2);assert.equal(await evaluate('visibilityScene.solids.length'),0);await key(10);assert.deepEqual(await evaluate('visibilityScene'),original);await check()
  await textButton('Sual üçün görünüşü təyin et');await settle()
  const saved=await evaluate('structuredClone(visibilityScene)')
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved)
  const equal=await evaluate(`(()=>{const e=document.querySelector('${viewport}'),paths=c=>[...e.querySelectorAll(c+' path[data-id]')].map(p=>({id:p.dataset.id,d:p.getAttribute('d'),hidden:p.hasAttribute('stroke-dasharray')}));return JSON.stringify(paths('.geometry-3d-screen'))===JSON.stringify(paths('.geometry-3d-print'))})()`)
  assert.equal(equal,true,'saved-view screen and print strokes agree after Apply')
  console.log('PASS: real Edge actual solid/dashed materials, both projections, grazing front apex, camera orbit reclassification, no geometry changes, source consumption, Undo/Redo, Apply and screen/print parity')
}
