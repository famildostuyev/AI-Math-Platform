import assert from 'node:assert/strict'
export async function runUnifiedGeometryMenuAcceptance({evaluate,until,textButton,click,box,pointer,delay,send}){
  const ribbon='.universal-editor-geometry-ribbon',f2='[data-frame-id="frame-1"]',f3='[data-frame-id="frame-2"]'
  const menu=async label=>{await until(`(()=>{const d=[...document.querySelectorAll('${ribbon} > details')].find(d=>d.querySelector('summary').textContent.trim().replace(/\\s*▾$/,'')===${JSON.stringify(label)});return d&&d.querySelector('summary').getAttribute('aria-disabled')!=='true'})()`);await evaluate(`(()=>{const d=[...document.querySelectorAll('${ribbon} > details')].find(d=>d.querySelector('summary').textContent.trim().replace(/\\s*▾$/,'')===${JSON.stringify(label)});if(!d)throw Error('Missing menu');if(!d.open)d.querySelector('summary').click()})()`);await until(`!![...document.querySelectorAll('${ribbon} > details[open]')].find(d=>d.querySelector('summary').textContent.includes(${JSON.stringify(label)}))`)}
  const action=async(code,group)=>{if(group)await menu(group);await click(`${ribbon} [data-geometry-action="${code}"]`);await until(`document.querySelector('${ribbon} [data-geometry-action="${code}"]').getAttribute('aria-pressed')==='true'`)}
  const choose=async id=>{await evaluate(`(()=>{const s=document.querySelector('[aria-label="3D obyekt seç"]');s.value='${id}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(50)}
  const input=async(name,value)=>{await click(`[aria-label="${name}"]`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:2,windowsVirtualKeyCode:65});await send('Input.insertText',{text:String(value)})}
  const save=async(frame)=>{await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${frame} .geometry-editor')&&!document.querySelector('${frame} .geometry-3d-editor')`)}
  await textButton('Həndəsə')
  assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="point"]').disabled`),true)
  assert.equal(await evaluate(`[...document.querySelectorAll('${ribbon} button')].some(b=>b.textContent==='3D səhnə əlavə et')`),false)
  await menu('Çərçivə əlavə et');assert.deepEqual(await evaluate(`[...document.querySelectorAll('${ribbon} > details[open] button')].map(b=>b.textContent)`),['2D çərçivə','3D çərçivə']);assert.equal(await evaluate('requests.length'),0)
  await textButton('2D çərçivə');await until(`document.querySelector('${f2} .geometry-authoring-board svg')`)
  assert.equal(await evaluate('savedRevision.blocks[0].payload.source_data.schema_version'),1)
  for(const code of ['line','directed_line','segment','vector'])await action(code,'Xətt')
  await action('point');await evaluate(`document.querySelector('${f2}').scrollIntoView({block:'center'})`)
  const b=await box(`${f2} .geometry-authoring-board`)
  for(const [x,y]of [[80,90],[200,90]]){await pointer('mousePressed',b.x+x,b.y+y,{button:'left',clickCount:1});await pointer('mouseReleased',b.x+x,b.y+y,{button:'left',clickCount:1});await delay(120)}
  await until(`document.querySelectorAll('${f2} svg ellipse').length===2`)
  await action('segment','Xətt');await click(`${f2} svg ellipse:nth-of-type(1)`);await click(`${f2} svg ellipse:nth-of-type(2)`)
  await menu('Müstəvi fiqurları');assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="triangle"]').disabled`),false)
  await menu('3D');assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="cube"]').disabled`),false,'3D tools offer a separate frame without writing into V1')
  await save(f2);const two=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)');assert.equal(two.points.length,2);assert.equal(two.segments.length,1)
  assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="point"]').disabled`),true,'saved frame alone is not an editing target')
  await menu('Çərçivə əlavə et');await textButton('3D çərçivə');await until(`document.querySelector('${f3} .geometry-3d-viewport canvas')`)
  assert.equal(await evaluate('savedRevision.blocks[1].payload.source_data.schema_version'),2)
  assert.equal(await evaluate(`document.querySelectorAll('${ribbon} [data-geometry-action="point"]').length`),1)
  assert.equal(await evaluate(`document.querySelectorAll('${ribbon} > button[data-tool-3d]').length`),4,'shared Select/Point and accepted M5 rotation/translation remain direct actions')
  assert.equal(await evaluate(`document.querySelectorAll('${ribbon} > button[data-solid-3d]').length`),0)
  await action('point');await click(`${f3} .geometry-3d-inspector summary`)
  const ids=[]
  for(const pos of [[0,0,0],[2,0,0],[0,2,0]]){for(let i=0;i<3;i++)await input(`3D nöqtə ${['X','Y','Z'][i]}`,pos[i]);await textButton('Koordinatla nöqtə yarat');ids.push(await evaluate(`document.querySelector('${f3} .geometry-3d-editor').dataset.selectedId`))}
  for(const code of ['line','directed_line','segment','vector']){await action(code,'Xətt');if(code==='directed_line')assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="directed_line"]').textContent`),'Şüa');await choose(ids[0]);await choose(ids[1])}
  await menu('Müstəvi fiqurları');assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="triangle"]').disabled`),false)
  await action('plane','3D');for(const id of ids)await choose(id)
  for(const code of ['cube','cuboid','prism']){await menu('3D');await click(`${ribbon} [data-solid-3d="${code}"]`);await until('document.querySelector(".geometry-3d-solid-properties")');await textButton('Cisim panelini bağla')}
  await menu('3D');await click(`${ribbon} [data-solid-3d="pyramid"]`);await until(`document.querySelector('${f3} .geometry-3d-editor').dataset.activeTool==='pyramid'`);assert.equal(await evaluate('!!document.querySelector(".geometry-3d-solid-properties")'),false)
  await menu('3D');assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="cylinder"]').disabled`),false)
  assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="cone"]').disabled`),false,'implemented cone authoring remains enabled')
  for(const label of ['Sfera','Düzgün n-bucaqlı kəsik piramida'])assert.equal(await evaluate(`[...document.querySelectorAll('${ribbon} button')].find(b=>b.textContent===${JSON.stringify(label)}).disabled`),true)
  await click(`${ribbon} [data-solid-3d="cube"]`);await until('document.querySelector(".geometry-3d-solid-properties")');await textButton('Cisim yarat')
  await save(f3);const three=await evaluate('structuredClone(savedRevision.blocks[1].payload.source_data)');assert.deepEqual(three.linear_objects.map(l=>l.kind).sort(),['line','ray','segment','vector']);assert.equal(three.planes.length,1);assert.equal(three.solids[0].kind,'cube');assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),two,'3D tools never mutate 2D data')
  await click(f2);await click(`${f2} .visual-frame__actions button`);await until(`document.querySelector('${f2} .geometry-authoring-board')`)
  await menu('Xətt');assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="directed_line"]').textContent`),'İstiqamətlənmiş düz xətt')
  await action('point');assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="point"]').hasAttribute('data-tool-3d')`),false)
  await save(f2);assert.deepEqual(await evaluate('savedRevision.blocks[1].payload.source_data'),three,'2D routing never retargets a 3D frame')
  await evaluate('reloadEditor()');await until('document.querySelectorAll("[data-frame-id]").length===2');assert.deepEqual(await evaluate('savedRevision.blocks.map(b=>b.payload.source_data.schema_version)'),[1,2])
  console.log('PASS: real Edge unified frame menu, V1/V2 creation, shared routing, context switching, no wrong-dimension writes, 3D plane/solid accessibility, planar availability, disabled future tools, compact ribbon and mixed save/reload (fixture API)')
}
