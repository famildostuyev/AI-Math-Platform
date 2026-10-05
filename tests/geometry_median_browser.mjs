import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {defaultGeometryPlacement}=await loadGeometryModule('geometryFrameModel')
const {commitMidpoint}=await loadGeometryModule('geometryConstructionModel')

export async function runGeometryMedianAcceptance({evaluate,until,click,delay,send,drag}){
 const frame='[data-frame-id="frame-1"]',board='.geometry-authoring-board',point=id=>`${board} [data-geometry-point-id="${id}"]`
 const source=commitMidpoint({...emptyGeometryV1(),description:'Median browser',points:[['a',15,20],['v',45,50],['c',75,20],['free',20,75]].map(([id,x,y])=>({id,x,y,label:null})),polygons:[{id:'triangle',point_ids:['a','v','c']}]},'a','c')
 const independent=source.constructions[0].output_point_id
 await until('document.querySelector("math-field")')
 const text=await evaluate('JSON.stringify(savedRevision.blocks[0])'),formula=await evaluate('document.querySelector("math-field").value')
 await evaluate(`savedRevision.blocks.push(${JSON.stringify({id:'frame-1',block_type:'geometry',sort_order:1000,payload:{source_data:source,format_version:1},visual_placement:defaultGeometryPlacement(source,0)})});reloadEditor()`)
 await until(`document.querySelector('${frame}')`)
 const edit=async()=>{await click(frame);await click(`${frame} .visual-frame__actions button`);await until(`document.querySelector('${board}')`)}
 const save=async()=>{await click(`${frame} .visual-frame__actions button`);await until('!document.querySelector(".geometry-authoring-board")');const g=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1").payload.source_data)');assert.ok(normalize(g));return g}
 const action=async label=>{await evaluate(`(()=>{const menu=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.startsWith('Konstruksiya'));if(!menu.open)menu.querySelector('summary').click();const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')].find(b=>b.textContent===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Unavailable tool');b.click()})()`);await delay(100)}
 const construct=async ids=>{await action('Median');for(const id of ids)await click(point(id));await delay(150)}
 const escape=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100)}
 await edit()
 for(const ids of [['a'],['a','v']]){
  await action('Median');for(const id of ids)await click(point(id));await escape()
  assert.equal(await evaluate(`document.querySelectorAll('${board} [data-geometry-segment-id]').length`),0)
 }
 await construct(['a','a','v','v','c']);let g=await save(),recipe=g.constructions.find(c=>c.kind==='median')
 assert.ok(recipe,'Three distinct selections must create a median using the existing midpoint')
 const mId=recipe.midpoint_point_id
 assert.ok(recipe);assert.equal(mId,independent);assert.deepEqual(g.points,source.points)
 assert.equal(recipe.vertex_point_id,'v');assert.ok(!Object.hasOwn(recipe,'source_point_ids'))
 assert.deepEqual(g.segments.find(s=>s.id===recipe.output_segment_id),{id:recipe.output_segment_id,start_point_id:'v',end_point_id:mId})
 assert.equal(await evaluate(`document.querySelectorAll('${frame} .geometry-points circle').length`),5)
 await evaluate('reloadEditor()');await until(`document.querySelector('${frame} .geometry-points circle')`)
 for(const ids of [['a','v','c'],['c','v','a']]){
  await edit();await construct(ids);g=await save();assert.equal(g.constructions.filter(c=>c.kind==='median').length,1)
  assert.equal(g.constructions.filter(c=>c.kind==='midpoint').length,1);assert.equal(g.points.length,source.points.length)
 }
 await edit();const before=structuredClone(g);await drag(point(mId),12,8);g=await save();assert.deepEqual(g,before)
 await edit();await drag(point('a'),16,8);g=await save();assert.notDeepEqual(g.points.find(p=>p.id===mId),before.points.find(p=>p.id===mId));assert.equal(g.constructions.find(c=>c.kind==='median').midpoint_point_id,mId)
 await edit();const midpoint=structuredClone(g.points.find(p=>p.id===mId));await drag(point('v'),12,8);g=await save();assert.deepEqual(g.points.find(p=>p.id===mId),midpoint)
 await edit();await click(`${board} [data-geometry-segment-id="${recipe.output_segment_id}"]`);await action('Seçiləni sil');g=await save()
 assert.equal(g.constructions.length,1);assert.equal(g.constructions[0].kind,'midpoint');assert.ok(g.points.some(p=>p.id===independent));assert.equal(g.points.length,source.points.length);assert.equal(g.segments.length,0)
 // Missing midpoint: publish one ordinary midpoint owner and one Median together.
 const withoutMidpoint={...source,points:source.points.filter(p=>p.id!==independent),constructions:[]}
 await evaluate(`savedRevision.blocks.find(b=>b.id==='frame-1').payload.source_data=${JSON.stringify(withoutMidpoint)};reloadEditor()`)
 await until(`document.querySelector('${frame} .geometry-points circle')`)
 await edit();await construct(['a','v','c'])
 // Successful creation selects the output segment, so Delete works without clicking it.
 await action('Seçiləni sil');g=await save()
 assert.equal(g.segments.length,0);assert.equal(g.constructions.length,1);assert.equal(g.constructions[0].kind,'midpoint')
 const autoOwner=g.constructions[0],autoM=autoOwner.output_point_id
 assert.deepEqual(autoOwner.source_point_ids,['a','c']);assert.equal(g.points.length,withoutMidpoint.points.length+1)
 assert.deepEqual(g.points.find(p=>p.id===autoM),{id:autoM,x:45,y:20,label:null})
 // Reuse the automatically-created owner, then recreate the missing-owner path.
 await edit();await construct(['c','v','a']);g=await save();assert.equal(g.constructions.length,2);assert.equal(g.constructions[1].midpoint_point_id,autoM)
 await evaluate(`savedRevision.blocks.find(b=>b.id==='frame-1').payload.source_data=${JSON.stringify(withoutMidpoint)};reloadEditor()`)
 await until(`document.querySelector('${frame} .geometry-points circle')`)
 await edit();await construct(['a','v','c']);g=await save()
 assert.deepEqual(g.constructions.map(c=>c.kind),['midpoint','median']);assert.equal(g.points.length,withoutMidpoint.points.length+1)
 assert.deepEqual(g.segments[0],{id:g.constructions[1].output_segment_id,start_point_id:'v',end_point_id:g.constructions[0].output_point_id})
 await evaluate('reloadEditor()');await until(`document.querySelector('${frame} .geometry-points circle')`)
 await edit();const autoBefore=structuredClone(g);await drag(point(g.constructions[0].output_point_id),12,8);g=await save();assert.deepEqual(g,autoBefore)
 assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),text);assert.equal(await evaluate('document.querySelector("math-field").value'),formula)
 console.log('PASS: Edge Median A/V/C, existing/automatic midpoint, repeated IDs, reversed duplicates, Escape after one/two clicks, output selection, lock, edits, save/reload, deletion and document isolation')
}
