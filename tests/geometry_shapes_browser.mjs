import assert from 'node:assert/strict'
export async function runGeometryShapesAcceptance({evaluate,until,textButton,box,pointer,delay,click}){
 await textButton('Həndəsə');await textButton('Çərçivə əlavə et')
 const board='.geometry-authoring-board',frame='[data-frame-id="frame-1"]'
 await until(`document.querySelector('${board} svg')`)
 const tool=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`);await delay(100)}
 const at=async(x,y)=>{const r=await box(board);await pointer('mousePressed',r.x+x,r.y+y,{button:'left',clickCount:1});await pointer('mouseReleased',r.x+x,r.y+y,{button:'left',clickCount:1});await delay(150)}
 await tool('Nöqtə');for(const p of [[80,100],[240,100],[160,240]])await at(...p)
 await tool('Parça')
 const choose=async i=>{const r=await box(`${board} [data-geometry-point-id="point-${i}"]`);await pointer('mousePressed',r.x+r.width/2,r.y+r.height/2,{button:'left',clickCount:1});await pointer('mouseReleased',r.x+r.width/2,r.y+r.height/2,{button:'left',clickCount:1});await delay(150)}
 for(const [a,b] of [[1,2],[2,3],[3,1]]){await choose(a);await choose(b)}
 await tool('Seç');await at(160,100);await until('document.querySelector("[data-geometry-shape]")')
 const original=await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].map(e=>[e.getAttribute('cx'),e.getAttribute('cy')])`)
 const gesture=async(selector,dx,dy)=>{const r=await box(selector),x=r.x+r.width/2,y=r.y+r.height/2;await pointer('mousePressed',x,y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',x+dx,y+dy,{button:'left',buttons:1});await delay(100);await pointer('mouseReleased',x+dx,y+dy,{button:'left',clickCount:1});await delay(180)}
 // A boundary midpoint, away from ordinary point editing and scale handles.
 await at(160,100)
 const r=await box(board);await pointer('mousePressed',r.x+160,r.y+100,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',r.x+180,r.y+120,{button:'left',buttons:1});await pointer('mouseReleased',r.x+180,r.y+120,{button:'left',clickCount:1});await delay(200)
 const moved=await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].map(e=>[e.getAttribute('cx'),e.getAttribute('cy')])`);assert.notDeepEqual(moved,original)
 await click('button[aria-label="Geri al"]');await delay(150)
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].map(e=>[e.getAttribute('cx'),e.getAttribute('cy')])`),original)
 for(const kind of ['rotate','scale']){
  await tool('Seç');await at(160,100);await until(`document.querySelector('[data-transform="${kind}"]')`)
  await gesture(`[data-transform="${kind}"]`,kind==='rotate'?35:20,kind==='rotate'?20:20)
  assert.notDeepEqual(await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].map(e=>[e.getAttribute('cx'),e.getAttribute('cy')])`),original)
  await click('button[aria-label="Geri al"]');await delay(150)
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].map(e=>[e.getAttribute('cx'),e.getAttribute('cy')])`),original)
 }
 await choose(1)
 assert.ok(await evaluate('!!document.querySelector(".geometry-editor__label input")'))
 assert.equal(await evaluate('document.querySelector("[data-geometry-shape]")'),null)
 await gesture(`${board} [data-geometry-point-id="point-1"]`,8,8)
 const vertexEdit=await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].map(e=>[e.getAttribute('cx'),e.getAttribute('cy')])`)
 assert.notDeepEqual(vertexEdit[0],original[0]);assert.deepEqual(vertexEdit.slice(1),original.slice(1))
 await click('button[aria-label="Geri al"]');await delay(150)
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].map(e=>[e.getAttribute('cx'),e.getAttribute('cy')])`),original)
 await tool('Düz xətt');await at(300,300);await at(380,340)
 assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),5,'Invisible anchors remain internal SVG objects')
 assert.equal(await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].filter(e=>getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none').length`),3)
 await tool('Düz xətt');await choose(1);await choose(2)
 // Reuse the exact hidden anchor in each visible mathematical role.
 for(const [label,locations] of [
  ['Sınıq xətt',[[300,300],[340,280],[360,300],[300,300]]],
  ['Üçbucaq',[[300,300],[340,300]]],
  ['Qövs',[[300,300],[340,300],[300,340]]],
  ['Çevrə',[[300,300],[340,300]]],
 ]){
  await tool(label);for(const location of locations)await at(...location)
  assert.ok(await evaluate(`(()=>{const e=document.querySelector('${board} [data-geometry-point-id="point-4"]');return e&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'})()`),label+' promotes the same anchor in authoring')
  await click('button[aria-label="Geri al"]');await delay(150)
  assert.equal(await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].filter(e=>getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none').length`),3,'Undo restores the implicit role atomically')
 }
 await tool('Çevrə');await at(300,300);await at(340,300)
 await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`)
 const saved=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)')
 assert.equal(saved.polygons.length,0);assert.equal(saved.points.filter(p=>p.role==='implicit').length,1)
 assert.equal(saved.points.find(p=>p.id==='point-4').role,'explicit');assert.equal(saved.points.length,5)
 assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-points > g').length`),4)
 await evaluate(`document.querySelector('${frame} .visual-frame__actions button').click()`);await until(`document.querySelector('${board}')`)
 assert.equal(await evaluate(`[...document.querySelectorAll('${board} [data-geometry-point-id]')].filter(e=>getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none').length`),4)
 console.log('PASS: Edge composed triangle selection, translate/rotate/uniform scale, single-gesture undo, implicit/explicit visibility and save/reload')
}
