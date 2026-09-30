import assert from 'node:assert/strict'

// Complete D4 fixture uses the production editor and real pointer interactions.
export async function runGeometry2DAcceptance({ evaluate, until, textButton, click, box, pointer, delay, send, drag }) {
  const board = '.geometry-authoring-board', frame = '[data-frame-id="frame-1"]'
  const menu = async label => {
    await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()===${JSON.stringify(label+' ▾')});if(!d.open)d.querySelector('summary').click()})()`); await delay(60)
  }
  const action = async label => {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable action');b.click()})()`); await delay(100)
  }
  const tool = async label => { await menu('2D fiqurlar'); await action(label) }
  const at = async (x,y,press=true) => {
    await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`)
    const r=await box(board); await pointer('mouseMoved',r.x+x,r.y+y)
    if(press) { await pointer('mousePressed',r.x+x,r.y+y,{button:'left',clickCount:1}); await pointer('mouseReleased',r.x+x,r.y+y,{button:'left',clickCount:1}) }
    await delay(100)
  }
  const escape = async () => { await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); await delay(100) }
  const count = () => evaluate(`document.querySelectorAll('${board} svg ellipse').length`)
  const layout = () => evaluate("(()=>{const r=document.querySelector('.universal-editor-geometry-ribbon').getBoundingClientRect(),c=document.querySelector('.universal-question-canvas').getBoundingClientRect();return [r.height,c.x,c.y+scrollY]})()")
  const save = async id => { await click(`[data-frame-id="${id}"] .visual-frame__actions button`); await until('!document.querySelector(".geometry-authoring-board")'); return evaluate(`structuredClone(savedRevision.blocks.find(b=>b.id===${JSON.stringify(id)}))`) }
  const arbitrary = async (x,y) => {
    const first=await count(); await action('Nöqtə')
    for(const [dx,dy] of [[0,0],[40,0],[40,35],[0,35]]) await at(x+dx,y+dy)
    await tool('Sərbəst fiqur')
    for(let i=1;i<=4;i++) await click(`${board} svg ellipse:nth-of-type(${first+i})`)
    await textButton('Çoxbucaqlını tamamla')
    await menu('Xətt'); await action('Sınıq xətt')
    for(const [dx,dy] of [[65,0],[100,0],[85,35]]) await at(x+dx,y+dy)
    await at(x+69,y,false)
    assert.ok(await evaluate('document.querySelector("[data-geometry-closure=true]")'))
    await at(x+69,y)
  }
  await until('document.querySelector("math-field")')
  const text=await evaluate('JSON.stringify(savedRevision.blocks[0])'),formula=await evaluate('document.querySelector("math-field").value')
  await textButton('Həndəsə'); await textButton('Çərçivə əlavə et'); await until(`document.querySelector('${board} svg')`)
  const baseline=await layout()
  const labels=['Üçbucaq','Düzbucaqlı üçbucaq','Düzbucaqlı','Kvadrat','Paraleloqram','Romb','Trapesiya','Düzgün 5-bucaqlı','Düzgün 6-bucaqlı','Düzgün n-bucaqlı']
  await menu('2D fiqurlar')
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].map(b=>[b.textContent,b.disabled])"), [...labels,'Sərbəst fiqur'].map(s=>[s,false]))
  assert.deepEqual(await layout(),baseline)
  for(let i=0;i<labels.length;i++) {
    const x=65+(i%3)*120,y=65+Math.floor(i/3)*90
    await tool(labels[i]); const before=await count()
    await at(x,y); await at(x+1,y); await escape(); assert.equal(await count(),before,'Degenerate and cancel leave no points')
    await at(x,y); await at(x+30,y+6,false)
    assert.ok(await evaluate('document.querySelector("[data-geometry-template-preview]")'))
    await escape(); assert.equal(await count(),before,'Escape removes preview points')
    await at(x,y); await at(x+30,y+6,false)
    await send('Emulation.setEmulatedMedia',{media:'print'})
    assert.equal(await evaluate('[...document.querySelectorAll("[data-geometry-transient]")].every(e=>getComputedStyle(e).display==="none")'),true)
    await send('Emulation.setEmulatedMedia',{media:''}); await textButton('Çəkilişi ləğv et'); assert.equal(await count(),before)
    await at(x,y); await at(x+30,y+6)
  }
  await arbitrary(190,335)
  await tool('Üçbucaq'); await at(340,335); await at(390,360,false)
  const a=await save('frame-1'),g=a.payload.source_data
  assert.equal(g.polygons.length,12); assert.equal(g.points.length,51)
  assert.deepEqual(g.polygons.slice(0,7).map(p=>p.template.kind),['triangle','right_triangle','rectangle','square','parallelogram','rhombus','trapezoid'])
  assert.deepEqual(g.polygons.slice(7,10).map(p=>p.template),[5,6,7].map(n=>({kind:'regular_polygon',n})))
  assert.ok(g.polygons.slice(10).every(p=>!Object.hasOwn(p,'template')),'No shape recognition even for rectangular free polygon')
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-transient]").length'),0)
  assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-polygons polygon').length`),12)
  await textButton('Çərçivə əlavə et'); await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await tool('Kvadrat'); await at(65,65); await at(110,75); await arbitrary(80,190)
  const b=await save('frame-2'); assert.equal(b.payload.source_data.polygons.length,3)
  assert.notDeepEqual(a.payload.source_data,b.payload.source_data)
  await click(frame)
  const shape=`${frame} .geometry-polygons polygon`,before=await box(shape)
  await drag(`${frame} [data-handle=se]`,-1200,-1200)
  const after=await box(shape); assert.ok(Math.abs(after.width-before.width)<.01 && Math.abs(after.height-before.height)<.01)
  assert.ok(await evaluate(`(()=>{const f=document.querySelector('${frame}').getBoundingClientRect();return [...document.querySelectorAll('${frame} .geometry-polygons polygon')].every(e=>{const r=e.getBoundingClientRect();return r.left>=f.left+16&&r.top>=f.top+16&&r.right<=f.right-16&&r.bottom<=f.bottom-16})})()`))
  await drag(`${frame} .visual-frame__move`,25,25)
  await click(`${frame} .visual-frame__actions button:nth-child(2)`); await until('requests.at(-1).url.endsWith("/visual-placement")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'),g)
  const placement=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").visual_placement)')
  await evaluate('reloadEditor()'); await until('document.querySelectorAll("[data-frame-id]").length===2 && document.querySelector("math-field")')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),text); assert.equal(await evaluate('document.querySelector("math-field").value'),formula)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").visual_placement'),placement)
  await pointer('mouseMoved',0,0)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame}')).outlineColor`),'rgba(0, 0, 0, 0)')
  await evaluate(`document.querySelector('${frame}').scrollIntoView({block:'center'})`)
  const rect=await box(frame); await pointer('mouseMoved',rect.x+10,rect.y+10)
  assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('${frame}')).outlineColor`),'rgba(0, 0, 0, 0)')
  await click(frame); assert.equal(await evaluate(`document.querySelectorAll('${frame} [data-handle]').length`),8)
  await send('Emulation.setEmulatedMedia',{media:'print'})
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame} [data-handle]')).display`),'none'); await send('Emulation.setEmulatedMedia',{media:''})
  await click(`${frame} .visual-frame__actions button`); await until(`document.querySelector('${board}')`)
  await action('Seç'); const polygon=await box(`${board} polygon`)
  await pointer('mousePressed',polygon.x+polygon.width/3,polygon.y+polygon.height/3,{button:'left',clickCount:1}); await pointer('mouseReleased',polygon.x+polygon.width/3,polygon.y+polygon.height/3,{button:'left',clickCount:1}); await delay(100)
  await menu('Daha çox'); await action('Seçiləni sil')
  const deleted=await save('frame-1')
  assert.deepEqual(deleted.payload.source_data.polygons,g.polygons.slice(1)); assert.deepEqual(deleted.payload.source_data.points,g.points)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  console.log('PASS: complete 12-figure/51-point 2D fixture, all three authoring paths, all-template cancel/degeneracy/print, common rendering, dense bounds/scale, independent mixed frames, reload and neighboring deletion')
  return {a:g,b:b.payload.source_data}
}
