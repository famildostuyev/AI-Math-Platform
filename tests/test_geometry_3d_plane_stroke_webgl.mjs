import assert from 'node:assert/strict'
import {printableComponent as load,requireFrontend} from './printable_test_modules.mjs'
const THREE=requireFrontend('three'),{populateGeometrySceneViewport3D:populate}=load('GeometrySceneViewport'),{planeStrokeWebGL3D:paint}=load('geometry3dPlaneStrokeWebGL')
const m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),p=load('geometry3dProjection'),resolver=load('geometry3dPlaneStroke'),g=load('geometry3dAuthoring'),math=load('geometry3dConstructedPlane')
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} != ${b}`)
const owner={id:'owner',point_ids:['o','x','y'],display:{width:4,height:3,stroke:{color:'#123ABC',width:2,style:'dotted'}}}
for(const mode of ['orthographic','perspective'])for(const hidden of [false,true]){
 const camera={...m.emptyGeometryScene3D().print_camera,projection:mode,position:[0,0,0],target:[0,0,1],up:[0,1,0]},projection=p.createProjection3D(camera,800,600)
 const viewA=[-2,0,5],viewB=[2,0,20],line={id:'owner',kind:'segment',viewA,viewB,a:projection.screen(viewA),b:projection.screen(viewB),dashOffset:3.25,hidden},before=structuredClone(line)
 const style=resolver.resolvePlaneBoundaryStroke3D(owner,'segment'),object=paint(freeze(line),style,projection,800,600)
 assert.ok(object.isLineSegments2);assert.equal(object.material.worldUnits,false);assert.equal(object.material.linewidth,2)
 assert.equal(object.material.dashed,hidden);assert.equal(object.material.gapSize,0);assert.equal(object.material.opacity,hidden?.45:1);assert.equal(object.material.depthTest,false);assert.equal(object.material.depthWrite,false)
 assert.equal(object.material.color.getHexString(),'123abc');assert.deepEqual(object.material.resolution.toArray(),[800,600])
 const run=object.userData.strokeRuns[0];assert.equal(run.phase,3.25)
 near(run.intervals[0][0],hidden?0:4.75)
 const start=object.geometry.attributes.instanceStart,end=object.geometry.attributes.instanceEnd
 assert.equal(start.count,run.intervals.length)
 for(let i=0;i<start.count;i++){
  const from=projection.screen(projection.view([start.getX(i),start.getY(i),start.getZ(i)])),to=projection.screen(projection.view([end.getX(i),end.getY(i),end.getZ(i)]))
  const [lo,hi]=run.intervals[i]
  for(const [q,d] of [[from,lo],[to,hi]]){const t=d/run.length;near(q[0],line.a[0]+t*(line.b[0]-line.a[0]));near(q[1],line.a[1]+t*(line.b[1]-line.a[1]))}
  assert.ok(hi-lo<=(hidden?4:2)+1e-9)
 }
 object.onBeforeRender({getViewport:target=>target.set(0,0,1024,768)});assert.deepEqual(object.material.resolution.toArray(),[1024,768])
 assert.deepEqual(line,before);assert.deepEqual(paint(line,style,projection,800,600).userData.strokeRuns,object.userData.strokeRuns)
}
function fixture(mode='cross',offset=4,projection='orthographic'){
 let scene=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 scene=m.transactGeometryScene3D(scene,s=>s.points.push({id:'P',position:[0,0,offset],label:null,visibility:'hidden'}))
 scene=a.createPerpendicularPlaneThroughPoint3D(scene,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
 return m.transactGeometryScene3D(scene,s=>{s.planes.find(q=>q.id==='beta').display.intersection_mode=mode;s.print_camera={...s.print_camera,projection,position:[8,-10,12],target:[0,0,2],vertical_span:24}})
}
function draw(scene,highlighted=[]){const group=new THREE.Group();populate(group,scene,scene.print_camera,800,600,new Set(highlighted));return group}
const wide=group=>group.children.filter(q=>q.isLineSegments2),fills=group=>group.children.filter(q=>q.isMesh&&!q.isLineSegments2)
const signature=group=>group.children.map(q=>({type:q.type,id:q.userData.semanticId,color:q.material.color.getHexString(),opacity:q.material.opacity,width:q.material.linewidth,positions:q.geometry.attributes.position?Array.from(q.geometry.attributes.position.array):undefined,runs:q.userData.strokeRuns}))
for(const mode of ['cross','first','opposite'])for(const camera of ['orthographic','perspective'])for(const offset of [-10,10])for(const style of ['solid','dashed','dotted']){
 const legacy=fixture(mode,offset,camera),width=style==='solid'?.25:style==='dashed'?2:8
 const scene=m.transactGeometryScene3D(legacy,s=>{for(const q of s.planes)q.display.stroke={color:q.id==='alpha'?'#123ABC':'#ABC123',width,style}}),before=structuredClone(scene),group=draw(freeze(scene)),baseline=draw(legacy)
 assert.ok(wide(baseline).every(q=>q.userData.planeBoundaryVisibility),'legacy planes use wide lines only when classification changes')
 const alpha=wide(group).filter(q=>q.userData.semanticId==='alpha')
 assert.ok(alpha.length>=1&&alpha.length<=2,'outline intervals batch by visible/hidden state')
 assert.ok(wide(group).some(q=>q.userData.semanticId==='beta'))
 assert.ok(!group.children.some(q=>q.type==='LineLoop'&&q.userData.semanticId==='alpha'))
 for(const object of wide(group)){
  const id=object.userData.semanticId;assert.equal(object.material.linewidth,width);assert.equal(object.material.worldUnits,false);assert.equal(object.material.color.getHexString(),id==='alpha'?'123abc':'abc123')
  const hidden=object.userData.planeBoundaryVisibility==='hidden'
  assert.equal(object.material.dashed,hidden||style!=='dotted');assert.equal(object.material.depthWrite,id==='alpha'&&!hidden)
  assert.equal(object.material.depthTest,id==='alpha'&&!hidden)
  assert.equal(object.material.opacity,hidden?.45:1)
 }
 assert.deepEqual(fills(group).map(q=>({id:q.userData.semanticId,positions:Array.from(q.geometry.attributes.position.array),opacity:q.material.opacity})),fills(baseline).map(q=>({id:q.userData.semanticId,positions:Array.from(q.geometry.attributes.position.array),opacity:q.material.opacity})))
 assert.ok(fills(group).every(q=>q.material.opacity===.15))
 const selected=draw(scene,['alpha','beta'])
 assert.ok(wide(selected).filter(q=>q.userData.semanticId==='beta').every(q=>q.material.color.getHexString()==='f97316'))
 assert.ok(wide(selected).filter(q=>q.userData.semanticId==='alpha').every(q=>q.material.color.getHexString()==='123abc'))
 const contour=alpha.flatMap(q=>q.userData.strokeRuns).sort((a,b)=>a.phase-b.phase)
 for(let i=1;i<contour.length;i++)near(contour[i].phase,contour[i-1].phase+contour[i-1].length)
 assert.deepEqual(signature(draw(scene)),signature(group));assert.deepEqual(scene,before)
 const projection=p.createProjection3D(scene.print_camera,800,600)
 for(const polygon of math.perpendicularPlaneSurface3D(scene,'P',{kind:'plane',id:'alpha'},.4,undefined,mode).polygons){const world=polygon[0].map((_,i)=>polygon.reduce((sum,q)=>sum+q[i],0)/polygon.length),xy=projection.screen(projection.view(world)),pointer={x:xy[0],y:xy[1],width:800,height:600};assert.deepEqual(g.pickGeometry3D(scene,scene.print_camera,pointer),g.pickGeometry3D(legacy,scene.print_camera,pointer))}
}
let coincident=a.createPerpendicularPlaneThroughPoint3D(fixture(),'P',{kind:'plane',id:'alpha'},.4,'beta2').scene
const blue={color:'#123ABC',width:2,style:'dashed'},red={color:'#ABC123',width:3,style:'dotted'}
for(const [first,second,expected] of [[blue,red,blue],[null,red,red]]){
 const scene=m.transactGeometryScene3D(coincident,s=>{for(const [id,stroke] of [['beta',first],['beta2',second]]){const q=s.planes.find(p=>p.id===id);if(stroke)q.display.stroke=stroke;else delete q.display.stroke}}),before=structuredClone(scene),group=draw(scene)
 assert.ok(!wide(group).some(q=>q.userData.semanticId==='beta2'))
 for(const object of wide(group).filter(q=>q.userData.semanticId==='beta')){assert.equal(object.material.color.getHexString(),expected.color.slice(1).toLowerCase());assert.equal(object.material.linewidth,expected.width);assert.ok(object.userData.selectionAliases.includes('beta2'));assert.equal(object.userData.planeBoundaries.length,2)}
 assert.ok(wide(draw(scene,['beta2'])).filter(q=>q.userData.semanticId==='beta').every(q=>q.material.color.getHexString()==='f97316'))
 assert.deepEqual(scene,before)
}
let outlines=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','A').scene
outlines=plane.createPlaneAt3D(outlines,[0,0,0],'XY','B').scene
outlines=m.transactGeometryScene3D(outlines,s=>{s.planes[0].display.stroke=blue;s.planes[1].display.stroke=red})
const outlined=draw(outlines);assert.equal(wide(outlined).length,1);assert.equal(wide(outlined)[0].userData.semanticId,'B');assert.equal(wide(outlined)[0].material.color.getHexString(),'123abc');assert.equal(fills(outlined).length,2)
// Re-populating disposes previous wide-line resources through the existing path.
let disposed=0;for(const q of wide(outlined)){q.geometry.addEventListener('dispose',()=>disposed++);q.material.addEventListener('dispose',()=>disposed++)}
populate(outlined,fixture(),fixture().print_camera,800,600,new Set());assert.equal(disposed,2)
console.log('PASS: real Three.js wide-line materials, screen-space widths/patterns/caps, perspective phase, native legacy path, shared precedence/aliases, selection, all modes, unchanged fills/picking and resource disposal')
