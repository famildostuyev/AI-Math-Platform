import assert from 'node:assert/strict'
import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
export async function exerciseEdgePoint({evaluate,until,click,pointer,send}){
 const viewport='.geometry-3d-editor .geometry-3d-viewport',editor='.geometry-3d-editor'
 const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 await click('[data-geometry-action="point"]')
 await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center'})`);await settle()
 const hit=await evaluate(`(async()=>{const {pickSolidEdge3D}=await import('/src/components/geometry3dEdgePoints.ts'),{pickGeometry3D}=await import('/src/components/geometry3dAuthoring.ts'),{projectScene3D,projectedEdgeStrokes3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=JSON.parse(e.dataset.editingCamera),p=projectScene3D(rotationScene,c,b.width,b.height);for(const s of projectedEdgeStrokes3D(p,c.projection).filter(s=>!s.hidden)){const q={x:(s.a[0]+s.b[0])/2,y:(s.a[1]+s.b[1])/2,width:b.width,height:b.height},h=pickSolidEdge3D(rotationScene,c,q);if(h&&!pickGeometry3D(rotationScene,c,q,true))return {...h,x:b.x+q.x,y:b.y+q.y}}throw Error('No visible edge')})()`)
 const press=async p=>{await pointer('mouseMoved',p.x,p.y);await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1});await pointer('mouseReleased',p.x,p.y,{button:'left',buttons:0});await settle()}
 const camera=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
 await press(hit);await until('rotationScene.constructions.some(c=>c.kind==="point_on_edge")')
 const original=await evaluate('structuredClone(rotationScene)'),c=original.constructions.find(c=>c.kind==='point_on_edge');assert.equal(c.edge_id,hit.edge_id)
 await press(hit);assert.deepEqual(await evaluate('rotationScene'),original)
 await click('[data-geometry-action="select"]');await settle()
 const path=await evaluate(`(async()=>{const {createProjection3D,add,sub,scale}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),c=rotationScene.constructions.find(c=>c.output_point_id==='${c.output_point_id}'),edge=rotationScene.edges.find(v=>v.id===c.edge_id),a=rotationScene.points.find(v=>v.id===edge.start).position,z=rotationScene.points.find(v=>v.id===edge.end).position,p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),screen=t=>p.screen(p.view(add(a,scale(sub(z,a),t)))),s=screen(c.t),t=screen(c.t<.6?c.t+.2:c.t-.2);return {x:b.x+s[0],y:b.y+s[1],tx:b.x+t[0],ty:b.y+t[1]}})()`)
 const drag=async cancel=>{await pointer('mousePressed',path.x,path.y,{button:'left',buttons:1});for(let i=1;i<=8;i++)await pointer('mouseMoved',path.x+(path.tx-path.x)*i/8,path.y+(path.ty-path.y)*i/8,{button:'left',buttons:1});if(cancel){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'})}await pointer('mouseReleased',path.tx,path.ty,{button:'left',buttons:0});await settle()}
 await drag(true);assert.deepEqual(await evaluate('rotationScene'),original)
 await drag(false);const changed=await evaluate('structuredClone(rotationScene)');assert.notEqual(changed.constructions.find(v=>v.id===c.id).t,c.t);assert.equal(await evaluate(`document.querySelector('${editor}').dataset.selectedId`),c.output_point_id);assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),camera)
 const key=async modifiers=>{await evaluate(`document.querySelector('${viewport}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers});await settle()}
 await key(2);assert.deepEqual(await evaluate('rotationScene'),original);await key(10);assert.deepEqual(await evaluate('rotationScene'),changed)
 console.log('PASS: real Edge visible edge creation/reuse, native constrained drag, Escape, atomic Undo/Redo, selected semantic ID and camera isolation')
}
export async function runEdgePointsAcceptance(api){
 const {textButton,until,evaluate,click}=api
 await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until('document.querySelector(".geometry-3d-viewport canvas")')
 await createScenePyramid(api);await exerciseEdgePoint(api)
 const before=await evaluate('structuredClone(rotationScene)')
 await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-3d-editor")');assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),before)
 await evaluate('reloadEditor()');await until('document.querySelector(".geometry-3d-screen svg")');assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),before)
 console.log('PASS: Edge Apply and reload preserve edge recipe and geometry')
}
