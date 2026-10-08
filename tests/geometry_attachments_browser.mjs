import assert from 'node:assert/strict'

export async function runGeometryAttachmentAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}) {
  const board='.geometry-authoring-board',frame='[data-frame-id="frame-1"]',note='[data-geometry-annotation-layer] [data-annotation-id="note"]'
  const source={schema_version:1,description:'Attachment acceptance',viewport:{min_x:0,min_y:0,width:100,height:100},
    points:[{id:'a',x:10,y:10,label:'A'},{id:'b',x:40,y:10,label:'B'},{id:'c',x:25,y:35,label:'C'},{id:'d',x:25,y:10,label:'D'},{id:'o',x:60,y:15,label:'O'},{id:'p',x:80,y:20,label:'P'}],
    segments:[{id:'ab',start_point_id:'a',end_point_id:'b'},{id:'cd',start_point_id:'c',end_point_id:'d'}],polygons:[{id:'triangle',point_ids:['a','b','c']}],
    circles:[{id:'circle',center_point_id:'o',radius:7,kind:'circle'}],arcs:[{id:'arc',center_point_id:'p',radius:7,kind:'arc',start_angle:0,sweep_angle:1.5}],
    constructions:[{id:'constraint',kind:'point_on_segment',parent:{kind:'segment',segment_id:'ab'},t:.5,output_point_id:'d'}],
    texts:[{id:'note',x:55,y:48,content:'Area x',runs:[{type:'text',text:'Area ',marks:[]},{type:'inline_math',latex:'x'}],layout_width:20,scale:1,rotation:.1}]}
  const at=async(x,y)=>{await pointer('mouseMoved',x,y);await pointer('mousePressed',x,y,{button:'left',clickCount:1});await pointer('mouseReleased',x,y,{button:'left',clickCount:1});await delay(180)}
  const selectNote=async()=>{await click(note+' foreignObject');await delay(100)}
  const pose=()=>evaluate(`document.querySelector('${note}').getAttribute('transform')`)
  const location=async id=>{await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`);await delay(50);const r=await box(`${board} [data-geometry-point-id="${id}"]`);return {x:r.x+r.width/2,y:r.y+r.height/2}}
  const world=async(x,y)=>{const a=await location('a'),b=await location('b'),s=(b.x-a.x)/30;return {x:a.x+(x-10)*s,y:a.y+(y-10)*s}}
  const targetClick=async(kind,id,x,y)=>{
    const p=kind==='point'?await location(id):await world(x,y);await at(p.x,p.y)
    const option=`[data-attachment-target-kind="${kind}"][data-attachment-target-id="${id}"]`
    if(await evaluate(`!!document.querySelector('${option}')`))await click(option)
    await until(`!document.querySelector('[aria-label="Bağlantı hədəfi"]')`)
  }
  const attach=async(kind,id,x,y)=>{await selectNote();const before=await pose();await textButton(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Dəyiş')`)?'Dəyiş':'Bağla');await targetClick(kind,id,x,y);assert.equal(await pose(),before,'Attach/retarget preserves visible world pose');assert.ok(await evaluate(`document.querySelectorAll('[data-annotation-target-highlight]').length>0`),'Selected target highlighted')}
  const save=async()=>{await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`);return evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)')}
  const reopen=async()=>{await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${board} svg')`)}
  const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100)}
  await textButton('Həndəsə');await textButton('Çərçivə əlavə et');await until(`document.querySelector('${board} svg')`);await save()
  await evaluate(`savedRevision.blocks[0].payload.source_data=${JSON.stringify(source)};reloadEditor()`);await until(`document.querySelector('${frame} .geometry-points')`);await reopen()
  await attach('point','a',10,10)
  const initialAttached=await pose();await click('button[aria-label="Geri al"]');await delay(150);await selectNote();assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Bağla')`));await click('button[aria-label="Yenidən et"]');await delay(150);await selectNote();assert.equal(await pose(),initialAttached)
  console.log('PASS framed: free-point attachment, exact pose, highlight and Attach Undo/Redo')
  await textButton('Dəyiş');const hover=await location('b');await pointer('mouseMoved',hover.x,hover.y);await delay(100)
  assert.ok(await evaluate(`document.querySelector('${board} [data-geometry-point-id="b"]').hasAttribute('data-annotation-target-highlight')`),'Compatible hovered target highlighted')
  await textButton('Bağlamanı ləğv et');const ordinary=await location('b');await at(ordinary.x,ordinary.y)
  assert.equal(await evaluate(`document.querySelectorAll('[data-annotation-target-highlight]').length`),0,'Deselecting annotation clears target highlight')
  for(const [kind,id,x,y] of [['segment','ab',18,10],['polygon_edge','triangle',18,10],['shape','polygon:triangle',25,25],['circle','circle',67,15],['arc','arc',87,20]]){
    await attach(kind,id,x,y);const saved=await save();assert.equal(saved.texts[0].attachment.target_kind,kind);assert.equal(saved.texts[0].attachment.target_id,id);await reopen()
    if(kind==='polygon_edge'){
      await selectNote()
      assert.ok(await evaluate(`(()=>{const ordinary=document.querySelector('${board} [data-geometry-segment-id="ab"]'),highlight=document.querySelector('${board} [data-annotation-target-highlight]');return !!highlight&&(ordinary.compareDocumentPosition(highlight)&Node.DOCUMENT_POSITION_FOLLOWING)!==0})()`),'Coincident polygon-edge highlight paints above ordinary AB')
      const other=await location('c');await at(other.x,other.y)
      assert.equal(await evaluate(`document.querySelectorAll('[data-annotation-target-highlight]').length`),0)
    }
    console.log(`PASS framed: ${kind} authoring, retarget world pose and persisted identity`)
  }
  await attach('point','d',25,10)
  const beforeSlide=await pose();await drag(`${board} [data-geometry-point-id="d"]`,20,15);assert.notEqual(await pose(),beforeSlide);await selectNote()
  await textButton('Dəyiş');const beforeCancel=await pose();await evaluate(`document.querySelector('${board}').focus()`);await escape();assert.equal(await pose(),beforeCancel);assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Ayır')`))
  await textButton('Dəyiş');await textButton('Bağlamanı ləğv et');assert.equal(await pose(),beforeCancel)
  const p=await world(18,10);await at(p.x,p.y)
  await evaluate(`[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent==='Seçiləni sil').click()`);await delay(180);await selectNote();assert.equal(await pose(),beforeCancel,'D attachment survives AB deletion')
  const survived=await save();assert.equal(survived.texts[0].attachment.target_id,'d');assert.equal(survived.constructions.length,0);assert.ok(survived.points.some(p=>p.id==='d'));await reopen()
  console.log('PASS framed: constrained D slide, Escape/cancel, parent deletion preserves D attachment')
  await selectNote();const beforeDetach=await pose();await textButton('Ayır');assert.equal(await pose(),beforeDetach);await click('button[aria-label="Geri al"]');await delay(150);await selectNote();assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Ayır')`));await click('button[aria-label="Yenidən et"]');await delay(150);await selectNote();assert.equal(await pose(),beforeDetach)
  await attach('point','d',29,10)
  const pointPosition=await location('d');await at(pointPosition.x,pointPosition.y)
  await evaluate(`[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent==='Seçiləni sil').click()`);await delay(180);await selectNote();assert.equal(await pose(),beforeDetach)
  assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Bağla')`),'Deleting D detaches annotation')
  await click('button[aria-label="Geri al"]');await delay(150);await selectNote();assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Ayır')`),'Undo restores D and attachment')
  await click('button[aria-label="Yenidən et"]');await delay(150);await selectNote();assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Bağla')`),'Redo detaches again')
  await click('button[aria-label="Geri al"]');await delay(150)
  console.log('PASS framed: target deletion preserves pose/content and Undo/Redo restores attachment')
  await attach('polygon_edge','triangle',18,10)
  await click('button[aria-label="Geri al"]');await delay(150);await selectNote();assert.ok(await evaluate(`document.body.textContent.includes('Bağlantı: D nöqtəsi')`),'Retarget Undo restores D')
  await click('button[aria-label="Yenidən et"]');await delay(150);await selectNote();assert.ok(await evaluate(`document.body.textContent.includes('Bağlantı: AB tərəfi')`),'Retarget Redo restores edge')
  await evaluate(`(()=>{const s=document.querySelector('[aria-label="Bağlantı istiqaməti"]');s.value='follow_target';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await delay(150);assert.equal(await pose(),beforeDetach)
  await click('button[aria-label="Geri al"]');await delay(150);await selectNote();assert.equal(await evaluate(`document.querySelector('[aria-label="Bağlantı istiqaməti"]').value`),'keep_page')
  await click('button[aria-label="Yenidən et"]');await delay(150);await selectNote();assert.equal(await evaluate(`document.querySelector('[aria-label="Bağlantı istiqaməti"]').value`),'follow_target')
  const vertex=await location('b'),destination=await world(7,10)
  await drag(`${board} [data-geometry-point-id="b"]`,destination.x-vertex.x,0);const rotated=await pose();assert.notEqual(rotated,beforeDetach);const degrees=Number(rotated.match(/rotate\(([^)]+)\)/)[1]);assert.ok(degrees>=-90&&degrees<90,'Target-following text stays upright')
  await click('button[aria-label="Geri al"]');await delay(150);await selectNote();assert.equal(await pose(),beforeDetach)
  const follows=await save();assert.equal(follows.texts[0].attachment.auto_upright,true);assert.equal(follows.texts[0].attachment.orientation,'follow_target');await evaluate('reloadEditor()');await until(`document.querySelector('${frame} .geometry-points')`);await reopen();const reloaded=await save();assert.deepEqual(reloaded,follows)
  console.log('PASS framed: Detach Undo/Redo, opted-in orientation, exact save/reload')
  // Same production editor and board, without frameSize. State is a test transport bridge.
  await evaluate(`openUnframedGeometry(${JSON.stringify(source)})`);await until(`document.querySelector('${board} svg')`)
  await attach('polygon_edge','triangle',18,10)
  let state=await evaluate('structuredClone(unframedGeometry)');assert.equal(state.texts[0].attachment.target_kind,'polygon_edge')
  const beforeDrag=await pose();await drag(note+' foreignObject',20,12);assert.notEqual(await pose(),beforeDrag);state=await evaluate('structuredClone(unframedGeometry)');assert.equal(state.texts[0].attachment.target_kind,'polygon_edge');assert.equal(state.texts[0].attachment.parameter,1)
  await selectNote();await textButton('Dəyiş');await evaluate(`document.querySelector('${board}').focus()`);await escape();assert.deepEqual(await evaluate('structuredClone(unframedGeometry)'),state)
  await textButton('Ayır');const detached=await evaluate('structuredClone(unframedGeometry)');assert.equal(detached.texts[0].attachment,undefined)
  await attach('point','d',25,10);await drag(`${board} [data-geometry-point-id="d"]`,15,10);await selectNote();state=await evaluate('structuredClone(unframedGeometry)');assert.equal(state.texts[0].attachment.target_id,'d')
  await evaluate('openUnframedGeometry(JSON.parse(JSON.stringify(unframedGeometry)))');await until(`document.querySelector('${board} svg')`);assert.deepEqual(await evaluate('structuredClone(unframedGeometry)'),state)
  console.log('PASS unframed: edge/point attachments, offset dragging, cancel, detach, constrained slide and JSON reopen')
}
