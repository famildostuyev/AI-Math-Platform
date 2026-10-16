import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
import assert from 'node:assert/strict'
export async function runApexApplyAcceptance({evaluate,until,textButton,click,box,pointer,send}){
  const frame='[data-frame-id="frame-1"]',viewport=`${frame} .geometry-3d-viewport`,editor=`${frame} .geometry-3d-editor`
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const capture=()=>evaluate(`(async()=>{const {evaluateGeometryScene3D}=await import('/src/components/geometry3dModel.ts');const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),scene=document.querySelector('${editor}')?apexApplyScene:savedRevision.blocks[0].payload.source_data,camera=JSON.parse(e.dataset.editingCamera);const {projectScene3D}=await import('/src/components/geometry3dProjection.ts');return {scene:structuredClone(scene),evaluated:evaluateGeometryScene3D(scene).scene,camera,width:b.width,height:b.height,projected:projectScene3D(scene,camera,b.width,b.height).points}})()`)
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${viewport} canvas')`)
  await createScenePyramid({evaluate,until,click,pointer})
  for(const [heightMode,orbit] of [[true,false],[false,false],[true,true],[false,true]]){
    await click('[data-tool-3d="camera"]');const b=await box(`${viewport} canvas`),x=b.x+b.width*.5,y=b.y+b.height*.5
    if(orbit){await pointer('mousePressed',x,y,{button:'left',buttons:1});for(let i=1;i<=15;i++)await pointer('mouseMoved',x+i*2,y+i*.5,{button:'left',buttons:1});await pointer('mouseReleased',x+30,y+7.5,{button:'left',buttons:0});await settle()}
    await click('[data-tool-3d="select"]')
    const source=await capture(),apex=source.scene.points.at(-1)
    const points=await evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height);return [${JSON.stringify(apex.position)},${JSON.stringify(apex.position.map((v,i)=>v+(heightMode?(i===2?.6:0):(i===0?.4:0))))}].map(pos=>{const s=p.screen(p.view(pos));return {x:b.x+s[0],y:b.y+s[1]}})})()`)
    await pointer('mousePressed',points[0].x,points[0].y,{button:'left',buttons:1,modifiers:heightMode?8:0});await pointer('mouseMoved',points[1].x,points[1].y,{button:'left',buttons:1});await pointer('mouseReleased',points[1].x,points[1].y,{button:'left',buttons:0});await settle()
    if(heightMode&&!orbit){
      // Editing a saved print view must not replace an untouched session camera on Apply.
      await click('[aria-label="Sual kamerası X"]')
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:'7'})
      await textButton('Sual görünüşünü tətbiq et');await settle()
      assert.equal(await evaluate('apexApplyScene.print_camera.position[0]'),7)
      await click('.geometry-properties-dialog[open] header button')
    }
    const before=await capture();await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);await settle();const after=await capture()
    assert.deepEqual(after.scene,before.scene,'all serialized semantic data must survive Apply exactly')
    assert.deepEqual(after.evaluated,before.evaluated,'all reevaluated vertices/edges/faces/solid parameters must survive Apply')
    console.log('APPLY DIAGNOSTIC',JSON.stringify({mode:heightMode?'height':'horizontal',orbit,semanticEqual:true,viewportBefore:[before.width,before.height],viewportAfter:[after.width,after.height],cameraBefore:before.camera.position,cameraAfter:after.camera.position,maxProjectedVertexDelta:Math.max(...before.projected.map(p=>{const q=after.projected.find(q=>q.id===p.id);return Math.hypot(p.position[0]-q.position[0],p.position[1]-q.position[1])}))}))
    assert.deepEqual(after.camera,before.camera,'Apply must retain the session viewing camera')
    assert.deepEqual(after.projected,before.projected,'Apply must retain projected vertex positions')
    const svgCheck=await evaluate(`(async()=>{const {geometrySceneSVG3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),s=savedRevision.blocks[0].payload.source_data,c=JSON.parse(e.dataset.editingCamera),html=source=>{const d=document.createElement('div');d.innerHTML=source;return d.innerHTML};return {screen:e.querySelector('.geometry-3d-screen').innerHTML===html(geometrySceneSVG3D({...s,print_camera:c},b.width,b.height)),print:e.querySelector('.geometry-3d-print').innerHTML===html(geometrySceneSVG3D(s,b.width,b.height))}})()`)
    assert.deepEqual(svgCheck,{screen:true,print:true},'actual SVG output uses session camera on screen and saved camera for print')
    // The platform prints only the explicit PDF export document subtree.
    await evaluate(`document.querySelector('${frame}').classList.add('pdf-export-document')`)
    await send('Emulation.setEmulatedMedia',{media:'print'})
    assert.deepEqual(await evaluate(`(()=>{const e=document.querySelector('${viewport}');return {screen:getComputedStyle(e.querySelector('.geometry-3d-screen')).display,print:getComputedStyle(e.querySelector('.geometry-3d-print')).visibility}})()`),{screen:'none',print:'visible'})
    await send('Emulation.setEmulatedMedia',{media:''})
    await evaluate(`document.querySelector('${frame}').classList.remove('pdf-export-document')`)
    await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${viewport} canvas')`)
  }
  console.log('PASS: height/horizontal apex Apply preserves complete semantic scene, reevaluated topology, camera and projected vertices after orbit')
}
