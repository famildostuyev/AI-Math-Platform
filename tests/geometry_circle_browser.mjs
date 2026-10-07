import assert from 'node:assert/strict'

export async function runGeometryCircleAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}) {
  const board='.geometry-authoring-board',frame='[data-frame-id="frame-1"]'
  const action=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable');b.click()})()`);await delay(100)}
  const menu=async label=>{await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()===${JSON.stringify(label+' ▾')});if(!d.open)d.querySelector('summary').click()})()`);await delay(60)}
  const tool=async label=>{await menu('Çevrə');await action(label)}
  const at=async(x,y,press=true)=>{await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`);const r=await box(board);await pointer('mouseMoved',r.x+x,r.y+y);if(press){await pointer('mousePressed',r.x+x,r.y+y,{button:'left',clickCount:1});await pointer('mouseReleased',r.x+x,r.y+y,{button:'left',clickCount:1})}await delay(120)}
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100)}
  const save=async id=>{await click(`[data-frame-id="${id}"] .visual-frame__actions button`);await until('!document.querySelector(".geometry-authoring-board")');return evaluate(`structuredClone(savedRevision.blocks.find(b=>b.id===${JSON.stringify(id)}))`)}
  const shape=k=>`${board} [data-geometry-kind="${k}"]`
  const layout=()=>evaluate("(()=>{const r=document.querySelector('.universal-editor-geometry-ribbon').getBoundingClientRect(),c=document.querySelector('.universal-question-canvas').getBoundingClientRect();return [r.height,c.x,c.y+scrollY]})()")
  await until('document.querySelector("math-field")')
  const text=await evaluate('JSON.stringify(savedRevision.blocks[0])'),formula=await evaluate('document.querySelector("math-field").value')
  await textButton('Həndəsə');await textButton('Çərçivə əlavə et');await until(`document.querySelector('${board} svg')`)
  const baseline=await layout();await menu('Çevrə');assert.deepEqual(await layout(),baseline)
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].filter(b=>!b.disabled).map(b=>b.textContent)"),['Çevrə','Dairə','Qövs','Sektor'])
  for(const label of ['Çevrə','Dairə','Qövs','Sektor']) {
    await tool(label);await at(120,120);await at(122,120);await escape()
    assert.equal(await evaluate(`document.querySelectorAll('${board} svg ellipse').length`),0)
    await at(120,120);await at(150,120,false)
    const small=await box('[data-geometry-circle-preview]');await at(170,120,false)
    assert.ok((await box('[data-geometry-circle-preview]')).width>small.width)
    await escape();assert.equal(await evaluate(`document.querySelectorAll('${board} svg ellipse').length`),0)
  }
  for(const [label,x,y,r] of [['Çevrə',110,110,45],['Dairə',270,110,35]]) {
    await tool(label);await at(x,y);await at(x+r,y,false)
    await send('Emulation.setEmulatedMedia',{media:'print'});assert.equal(await evaluate('[...document.querySelectorAll("[data-geometry-transient]")].every(e=>getComputedStyle(e).display==="none")'),true);await send('Emulation.setEmulatedMedia',{media:''})
    await at(x+r,y)
  }
  assert.equal(await evaluate(`Number(getComputedStyle(document.querySelector('${shape('circle')}')).fillOpacity)`),0)
  assert.ok(await evaluate(`Number(getComputedStyle(document.querySelector('${shape('disk')}')).fillOpacity)>0`))
  // Reuse the existing center point drag; radius stays fixed.
  const circleBefore=await box(shape('circle'));await drag(`${board} [data-geometry-point-id]`,12,8)
  const circleAfter=await box(shape('circle'));assert.ok(Math.abs(circleBefore.width-circleAfter.width)<.01)
  assert.ok(Math.abs(circleAfter.x-circleBefore.x)>5)
  await menu('2D fiqurlar');await action('Kvadrat');await at(70,245);await at(130,255)
  await action('Nöqtə');await at(240,260);await at(320,280)
  await menu('Xətt');await action('Parça')
  for (const offset of [2,1]) {
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll('${board} svg ellipse:not([data-geometry-kind])')].at(-${offset}).getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}})()`)
    await pointer('mousePressed',p.x,p.y,{button:'left',clickCount:1});await pointer('mouseReleased',p.x,p.y,{button:'left',clickCount:1});await delay(100)
  }
  await tool('Çevrə');await at(330,320);await at(380,320,false)
  const a=await save('frame-1'),g=a.payload.source_data
  assert.equal(g.circles.length,2);assert.equal(g.points.length,8);assert.equal(g.polygons.length,1);assert.equal(g.segments.length,1)
  assert.deepEqual(g.circles.map(c=>[c.kind,c.radius]),[['circle',11.25],['disk',8.75]])
  assert.ok(g.circles.every(c=>g.points.find(p=>p.id===c.center_point_id).label===null))
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-transient]").length'),0)
  const rendered=`${frame} .geometry-circles [data-geometry-kind=circle]`,original=await box(rendered)
  for(const [handle,dx,dy] of [['e',70,0],['s',0,60],['se',50,40]]) {
    await drag(`${frame} [data-handle=${handle}]`,dx,dy);const r=await box(rendered)
    assert.ok(Math.abs(r.width-original.width)<.01 && Math.abs(r.height-original.height)<.01 && Math.abs(r.width-r.height)<.01)
  }
  await drag(`${frame} [data-handle=se]`,-1200,-1200)
  assert.ok(await evaluate(`(()=>{const f=document.querySelector('${frame}').getBoundingClientRect();return [...document.querySelectorAll('${frame} .geometry-circles circle')].every(e=>{const r=e.getBoundingClientRect();return r.left>=f.left+16&&r.top>=f.top+16&&r.right<=f.right-16&&r.bottom<=f.bottom-16})})()`))
  await drag(`${frame} .visual-frame__move`,25,20);await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until('requests.at(-1).url.endsWith("/visual-placement")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'),g)
  await textButton('Çərçivə əlavə et');await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await tool('Dairə');await at(140,140);await at(210,140)
  const b=await save('frame-2');assert.equal(b.payload.source_data.circles[0].radius,17.5)
  await click(frame);await drag(`${frame} [data-handle=e]`,30,0);await drag(`${frame} .visual-frame__move`,15,10)
  await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until('requests.at(-1).url.endsWith("/visual-placement")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  await evaluate('reloadEditor()');await until('document.querySelectorAll("[data-frame-id]").length===2 && document.querySelector("math-field")')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),text);assert.equal(await evaluate('document.querySelector("math-field").value'),formula)
  await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${board}')`)
  for(const kind of ['circle','disk']) {
    await action('Seç');await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`)
    const r=await box(shape(kind)),x=kind==='circle'?r.x+r.width:r.x+r.width*.65,y=r.y+r.height/2
    await pointer('mousePressed',x,y,{button:'left',clickCount:1});await pointer('mouseReleased',x,y,{button:'left',clickCount:1});await delay(120)
    await menu('Daha çox');await action('Seçiləni sil')
    assert.equal(await evaluate(`document.querySelectorAll('${shape(kind)}').length`),0)
  }
  const deleted=await save('frame-1');assert.deepEqual(deleted.payload.source_data.points,g.points);assert.deepEqual(deleted.payload.source_data.polygons,g.polygons);assert.deepEqual(deleted.payload.source_data.segments,g.segments)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  console.log('PASS: real Edge circle/disk preview, atomic creation, cancel/degenerate, center drag, boundary/interior selection/delete, mixed Geometry, fixed circular scale/bounds, independent frames, print and mixed document')
  return {a:g,b:b.payload.source_data}
}
