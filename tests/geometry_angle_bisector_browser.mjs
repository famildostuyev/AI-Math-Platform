import assert from 'node:assert/strict'
import {loadGeometryModule} from './geometry_test_modules.mjs'

const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const {defaultGeometryPlacement}=await loadGeometryModule('geometryFrameModel')
const {findAngleBisector,commitAngleBisector}=await loadGeometryModule('geometryConstructionModel')

export async function runGeometryAngleBisectorAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}){
 const board='.geometry-authoring-board'
 const frame=id=>`[data-frame-id="${id}"]`
 const point=id=>`${board} [data-geometry-point-id="${id}"]`

 const source={
  ...emptyGeometryV1(),
  description:'Angle bisector acceptance',
  polygons:[{id:'triangle',point_ids:['a','v','c']}],
  points:[
   ['a',15,20],
   ['v',45,45],
   ['c',75,20],
   ['free',20,75],
  ].map(([id,x,y])=>({id,x,y,label:null}))
 }

 await until('document.querySelector("math-field")')

 const originalText=await evaluate('JSON.stringify(savedRevision.blocks[0])')
 const formula=await evaluate('document.querySelector("math-field").value')

 const block={
  id:'frame-1',
  block_type:'geometry',
  sort_order:1000,
  payload:{source_data:source,format_version:1},
  visual_placement:defaultGeometryPlacement(source,0),
 }

 await evaluate(`savedRevision.blocks.push(${JSON.stringify(block)});reloadEditor()`)
 await until('document.querySelector(\'[data-frame-id="frame-1"]\')')

 const menu=async label=>{await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.trim()===${JSON.stringify(label+' ▾')});if(!d)throw Error('Missing menu '+${JSON.stringify(label)});if(!d.open)d.querySelector('summary').click()})()`);await delay(60)}

 const action=async label=>{
  await evaluate(`(()=>{
   const b=[...document.querySelectorAll('.universal-editor-geometry-ribbon button')]
    .find(b=>b.textContent===${JSON.stringify(label)});
   if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});
   b.click()
  })()`)
  await delay(100)
 }

 const edit=async()=>{
  await click(frame('frame-1'))
  await click(`${frame('frame-1')} .visual-frame__actions button`)
  await until(`document.querySelector('${board}')`)
 }

 const save=async()=>{
  await click(`${frame('frame-1')} .visual-frame__actions button`)
  await until('!document.querySelector(".geometry-authoring-board")')
  const saved=await evaluate('structuredClone(savedRevision.blocks.find(b=>b.id==="frame-1"))')
  assert.ok(normalize(saved.payload.source_data))
  return saved
 }

 const escape=async()=>{
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await delay(120)
 }

 await edit()
 await menu('Konstruksiya')

 const buttons=await evaluate(
  "[...document.querySelectorAll('.universal-editor-geometry-ribbon details[open] button')].map(b=>[b.textContent,b.disabled])"
 )
 assert.ok(buttons.some(([label,disabled])=>label==='Tənbölən'&&!disabled))

 await action('Tənbölən')
 await click(point('a'))
 await click(point('v'))
 await escape()

 assert.equal(
  await evaluate(`document.querySelectorAll('${board} [data-geometry-line-id]').length`),
  0,
  'Escape must cancel incomplete angle bisector',
 )

 await action('Tənbölən')
 await click(point('a'))
 await click(point('v'))
 await click(point('c'))
 await delay(150)

 let saved=await save()
 let g=saved.payload.source_data

 assert.equal(g.constructions.length,1)
 const recipe=g.constructions[0]
 assert.equal(recipe.kind,'angle_bisector')
 assert.deepEqual(recipe.source_point_ids,['a','v','c'])
 assert.equal(g.lines.find(l=>l.id===recipe.output_line_id).start_point_id,'v')
 assert.ok(g.points.some(p=>p.id===recipe.support_point_id))
 assert.ok(recipe.intersection_point_id)
 assert.equal(g.points.find(p=>p.id===recipe.intersection_point_id).label,null)
 assert.notEqual(recipe.intersection_point_id,recipe.support_point_id)
 const intersectionPoint=g.points.find(p=>p.id===recipe.intersection_point_id)
 const savedPointCoordinates=await evaluate(`([...document.querySelectorAll('${frame('frame-1')} .geometry-points circle')].map(p=>[Number(p.getAttribute('cx')),Number(p.getAttribute('cy'))]))`)
 assert.ok(savedPointCoordinates.some(([x,y])=>x===intersectionPoint.x&&y===intersectionPoint.y))
 const supportPoint=g.points.find(p=>p.id===recipe.support_point_id)
 assert.ok(!savedPointCoordinates.some(([x,y])=>x===supportPoint.x&&y===supportPoint.y))
 assert.deepEqual(await evaluate(`(()=>{const l=document.querySelector('${frame('frame-1')} .geometry-angle-bisectors line');return ['x1','y1','x2','y2'].map(k=>Number(l.getAttribute(k)))})()`),[45,45,intersectionPoint.x,intersectionPoint.y])

 assert.ok(
  findAngleBisector(g,'c','v','a'),
  'Model lookup must recognize reversed angle arms as the same bisector',
 )
 assert.strictEqual(
  commitAngleBisector(g,'c','v','a'),
  g,
  'Model commit must reject the reversed angle arms as a duplicate',
 )

 await edit()
 assert.equal(
  await evaluate(`document.querySelectorAll('${board} [data-geometry-line-id]').length`),
  1,
  'Reopened editor must receive the saved angle bisector before duplicate attempt',
 )
 assert.equal(
  await evaluate(`document.querySelector('${board} [data-geometry-line-id]')?.getAttribute('data-geometry-line-id')`),
  recipe.output_line_id,
  'Reopened editor must render the original saved angle-bisector line',
 )
 await menu('Konstruksiya')
 await action('Tənbölən')


 await click(point('c'))
 await click(point('v'))
 await click(point('a'))
 await delay(150)

 saved=await save()

 assert.equal(
  saved.payload.source_data.constructions.length,
  1,
  'Reversed angle arms must not create a duplicate bisector',
 )

 g=saved.payload.source_data

 await edit()
 await action('Seç')
 const before=g.points.find(p=>p.id==='a')
 await drag(point('a'),8,4)
 saved=await save()
 g=saved.payload.source_data

 assert.notDeepEqual(g.points.find(p=>p.id==='a'),before)
 assert.ok(normalize(g))

 await edit()
 await action('Seç')
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('${point(recipe.support_point_id)}')).display`),'none')
 const supportBox=await box(point(recipe.intersection_point_id))
 const supportX=supportBox.x+supportBox.width/2
 const supportY=supportBox.y+1
 await pointer('mouseMoved',supportX,supportY)
 await pointer('mousePressed',supportX,supportY,{button:'left',buttons:1,clickCount:1})
 await pointer('mouseMoved',supportX+25,supportY+20,{button:'left',buttons:1})
 await delay(120)
 await pointer('mouseReleased',supportX+25,supportY+20,{button:'left',clickCount:1})
 await delay(150)
 saved=await save()

 assert.deepEqual(
  saved.payload.source_data,
  g,
  'Derived angle-bisector intersection point must remain locked',
 )

 assert.equal(await evaluate('JSON.stringify(savedRevision.blocks[0])'),originalText)
 assert.equal(await evaluate('document.querySelector("math-field").value'),formula)

 console.log('PASS: real Edge angle bisector ribbon/click flow, cancel, symmetric duplicate prevention, source recompute, derived-point lock and mixed document isolation')

 return g
}
