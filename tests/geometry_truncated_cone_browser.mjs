import assert from 'node:assert/strict'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
export async function runTruncatedConeAcceptance({evaluate,until,textButton,click,send}){
 const ribbon='.universal-editor-geometry-ribbon',viewport='.geometry-3d-viewport';await textButton('H\u0259nd\u0259s\u0259');await textButton('3D s\u0259hn\u0259 \u0259lav\u0259 et');await until(`document.querySelector('${viewport} canvas')`)
 await until(`(()=>{const p=document.querySelector('${ribbon} [data-geometry-action="point"]');return p&&!p.disabled&&p.hasAttribute('data-tool-3d')})()`)
 await click(`${ribbon} [data-geometry-action="frustum"]`);assert.equal(await evaluate('!!document.querySelector(".geometry-3d-solid-properties")'),false)
 const rect=await evaluate(`(()=>{const r=document.querySelector('${viewport}').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`)
 const mouse=(type,x,y,buttons=0)=>send('Input.dispatchMouseEvent',{type,x:rect.x+x,y:rect.y+y,button:'left',buttons,clickCount:type==='mouseMoved'?0:1})
 await mouse('mousePressed',rect.width/2,rect.height/2,1);await mouse('mouseReleased',rect.width/2,rect.height/2)
 await until('prismVisibilityScene.solids.some(s=>s.kind==="frustum")');const initial=await evaluate('structuredClone(prismVisibilityScene)'),id=initial.solids[0].id
 assert.deepEqual(initial.solids[0].parameters,{bottom_radius:2,top_radius:1,height:2});assert.deepEqual(initial.points.map(p=>p.label).sort(),['O1','O2']);assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.displayPipeline`),'shared-vector')
 const b=await load('geometry3dSolidBounds'),p=await load('geometry3dProjection')
 for(const dimension of ['bottom_radius','top_radius','height']){
  const source=await evaluate('structuredClone(prismVisibilityScene)'),camera=await evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`),view=p.createProjection3D(camera,rect.width,rect.height),handle=b.projectedSolidBounds3D(source,camera,rect.width,rect.height,id).handles.find(h=>h.kind===dimension);assert.ok(handle,dimension)
  const target=view.screen(view.view(p.add(handle.world,p.scale(handle.direction,handle.length*.2)))),end={x:target[0]+handle.x-handle.screen[0],y:target[1]+handle.y-handle.screen[1]}
  await mouse('mousePressed',handle.x,handle.y,1);await mouse('mouseMoved',end.x,end.y,1);await until(`prismVisibilityScene.solids[0].parameters.${dimension}>${source.solids[0].parameters[dimension]}`)
  await mouse('mouseReleased',end.x,end.y)
  const next=await evaluate('structuredClone(prismVisibilityScene)');for(const k of ['bottom_radius','top_radius','height'])if(k===dimension)assert.ok(Math.abs(next.solids[0].parameters[k]-source.solids[0].parameters[k]*1.2)<1e-5,'pointer coordinate precision');else assert.equal(next.solids[0].parameters[k],source.solids[0].parameters[k])
 }
 await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-3d-editor")');const saved=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)');assert.equal(saved.solids[0].id,id);assert.deepEqual(saved.solids[0].features,initial.solids[0].features)
 await evaluate('reloadEditor()');await until('document.querySelector("[data-frame-id]")');assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),saved)
 await click('[data-frame-id="frame-1"]');await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('document.querySelector(".geometry-3d-viewport canvas")');await until('prismVisibilityScene.solids[0].kind==="frustum"');assert.deepEqual(await evaluate('prismVisibilityScene'),saved)
 console.log('PASS: real Edge truncated cone ribbon/click creation with no numeric form, O1/O2, analytic SVG viewport, independent R1/R2/H pointer drags, stable IDs and Apply/reopen with mocked persistence')
}
