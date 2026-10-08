import assert from 'node:assert/strict'
export async function runFinalPointOnSegmentAcceptance({evaluate,until,textButton,box,pointer,delay,click}) {
  const board='.geometry-authoring-board'
  const tool=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`);await delay(100)}
  const at=async(x,y)=>{await pointer('mousePressed',x,y,{button:'left',clickCount:1});await pointer('mouseReleased',x,y,{button:'left',clickCount:1});await delay(150)}
  const point=async i=>{await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`);await delay(50);const r=await box(`${board} [data-geometry-point-id="point-${i}"]`);return {x:r.x+r.width/2,y:r.y+r.height/2}}
  const localPoint=async i=>{const p=await point(i),r=await box(board);return {x:p.x-r.x,y:p.y-r.y}}
  const choose=async i=>{const p=await point(i);await at(p.x,p.y)}
  const save=async frame=>{await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`);return evaluate(`structuredClone(savedRevision.blocks.find(b=>b.id===${JSON.stringify(frame.match(/frame-\d+/)[0])}).payload.source_data)`)}
  const reopen=async frame=>{await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${board} svg')`)}
  let constrainedBaseline
  for(const kind of ['segment','polygon_edge']){
    const frame=kind==='segment'?'[data-frame-id="frame-1"]':'[data-frame-id="frame-2"]'
    await textButton('Həndəsə');await textButton('Çərçivə əlavə et');await until(`document.querySelector('${board} svg')`)
    await tool('Nöqtə');const r=await box(board)
    for(const [x,y] of [[80,100],[240,100],[160,240]])await at(r.x+x,r.y+y)
    if(kind==='segment'){await tool('Parça');await choose(1);await choose(2)}
    else {await tool('Sərbəst fiqur');await choose(1);await choose(2);await choose(3);await textButton('Çoxbucaqlını tamamla')}
    await tool('Nöqtə');let a=await point(1),b=await point(2);await at((a.x+b.x)/2,(a.y+b.y)/2)
    assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),4)
    await tool('Parça');await choose(3);await choose(4)
    const baseline=await save(frame),d=baseline.points.find(p=>p.id==='point-4'),constraint=baseline.constructions.find(c=>c.output_point_id===d.id)
    assert.equal(constraint.parent.kind,kind)
    const cd=baseline.segments.find(s=>s.end_point_id===d.id)
    assert.ok(cd);assert.equal(cd.start_point_id,'point-3')
    if(kind==='segment')constrainedBaseline=baseline
    console.log(`PASS ${kind}: real creation, stable D=${d.id} at (${d.x},${d.y}), CD=${cd.id}, recipe=${constraint.id}`)
    await reopen(frame);await tool('Seç')
    if(kind==='segment'){a=await point(1);b=await point(2);await at(a.x*.8+b.x*.2,a.y*.8+b.y*.2)}
    else {a=await point(1);b=await point(2);const c=await point(3);await at(a.x*.5+b.x*.2+c.x*.3,a.y*.5+b.y*.2+c.y*.3)}
    const before=await localPoint(4)
    await tool('Seçiləni sil');await delay(150)
    assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`),4)
    const after=await localPoint(4);assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1,'Deletion preserves board-relative position')
    await choose(4);assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Sərbəst et')`),false,'D is free after parent deletion')
    await click('button[aria-label="Geri al"]');await delay(150);await choose(4)
    assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Sərbəst et')`),true,'Undo restores constraint')
    assert.ok(Math.hypot((await localPoint(4)).x-before.x,(await localPoint(4)).y-before.y)<1)
    await click('button[aria-label="Yenidən et"]');await delay(150);await choose(4)
    assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Sərbəst et')`),false,'Redo detaches D')
    const deleted=await save(frame)
    assert.deepEqual(deleted.points.find(p=>p.id===d.id),d)
    assert.deepEqual(deleted.segments.find(s=>s.id===cd.id),cd)
    assert.equal(deleted.constructions.some(c=>c.id===constraint.id),false)
    assert.equal(kind==='segment'?deleted.segments.some(s=>s.id===constraint.parent.segment_id):deleted.polygons.some(p=>p.id===constraint.parent.polygon_id),false)
    await evaluate('reloadEditor()');await until(`document.querySelector('${frame} .geometry-points')`);await reopen(frame);await choose(4)
    assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Sərbəst et')`),false)
    const reloaded=await save(frame);assert.deepEqual(reloaded,deleted,'Save/reopen preserves identities, positions and consumers')
    console.log(`PASS ${kind}: parent deletion, Undo restoration, Redo preservation and save/reload exact equality; D and ${cd.id} survive`)
  }
  // Render the real GeometryEditor without frameSize; retain production model/history.
  await evaluate(`openUnframedGeometry(${JSON.stringify({...constrainedBaseline,points:constrainedBaseline.points.slice(0,3),segments:constrainedBaseline.segments.slice(0,1),constructions:[]})})`)
  await until(`document.querySelector('${board} svg')`)
  await textButton('Nöqtə');const a=await point(1),b=await point(2);await at((a.x+b.x)/2,(a.y+b.y)/2)
  await until(`unframedGeometry.constructions?.length===1`)
  const unframed=await evaluate('structuredClone(unframedGeometry)'),d=unframed.points.at(-1),p=await point(4)
  await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',p.x+30,p.y+40,{button:'left',buttons:1});await pointer('mouseReleased',p.x+30,p.y+40,{button:'left',clickCount:1});await delay(150)
  const moved=await evaluate('structuredClone(unframedGeometry)'),out=moved.points.find(q=>q.id===d.id)
  assert.notEqual(out.x,d.x);assert.equal(out.y,d.y);assert.equal(out.id,d.id);assert.notEqual(moved.constructions[0].t,unframed.constructions[0].t)
  await evaluate('openUnframedGeometry(JSON.parse(JSON.stringify(unframedGeometry)))');await until(`document.querySelector('${board} svg')`)
  assert.deepEqual(await evaluate('structuredClone(unframedGeometry)'),moved)
  console.log(`PASS unframed: real Point creation and constrained drag, stable ${d.id}, t=${moved.constructions[0].t}, JSON reopen unchanged`)
}
export async function runPointOnSegmentAcceptance({evaluate,until,textButton,box,pointer,delay,click,send}) {
  await textButton('Həndəsə');await textButton('Çərçivə əlavə et')
  const board='.geometry-authoring-board',frame='[data-frame-id="frame-1"]'
  await until(`document.querySelector('${board} svg')`)
  const tool=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`);await delay(100)}
  const at=async(x,y)=>{await pointer('mousePressed',x,y,{button:'left',clickCount:1});await pointer('mouseReleased',x,y,{button:'left',clickCount:1});await delay(150)}
  const point=async i=>{const r=await box(`${board} [data-geometry-point-id="point-${i}"]`);return {x:r.x+r.width/2,y:r.y+r.height/2}}
  const choose=async i=>{const p=await point(i);await at(p.x,p.y)}
  const edge=async(a,b,t=.5)=>{const p=await point(a),q=await point(b);return {x:(1-t)*p.x+t*q.x,y:(1-t)*p.y+t*q.y}}
  const count=()=>evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`)
  await tool('Nöqtə');const r=await box(board);for(const [x,y] of [[80,100],[240,100],[160,240]])await at(r.x+x,r.y+y)
  await tool('Parça');await choose(1);await choose(2)
  await tool('Nöqtə');await choose(1);assert.equal(await count(),3,'Existing point click creates no duplicate')
  let p=await edge(1,2,.25);await at(p.x,p.y);assert.equal(await count(),4)
  await until(`document.body.textContent.includes('Sərbəst et')`)
  const drag=async(i,dx,dy)=>{const p=await point(i);await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',p.x+dx,p.y+dy,{button:'left',buttons:1});await pointer('mouseReleased',p.x+dx,p.y+dy,{button:'left',clickCount:1});await delay(150)}
  const initial=await point(4);await drag(4,40,30);const slid=await point(4);assert.ok(Math.abs(slid.y-initial.y)<1);assert.ok(slid.x>initial.x+30)
  await click('button[aria-label="Geri al"]');await delay(150);assert.ok(Math.abs((await point(4)).x-initial.x)<1)
  const cancelStart=await point(4);await pointer('mousePressed',cancelStart.x,cancelStart.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',cancelStart.x+30,cancelStart.y+20,{button:'left',buttons:1})
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await pointer('mouseReleased',cancelStart.x+30,cancelStart.y+20,{button:'left',clickCount:1});await delay(150);assert.ok(Math.abs((await point(4)).x-initial.x)<1,'Canceled drag preserves the point')
  await choose(4);await textButton('Sərbəst et');await drag(4,0,20);assert.ok((await point(4)).y>initial.y+15)
  await click('button[aria-label="Geri al"]');await delay(100);await click('button[aria-label="Geri al"]');await delay(100)
  await tool('Parça');await choose(3);await choose(4)
  await tool('Sərbəst fiqur');await choose(1);await choose(2);await choose(3);await textButton('Çoxbucaqlını tamamla')
  await tool('Nöqtə');const pa=await point(1),pb=await point(2),pc=await point(3);await at((pa.x+pb.x+pc.x)/3,(pa.y+pb.y+pc.y)/3);assert.equal(await count(),4,'Polygon interior is not an edge hit')
  await tool('Seç');await choose(4);await textButton('Başqa tərəfə bağla');await textButton('Bağlamanı ləğv et')
  await tool('Nöqtə');p=await edge(1,2,.6);await at(p.x,p.y)
  await until(`document.querySelector('[aria-label="Tərəfi seçin"]')`)
  assert.equal(await count(),4,'Ambiguous hit does not choose an arbitrary parent')
  await evaluate(`[...document.querySelectorAll('[aria-label="Tərəfi seçin"] button')].find(b=>b.textContent.startsWith('Çoxbucaqlı tərəfi')).click()`);await delay(150)
  assert.equal(await count(),5)
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`)
  const saved=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)')
  const recipe=saved.constructions.find(c=>c.output_point_id==='point-5')
  assert.equal(recipe.kind,'point_on_segment');assert.equal(recipe.parent.kind,'polygon_edge');assert.ok(Math.abs(recipe.t-.6)<.01)
  assert.equal(saved.segments.find(s=>s.id==='segment-2').end_point_id,'point-4')
  await evaluate(`document.querySelector('${frame} .visual-frame__actions button').click()`);await until(`document.querySelector('${board}')`)
  await tool('Seç');await choose(5);await textButton('Başqa tərəfə bağla');p=await edge(1,2,.7);await at(p.x,p.y)
  await until(`document.querySelector('[aria-label="Tərəfi seçin"]')`)
  await evaluate(`[...document.querySelectorAll('[aria-label="Tərəfi seçin"] button')].find(b=>b.textContent.startsWith('Parça:')).click()`);await delay(150)
  await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`)
  const retargeted=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)')
  assert.equal(retargeted.constructions.find(c=>c.output_point_id==='point-5').parent.kind,'segment')
  console.log('PASS: real Edge Point tool, duplicate prevention, constrained sliding/Undo, detach/free drag, CD dependency, retarget cancellation, ambiguous polygon-edge selection and persisted save/reopen/retarget')
}
