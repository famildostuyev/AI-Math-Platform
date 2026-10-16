import assert from 'node:assert/strict'
import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
export async function runBaseAlignmentAcceptance({evaluate,until,textButton,click,pointer,send}){
  const frame='[data-frame-id="frame-1"]',viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await settle()}
  const reopen=async()=>{await evaluate(`document.querySelector('${frame}').focus()`);await key('F10','F10',8);await until(`document.querySelector('[data-frame-menu-owner="frame-1"] button')?.disabled===false`);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)}
  const check=async plane=>{
    await settle()
    const d=await evaluate(`(async()=>{const {createProjection3D,scenePrimitives3D,displayPrimitives3D}=await import('/src/components/geometry3dProjection.ts'),s=baseAlignmentScene,solid=s.solids[0],b=solid.parameters.base,e=document.querySelector('${viewport}'),box=e.getBoundingClientRect(),camera=JSON.parse(e.dataset.editingCamera),p=createProjection3D(camera,box.width,box.height),points=new Map(s.points.map(p=>[p.id,p.position]));return {scene:structuredClone(s),pairs:b.vertices.map((position,i)=>{const baseId=solid.features.find(f=>f.slot==='v_'+i).entity_id,a=position,b=points.get(baseId),renderSource=baseAlignmentDraw.find(o=>o.id===baseId&&o.type==='Points'),renderBase=baseAlignmentDraw.find(o=>o.id===baseId&&o.type==='Points');return {source:a,base:b,projectedSource:p.screen(p.view(a)),projectedBase:p.screen(p.view(b)),renderSource:renderSource?.positions,renderBase:renderBase?.positions}}),lineCount:baseAlignmentDraw.filter(o=>o.type==='Line').length,loopCount:baseAlignmentDraw.filter(o=>o.type==='LineLoop').length}})()`)
    for(const pair of d.pairs){assert.deepEqual(pair.base,pair.source);assert.deepEqual(pair.projectedBase,pair.projectedSource);assert.deepEqual(pair.renderBase,pair.source.map(Math.fround));assert.ok(pair.renderBase)}
    assert.equal(d.lineCount,8);assert.equal(d.loopCount,0)
    console.log('ALIGNMENT',JSON.stringify({plane,pairs:d.pairs.map(p=>({source:p.source,base:p.base})),maxWorldDelta:0,maxPixelDelta:0,strokes:8,faceOutlineLoops:0}))
    return d.scene
  }
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  for(const plane of ['XY','XZ','YZ']){
    if(plane!=='XY'){
      const empty=await evaluate(`(async()=>{const {emptyGeometryScene3D}=await import('/src/components/geometry3dModel.ts');return emptyGeometryScene3D()})()`)
      await evaluate(`window.alignmentPrevious=document.querySelector('${frame}');savedRevision.blocks[0].payload.source_data=${JSON.stringify(empty)};reloadEditor()`);await until(`document.querySelector('${frame}')!==alignmentPrevious&&document.querySelector('${frame} svg')`);await reopen()
      await evaluate(`(()=>{const e=document.querySelector('[aria-label="3D iş müstəvisi"]');e.value='${plane}';e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    }
    const vertices=[[1.3,-2.1],[3.7,-1.4],[4.1,1.2],[.8,.6]].map(([x,y])=>plane==='XY'?[x,y,0]:plane==='XZ'?[x,0,y]:[0,x,y])
    await createScenePyramid({evaluate,until,click,pointer},vertices);await until('baseAlignmentDraw?.filter(o=>o.type==="Line").length===8')
    const original=await check(plane)
    await key('z','KeyZ',2);assert.equal(await evaluate('baseAlignmentScene.solids.length'),0);await key('z','KeyZ',10);await check(plane)
    await click('[data-tool-3d="camera"]');const box=await evaluate(`(()=>{const b=document.querySelector('${viewport} canvas').getBoundingClientRect();return {x:b.x+b.width*.3,y:b.y+b.height*.55}})()`)
    await pointer('mousePressed',box.x,box.y,{button:'left',buttons:1});for(let i=1;i<=20;i++)await pointer('mouseMoved',box.x+i*2,box.y+i*.3,{button:'left',buttons:1});await pointer('mouseReleased',box.x+40,box.y+6,{button:'left',buttons:0});await check(plane)
    await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),original)
    await evaluate(`window.alignmentPrevious=document.querySelector('${frame}');reloadEditor()`);await until(`document.querySelector('${frame}')!==alignmentPrevious&&document.querySelector('${frame} svg')`);await reopen();await until('baseAlignmentDraw?.filter(o=>o.type==="Line").length===8');await check(plane)
    await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  }
  console.log('PASS: real Edge asymmetric direct quadrilaterals, exact source/base world and GPU positions, XY/XZ/YZ, orbit, single Undo/Redo, one stroke per edge, Apply/reload')
}
