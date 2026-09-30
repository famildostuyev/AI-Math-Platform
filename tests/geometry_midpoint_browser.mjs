import assert from 'node:assert/strict'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const { normalizeGeometrySourceDataV1: normalize } = await loadGeometryModule('geometryV1')

export async function runGeometryMidpointAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}) {
  const board='.geometry-authoring-board',frame=id=>`[data-frame-id="${id}"]`,point=id=>`${board} [data-geometry-point-id="${id}"]`
  const action=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click()})()`);await delay(100)}
  const menu=async label=>{await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()===${JSON.stringify(label+' ▾')});if(!d.open)d.querySelector('summary').click()})()`);await delay(60)}
  const tool=async()=>{await menu('Konstruksiya');await action('Orta nöqtə')}
  const at=async(x,y)=>{await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`);const r=await box(board);await pointer('mouseMoved',r.x+x,r.y+y);await pointer('mousePressed',r.x+x,r.y+y,{button:'left',clickCount:1});await pointer('mouseReleased',r.x+x,r.y+y,{button:'left',clickCount:1});await delay(120)}
  const pclick=async id=>{await click(point(id));await delay(140)}
  const hover=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const r=await box(selector);await pointer('mouseMoved',r.x+r.width/2,r.y+r.height/2);await delay(120)}
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(120)}
  const count=()=>evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`)
  const save=async id=>{await click(`${frame(id)} .visual-frame__actions button`);await until('!document.querySelector(".geometry-authoring-board")');const b=await evaluate(`structuredClone(savedRevision.blocks.find(b=>b.id===${JSON.stringify(id)}))`);assert.ok(normalize(b.payload.source_data));return b}
  const edit=async id=>{await click(frame(id));await click(`${frame(id)} .visual-frame__actions button`);await until(`document.querySelector('${board}')`)}
  const pair=async(a,b)=>{await tool();await pclick(a);await hover(point(b));assert.ok(await evaluate('document.querySelector("[data-geometry-midpoint-preview]")'));await pclick(b)}
  const near=(a,b)=>assert.ok(Math.abs(a-b)<.02,`${a} != ${b}`)
  const screenMidpoint=async(a,b,m)=>{const boxes=await Promise.all([a,b,m].map(id=>box(point(id))));near(boxes[2].x+boxes[2].width/2,(boxes[0].x+boxes[0].width/2+boxes[1].x+boxes[1].width/2)/2);near(boxes[2].y+boxes[2].height/2,(boxes[0].y+boxes[0].height/2+boxes[1].y+boxes[1].height/2)/2)}
  const remove=async()=>{await menu('Daha çox');await action('Seçiləni sil')}
  await until('document.querySelector("math-field")')
  const text=await evaluate('JSON.stringify(savedRevision.blocks[0])'),formula=await evaluate('document.querySelector("math-field").value')
  await textButton('Həndəsə');await textButton('Çərçivə əlavə et');await until(`document.querySelector('${board} svg')`)
  await action('Nöqtə');await at(80,80);await at(240,120);await at(160,260)
  await menu('Konstruksiya');assert.deepEqual(await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].map(b=>[b.textContent,b.disabled])"),[['Orta nöqtə',false],['Paralel',false],['Perpendikulyar',false],['Kəsişmə',true]])
  await tool();await pclick('point-1');await hover(point('point-2'))
  assert.equal(await count(),3);assert.ok(await evaluate('document.querySelector("[data-geometry-midpoint-preview]")'))
  await escape();assert.equal(await count(),3);assert.equal(await evaluate('document.querySelectorAll("[data-geometry-midpoint-preview]").length'),0)
  await pclick('point-1');await pclick('point-1');assert.equal(await count(),3);await escape()
  await pair('point-1','point-2');await screenMidpoint('point-1','point-2','point-4')
  await tool();await pclick('point-2');await pclick('point-1');assert.equal(await count(),4)
  await pair('point-4','point-3');assert.equal(await count(),5)
  await action('Seç');await drag(point('point-1'),16,8);await screenMidpoint('point-1','point-2','point-4');await screenMidpoint('point-4','point-3','point-5')
  await drag(point('point-2'),8,12);await screenMidpoint('point-1','point-2','point-4');await screenMidpoint('point-4','point-3','point-5')
  const locked=await box(point('point-4'));await drag(point('point-4'),30,20);const after=await box(point('point-4'));near(locked.x,after.x);near(locked.y,after.y)
  await menu('Xətt');await action('Parça');await pclick('point-2');await pclick('point-3')
  await tool();await hover(`${board} [data-geometry-segment-id]`);assert.ok(await evaluate('document.querySelector("[data-geometry-midpoint-preview]")'));await click(`${board} [data-geometry-segment-id]`);await delay(150);assert.equal(await count(),6)
  await action('Seç');await click(`${board} [data-geometry-segment-id]`);await remove();assert.equal(await count(),6)
  await action('Seç');await drag(point('point-2'),8,0);await screenMidpoint('point-2','point-3','point-6')
  await menu('Çevrə');await action('Çevrə');await at(310,230);await at(345,230)
  await menu('2D fiqurlar');await action('Kvadrat');await at(260,330);await at(310,340)
  await pair('point-7','point-8');await action('Seç');await drag(point('point-7'),8,4);await screenMidpoint('point-7','point-8','point-12');await drag(point('point-8'),4,8);await screenMidpoint('point-7','point-8','point-12')
  // Saving a pending draft must not add a point or recipe.
  await tool();await pclick('point-1');await hover(point('point-3'))
  await send('Emulation.setEmulatedMedia',{media:'print'});assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-geometry-midpoint-preview]")).display'),'none');await send('Emulation.setEmulatedMedia',{media:''})
  const a=await save('frame-1');assert.equal(a.payload.source_data.constructions.length,4);assert.equal(a.payload.source_data.points.length,12)
  const original=structuredClone(a.payload.source_data)
  await send('Emulation.setEmulatedMedia',{media:'print'});assert.equal(await evaluate(`document.querySelector('${frame('frame-1')} .geometry-points').checkVisibility()`),true);assert.equal(await evaluate(`getComputedStyle(document.querySelector('${frame('frame-1')} .visual-frame__move')).display`),'none');await send('Emulation.setEmulatedMedia',{media:''})
  for(const [h,dx,dy] of [['e',50,0],['s',0,40],['se',30,30]])await drag(`${frame('frame-1')} [data-handle=${h}]`,dx,dy)
  await drag(`${frame('frame-1')} .visual-frame__move`,20,15);await click(`${frame('frame-1')} .visual-frame__actions button:nth-child(2)`)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'),original)
  await textButton('Çərçivə əlavə et');await until('document.querySelector("[data-frame-id=frame-2] .geometry-authoring-board")')
  await action('Nöqtə');await at(90,90);await at(250,130)
  await menu('Xətt');await action('Parça');await pclick('point-1');await pclick('point-2')
  await pair('point-1','point-2');await action('Seç');await drag(point('point-1'),12,4);await screenMidpoint('point-1','point-2','point-3')
  await menu('Çevrə');await action('Dairə');await at(220,260);await at(260,260)
  const b=await save('frame-2');assert.equal(b.payload.source_data.constructions.length,1)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'),original)
  await click(frame('frame-1'))
  for(const [h,dx,dy] of [['e',20,0],['s',0,20],['se',20,20]])await drag(`${frame('frame-1')} [data-handle=${h}]`,dx,dy)
  await drag(`${frame('frame-1')} .visual-frame__move`,10,10);await click(`${frame('frame-1')} .visual-frame__actions button:nth-child(2)`)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'),original)
  await evaluate('reloadEditor()');await until('document.querySelectorAll("[data-frame-id]").length===2 && document.querySelector("math-field")');await edit('frame-1')
  await action('Seç');await evaluate('window.scrollBy(0,73)');await pclick('point-1');await drag(point('point-1'),12,8);await screenMidpoint('point-1','point-2','point-4');await screenMidpoint('point-4','point-3','point-5')
  await drag(point('point-4'),20,10);await screenMidpoint('point-1','point-2','point-4')
  const reloaded=await save('frame-1');await edit('frame-1')
  await pclick('point-4');await remove();assert.equal(await count(),10)
  assert.ok(await evaluate(`document.querySelector('${point('point-1')}')&&document.querySelector('${point('point-2')}')`))
  await action('Seç');await pclick('point-7');await remove();assert.equal(await count(),8)
  const deleted=await save('frame-1');assert.equal(deleted.payload.source_data.constructions.length,1);assert.equal(deleted.payload.source_data.polygons.length,1)
  assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
  assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),text);assert.equal(await evaluate('document.querySelector("math-field").value'),formula)
  // A valid legacy fixture may contain distinct free points at the same location.
  // Mouse hit testing cannot disambiguate these coincident targets; authoring must
  // still refuse creation without an orphan or recipe (identity-specific rejection
  // is also exercised directly in the model test).
  await evaluate(`(()=>{const g=savedRevision.blocks.find(b=>b.id==='frame-2').payload.source_data;g.constructions=[];g.points[1].x=g.points[0].x;g.points[1].y=g.points[0].y;reloadEditor()})()`)
  await until('document.querySelectorAll("[data-frame-id]").length===2');await edit('frame-2')
  await tool();await pclick('point-1');await pclick('point-2');assert.equal(await count(),4)
  await escape();const coincident=await save('frame-2');assert.equal(coincident.payload.source_data.constructions.length,0)
  console.log('PASS: Edge midpoint pair/segment preview, cancellation, same-point/duplicate rejection, source/derived dragging, chains, center/vertex sources, transitive delete, segment independence, post-reload dependencies, print/frame isolation and mixed document')
  return {a:reloaded.payload.source_data,b:b.payload.source_data}
}
