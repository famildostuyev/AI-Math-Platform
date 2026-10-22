import assert from 'node:assert/strict'
import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
export async function exerciseFacePoint({evaluate,until,click,pointer,send}){
 const viewport='.geometry-3d-editor .geometry-3d-viewport',editor='.geometry-3d-editor',settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 await click('[data-geometry-action="point"]');await evaluate(`document.querySelector('${viewport}').scrollIntoView({block:'center'})`);await settle()
 const hit=await evaluate(`(async()=>{const {pickSolidFace3D,visiblePointForCreation3D}=await import('/src/components/geometry3dFacePoints.ts'),{pickSolidEdge3D}=await import('/src/components/geometry3dEdgePoints.ts'),{pickGeometry3D}=await import('/src/components/geometry3dAuthoring.ts'),{projectScene3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),camera=JSON.parse(e.dataset.editingCamera),p=projectScene3D(rotationScene,camera,b.width,b.height);for(const face of p.faces){const q={x:face.vertices.reduce((s,v)=>s+v[0]/face.vertices.length,0),y:face.vertices.reduce((s,v)=>s+v[1]/face.vertices.length,0),width:b.width,height:b.height},h=pickSolidFace3D(rotationScene,camera,q);if(h&&!pickGeometry3D(rotationScene,camera,q,true,id=>visiblePointForCreation3D(rotationScene,camera,q,id))&&!pickSolidEdge3D(rotationScene,camera,q))return {...h,x:q.x+b.x,y:q.y+b.y}}throw Error('No visible face interior')})()`)
 const scene=()=>evaluate('structuredClone(rotationScene)'),press=async p=>{await pointer('mouseMoved',p.x,p.y);await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1});await pointer('mouseReleased',p.x,p.y,{button:'left',buttons:0});await settle()}
 const before=await scene(),camera=await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`)
 await press(hit);await until('rotationScene.constructions.some(c=>c.kind==="point_on_face")')
 const created=await scene(),c=created.constructions.find(v=>v.kind==='point_on_face');assert.equal(c.face_id,hit.face_id);assert.equal(created.points.length,before.points.length+1)
 await press(hit);assert.deepEqual(await scene(),created)
 await click('[data-geometry-action="select"]');await settle()
 const path=await evaluate(`(async()=>{const {createProjection3D,add,sub,scale}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),point=rotationScene.points.find(p=>p.id==='${c.output_point_id}').position,face=rotationScene.faces.find(f=>f.id==='${c.face_id}'),vertex=rotationScene.points.find(p=>p.id===face.boundary[0]).position,p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),s=p.screen(p.view(point)),t=p.screen(p.view(add(scale(point,.85),scale(vertex,.15))));return {x:b.x+s[0],y:b.y+s[1],tx:b.x+t[0],ty:b.y+t[1],outsideX:b.right-2,outsideY:b.bottom-2}})()`)
 const drag=async cancel=>{await pointer('mouseMoved',path.x,path.y);await pointer('mousePressed',path.x,path.y,{button:'left',buttons:1});for(let i=1;i<=8;i++)await pointer('mouseMoved',path.x+(path.tx-path.x)*i/8,path.y+(path.ty-path.y)*i/8,{button:'left',buttons:1});if(cancel){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'})}else await pointer('mouseMoved',path.outsideX,path.outsideY,{button:'left',buttons:1});await pointer('mouseReleased',cancel?path.tx:path.outsideX,cancel?path.ty:path.outsideY,{button:'left',buttons:0});await settle()}
 await drag(true);assert.deepEqual(await scene(),created)
 await drag(false);const dragged=await scene();assert.notDeepEqual(dragged.constructions.find(v=>v.id===c.id).uv,c.uv);assert.equal(dragged.constructions.find(v=>v.id===c.id).kind,'point_on_face');assert.equal(await evaluate(`document.querySelector('${editor}').dataset.selectedId`),c.output_point_id);assert.equal(await evaluate(`document.querySelector('${viewport}').dataset.editingCamera`),camera)
 const check=await evaluate(`(async()=>{const {faceBasis3D,insideFace3D}=await import('/src/components/geometry3dFaces.ts'),c=rotationScene.constructions.find(c=>c.id==='${c.id}'),face=rotationScene.faces.find(f=>f.id===c.face_id),basis=faceBasis3D(face.boundary.map(id=>rotationScene.points.find(p=>p.id===id).position));return insideFace3D(c.uv,basis.polygon)})()`);assert.ok(check)
 const key=async modifiers=>{await evaluate(`document.querySelector('${viewport}').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers});await settle()}
 await key(2);assert.deepEqual(await scene(),created);await key(10);assert.deepEqual(await scene(),dragged)
 console.log('PASS: real Edge nearest visible face creation/reuse, native UV drag, last-valid boundary preview, Escape, atomic Undo/Redo and camera isolation')
}
export async function runFacePointsAcceptance(api){
 const {evaluate,until,textButton,click}=api
 await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until('document.querySelector(".geometry-3d-viewport canvas")')
 await createScenePyramid(api);await exerciseFacePoint(api)
 const before=await evaluate('structuredClone(rotationScene)')
 await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-3d-editor")');assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),before)
 await evaluate('reloadEditor()');await until('document.querySelector(".geometry-3d-screen svg")');assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),before)
 // Cancel a subsequent edit and retain the applied attachment unchanged.
 await evaluate(`document.querySelector('[data-frame-id="frame-1"]').focus()`);await api.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8});await api.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F10',code:'F10',modifiers:8});await until(`document.querySelector('[data-frame-menu-owner="frame-1"] button')?.disabled===false`)
 await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('document.querySelector(".geometry-3d-editor")');await click('[data-geometry-action="point"]')
 const e=await evaluate('(()=>{const b=document.querySelector(".geometry-3d-viewport").getBoundingClientRect();return {x:b.x+20,y:b.y+20}})()');await api.pointer('mousePressed',e.x,e.y,{button:'left',buttons:1});await api.pointer('mouseReleased',e.x,e.y,{button:'left',buttons:0})
 await click('[data-frame-id="frame-1"] .visual-frame__actions button:nth-child(2)');await until('!document.querySelector(".geometry-3d-editor")');assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data'),before)
 console.log('PASS: Edge face-point Apply/Cancel/reload')
}
