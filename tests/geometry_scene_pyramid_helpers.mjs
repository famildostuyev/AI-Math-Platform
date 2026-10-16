/** Construct through the actual teacher workflow, without opening a coordinate form. */
export async function createScenePyramid({evaluate,until,click,pointer},vertices=Array.from({length:4},(_,i)=>[2*Math.cos(i*Math.PI/2),2*Math.sin(i*Math.PI/2),0])){
  const tool=async(action,menu)=>{
    await evaluate(`(()=>{const d=[...document.querySelectorAll('.universal-editor-geometry-ribbon > details')].find(d=>d.querySelector('summary').textContent.includes(${JSON.stringify(menu)}));if(!d.open)d.querySelector('summary').click()})()`)
    await click(`.universal-editor-geometry-ribbon [data-geometry-action="${action}"]`)
  }
  const at=async(position)=>{
    await evaluate(`document.querySelector('.geometry-3d-editor .geometry-3d-viewport').scrollIntoView({block:'center',behavior:'instant'})`)
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const p=await evaluate(`(async()=>{const {createProjection3D}=await import('/src/components/geometry3dProjection.ts'),e=document.querySelector('.geometry-3d-editor .geometry-3d-viewport'),b=e.getBoundingClientRect(),p=createProjection3D(JSON.parse(e.dataset.editingCamera),b.width,b.height),s=p.screen(p.view(${JSON.stringify(position)}));return {x:b.x+s[0],y:b.y+s[1]}})()`)
    await pointer('mouseMoved',p.x,p.y);await pointer('mousePressed',p.x,p.y,{button:'left',buttons:1,clickCount:1});await pointer('mouseReleased',p.x,p.y,{button:'left',buttons:0,clickCount:1})
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  }
  await tool('polygon','Müstəvi fiqurları')
  for(const p of [...vertices,vertices[0]])await at(p)
  await until(`document.querySelector('.geometry-3d-editor').dataset.selectedId.startsWith('face_')`)
  await tool('pyramid','3D');await until(`document.querySelector('.geometry-3d-editor').dataset.activeTool==='pyramid'`)
  await at(vertices.reduce((sum,p)=>sum.map((v,i)=>v+p[i]/vertices.length),[0,0,0]));await until(`document.querySelector('.geometry-3d-editor').dataset.activeTool==='select'`)
}
