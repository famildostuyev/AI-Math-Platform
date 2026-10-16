import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
export async function runGeometry3DM4Acceptance({evaluate,until,textButton,click,send,drag,pointer}){
  const originalButton=textButton
  textButton=async text=>{if(text==='Çərçivə əlavə et'||text==='3D səhnə əlavə et')return originalButton(text);await until(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`);return originalButton(text)}
  const frame='[data-frame-id="frame-1"]',editor=`${frame} .geometry-3d-editor`
  const input=async(name,value)=>{const selector=`[aria-label="${name}"]`;await until(`document.querySelector('${selector}')`);await click(selector);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:String(value)})}
  const select=async(name,value)=>{await until(`document.querySelector('[aria-label="${name}"]')`);return evaluate(`(()=>{const e=document.querySelector('[aria-label="${name}"]');e.value='${value}';e.dispatchEvent(new Event('change',{bubbles:true}))})()`)}
  const inspector=async()=>{if(!await evaluate(`document.querySelector('.geometry-3d-inspector').open`))await click('.geometry-3d-inspector summary')}
  const selected=()=>evaluate(`document.querySelector('${editor}').dataset.selectedId`)
  const save=async()=>{await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`);const result=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)');await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${editor}')`);return result}
  // Compatibility fixtures exercise saved template/face definitions, not the retired creation UI.
  const loadPyramid=async(id,base=null)=>{
    await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
    await evaluate(`(async()=>{const {defaultSolid3D,createSolid3D}=await import('/src/components/geometry3dSolidAuthoring.ts'),d=defaultSolid3D('pyramid','${id}'),base=${JSON.stringify(base)};if(base){const face=savedRevision.blocks[0].payload.source_data.faces.find(f=>f.id===base.face_id);d.parameters={sides:face.boundary.length,height:2,base:{kind:'face',face_id:face.id,point_ids:[...face.boundary]},apex_offset:[0,0]}}const result=createSolid3D(savedRevision.blocks[0].payload.source_data,d);if(!result)throw Error('Invalid compatibility fixture');savedRevision.blocks[0].payload.source_data=result.scene;globalThis.m4PreviousFrame=document.querySelector('${frame}');reloadEditor()})()`)
    await until(`document.querySelector('${frame}')!==m4PreviousFrame&&document.querySelector('${frame} svg')`)
    await evaluate(`document.querySelector('${frame}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8,windowsVirtualKeyCode:121});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',windowsVirtualKeyCode:121})
    await until(`document.querySelector('[data-frame-menu-owner="frame-1"] button')?.disabled===false`);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${editor}')`)
    await inspector();await select('3D obyekt seç',id)
  }
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${frame} canvas')`)
  await click('[data-solid-3d="cube"]');await input('Cisim side',3);await textButton('Cisim yarat');const cubeId=await selected();assert.ok(cubeId)
  await inspector();await input('Cisim side',4);await input('Cisim origin0',1);await input('Cisim angle2',30);await textButton('Cismə tətbiq et')
  await click('[aria-label="Geri al"]');await until('document.querySelector(\'[aria-label="Cisim side"]\').value==="3"');await click('[aria-label="Yenidən et"]');await until('document.querySelector(\'[aria-label="Cisim side"]\').value==="4"')
  await input('Cisim side',0);await textButton('Cismə tətbiq et');await until('document.querySelector(".geometry-3d-solid-properties [role=alert]")');await input('Cisim side',4)
  let scene=await save();const cube=scene.solids.find(s=>s.id===cubeId),cubeFeatures=structuredClone(cube.features);assert.equal(cube.parameters.side,4);assert.deepEqual(cube.frame.origin,[1,0,0]);assert.equal(cube.features.length,26)
  const faceCenter=await evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts');const scene=${JSON.stringify(scene)},f=scene.faces.find(f=>f.id==='${cubeFeatures.find(f=>f.slot==='f_1').entity_id}'),coords=f.boundary.map(id=>scene.points.find(p=>p.id===id).position),center=[0,1,2].map(i=>coords.reduce((v,p)=>v+p[i],0)/coords.length),el=document.querySelector('${frame} .geometry-3d-viewport');el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect(),c=JSON.parse(el.dataset.editingCamera),p=createProjection3D(c,b.width,b.height),v=p.screen(p.view(center));return {x:b.x+v[0],y:b.y+v[1]}})()`)
  await pointer('mousePressed',faceCenter.x,faceCenter.y,{button:'left',buttons:1});await pointer('mouseReleased',faceCenter.x,faceCenter.y,{button:'left'});await until(`document.querySelector('${editor}').dataset.selectedId==='${cubeId}'`)
  await click('[data-solid-3d="cuboid"]');for(const [key,v]of [['width',3],['depth',2],['height',4]])await input(`Cisim ${key}`,v);await textButton('Cisim yarat');const cuboidId=await selected();await inspector();await input('Cisim height',5);await textButton('Cismə tətbiq et');scene=await save();assert.equal(scene.solids.find(s=>s.id===cuboidId).parameters.height,5)
  await click('[data-solid-3d="prism"]');await textButton('Cisim yarat');const triangular=await selected();scene=await save();assert.equal(scene.solids.find(s=>s.id===triangular).parameters.sides,3)
  await click('[data-solid-3d="prism"]');await input('Cisim sides',6);await textButton('Cisim yarat');const hexagonal=await selected();scene=await save();assert.equal(scene.solids.find(s=>s.id===hexagonal).features.length,38)
  const pyramidId='legacy_template_pyramid';await loadPyramid(pyramidId);await input('Cisim apex0',1);await input('Cisim height',3);await textButton('Cismə tətbiq et');scene=await save();assert.deepEqual(scene.solids.find(s=>s.id===pyramidId).parameters.apex_offset,[1,0]);assert.equal(scene.solids.find(s=>s.id===pyramidId).parameters.height,3)
  await inspector();await select('3D obyekt seç',pyramidId);for(let i=0;i<3;i++)await input(`Cisim worldApex${i}`,[0,0,4][i]);await textButton('Apex mövqeyini tətbiq et');scene=await save();assert.ok(Math.hypot(...scene.points.find(p=>p.id===`${pyramidId}_v_4`).position.map((v,i)=>v-[0,0,4][i]))<1e-9)
  // A teacher creates a non-regular closed polygon with M3 points and segments.
  await click('[data-tool-3d="select"]');await inspector();const points=[]
  for(const pos of [[-3,-2,0],[-1,-2,0],[-.5,0,0],[-3,1,0]]){
    for(let i=0;i<3;i++)await input(`3D nöqtə ${['X','Y','Z'][i]}`,pos[i]);await textButton('Koordinatla nöqtə yarat');points.push(await selected())
  }
  await click('[data-tool-3d="segment"]');for(let i=0;i<4;i++){await select('3D obyekt seç',points[i]);await select('3D obyekt seç',points[(i+1)%4])}
  await click('[data-solid-3d="prism"]');await select('Cisim əsas rejimi','existing');for(const id of points){await select('Cisim poliqon nöqtəsi',id);await textButton('Əsasa nöqtə əlavə et')}
  await textButton('Cisim yarat');const existingPrism=await selected();scene=await save();const base=scene.solids.find(s=>s.id===existingPrism).parameters.base;assert.equal(base.kind,'face');assert.deepEqual(base.point_ids,points)
  const existingPyramid='legacy_source_pyramid';await loadPyramid(existingPyramid,base);scene=await save();assert.equal(scene.solids.find(s=>s.id===existingPyramid).parameters.base.face_id,base.face_id)
  await inspector();await select('3D obyekt seç',cubeId);assert.equal(await selected(),cubeId);assert.equal(await evaluate('document.querySelector(".geometry-3d-solid-properties legend").textContent.includes("Kub")'),true)
  assert.deepEqual(scene.solids.find(s=>s.id===cubeId).features,cubeFeatures)
  await select('3D obyekt seç',cubeFeatures.find(f=>f.slot==='v_0').entity_id);assert.ok(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Nöqtəyə tətbiq et").disabled'))
  await click('[data-tool-3d="camera"]');await drag(`${frame} canvas`,20,15);await textButton('Sual üçün görünüşü təyin et');scene=await save()
  assert.deepEqual(scene.solids.find(s=>s.id===cubeId).features,cubeFeatures)
  const svg=await evaluate(`document.querySelector('${frame} .geometry-3d-static').innerHTML`);assert.ok(svg.includes(cubeFeatures.find(f=>f.slot==='f_0').entity_id))
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${editor}')`)
  await textButton('Çərçivə əlavə et');await until('document.querySelector(".geometry-authoring-board")');await until('document.querySelector(\'[data-frame-menu-owner="frame-2"] button\')?.disabled===false');await click('[data-frame-id="frame-2"] .visual-frame__actions button');await until('!document.querySelector(".geometry-authoring-board")')
  await evaluate('reloadEditor()');await until(`document.querySelector('${frame} svg')`);assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),scene);assert.equal(await evaluate('savedRevision.blocks[1].payload.source_data.schema_version'),1)
  // Production unframed editor also edits and safely deletes the solid.
  await evaluate(`openUnframedScene(${JSON.stringify(scene)})`);await until('document.querySelector(".geometry-3d-viewport canvas")');await click('.geometry-3d-inspector summary');await select('3D obyekt seç',points[1]);await input('3D nöqtə X',-.8);await textButton('Nöqtəyə tətbiq et');await until(`Math.abs(unframedScene.points.find(p=>p.id==='${existingPrism}_v_1').position[0]+.8)<1e-9`)
  assert.equal(await evaluate('document.querySelector(".geometry-3d-viewport").dataset.webglFallback'),'false')
  await select('3D obyekt seç',existingPyramid);await input('Cisim worldApex2',-2);await textButton('Apex mövqeyini tətbiq et');await until(`unframedScene.solids.find(s=>s.id==='${existingPyramid}').parameters.height===-2`)
  await select('3D obyekt seç',existingPrism);await input('Cisim direction2',-1);await textButton('Cismə tətbiq et');await until(`unframedScene.points.find(p=>p.id==='${existingPrism}_v_4').position[2]===-2`)
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(os.tmpdir(),'geometry-3d-m4-acceptance.png'),Buffer.from(screenshot.result.data,'base64'))
  await select('3D obyekt seç',cubeId);await textButton('3D seçiləni sil');await until(`!unframedScene.solids.some(s=>s.id==='${cubeId}')`);assert.ok(await evaluate(`unframedScene.points.some(p=>p.id==='${cubeFeatures.find(f=>f.slot==='v_0').entity_id}')`))
  await evaluate('document.querySelector(".geometry-3d-viewport").focus({preventScroll:true})');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90});await until(`unframedScene.solids.some(s=>s.id==='${cubeId}')`);assert.deepEqual(await evaluate(`unframedScene.solids.find(s=>s.id==='${cubeId}').features`),cubeFeatures)
  console.log('PASS: real Edge M4 cube/cuboid editing, triangle/hexagon prisms, template/existing polygon prism/pyramid, apex/height, stable IDs, invalid rejection, Undo/Redo, camera/print SVG, mixed save/reload and unframed safe deletion (fixture API)')
}
