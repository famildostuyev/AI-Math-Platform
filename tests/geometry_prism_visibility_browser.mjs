import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const a=await loadGeometryModule('geometry3dSolidAuthoring'),m=await loadGeometryModule('geometry3dModel'),p=await loadGeometryModule('geometry3dProjection'),bounds=await loadGeometryModule('geometry3dSolidBounds'),author=await loadGeometryModule('geometry3dAuthoring')
export async function runPrismVisibilityAcceptance({evaluate,until,send,delay}){
 const out=await fs.mkdtemp(path.join(os.tmpdir(),'prism-visibility-')),results=[]
 console.log('Visibility artifacts: '+out)
 async function capture(source,projection,label,pipeline){
   const size=await evaluate(`(()=>{const e=document.querySelector('.geometry-3d-viewport'),r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,pipeline:e.dataset.displayPipeline}})()`)
   const {width,height}=size,projected=p.projectScene3D(source,source.print_camera,width,height)
   const faces=projected.faces.filter(f=>f.ownerId==='P')
   const inside=(x,y,v)=>{let hit=false;for(let i=0,j=v.length-1;i<v.length;j=i++)if((v[i][1]>y)!==(v[j][1]>y)&&x<(v[j][0]-v[i][0])*(y-v[i][1])/(v[j][1]-v[i][1])+v[i][0])hit=!hit;return hit}
   const edgeDistance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)}
   const chrome=pipeline==='webgl-live'?bounds.projectedSolidBounds3D(source,source.print_camera,width,height,'P')?.handles??[]:[]
   const samples=[];for(let y=10;y<height-10;y+=3)for(let x=10;x<width-10;x+=3){if(chrome.some(h=>Math.hypot(x-h.x,y-h.y)<12))continue;if(faces.filter(f=>inside(x+.5,y+.5,f.vertices)).length!==2)continue;if(faces.some(f=>f.vertices.some((a,i)=>edgeDistance(x+.5,y+.5,a,f.vertices[(i+1)%f.vertices.length])<4)))continue;samples.push([x,y])}
   const screenshot=await send('Page.captureScreenshot',{format:'png',clip:{...size,scale:1}})
   const file=path.join(out,projection+'-'+label+'-'+pipeline+'.png');await fs.writeFile(file,Buffer.from(screenshot.result.data,'base64'))
   const pixels=await evaluate(`(async()=>{const img=await createImageBitmap(new Blob([Uint8Array.from(atob('${screenshot.result.data}'),c=>c.charCodeAt(0))],{type:'image/png'})),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;return ${JSON.stringify(samples)}.map(([x,y])=>[d[(y*c.width+x)*4],d[(y*c.width+x)*4+1],d[(y*c.width+x)*4+2]])})()`)
   const colors={};for(const color of pixels){const k=color.join(',');colors[k]=(colors[k]??0)+1}
   const row={projection,label,pipeline,actualPipeline:size.pipeline,samples:pixels.length,white:pixels.filter(c=>c.every(v=>v>=250)).length,colors:Object.entries(colors).sort((a,b)=>b[1]-a[1]).slice(0,6),file};results.push(row);console.log(JSON.stringify(row))
 }
 let base=a.createSolid3D(m.emptyGeometryScene3D(),{...a.defaultRegularPrism3D('P'),parameters:{sides:6,radius:2,height:2,constraint:'regular'}}).scene
 const cases=[['default',base],['radius-small',a.resizeRegularPrism3D(base,'P','radius',.7)],['radius-large',a.resizeRegularPrism3D(base,'P','radius',3)],['height-small',a.resizeRegularPrism3D(base,'P','height',.7)],['height-large',a.resizeRegularPrism3D(base,'P','height',4)],['rotate',a.rotateSolid3D(base,'P',[1,2,3],.8)]]

 for(const projection of ['orthographic','perspective']){
  const source={...base,print_camera:{...base.print_camera,projection,position:[7,6,8],target:[0,0,1],vertical_span:10}}
  await evaluate(`openUnframedScene(${JSON.stringify(source)})`)
  await until('document.querySelector(".geometry-3d-viewport canvas")?.dataset.renderCount>0')
  await until('!!window.prismVisibilityScene')
  const viewport=await evaluate(`(()=>{const r=document.querySelector('.geometry-3d-viewport').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`)
  const q=p.createProjection3D(source.print_camera,viewport.width,viewport.height),projected=p.projectScene3D(source,source.print_camera,viewport.width,viewport.height)
  const candidate=projected.faces.map(f=>f.vertices.reduce((a,v)=>p.add(a,v),[0,0,0]).map(x=>x/f.vertices.length)).find(v=>author.pickGeometry3D(source,source.print_camera,{x:v[0],y:v[1],width:viewport.width,height:viewport.height})?.id==='P')
  assert.ok(candidate,'selectable face interior')
  const mouse=(type,x,y,buttons=0)=>send('Input.dispatchMouseEvent',{type,x:viewport.x+x,y:viewport.y+y,button:'left',buttons,clickCount:type==='mouseMoved'?0:1})
  await mouse('mousePressed',candidate[0],candidate[1],1);await mouse('mouseReleased',candidate[0],candidate[1])
  await until(`document.querySelector('.geometry-3d-editor').dataset.selectedId==='P'`)
  for(const dimension of ['radius','height']){
   const current=await evaluate('structuredClone(prismVisibilityScene)'),camera=await evaluate(`JSON.parse(document.querySelector('.geometry-3d-viewport').dataset.editingCamera)`),view=p.createProjection3D(camera,viewport.width,viewport.height)
   const handle=bounds.projectedSolidBounds3D(current,camera,viewport.width,viewport.height,'P').handles.find(h=>h.kind===dimension)
   assert.ok(handle,dimension+' visible handle')
   await mouse('mousePressed',handle.x,handle.y,1)
   for(const fraction of [.15,.3,.45]){
    const world=p.add(handle.world,p.scale(handle.direction,handle.length*fraction)),point=view.screen(view.view(world)),x=point[0]+handle.x-handle.screen[0],y=point[1]+handle.y-handle.screen[1]
    await mouse('mouseMoved',x,y,1);await delay(100)
    const preview=await evaluate('structuredClone(prismVisibilityScene)');assert.ok(preview.solids[0].parameters[dimension]>current.solids[0].parameters[dimension])
    await capture({...preview,print_camera:camera},projection,'live-'+dimension+'-'+fraction,'webgl-live')
   }
   const last=p.add(handle.world,p.scale(handle.direction,handle.length*.45)),pt=view.screen(view.view(last));await mouse('mouseReleased',pt[0]+handle.x-handle.screen[0],pt[1]+handle.y-handle.screen[1]);await delay(100)
  }
  await evaluate(`document.querySelector('[data-tool-3d="camera"]').click()`)
  await mouse('mousePressed',viewport.width*.5,viewport.height*.5,1)
  for(const dx of [20,40,60]){await mouse('mouseMoved',viewport.width*.5+dx,viewport.height*.5+15,1);await delay(100);const scene=await evaluate('structuredClone(prismVisibilityScene)'),camera=await evaluate(`JSON.parse(document.querySelector('.geometry-3d-viewport').dataset.editingCamera)`);await capture({...scene,print_camera:camera},projection,'live-orbit-'+dx,'webgl-live')}
  await mouse('mouseReleased',viewport.width*.5+60,viewport.height*.5+15)
 }
 for(const projection of ['orthographic','perspective'])for(const [label,original]of cases){
  const source={...original,print_camera:{...original.print_camera,projection,position:[7,6,8],target:[0,0,1],vertical_span:10}}
  for(const pipeline of ['webgl','svg']){
   const scene=pipeline==='svg'?a.createSphereAt3D(source,[100,100,100],'XY','offscreen').scene:source
   await evaluate(`openCylinderRenderFixture(${JSON.stringify(scene)})`)
   await until(`document.querySelector('.geometry-3d-viewport canvas')?.dataset.renderCount>0`)
   await delay(120)
   await capture(source,projection,label,pipeline)
  }
 }
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2))
 assert.ok(results.every(r=>r.samples>50),'adequate interior samples')
 assert.equal(results.reduce((n,r)=>n+r.white,0),0,'solid interiors must not expose white gaps')
 console.log(`PASS: ${results.length} Edge WebGL/SVG states have no white interior gaps; ${out}`)
}
