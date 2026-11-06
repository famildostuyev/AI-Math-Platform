import assert from 'node:assert/strict'
export async function runMenuSwitchAcceptance({evaluate,until,textButton,click,send,delay}){
 const ribbon='.universal-editor-geometry-ribbon',f2='[data-frame-id="frame-1"]',f3='[data-frame-id="frame-2"]'
 await textButton('H\u0259nd\u0259s\u0259');await textButton('\u00c7\u0259r\u00e7iv\u0259 \u0259lav\u0259 et');await until(`document.querySelector('${f2} .geometry-authoring-board')`)
 await click(`${f2} .visual-frame__actions button`);await until(`!document.querySelector('${f2} .geometry-editor')`)
 await textButton('3D s\u0259hn\u0259 \u0259lav\u0259 et');await until(`document.querySelector('${f3} .geometry-3d-viewport canvas')`)
 await click(`${f3} .visual-frame__actions button`);await until(`!document.querySelector('${f3} .geometry-3d-editor')`)
 await click(f2);await click(`${f2} .visual-frame__actions button`);await until(`document.querySelector('${f2} .geometry-authoring-board')`)
 const probe=()=>evaluate(`(()=>{const d=[...document.querySelectorAll('${ribbon}>details')].find(d=>d.querySelector('summary').textContent.includes('X\u0259tt')),s=d.querySelector('summary'),r=s.getBoundingClientRect();return{state:menuSwitchState,open:d.open,expanded:s.getAttribute('aria-expanded'),disabled:s.getAttribute('aria-disabled'),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,160),dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>e.className)}})()`)
 const original=await evaluate('structuredClone(savedRevision.blocks.map(b=>b.payload.source_data))')
 console.log('BEFORE',JSON.stringify(await probe()))
 await evaluate(`(()=>{const d=[...document.querySelectorAll('${ribbon}>details')].find(d=>d.querySelector('summary').textContent.includes('X\u0259tt'));if(!d.open)d.querySelector('summary').click()})()`)
 console.log('AFTER programmatic click',JSON.stringify(await probe()));await delay(400);console.log('SETTLED',JSON.stringify(await probe()));console.log('CONTEXT LOG',JSON.stringify(await evaluate('menuSwitchLog.slice(-12)')))
 // A real pointer click after the destination commands register must work.
 await until(`menuSwitchState.dimension===2&&menuSwitchState.commandsId==='frame-1'`)
 if(!(await probe()).open){const pos=await evaluate(`(()=>{const s=[...document.querySelectorAll('${ribbon}>details>summary')].find(e=>e.textContent.includes('X\u0259tt')),r=s.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...pos,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...pos,button:'left',buttons:0,clickCount:1})}
 await until(`menuSwitchState.activeMenu==='geometry:X\u0259tt'`);assert.equal((await probe()).open,true);for(const [frame,dimension]of [[f2,2],[f3,3],[f2,2]]){
   const current=await evaluate(`menuSwitchState.commandsId`)
   if(current){await click(`[data-frame-id="${current}"] .visual-frame__actions button`);await until(`!document.querySelector('[data-frame-id="${current}"] .geometry-authoring-board')&&!document.querySelector('[data-frame-id="${current}"] .geometry-3d-editor')`)}
   await click(frame);await click(`${frame} .visual-frame__actions button`)
   await until(`(()=>{const p=document.querySelector('${ribbon} [data-geometry-action="point"]');return p&&!p.disabled&&p.hasAttribute('data-tool-3d')===${dimension===3}})()`)
   assert.equal(await evaluate('menuSwitchState.dimension'),dimension)
   const selector=await evaluate(`(()=>{const e=[...document.querySelectorAll('${ribbon}>details>summary')].find(e=>e.textContent.includes('X\u0259tt'));e.dataset.menuSwitchTrigger='yes';return '[data-menu-switch-trigger="yes"]'})()`)
   if((await probe()).open)await click(selector)
   await click(selector);await until(`menuSwitchState.activeMenu==='geometry:X\u0259tt'`)
   assert.equal((await probe()).open,true)
   assert.equal((await probe()).expanded,'true')
   await click(`${ribbon} [data-geometry-action="directed_line"]`)
   await until(`document.querySelector('${ribbon} [data-geometry-action="directed_line"]').getAttribute('aria-pressed')==='true'`)
   assert.equal(await evaluate(`document.querySelector('${ribbon} [data-geometry-action="directed_line"]').textContent`),dimension===3?'\u015e\u00fca':'\u0130stiqam\u0259tl\u0259nmi\u015f d\u00fcz x\u0259tt')
 }
 assert.deepEqual(await evaluate('savedRevision.blocks.map(b=>b.payload.source_data)'),original)
 console.log('PASS: focused command-registration regression; repeated 2D/3D pointer menu clicks, dimension-specific routing, no geometry changes')
}
