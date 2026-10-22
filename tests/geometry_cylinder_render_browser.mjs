import assert from 'node:assert/strict'
import {cylinderRenderFixture} from './geometry_cylinder_render_fixtures.mjs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
export async function runCylinderRenderAcceptance({evaluate,until,pointer,send}){
  const original=await cylinderRenderFixture(),selector='.geometry-3d-viewport'
  const settle=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const open=async(scene,highlight=[])=>{
    await evaluate(`openCylinderRenderFixture(${JSON.stringify(scene)},${JSON.stringify(highlight)})`)
    await until(`document.querySelector('${selector}')?.dataset.displayPipeline==='shared-vector'&&document.querySelector('.geometry-3d-shared-screen svg')&&document.querySelector('${selector} canvas')`)
    await settle()
    assert.equal(await evaluate(`document.querySelector('${selector}').dataset.webglFallback`),'false')
  }
  const parity=async(highlight=[])=>{
    const result=await evaluate(`(async()=>{const {geometrySceneSVG3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('${selector}'),b=e.getBoundingClientRect(),source=cylinderRenderSnapshot.source,camera=cylinderRenderSnapshot.camera,d=document.createElement('div');d.innerHTML=geometrySceneSVG3D({...source,print_camera:camera},b.width,b.height,new Set(${JSON.stringify(highlight)}));return {same:e.querySelector('.geometry-3d-shared-screen').innerHTML===d.innerHTML,surfaces:e.querySelectorAll('.geometry-3d-shared-screen [data-render-surface]').length,curves:e.querySelectorAll('.geometry-3d-shared-screen [data-render-curve]').length,snapshot:source,print:e.querySelector('.geometry-3d-print').innerHTML}})()`)
    assert.ok(result.same,'live viewport and deterministic SVG use identical compositor output')
    assert.ok(result.surfaces&&result.curves);return result
  }
  await open(original)
  const initial=await parity()
  assert.deepEqual(initial.snapshot,original)
  assert.ok(await evaluate(`!!document.querySelector('.geometry-3d-shared-screen circle[data-id="front"]')&&!document.querySelector('.geometry-3d-shared-screen circle[data-id="back"]')&&!document.querySelector('.geometry-3d-shared-screen [data-id="occluded_annotation"]')`))
  const viewBox=await evaluate(`(()=>{const b=document.querySelector('${selector}').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`)
  const start=original.print_camera.position.map((v,i)=>v-original.print_camera.target[i]),x=viewBox.x+viewBox.width/2,y=viewBox.y+viewBox.height/2
  await pointer('mouseMoved',x,y);await pointer('mousePressed',x,y,{button:'left',buttons:1,clickCount:1})
  for(let i=1;i<=100;i++)await pointer('mouseMoved',x+2*i,y,{button:'left',buttons:1})
  await pointer('mouseReleased',x+200,y,{button:'left',buttons:0,clickCount:1});await settle()
  const after=await evaluate('structuredClone(cylinderRenderSnapshot)'),direction=after.camera.position.map((v,i)=>v-after.camera.target[i])
  const rotation=Math.acos(Math.max(-1,Math.min(1,start.reduce((n,v,i)=>n+v*direction[i],0)/Math.hypot(...start)/Math.hypot(...direction))))*180/Math.PI
  assert.ok(Math.abs(rotation-180)<.01,`orbit completes expected 180 degrees: ${rotation}`)
  const orbited=await parity();assert.equal(orbited.print,initial.print,'editing orbit does not change saved-camera print')
  assert.deepEqual(after.source,original,'navigation never edits geometry')
  await pointer('mouseWheel',x,y,{deltaY:100,deltaX:0});await settle();await parity()
  await pointer('mousePressed',x,y,{button:'right',buttons:2,clickCount:1});await pointer('mouseMoved',x+25,y+15,{button:'right',buttons:2});await pointer('mouseReleased',x+25,y+15,{button:'right',buttons:0});await settle();await parity()
  for(const projection of ['orthographic','perspective'])for(const position of [[6,-7,7],[0,0,10],[0,0,-6],[.001,-.001,10]]){
    await evaluate(`cylinderRenderSetCamera(${JSON.stringify({...original.print_camera,projection,position,up:Math.abs(position[0])+Math.abs(position[1])<.01?[0,1,0]:[0,0,1]})})`)
    await settle();await parity()
  }
  // Browser raster comparison catches SVG mask/DOM behavior that model-only
  // parity cannot: an opaque cylinder behind a cube must not tint its front.
  const m=await loadGeometryModule('geometry3dModel'),s=await loadGeometryModule('geometry3dSolidAuthoring')
  const cube=s.defaultSolid3D('cube','cube');cube.frame.origin=[-1,-1,0]
  const poly=s.createSolid3D(m.emptyGeometryScene3D(),cube).scene;poly.print_camera=original.print_camera
  const behind=structuredClone(poly);behind.solids.push({...structuredClone(original.solids[0]),frame:{...original.solids[0].frame,origin:[0,3,0]}})
  await open(behind);await parity()
  const raster=await evaluate(`(async()=>{const {geometrySceneSVG3D,createProjection3D}=await import('/src/components/geometry3dProjection.ts');const e=document.querySelector('${selector}'),b=e.getBoundingClientRect(),scene=cylinderRenderSnapshot.source,c=scene.print_camera,pr=createProjection3D(c,b.width,b.height),q=pr.screen(pr.view([.4,-1,1]));const sample=async svg=>{const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();const canvas=document.createElement('canvas');canvas.width=b.width;canvas.height=b.height;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,b.width,b.height);ctx.drawImage(img,0,0);return [...ctx.getImageData(Math.floor(q[0]),Math.floor(q[1]),1,1).data]};return {base:await sample(geometrySceneSVG3D(${JSON.stringify(poly)},b.width,b.height)),behind:await sample(e.querySelector('.geometry-3d-shared-screen svg').outerHTML)}})()`)
  assert.deepEqual(raster.behind,raster.base,'opaque cap/lateral masking prevents background tint through foreground polyhedron')
  const overlap=structuredClone(original);overlap.solids.push({...structuredClone(original.solids[0]),id:'second',frame:{...original.solids[0].frame,origin:[.4,3,.3]}})
  await open(overlap,['cylinder']);await parity(['cylinder'])
  await send('Emulation.setEmulatedMedia',{media:'print'})
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.geometry-3d-shared-screen')).display`),'none')
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.geometry-3d-print')).visibility`),'visible')
  await send('Emulation.setEmulatedMedia',{media:''})
  assert.deepEqual(await evaluate('cylinderRenderSnapshot.source'),overlap)
  console.log(`PASS: real Edge read-only cylinder viewport/SVG parity; opaque mixed-solid raster ${raster.behind}; both projections/axial/near-axis; orbit ${rotation.toFixed(3)} degrees, pan/zoom, saved print unchanged, print CSS, two cylinders, no semantic mutation`)
}
