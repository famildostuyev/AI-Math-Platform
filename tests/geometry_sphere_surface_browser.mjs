import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {loadGeometryModule as load} from './geometry_test_modules.mjs'
export async function runSphereSurfaceAcceptance({evaluate,until,textButton,click,send}){
 const ribbon='.universal-editor-geometry-ribbon',viewport='.geometry-3d-viewport'
 await textButton('H\u0259nd\u0259s\u0259');await textButton('3D s\u0259hn\u0259 \u0259lav\u0259 et');await until(`document.querySelector('${viewport} canvas')`);await until(`!document.querySelector('${ribbon} [data-geometry-action="point"]').disabled`)
 await click(`${ribbon} [data-geometry-action="sphere_surface"]`)
 const rect=await evaluate(`(()=>{const r=document.querySelector('${viewport}').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`),mouse=async(type,x,y,buttons=0)=>{const origin=await evaluate(`(()=>{const r=document.querySelector('${viewport}').getBoundingClientRect();return {x:r.x,y:r.y}})()`);return send('Input.dispatchMouseEvent',{type,x:origin.x+x,y:origin.y+y,button:'left',buttons,clickCount:type==='mouseMoved'?0:1})}
 await mouse('mousePressed',rect.width/2,rect.height/2,1);await mouse('mouseReleased',rect.width/2,rect.height/2);await until('prismVisibilityScene.solids.length===1')
 const initial=await evaluate('structuredClone(prismVisibilityScene)'),id=initial.solids[0].id
 assert.equal(initial.solids[0].kind,'sphere');assert.deepEqual(initial.solids[0].parameters,{radius:1,equator:'visible',region:'surface'});assert.equal(initial.points[0].label,'O')
 const p=await load('geometry3dProjection'),b=await load('geometry3dSolidBounds'),camera=await evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`),view=p.createProjection3D(camera,rect.width,rect.height)
 const h=b.projectedSolidBounds3D(initial,camera,rect.width,rect.height,id).handles.find(h=>h.kind==='radius'),target=view.screen(view.view(p.add(h.world,p.scale(h.direction,.3)))),end={x:target[0]+h.x-h.screen[0],y:target[1]+h.y-h.screen[1]}
 await mouse('mousePressed',h.x,h.y,1);await mouse('mouseMoved',end.x,end.y,1);await mouse('mouseReleased',end.x,end.y);await until('prismVisibilityScene.solids[0].parameters.radius>1.2')
 const resized=await evaluate('structuredClone(prismVisibilityScene)');assert.equal(resized.solids[0].parameters.region,'surface');assert.deepEqual(resized.points,initial.points)
 await click(`${ribbon} [data-geometry-action="point"]`)
 await until(`document.querySelector('${viewport}').dataset.interactionTool==='point'`)
 // An analytic front hit, away from O and the radius handle, creates an unnamed attachment.
 const direction=p.unit(p.sub(camera.position,resized.solids[0].frame.origin)),world=p.add(resized.solids[0].frame.origin,p.scale(direction,resized.solids[0].parameters.radius))
 const q=view.screen(view.view(world)),picker=await load('geometry3dCylinderPicking')
 const candidate=[[15,-12],[-15,-12],[12,15],[-12,15]].map(([x,y])=>({x:q[0]+x,y:q[1]+y,width:rect.width,height:rect.height})).find(point=>picker.pickAnalyticSurface3D(resized,camera,point))
 assert.ok(candidate,'visible analytic surface target')
 assert.equal(await evaluate(`(()=>{const v=document.querySelector('${viewport}'),r=v.getBoundingClientRect();return v.contains(document.elementFromPoint(r.x+${candidate.x},r.y+${candidate.y}))})()`),true,'surface click must reach viewport')
 await mouse('mousePressed',candidate.x,candidate.y,1);await mouse('mouseReleased',candidate.x,candidate.y);await until('prismVisibilityScene.constructions.length===1')
 const attached=await evaluate('structuredClone(prismVisibilityScene)');assert.equal(attached.constructions[0].kind,'point_on_surface');assert.equal(attached.constructions[0].surface_id,initial.surfaces[0].id);assert.equal(attached.points.find(p=>p.id===attached.constructions[0].output_point_id).label,null)
 await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-3d-editor")');const saved=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)');assert.equal(saved.solids[0].parameters.region,'surface')
 await evaluate('reloadEditor()');await until('document.querySelector("[data-frame-id]")');await click('[data-frame-id="frame-1"]');await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('prismVisibilityScene.solids.length===1');assert.deepEqual(await evaluate('prismVisibilityScene'),saved)
 const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),file=path.join(os.tmpdir(),'sphere-surface-acceptance.png');await fs.writeFile(file,Buffer.from(screenshot.result.data,'base64'));console.log('Screenshot: '+file)
 console.log('PASS: real Edge Sfera ribbon/one-click creation, radius drag with fixed O, unnamed surface attachment and Apply/reopen with region retained (mocked persistence)')
}
