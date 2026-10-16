import {createScenePyramid} from './geometry_scene_pyramid_helpers.mjs'
import assert from 'node:assert/strict'

export async function runCameraSyncAcceptance({evaluate,until,textButton,click,box,pointer,delay,send,drag}) {
  const viewport='.geometry-3d-viewport', canvas=`${viewport} canvas`
  const camera=()=>evaluate(`JSON.parse(document.querySelector('${viewport}').dataset.editingCamera)`)
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const closeMenu=async()=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})}
  const orbit=async(diagonal=false)=>{
    await evaluate('window.cameraSyncLog=[]')
    const b=await box(canvas),x=b.x+b.width*.3,y=b.y+b.height*.55
    await pointer('mouseMoved',x,y);await pointer('mousePressed',x,y,{button:'left',buttons:1})
    for(let i=1;i<=100;i++){await pointer('mouseMoved',x+i*2,y+(diagonal?i*.4:0),{button:'left',buttons:1});await delay(10)}
    await settle()
    const beforeRelease=await evaluate('cameraSyncLog.filter(x=>x.kind==="navigate").at(-1).position')
    await pointer('mouseReleased',x+200,y+(diagonal?40:0),{button:'left',buttons:0});await delay(150)
    const log=await evaluate('cameraSyncLog'),moves=log.filter(x=>x.kind==='navigate'),draws=log.filter(x=>x.kind==='draw')
    assert.equal(moves.length,100,'all pointer movements reach OrbitControls')
    assert.equal(log.filter(x=>x.kind==='apply').length,0,'navigation echoes never write to the camera')
    assert.deepEqual(draws.at(-1).position,beforeRelease,'release never changes camera position')
    let backwards=0,rotation=0
    for(let i=1;i<draws.length;i++){
      const a=draws[i-1].position,b=draws[i].position,d=Math.atan2(b[0],b[1])-Math.atan2(a[0],a[1]),step=Math.atan2(Math.sin(d),Math.cos(d))
      if(step < -1e-7)backwards++
    }
    // Include the first movement; initial view is restored before each scenario.
    let previous=Math.atan2(4,3)
    for(const m of moves){const angle=Math.atan2(m.position[0],m.position[1]),d=angle-previous;rotation+=Math.atan2(Math.sin(d),Math.cos(d));previous=angle}
    assert.equal(backwards,0,'rendered orbit never reverses')
    const expected=2*Math.PI*200/b.height
    assert.ok(Math.abs(rotation-expected)<1e-6,'no pointer rotation is lost')
    const result={scenario:diagonal?'diagonal':'horizontal',movements:moves.length,degrees:rotation*180/Math.PI,expectedDegrees:expected*180/Math.PI,staleApplications:0,backwardJumps:backwards,meanDrawMs:draws.reduce((sum,d)=>sum+d.ms,0)/draws.length}
    console.log('CAMERA MEASUREMENT',JSON.stringify(result))
    return result
  }
  await textButton('Həndəsə');await textButton('3D səhnə əlavə et');await until(`document.querySelector('${canvas}')`)
  await createScenePyramid({evaluate,until,click,pointer});await click('[data-tool-3d="camera"]');await settle()
  const original=await camera(),printCamera=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data.print_camera)')
  const undoState=await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled')
  await orbit()
  await textButton('Kameranı sıfırla');await settle();assert.deepEqual(await camera(),original,'reset works')
  await orbit(true)
  assert.equal(await evaluate('document.querySelector(\'[aria-label="Geri al"]\').disabled'),undoState,'navigation leaves geometry history unchanged')
  assert.deepEqual(await evaluate('savedRevision.blocks[0].payload.source_data.print_camera'),printCamera,'navigation does not alter saved camera')
  const beforePan=await camera(),b=await box(canvas),x=b.x+b.width/2,y=b.y+b.height/2
  await pointer('mousePressed',x,y,{button:'left',buttons:1,modifiers:2});await pointer('mouseMoved',x+20,y+20,{button:'left',buttons:1,modifiers:2});await pointer('mouseReleased',x+20,y+20,{button:'left',buttons:0,modifiers:2});await settle()
  assert.notDeepEqual((await camera()).target,beforePan.target,'Ctrl-left pan works')
  const span=(await camera()).vertical_span;await pointer('mouseWheel',x,y,{deltaY:-120,deltaX:0});await settle();assert.notEqual((await camera()).vertical_span,span,'zoom works')
  await pointer('mousePressed',x,y,{button:'right',buttons:2});await pointer('mouseReleased',x,y,{button:'right',buttons:0});await until('!document.querySelector(".geometry-frame-context-menu").hidden');await closeMenu()
  for(const view of ['front','back','left','right','top','bottom','isometric']){await click(`[data-view="${view}"]`);await settle();assert.ok((await camera()).position.every(Number.isFinite));await closeMenu()}
  await textButton('Kameranı sıfırla');await settle();assert.deepEqual(await camera(),original)
  const screen=position=>evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts');const e=document.querySelector('${viewport}'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),v=p.screen(p.view(${JSON.stringify(position)}));return {x:b.x+v[0],y:b.y+v[1]}})()`)
  const start=await screen([-2,-2,0]),end=await screen([-2.5,-2,0])
  await click('[data-tool-3d="point"]');await pointer('mousePressed',start.x,start.y,{button:'left',buttons:1});await pointer('mouseReleased',start.x,start.y,{button:'left',buttons:0});await settle()
  const pointId=await evaluate('document.querySelector(".geometry-3d-editor").dataset.selectedId');assert.ok(pointId.startsWith('p_'),'point creation works')
  await click('[data-tool-3d="select"]');await pointer('mousePressed',start.x,start.y,{button:'left',buttons:1});await pointer('mouseMoved',end.x,end.y,{button:'left',buttons:1});await pointer('mouseReleased',end.x,end.y,{button:'left',buttons:0});await settle()
  assert.ok(Math.abs(Number(await evaluate('document.querySelector(\'[aria-label="3D nöqtə X"]\').value'))+2.5)<.05,'free point drag works')
  assert.deepEqual(await camera(),original,'point gestures do not orbit')
  await click('[aria-label="Geri al"]');await settle();assert.ok(Math.abs(Number(await evaluate('document.querySelector(\'[aria-label="3D nöqtə X"]\').value'))+2)<.05,'point drag Undo works')
  await click('[aria-label="Yenidən et"]');await settle();await click('[data-tool-3d="camera"]')
  await drag('[data-frame-id="frame-1"] .visual-frame__move',10,10);await drag('[data-frame-id="frame-1"] [data-handle="se"]',20,20);assert.deepEqual(await camera(),original,'frame move/resize preserves camera')
  await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until('!document.querySelector(".geometry-3d-editor")')
  const scene=await evaluate('structuredClone(savedRevision.blocks[0].payload.source_data)')
  await click('[data-frame-id="frame-1"] .visual-frame__actions button');await until(`document.querySelector('${canvas}')`);assert.deepEqual(await camera(),original,'session restoration works')

  // Controlled parent deliberately commits an old navigation snapshot after newer moves.
  await evaluate(`openCameraSyncFixture(${JSON.stringify(scene)})`);await until(`document.querySelector('${canvas}')`);await settle()
  await orbit()
  const last=await evaluate('cameraSyncLog.filter(x=>x.kind==="navigate").at(-1).position')
  await evaluate('cameraSyncApply(0)');await settle()
  assert.equal(await evaluate('cameraSyncLog.filter(x=>x.kind==="apply").length'),0,'delayed React snapshot is ignored even when coordinates differ')
  const beforeExternal=await evaluate('cameraSyncLog.filter(x=>x.kind==="draw").at(-1).position');assert.deepEqual(beforeExternal,last)
  await evaluate('cameraSyncExternal(cameraSyncPending[0].camera)');await settle()
  assert.ok(await evaluate('cameraSyncLog.some(x=>x.kind==="apply")'),'same snapshot with external origin is applied')
  await evaluate('cameraSyncExternal({...cameraSyncPending.at(-1).camera,projection:"perspective",fov_degrees:60})');await settle();assert.equal((await camera()).projection,'perspective','projection/property updates work')
  await evaluate(`cameraSyncExternal(${JSON.stringify(original)})`);await settle();assert.deepEqual(await camera(),original,'saved camera restoration works')
  await evaluate('cameraSyncApply(0)');await settle();await evaluate('cameraSyncRemount()');await settle()
  const restored=await evaluate('cameraSyncLog.filter(x=>x.kind==="draw").at(-1).position'),expected=await evaluate('cameraSyncPending[0].camera.position')
  assert.ok(Math.hypot(...restored.map((v,i)=>v-expected[i]))<1e-9,'new viewport restores snapshots from the previous viewport')
  console.log('PASS: delayed navigation, horizontal/diagonal orbit, release, pan/zoom, views/reset, projection/properties, saved/session/remount restoration, history, context menu and frame move/resize')
}
