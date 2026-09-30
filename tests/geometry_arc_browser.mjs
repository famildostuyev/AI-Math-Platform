import assert from 'node:assert/strict'

export async function runGeometryArcAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}, family=false) {
  const board='.geometry-authoring-board',frame='[data-frame-id="frame-1"]'
  const action=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click()})()`);await delay(100)}
  const menu=async label=>{await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()===${JSON.stringify(label+' ▾')});if(!d.open)d.querySelector('summary').click()})()`);await delay(60)}
  const tool=async label=>{await menu('Çevrə');await action(label)}
  const at=async(x,y,press=true)=>{await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`);const r=await box(board);await pointer('mouseMoved',r.x+x,r.y+y);if(press){await pointer('mousePressed',r.x+x,r.y+y,{button:'left',clickCount:1});await pointer('mouseReleased',r.x+x,r.y+y,{button:'left',clickCount:1})}await delay(120)}
  const polar=(x,y,r,a)=>[x+r*Math.cos(a),y+r*Math.sin(a)]
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100)}
  const save=async id=>{await click(`[data-frame-id="${id}"] .visual-frame__actions button`);await until('!document.querySelector(".geometry-authoring-board")');return evaluate(`structuredClone(savedRevision.blocks.find(b=>b.id===${JSON.stringify(id)}))`)}
  const noObjects=async()=>{assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-id], ${board} svg ellipse').length`),0)}
  const layout=()=>evaluate("(()=>{const r=document.querySelector('.universal-editor-geometry-ribbon').getBoundingClientRect(),c=document.querySelector('.universal-question-canvas').getBoundingClientRect();return [r.height,c.x,c.y+scrollY]})()")
  const authorArc=async(label,x,y,r,start,end)=>{
    await tool(label);await at(x,y);await at(...polar(x,y,r,start));await at(...polar(x,y,r,(start+end)/2),false)
    assert.ok(await evaluate('document.querySelector("[data-geometry-arc-preview]")'))
    const first=await evaluate('document.querySelector("[data-geometry-arc-preview]").getAttribute("d")')
    await at(...polar(x,y,r,end),false);assert.notEqual(await evaluate('document.querySelector("[data-geometry-arc-preview]").getAttribute("d")'),first)
    await send('Emulation.setEmulatedMedia',{media:'print'});assert.equal(await evaluate('[...document.querySelectorAll("[data-geometry-transient]")].every(e=>getComputedStyle(e).display==="none")'),true);await send('Emulation.setEmulatedMedia',{media:''})
    await at(...polar(x,y,r,end))
  }
  await until('document.querySelector("math-field")')
  const text=await evaluate('JSON.stringify(savedRevision.blocks[0])'),formula=await evaluate('document.querySelector("math-field").value')
  await textButton('Həndəsə');await textButton('Çərçivə əlavə et');await until(`document.querySelector('${board} svg')`)
  const baseline=await layout();await menu('Çevrə');assert.deepEqual(await layout(),baseline)
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].filter(b=>!b.disabled).map(b=>b.textContent)"),['Çevrə','Dairə','Qövs','Sektor'])
  for(const label of ['Qövs','Sektor']) {
    await tool(label);await at(100,100);await at(150,100,false);await escape();await noObjects()
    await at(100,100);await at(150,100);await at(100,150,false);assert.ok(await evaluate('document.querySelector("[data-geometry-arc-preview]")'));await escape();await noObjects()
    await at(100,100);await at(101,100);await escape();await noObjects()
    await at(100,100);await at(150,100);await at(150,100);assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-id]').length`),0);await escape();await noObjects()
  }
  await tool('Çevrə');await at(80,80);await at(115,80)
  await tool('Dairə');await at(240,80);await at(270,80)
  await authorArc('Qövs',80,210,50,11*Math.PI/6,Math.PI/6)
  const arcSelector=`${board} [data-geometry-kind=arc]`,sectorSelector=`${board} [data-geometry-kind=sector]`
  const arcBox=await box(arcSelector)
  assert.ok(arcBox.width<10 && Math.abs(arcBox.height-50)<1,'Wrap arc is the narrow right-hand sweep, not its complement')
  await authorArc('Sektor',260,230,45,Math.PI,3*Math.PI/2)
  assert.ok(await evaluate(`Number(getComputedStyle(document.querySelector('${sectorSelector}')).fillOpacity)>0`))
  // Real center drag retains radius and sweep, using accepted point editing.
  await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`)
  const centerRect=await evaluate(`(()=>{const e=[...document.querySelectorAll('${board} ellipse:not([data-geometry-kind]):not([data-geometry-helper])')][2].getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}})()`)
  await pointer('mousePressed',centerRect.x,centerRect.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',centerRect.x+12,centerRect.y+8,{button:'left',buttons:1});await delay(120);await pointer('mouseReleased',centerRect.x+12,centerRect.y+8,{button:'left',clickCount:1});await delay(150)
  const shifted=await box(arcSelector);assert.ok(Math.abs(shifted.width-arcBox.width)<.1 && Math.abs(shifted.x-arcBox.x)>5)
  if(family) for(const [index,kind] of [[0,'circle'],[1,'disk'],[3,'sector']]) {
    await action('Seç')
    const before=await box(`${board} [data-geometry-kind=${kind}]`)
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll('${board} ellipse:not([data-geometry-kind]):not([data-geometry-helper])')].filter(e=>getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none')[${index}].getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}})()`)
    await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',p.x+12,p.y+8,{button:'left',buttons:1});await delay(120);await pointer('mouseReleased',p.x+12,p.y+8,{button:'left',clickCount:1});await delay(150)
    const after=await box(`${board} [data-geometry-kind=${kind}]`)
    assert.ok(Math.abs(after.width-before.width)<.1&&Math.abs(after.height-before.height)<.1&&Math.abs(after.x-before.x-12)<1&&Math.abs(after.y-before.y-8)<1,kind+' center translates without distortion')
  }
  await menu('2D fiqurlar');await action('Kvadrat');await at(60,330);await at(110,340)
  await action('Nöqtə');await at(210,340);await at(310,365)
  await menu('Xətt');await action('Parça')
  for(const offset of [2,1]) {
    const p=await evaluate(`(()=>{const e=[...document.querySelectorAll('${board} ellipse:not([data-geometry-kind]):not([data-geometry-helper])')].filter(e=>getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none').at(-${offset}).getBoundingClientRect();return {x:e.x+e.width/2,y:e.y+e.height/2}})()`)
    await pointer('mousePressed',p.x,p.y,{button:'left',clickCount:1});await pointer('mouseReleased',p.x,p.y,{button:'left',clickCount:1});await delay(100)
  }
  if(family){await menu('Xətt');await action('Vektor');await at(330,140);await at(390,180)}
  await tool('Qövs');await at(330,320);await at(380,320);await at(330,370,false)
  const a=await save('frame-1'),g=a.payload.source_data
  assert.equal(g.points.length,family?12:10);assert.equal(g.arcs.length,2);assert.equal(g.circles.length,2);assert.equal(g.polygons.length,1);assert.equal(g.segments.length,1)
  if(family)assert.equal(g.lines[0].kind,'vector')
  if(family){
    assert.deepEqual(g.circles.map(c=>c.radius),[8.75,7.5])
    assert.ok(Math.abs(g.arcs[1].radius-11.25)<.01&&Math.abs(g.arcs[1].start_angle-Math.PI)<.01&&Math.abs(g.arcs[1].sweep_angle-Math.PI/2)<.01)
  }
  assert.ok(Math.abs(g.arcs[0].start_angle-11*Math.PI/6)<.02);assert.ok(Math.abs(g.arcs[0].sweep_angle-Math.PI/3)<.02);assert.ok(Math.abs(g.arcs[0].radius-12.5)<.1)
  assert.equal(await evaluate('document.querySelectorAll("[data-geometry-transient]").length'),0)
  const readonly=`${frame} .geometry-arcs [data-geometry-kind=arc]`,original=await box(readonly)
  assert.ok(Math.abs(original.width-shifted.width)<.1 && Math.abs(original.height-shifted.height)<.1,'Authoring and SVG selected sweep agree')
  if(family){
    await send('Emulation.setEmulatedMedia',{media:'print'})
    for(const kind of ['circle','disk','arc','sector'])assert.equal(await evaluate(`(()=>{const e=document.querySelector('${frame} .geometry-renderer [data-geometry-kind=${kind}]')||document.querySelector('${frame} [data-geometry-kind=${kind}]');return !!e&&e.checkVisibility()})()`),true,kind+' committed print content')
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame} .visual-frame__move')).display`),'none')
    await send('Emulation.setEmulatedMedia',{media:''})
  }
  const familyBoxes={}
  if(family)for(const kind of ['circle','disk','arc','sector'])familyBoxes[kind]=await box(`${frame} [data-geometry-kind=${kind}]`)
  for(const [h,dx,dy] of [['e',80,0],['s',0,60],['se',50,40]]){
    await drag(`${frame} [data-handle=${h}]`,dx,dy);const r=await box(readonly);assert.ok(Math.abs(r.width-original.width)<.01&&Math.abs(r.height-original.height)<.01)
    if(family)for(const [kind,before] of Object.entries(familyBoxes)){const after=await box(`${frame} [data-geometry-kind=${kind}]`);assert.ok(Math.abs(before.width-after.width)<.01&&Math.abs(before.height-after.height)<.01,kind+' fixed scale during '+h+' resize')}
  }
  await drag(`${frame} [data-handle=se]`,-1200,-1200)
  await drag(`${frame} .visual-frame__move`,25,20);await click(`${frame} .visual-frame__actions button:nth-child(2)`);await until('requests.at(-1).url.endsWith("/visual-placement")')
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'),g)
  await textButton('Çərçivə əlavə et');await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await tool('Dairə');await at(140,90);await at(210,90)
  await authorArc('Sektor',150,250,60,0,3*Math.PI/2)
  if(family){await action('Nöqtə');await at(260,340);await at(340,365);await menu('Xətt');await action('Parça');await at(260,340);await at(340,365)}
  const b=await save('frame-2');assert.ok(b.payload.source_data.arcs[0].sweep_angle>Math.PI)
  if(family)assert.equal(b.payload.source_data.segments.length,1)
  await click(frame);await drag(`${frame} [data-handle=e]`,30,0);await drag(`${frame} .visual-frame__move`,15,10);await click(`${frame} .visual-frame__actions button:nth-child(2)`)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  await evaluate('reloadEditor()');await until('document.querySelectorAll("[data-frame-id]").length===2 && document.querySelector("math-field")')
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),text);assert.equal(await evaluate('document.querySelector("math-field").value'),formula)
  await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${board}')`)
  for(const kind of (family?['circle','disk','arc','sector']:['arc','sector'])) {
    await action('Seç');await evaluate('window.scrollBy(0,73)')
    const r=await box(`${board} [data-geometry-kind=${kind}]`),x=['circle','arc'].includes(kind)?r.x+r.width:r.x+r.width*.7,y=r.y+r.height*.5
    await pointer('mousePressed',x,y,{button:'left',clickCount:1});await pointer('mouseReleased',x,y,{button:'left',clickCount:1});await delay(120)
    await menu('Daha çox');await action('Seçiləni sil');assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-kind=${kind}]').length`),0)
  }
  const deleted=await save('frame-1')
  for(const key of (family?['points','polygons','segments','lines']:['points','circles','polygons','segments']))assert.deepEqual(deleted.payload.source_data[key],g[key])
  if(family){assert.equal(deleted.payload.source_data.circles.length,0);assert.equal(deleted.payload.source_data.arcs.length,0)}
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  console.log('PASS: real Edge arc/sector three-click authoring, wrap/major sweep, preview/cancel/degenerate, center drag, exact renderer agreement, post-scroll selection/delete, fixed frame scale, mixed content and independent frames')
  if(family)console.log('PASS: E3 all four center drags, post-scroll hits/deletes, committed print visibility, fixed scale on all resize axes, vector in A and segment in B')
  return {a:g,b:b.payload.source_data}
}
