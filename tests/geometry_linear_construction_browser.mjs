import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {commitMidpoint}=await loadGeometryModule('geometryConstructionModel')
const {defaultGeometryPlacement}=await loadGeometryModule('geometryFrameModel')

export async function runGeometryLinearConstructionAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}){
 const board='.geometry-authoring-board',frame=id=>`[data-frame-id="${id}"]`,point=id=>`${board} [data-geometry-point-id="${id}"]`
 const a={...emptyGeometryV1(),description:'F2 frame A',points:[['a',10,10],['b',40,15],['d',10,35],['e',35,40],['f',60,15],['g',75,30],['h',55,60],['i',80,65],['p',20,70],['c',65,80],['j',15,85],['k',35,85],['center',70,45],['v1',10,45],['v2',25,45],['v3',20,60]].map(([id,x,y])=>({id,x,y,label:null})),segments:[{id:'s',start_point_id:'a',end_point_id:'b'}],lines:[{id:'l',kind:'line',start_point_id:'d',end_point_id:'e'},{id:'dl',kind:'directed_line',start_point_id:'f',end_point_id:'g'},{id:'v',kind:'vector',start_point_id:'h',end_point_id:'i'}],circles:[{id:'circle',kind:'circle',center_point_id:'center',radius:6}],polygons:[{id:'triangle',point_ids:['v1','v2','v3']}]}
 const sourceA=commitMidpoint(a,'j','k'),m=sourceA.constructions[0].output_point_id
 const sourceB={...emptyGeometryV1(),description:'F2 frame B',points:[['u',10,10],['v',45,25],['p',20,65],['center',65,65]].map(([id,x,y])=>({id,x,y,label:null})),lines:[{id:'vector',kind:'vector',start_point_id:'u',end_point_id:'v'}],segments:[{id:'segment',start_point_id:'p',end_point_id:'center'}],circles:[{id:'disk',kind:'disk',center_point_id:'center',radius:9}]}
 await until('document.querySelector("math-field")')
 const text=await evaluate('JSON.stringify(savedRevision.blocks[0])'),formula=await evaluate('document.querySelector("math-field").value')
 const blocks=[sourceA,sourceB].map((g,i)=>({id:`frame-${i+1}`,block_type:'geometry',sort_order:(i+1)*1000,payload:{source_data:g,format_version:1},visual_placement:defaultGeometryPlacement(g,i*460)}))
 await evaluate(`savedRevision.blocks.push(...${JSON.stringify(blocks)});reloadEditor()`)
 await until('document.querySelectorAll("[data-frame-id]").length===2')
 const action=async label=>{await evaluate(`(()=>{const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click()})()`);await delay(100)}
 const menu=async label=>{await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()===${JSON.stringify(label+' ▾')});if(!d.open)d.querySelector('summary').click()})()`);await delay(60)}
 const tool=async kind=>{await menu('Konstruksiya');await action(kind==='parallel'?'Paralel':'Perpendikulyar')}
 const edit=async id=>{await click(frame(id));await click(`${frame(id)} .visual-frame__actions button`);await until(`document.querySelector('${board}')`)}
 const save=async id=>{await click(`${frame(id)} .visual-frame__actions button`);await until('!document.querySelector(".geometry-authoring-board")');const b=await evaluate(`structuredClone(savedRevision.blocks.find(b=>b.id===${JSON.stringify(id)}))`);assert.ok(normalize(b.payload.source_data));return b}
 const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(120)}
 const pointAt=async id=>{await evaluate(`document.querySelector('${board}').scrollIntoView({block:'center'})`);const r=await box(point(id));return{x:r.x+r.width/2,y:r.y+r.height/2}}
 const press=async(x,y)=>{await pointer('mouseMoved',x,y);await pointer('mousePressed',x,y,{button:'left',clickCount:1});await pointer('mouseReleased',x,y,{button:'left',clickCount:1});await delay(140)}
 const selectSource=async(g,id)=>{const obj=[...g.segments,...(g.lines??[])].find(l=>l.id===id);const a=await pointAt(obj.start_point_id),b=await pointAt(obj.end_point_id);const t=Math.hypot(b.x-a.x,b.y-a.y)<20?30:.37;await press(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)}
 const hoverPoint=async id=>{const p=await pointAt(id);await pointer('mouseMoved',p.x,p.y);await delay(120)}
 const create=async(g,kind,id,through)=>{await tool(kind);await selectSource(g,id);await hoverPoint(through);assert.ok(await evaluate('document.querySelector("[data-geometry-construction-preview]")'));await click(point(through));await delay(150)}
 const counts=()=>evaluate(`document.querySelectorAll('${board} [data-geometry-line-id]').length`)
 await edit('frame-1');await menu('Konstruksiya')
 assert.deepEqual(await evaluate("[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].map(b=>[b.textContent,b.disabled])"),[['Orta nöqtə',false],['Paralel',false],['Perpendikulyar',false],['Kəsişmə',true]])
 let g=sourceA
 for(const kind of ['parallel','perpendicular']){
  await tool(kind);await escape();assert.equal(await counts(),g.lines.length)
  await tool(kind);await selectSource(g,'s');await hoverPoint('p');assert.ok(await evaluate('document.querySelector("[data-geometry-construction-preview]")'));await escape();assert.equal(await counts(),g.lines.length)
  for(const id of ['s','l','dl','v']){
   const through=id==='s'?m:'p';await create(g,kind,id,through)
   const saved=await save('frame-1');g=saved.payload.source_data
   const recipe=g.constructions.at(-1);assert.equal(recipe.kind,kind);assert.equal(recipe.source.id,id);assert.equal(recipe.through_point_id,through)
   await edit('frame-1');await create(g,kind,id,through);assert.equal(await counts(),g.lines.length)
  }
 }
 const l1=g.constructions.find(c=>c.kind==='parallel'&&c.source.id==='s').output_line_id
 await create(g,'perpendicular',l1,'c');g=(await save('frame-1')).payload.source_data
 const l2=g.constructions.at(-1).output_line_id
 await edit('frame-1');await action('Seç')
 // All source families, a free through-point and the midpoint's upstream point.
 for(const id of ['a','d','f','h','p','j']){const before=g.points.find(p=>p.id===id);await drag(point(id),8,4);g=(await save('frame-1')).payload.source_data;assert.notDeepEqual(g.points.find(p=>p.id===id),before,id+' source moved');await edit('frame-1')}
 const support=g.constructions.find(c=>c.kind==='parallel').support_point_id
 await action('Seç');await drag(point(support),25,20);assert.deepEqual((await save('frame-1')).payload.source_data,g)
 await edit('frame-1');await tool('parallel');await selectSource(g,'s');await hoverPoint('c')
 await send('Emulation.setEmulatedMedia',{media:'print'});assert.equal(await evaluate('[...document.querySelectorAll("[data-geometry-transient]")].every(e=>getComputedStyle(e).display==="none")'),true);await send('Emulation.setEmulatedMedia',{media:''})
 assert.deepEqual((await save('frame-1')).payload.source_data,g)
 await edit('frame-2');await create(sourceB,'perpendicular','vector','p');let b=await save('frame-2')
 await edit('frame-2');await action('Seç');await drag(point('u'),8,4);b=await save('frame-2')
 await click(frame('frame-1'));for(const [h,x,y]of[['e',60,0],['s',0,50],['se',30,20]])await drag(`${frame('frame-1')} [data-handle=${h}]`,x,y)
 await drag(`${frame('frame-1')} .visual-frame__move`,20,15);await click(`${frame('frame-1')} .visual-frame__actions button:nth-child(2)`)
 assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data'),g);assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
 await evaluate('reloadEditor()');await until('document.querySelectorAll("[data-frame-id]").length===2');await edit('frame-1')
 await action('Seç');await evaluate('window.scrollBy(0,73)');await drag(point('j'),8,4);const finalA=await save('frame-1');g=finalA.payload.source_data
 await edit('frame-1');await drag(point(support),20,10);assert.deepEqual((await save('frame-1')).payload.source_data,g)
 await edit('frame-1');await action('Seç');await selectSource(g,l1);await menu('Daha çox');await action('Seçiləni sil')
 let deleted=await save('frame-1');assert.ok(!deleted.payload.source_data.lines.some(l=>l.id===l1||l.id===l2));assert.ok(deleted.payload.source_data.points.some(p=>p.id===m));assert.ok(deleted.payload.source_data.segments.some(s=>s.id==='s'))
 await edit('frame-1');await action('Seç');await selectSource(deleted.payload.source_data,'s');await menu('Daha çox');await action('Seçiləni sil');deleted=await save('frame-1')
 assert.ok(!deleted.payload.source_data.constructions.some(c=>c.kind!=='midpoint'&&c.source.id==='s'));assert.ok(deleted.payload.source_data.points.some(p=>p.id==='a'))
 assert.deepEqual(await evaluate('savedRevision.blocks.find(b=>b.id==="frame-2")'),b)
 assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),text);assert.equal(await evaluate('document.querySelector("math-field").value'),formula)
 console.log('PASS: real Edge both F2 tools/all four source types, midpoint/free through-points, previews/cancel/duplicates, source edits, support lock, chains/reload/cascades, frame isolation, scrolling and mixed document')
 return {a:g,b:b.payload.source_data}
}
