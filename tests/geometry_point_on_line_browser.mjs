import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function runPointOnLineAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}) {
  const board='.geometry-authoring-board',frame='[data-frame-id="frame-1"]'
  let unframed=false
  const at=async(x,y)=>{await pointer('mouseMoved',x,y);await pointer('mousePressed',x,y,{button:'left',clickCount:1});await pointer('mouseReleased',x,y,{button:'left',clickCount:1});await delay(150)}
  const tool=async label=>{
    if(unframed)await textButton(label==='Seç'?'Seç / hərəkət etdir':label)
    else await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool '+${JSON.stringify(label)});b.click()})()`)
    await delay(100)
  }
  const location=async id=>{await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`);await delay(50);const r=await box(`${board} [data-geometry-point-id="${id}"]`);return {x:r.x+r.width/2,y:r.y+r.height/2}}
  const choose=async id=>{const p=await location(id);await at(p.x,p.y)}
  const count=()=>evaluate(`document.querySelectorAll('${board} [data-geometry-point-id]').length`)
  const escape=async()=>{await evaluate(`document.querySelector('${board}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100)}
  const save=async()=>{await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`);return evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)')}
  const reopen=async()=>{await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${board} svg')`)}
  const local=async id=>{const p=await location(id),r=await box(board);return {x:p.x-r.x,y:p.y-r.y}}
  const state=()=>evaluate('structuredClone(unframedGeometry)')
  const recipe=g=>g.constructions.find(c=>c.kind==='point_on_line')
  const close=(a,b,tolerance=1)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<tolerance,`${JSON.stringify(a)} != ${JSON.stringify(b)}`)
  await textButton('Həndəsə');await textButton('Çərçivə əlavə et');await until(`document.querySelector('${board} svg')`)
  await tool('Nöqtə');let r=await box(board)
  for(const [x,y] of [[100,100],[220,100],[160,230],[100,180],[220,180]])await at(r.x+x,r.y+y)
  assert.equal(await count(),5,'Empty canvas creates free points')
  await tool('Düz xətt');await choose('point-1');await choose('point-2')
  await tool('İstiqamətlənmiş düz xətt');await choose('point-4');await choose('point-5')
  await tool('Nöqtə');let b=await location('point-2');await at(b.x+60,b.y)
  assert.equal(await count(),6,'Point on visible infinite extension')
  await tool('Parça');await choose('point-3');await choose('point-6')
  const authored=await save(),dId='point-6',parentId=recipe(authored).parent.line_id
  assert.equal(recipe(authored).kind,'point_on_line');assert.ok(recipe(authored).t>1)
  assert.equal(authored.segments[0].end_point_id,dId)
  const baseline=structuredClone(authored)
  // Add a normal annotation fixture; attachment itself is authored through the UI.
  baseline.texts=[{id:'note',x:20,y:70,content:'D annotation',runs:[{type:'text',text:'D annotation',marks:[]}],layout_width:22,scale:1,rotation:0}]
  await evaluate(`savedRevision.blocks[0].payload.source_data=${JSON.stringify(baseline)};reloadEditor()`);await until(`document.querySelector('${frame} .geometry-points')`);await reopen()
  const note='[data-geometry-annotation-layer] [data-annotation-id="note"]'
  await click(note+' foreignObject');await textButton('Bağla');await choose(dId)
  const pointTarget=`[data-attachment-target-kind="point"][data-attachment-target-id="${dId}"]`
  if(await evaluate(`!!document.querySelector('${pointTarget}')`))await click(pointTarget)
  await until(`!document.querySelector('[aria-label="Bağlantı hədəfi"]')`)
  const pose=()=>evaluate(`document.querySelector('${note}').getAttribute('transform')`)
  const beforePose=await pose()
  await tool('Seç');let a=await location('point-1'),p=await location(dId)
  await drag(`${board} [data-geometry-point-id="${dId}"]`,a.x-p.x-30,35)
  let dp=await location(dId),ap=await location('point-1');assert.ok(dp.x<ap.x);assert.ok(Math.abs(dp.y-ap.y)<1)
  assert.notEqual(await pose(),beforePose,'Annotation tracks constrained D')
  await click('button[aria-label="Geri al"]');await delay(150)
  close(await location(dId),p);assert.equal(await pose(),beforePose,'One undo restores full drag and annotation')
  await click('button[aria-label="Yenidən et"]');await delay(150)
  dp=await location(dId);assert.ok(dp.x<(await location('point-1')).x)
  b=await location('point-2');await drag(`${board} [data-geometry-point-id="${dId}"]`,b.x-dp.x+70,-25)
  dp=await location(dId);assert.ok(dp.x>(await location('point-2')).x);assert.ok(Math.abs(dp.y-(await location('point-2')).y)<1)
  const moved=await save();assert.ok(recipe(moved).t>1);assert.equal(moved.texts[0].attachment.target_id,dId);await reopen()
  await tool('Seç');await choose('point-2')
  await drag(`${board} [data-geometry-point-id="point-2"]`,0,25)
  const rotated=await save(),rotatedD=rotated.points.find(p=>p.id===dId),aa=rotated.points[0],bb=rotated.points[1],t=recipe(rotated).t
  assert.equal(t,recipe(moved).t);close(rotatedD,{x:aa.x+t*(bb.x-aa.x),y:aa.y+t*(bb.y-aa.y)},1e-8)
  assert.equal(rotated.segments[0].end_point_id,dId);assert.notEqual(rotatedD.y,moved.points.find(p=>p.id===dId).y,JSON.stringify({before:moved.points,after:rotated.points}))
  await reopen();await tool('Seç');await choose(dId);assert.ok(await evaluate(`document.body.textContent.includes('düz xətti üzərində')`),JSON.stringify({rotatedD,position:await location(dId),board:await box(board),text:await evaluate('document.body.innerText')}))
  await textButton('Başqa xəttə bağla');await escape()
  assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Sərbəst et')`))
  const canceled=await save();assert.deepEqual(canceled,rotated,'Escape retarget leaves constraint untouched');await reopen()
  await tool('Seç');await choose(dId);await textButton('Başqa xəttə bağla')
  let e=await location('point-4'),f=await location('point-5');await at((e.x+f.x)/2,e.y)
  const retargeted=await save();assert.notEqual(recipe(retargeted).parent.line_id,parentId);assert.equal(retargeted.points.find(p=>p.id===dId).x,rotatedD.x)
  close(retargeted.points.find(p=>p.id===dId),{x:rotatedD.x,y:retargeted.points[3].y},1e-8)
  await reopen();await tool('Seç');await choose(dId);await textButton('Başqa xəttə bağla')
  a=await location('point-1');b=await location('point-2');await at((a.x+b.x)/2,(a.y+b.y)/2)
  const restored=await save();assert.equal(recipe(restored).parent.line_id,parentId);await reopen()
  await tool('Seç');a=await location('point-1');b=await location('point-2');await at(a.x*.7+b.x*.3,a.y*.7+b.y*.3)
  const last=await local(dId),lastPose=await pose();await tool('Seçiləni sil')
  assert.equal(await count(),6);close(await local(dId),last);assert.equal(await pose(),lastPose)
  await choose(dId);assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Sərbəst et')`),false)
  await click('button[aria-label="Geri al"]');await delay(150);await choose(dId)
  assert.ok(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent==='Sərbəst et')`))
  await click('button[aria-label="Yenidən et"]');await delay(150)
  const detached=await save();assert.equal(detached.constructions.length,0);assert.equal(detached.segments[0].end_point_id,dId)
  assert.equal(detached.texts[0].attachment.target_id,dId);assert.deepEqual(detached.points.find(p=>p.id===dId),restored.points.find(p=>p.id===dId))
  await evaluate('reloadEditor()');await until(`document.querySelector('${frame} .geometry-points')`);await reopen();assert.deepEqual(await save(),detached)
  assert.ok(await evaluate(`requests.some(r=>r.method==='PATCH'&&r.body?.source_data?.constructions?.some(c=>c.kind==='point_on_line'))`),'Existing API transport carries new construction')
  console.log('PASS framed Edge: authored infinite/directed lines, extension D, both-side drag, one-step Undo/Redo, CD, rotation, annotation, retarget/Escape, parent deletion and API-transport reload')

  // Unframed production editor with a normal persisted graph and its own history.
  unframed=true
  await evaluate(`openUnframedGeometry(${JSON.stringify(authored)})`);await until(`document.querySelector('${board} svg')`)
  await tool('Nöqtə');await choose(dId);assert.equal(await count(),6,'Existing point click prevents duplicate')
  a=await location('point-1');b=await location('point-2');await at(b.x+3,b.y+3);assert.equal(await count(),6,'Projected point near B uses existing hit tolerance')
  await tool('Seç');p=await location(dId);a=await location('point-1')
  await drag(`${board} [data-geometry-point-id="${dId}"]`,a.x-p.x-25,40)
  let ug=await state();assert.ok(recipe(ug).t<0);assert.equal(ug.points.find(p=>p.id===dId).y,ug.points[0].y)
  const first=structuredClone(ug);await choose(dId);await textButton('Başqa xəttə bağla');await escape();assert.deepEqual(await state(),first)
  assert.ok(await evaluate('unframedUndo()'));await delay(150);assert.deepEqual(await state(),authored,'Unframed drag is one history entry')
  assert.ok(await evaluate('unframedRedo()'));await delay(150);assert.deepEqual(await state(),first)
  await tool('Seç');a=await location('point-1');b=await location('point-2');await at(a.x*.7+b.x*.3,a.y*.7+b.y*.3);await tool('Seçiləni sil')
  const unframedDetached=await state();assert.equal(unframedDetached.constructions.length,0);assert.deepEqual(unframedDetached.segments,first.segments)
  assert.deepEqual(unframedDetached.points.find(p=>p.id===dId),first.points.find(p=>p.id===dId))
  assert.ok(await evaluate('unframedUndo()'));await delay(150);assert.deepEqual(await state(),first)
  assert.ok(await evaluate('unframedRedo()'));await delay(150);assert.deepEqual(await state(),unframedDetached)
  assert.ok(await evaluate('unframedUndo()'));await delay(150)
  await choose(dId);await textButton('Başqa xəttə bağla');e=await location('point-4');f=await location('point-5');await at((e.x+f.x)/2,e.y)
  ug=await state();assert.equal(recipe(ug).parent.line_id,'directed_line-1');assert.ok(recipe(ug).t<0)
  const projected=structuredClone(ug);await choose(dId);await textButton('Sərbəst et');assert.equal((await state()).constructions.length,0)
  await choose(dId);await drag(`${board} [data-geometry-point-id="${dId}"]`,30,80);assert.notEqual((await state()).points.find(p=>p.id===dId).y,projected.points.find(p=>p.id===dId).y)

  // Ambiguous line/segment and line/line hits: picker, Escape and button cancellation.
  const overlap=structuredClone(authored)
  overlap.lines.push({id:'overlap',kind:'directed_line',start_point_id:'point-1',end_point_id:'point-2'})
  overlap.segments.push({id:'ab-segment',start_point_id:'point-1',end_point_id:'point-2'})
  await evaluate(`openUnframedGeometry(${JSON.stringify(overlap)})`);await until(`document.querySelector('${board} svg')`)
  await tool('Nöqtə');a=await location('point-1');b=await location('point-2');await at((a.x+b.x)/2,a.y)
  await until(`document.querySelector('[aria-label="Tərəfi seçin"]')`)
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Tərəfi seçin"] button').length`),4)
  await escape();assert.deepEqual(await state(),overlap)
  await at((a.x+b.x)/2,a.y);await textButton('Ləğv et');assert.deepEqual(await state(),overlap)
  await at((a.x+b.x)/2,a.y);await evaluate(`[...document.querySelectorAll('[aria-label="Tərəfi seçin"] button')].find(b=>b.textContent.startsWith('Düz xətt:')).click()`);await delay(150)
  const ambiguous=await state();assert.equal(ambiguous.points.length,7);assert.equal(ambiguous.constructions.at(-1).kind,'point_on_line')
  await tool('Nöqtə');a=await location('point-1');b=await location('point-2');await at((a.x+b.x)/2,a.y);assert.equal(await count(),7)
  await evaluate('openUnframedGeometry(JSON.parse(JSON.stringify(unframedGeometry)))');await until(`document.querySelector('${board} svg')`);assert.deepEqual(await state(),ambiguous)
  console.log('PASS unframed Edge: stable unbounded drag, directed-line retarget/cancel/detach, duplicates, line/line/segment ambiguity picker, Escape/cancel and JSON reopen')
  // Export the real Edge-authored, still-constrained graph for separate HTTP/DB acceptance.
  const exportPath=path.join(os.tmpdir(),'geometry-point-on-line-edge.json')
  await fs.writeFile(exportPath,JSON.stringify(restored,null,2))
  console.log('Edge-authored persistence fixture:',exportPath)
}
