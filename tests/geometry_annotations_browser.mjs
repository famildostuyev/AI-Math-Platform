import assert from 'node:assert/strict'
export async function runGeometryAnnotationsAcceptance({evaluate,until,textButton,click,box,pointer,delay}){
 await textButton('Həndəsə');await textButton('Çərçivə əlavə et')
 const board='.geometry-authoring-board',frame='[data-frame-id="frame-1"]'
 await until(`document.querySelector('${board} svg')`)
 const tool=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`);await delay(100)}
 const at=async(x,y)=>{const r=await box(board);await pointer('mousePressed',r.x+x,r.y+y,{button:'left',clickCount:1});await pointer('mouseReleased',r.x+x,r.y+y,{button:'left',clickCount:1});await delay(150)}
 await tool('Mətn');await at(100,100);await until('document.querySelector("[data-geometry-annotation-editor]")')
 await textButton('Cancel annotation');assert.equal(await evaluate('document.querySelectorAll("[data-annotation-id]").length'),0)
 await tool('Mətn');await at(100,100)
 const fill=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await delay(100)}
 await fill('[aria-label="Annotation text 1"]','Area = ')
 await textButton('Add math');await until(`document.querySelector('math-field[aria-label="Annotation math 2"]')`)
 await evaluate(`(()=>{const f=document.querySelector('math-field[aria-label="Annotation math 2"]');f.focus();f.executeCommand(['insert',${JSON.stringify('\\frac{1}{2}ah')}]);f.dispatchEvent(new Event('input',{bubbles:true}))})()`)
 await textButton('Add text');await fill('[aria-label="Annotation text 3"]',' units')
 await textButton('Apply annotation');await until(`document.querySelector('[data-annotation-id="text-1"] .katex')`)
 const annotation='[data-geometry-annotation-layer] [data-annotation-id="text-1"]'
 const initial=await evaluate(`document.querySelector('${annotation}').getAttribute('transform')`)
 const drag=async(selector,dx,dy)=>{const r=await box(selector),x=r.x+r.width/2,y=r.y+r.height/2;await pointer('mousePressed',x,y,{button:'left',buttons:1,clickCount:1});await pointer('mouseMoved',x+dx,y+dy,{button:'left',buttons:1});await pointer('mouseReleased',x+dx,y+dy,{button:'left',clickCount:1});await delay(150)}
 await drag(annotation+' foreignObject',20,12)
 assert.notEqual(await evaluate(`document.querySelector('${annotation}').getAttribute('transform')`),initial)
 await click('button[aria-label="Geri al"]');await delay(150)
 assert.equal(await evaluate(`document.querySelector('${annotation}').getAttribute('transform')`),initial)
 // Re-select after history navigation; each transform must undo as one operation.
 for(const kind of ['resize','scale','rotate']){
  await drag(annotation+' foreignObject',0,0)
  const oldWidth=await evaluate(`document.querySelector('${annotation} foreignObject').getAttribute('width')`)
  await drag(annotation+` [data-annotation-transform="${kind}"]`,20,kind==='resize'?0:12)
  const changed=kind==='resize'?await evaluate(`document.querySelector('${annotation} foreignObject').getAttribute('width')`):await evaluate(`document.querySelector('${annotation}').getAttribute('transform')`)
  assert.notEqual(changed,kind==='resize'?oldWidth:initial)
  await click('button[aria-label="Geri al"]');await delay(150)
  assert.equal(await evaluate(`document.querySelector('${annotation}').getAttribute('transform')`),initial)
 }
 await click(`${frame} .visual-frame__actions button`);await until(`!document.querySelector('${board}')`)
 const saved=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)')
 assert.equal(saved.texts.length,1);assert.deepEqual(saved.texts[0].runs.map(r=>r.type),['text','inline_math','text'])
 assert.ok(saved.texts[0].runs[1].latex.includes('frac'));assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-annotations [data-annotation-id]').length`),1)
 await evaluate(`document.querySelector('${frame} .visual-frame__actions button').click()`);await until(`document.querySelector('${board}')`)
 assert.equal(await evaluate(`document.querySelector('${annotation}').getAttribute('transform')`),initial)
 await drag(annotation+' foreignObject',0,0);await textButton('Edit annotation');await until(`document.querySelector('math-field[aria-label="Annotation math 2"]')`)
 assert.ok(await evaluate(`document.querySelector('math-field[aria-label="Annotation math 2"]').value.includes('frac')`))
 await textButton('Cancel annotation')
 console.log('PASS: Edge empty cancellation, real MathLive mixed annotation authoring, move/resize/scale/rotate with one-step undo, structured save/reopen and editable math')
}
