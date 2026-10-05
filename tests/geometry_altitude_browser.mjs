import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {defaultGeometryPlacement}=await loadGeometryModule('geometryFrameModel')

export async function runGeometryAltitudeAcceptance({evaluate,until,click,delay,send,drag}){
 const frame='[data-frame-id="frame-1"]',board='.geometry-authoring-board',point=id=>`${board} [data-geometry-point-id="${id}"]`
 const source={...emptyGeometryV1(),description:'Altitude browser',points:[['a',15,20],['v',45,50],['c',75,20],['free',20,75]].map(([id,x,y])=>({id,x,y,label:null})),polygons:[{id:'triangle',point_ids:['a','v','c']}]}
 await until('document.querySelector("math-field")')
 const text=await evaluate('JSON.stringify(savedRevision.blocks[0])'),formula=await evaluate('document.querySelector("math-field").value')
 await evaluate(`savedRevision.blocks.push(${JSON.stringify({id:'frame-1',block_type:'geometry',sort_order:1000,payload:{source_data:source,format_version:1},visual_placement:defaultGeometryPlacement(source,0)})});reloadEditor()`)
 await until(`document.querySelector('${frame}')`)
 const edit=async()=>{await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${board}')`)}
 const save=async()=>{await click(`${frame} .visual-frame__actions button`);await until('!document.querySelector(".geometry-authoring-board")');const g=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)');assert.ok(normalize(g));return g}
 const action=async label=>{await evaluate(`(()=>{const menu=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.startsWith('Konstruksiya'));if(!menu.open)menu.querySelector('summary').click();const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`);await delay(100)}
 const construct=async ids=>{await action('Hündürlük');for(const id of ids)await click(point(id));await delay(150)}
 await edit();await action('Hündürlük');await click(point('a'));await click(point('v'))
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100)
 assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-segment-id]').length`),0)
 await construct(['a','v','c']);let g=await save(),recipe=g.constructions[0],hId=recipe.foot_point_id
 assert.equal(recipe.kind,'altitude');assert.equal(g.points.find(p=>p.id===hId).label,null)
 assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-points circle').length`),5)
 await edit();await construct(['c','v','a']);g=await save();assert.equal(g.constructions.length,1)
 await edit();const before=structuredClone(g);await drag(point(hId),12,8);g=await save();assert.deepEqual(g,before)
 await edit();await drag(point('v'),20,8);g=await save();assert.notDeepEqual(g.points.find(p=>p.id===hId),before.points.find(p=>p.id===hId));assert.equal(g.constructions[0].foot_point_id,hId)
 // Reopen persisted fixtures for exact right/obtuse coordinates; verify both views.
 const {moveGeometryPoint}=await loadGeometryModule('geometryAuthoringModel')
 for(const x of [15,5]){
  g=moveGeometryPoint(g,'v',x,50)
  await evaluate(`savedRevision.blocks.find(b=>b.id==='frame-1').payload.source_data=${JSON.stringify(g)};reloadEditor()`);await until(`document.querySelector('${frame} .geometry-points')`)
  assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-points circle').length`),x===15?4:5)
  assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-altitude-extensions line').length`),x===15?0:1)
  await edit();const display=await evaluate(`getComputedStyle(document.querySelector('${point(hId)}')).display`)
  if(x===15)assert.equal(display,'none');else assert.notEqual(display,'none')
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-altitude-extension]').length`),x===15?0:1)
  g=await save()
 }
 await edit();await click(`${board} [data-geometry-segment-id="${recipe.output_segment_id}"]`);await action('Seçiləni sil');g=await save()
 assert.equal(g.constructions.length,0);assert.ok(!g.points.some(p=>p.id===hId));assert.equal(g.segments.length,0)
 assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),text);assert.equal(await evaluate('document.querySelector("math-field").value'),formula)
 console.log('PASS: Edge altitude tool/clicks/cancel/save, duplicates, foot lock, source edit, right/obtuse display, deletion and mixed document isolation')
}
