import assert from 'node:assert/strict'
import fs from 'node:fs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const g=await loadGeometryModule('geometry3dAnalytic'),m=await loadGeometryModule('geometry3dModel'),n=await loadGeometryModule('geometry3d'),ribbon=await loadGeometryModule('geometryRibbonMenu')
const fixtures=JSON.parse(fs.readFileSync(new URL('./geometry_3d_analytic_fixtures.json',import.meta.url),'utf8').replace(/^\uFEFF/,'')),records=[]
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<=tolerance,`${a} != ${b}`)
const record=(op,input,result)=>{records.push({op,input,result});return result}
const solid=(kind,frame=fixtures.frames[0],features=[])=>({id:'solid',kind,mode:'parametric',frame:structuredClone(frame),parameters:kind==='sphere'?{radius:2}:{radius:2,height:4},features})
for(const frame of fixtures.frames){
 const transform=g.analyticFrame3D(frame),local=[.2,.3,.4],world=transform.toWorld(local)
 close(transform.toLocal(world),local)
 record('frame',{frame,local,world},{world,local:transform.toLocal(world),vector:transform.vectorToLocal(transform.vectorToWorld(local))})
 for(const example of fixtures.evaluations){
  const s=solid(example.kind,frame),before=structuredClone(s),position=record('evaluate',{solid:s,uv:example.uv},g.evaluateAnalyticSurface3D(s,example.uv))
  close(transform.toLocal(position),example.local);assert.deepEqual(s,before)
  const inverse=record('inverse',{solid:s,world:position,hint:.37},g.inverseAnalyticSurface3D(s,position,.37));assert.ok(inverse)
  close(g.evaluateAnalyticSurface3D(s,inverse),position)
  const singular=example.kind==='sphere'&&[0,1].includes(example.uv[1])||example.kind==='cone'&&example.uv[1]===1
  if(singular)assert.equal(inverse[0],.37)
 }
 for(const kind of ['cylinder','cone','sphere']){
  const s=solid(kind,frame),bounds=record('bounds',{solid:s},g.analyticBounds3D(s));close(bounds.pivot,transform.toWorld([0,0,kind==='sphere'?0:2]));assert.equal(bounds.corners.length,8)
  for(let i=0;i<32;i++)for(const v of [0,.01,.25,.5,.75,.99,1]){
   const uv=[i/32,v],position=g.evaluateAnalyticSurface3D(s,uv),inverse=g.inverseAnalyticSurface3D(s,position)
   assert.ok(inverse);close(g.evaluateAnalyticSurface3D(s,inverse),position)
   position.forEach((p,i)=>assert.ok(p>=bounds.worldMin[i]-1e-8&&p<=bounds.worldMax[i]+1e-8))
   if(i%8===0)record('inverse',{solid:s,world:position,hint:0},inverse)
  }
  // Tight world bounds reach the analytic support point, not merely a sampled mesh bound.
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const theta=Math.atan2(sign*transform.y[axis],sign*transform.x[axis]),u=g.wrapSurfaceAzimuth3D(theta/(2*Math.PI))
   let witness
   if(kind==='sphere'){
    const direction=[transform.x[axis]*sign,transform.y[axis]*sign,transform.z[axis]*sign],length=Math.hypot(...direction)
    witness=transform.toWorld(direction.map(v=>2*v/length))
   }else{
    const base=g.evaluateAnalyticSurface3D(s,[u,0]),top=g.evaluateAnalyticSurface3D(s,[u,1]);witness=sign*base[axis]>sign*top[axis]?base:top
   }
   assert.ok(Math.abs(witness[axis]-(sign===1?bounds.worldMax[axis]:bounds.worldMin[axis]))<1e-8)
  }
  for(const features of [[],[{slot:'surface',entity_id:'carrier'}],[{slot:'v_0',entity_id:'center'}],...(kind==='sphere'?[]:[[{slot:'v_1',entity_id:'tip'}]]),[{slot:'surface',entity_id:'carrier'},{slot:'v_0',entity_id:'center'},...(kind==='sphere'?[]:[{slot:'v_1',entity_id:'tip'}])]]){
   const input=solid(kind,frame,features),snapshot=structuredClone(input),positions=record('features',{solid:input},g.analyticFeaturePositions3D(input));assert.deepEqual(input,snapshot);assert.deepEqual(Object.keys(positions).sort(),features.filter(v=>v.slot!=='surface').map(v=>v.entity_id).sort())
   const scene=m.emptyGeometryScene3D();scene.solids=[input];scene.points=Object.entries(positions).map(([id,position])=>({id,position,label:null}));scene.surfaces=features.some(f=>f.slot==='surface')?[{id:'carrier',kind,solid_id:'solid',slot:'surface'}]:[]
   if(scene.surfaces.length){scene.points.push({id:'P',position:g.evaluateAnalyticSurface3D(input,[.25,.5]),label:'P'});scene.constructions.push({id:'attachment',kind:'point_on_surface',surface_id:'carrier',uv:[.25,.5],output_point_id:'P'})}
   const canonical=n.normalizeGeometryScene3D(scene);assert.ok(canonical);record('scene',{scene},canonical);assert.equal(m.evaluateGeometryScene3D(scene).status,'ok','sphere solids are enabled; sphere surface recipes are enabled')
  }
 }
 for(const example of fixtures.rays){
  const s=solid(example.kind,frame),ray={origin:transform.toWorld(example.origin),direction:transform.vectorToWorld(example.direction)},hits=record('ray',{solid:s,ray},g.intersectAnalyticSurface3D(s,ray))
  assert.equal(hits.length,example.hits.length,example.name)
  hits.forEach((hit,i)=>{close(transform.toLocal(hit.position),example.hits[i],example.name==='far sphere'?1e-6:1e-8);close(g.evaluateAnalyticSurface3D(s,hit.uv),hit.position,example.name==='far sphere'?1e-6:1e-8)})
 }
}
for(const u of [-2,-1,-.25,0,.25,1-1e-12,1,2,1000000000.25])assert.ok(record('wrap',{u},g.wrapSurfaceAzimuth3D(u))>=0&&g.wrapSurfaceAzimuth3D(u)<1)
for(const kind of ['cylinder','cone','sphere']){
 const s=solid(kind)
 for(const uv of [[-1,0],[1,.5],[.2,-.1],[.2,1.1],[NaN,0],[Infinity,0],[true,0]])assert.throws(()=>g.evaluateAnalyticSurface3D(s,uv))
 for(const projection of ['perspective','orthographic']){
  const camera={projection,position:[-8,0,2],target:[0,0,2],up:[0,0,1],vertical_span:8,fov_degrees:60,near:.1,far:100}
  for(const [x,y] of [[400,300],[450,280],[300,320]]){
   const ray=record('pointer',{camera,width:800,height:600,x,y},g.analyticPointerRay3D(camera,800,600,x,y)),hits=record('ray',{solid:s,ray},g.intersectAnalyticSurface3D(s,ray))
   if(x===400&&kind!=='sphere')assert.ok(hits.length)
   for(const hit of hits){assert.ok(hit.depth>=camera.near&&hit.depth<=camera.far);assert.ok(hit.distance>=hit.depth-1e-9)}
   if(projection==='perspective'&&x===450&&hits.length)assert.ok(hits[0].distance>hits[0].depth,'camera depth is not ray distance')
   for(const clip of [{...ray.clip,near:7,far:100},{...ray.clip,near:.1,far:7},{...ray.clip,near:20,far:30}]){
    const clipped={...ray,clip},actual=record('ray',{solid:s,ray:clipped},g.intersectAnalyticSurface3D(s,clipped))
    assert.deepEqual(actual,hits.filter(h=>h.depth>=clip.near&&h.depth<=clip.far))
   }
  }
  assert.throws(()=>g.analyticPointerRay3D(camera,800,600,-1,300));assert.throws(()=>g.analyticPointerRay3D({...camera,up:[1,0,0]},800,600,400,300))
 }
 assert.equal(g.inverseAnalyticSurface3D(s,[30,0,2]),null)
 for(const features of [[{slot:'v_4',entity_id:'bad'}],[{slot:'surface',entity_id:'a'},{slot:'surface',entity_id:'b'}],[{slot:'surface',entity_id:'bad id'}]])assert.throws(()=>g.analyticFeaturePositions3D({...s,features}))
 for(const radius of [0,-1,NaN,Infinity,true])assert.throws(()=>g.evaluateAnalyticSurface3D({...s,parameters:{...s.parameters,radius}},[0,0]))
 assert.throws(()=>g.evaluateAnalyticSurface3D({...s,frame:{...s.frame,x_axis:[2,0,0]}},[0,0]));assert.throws(()=>g.intersectAnalyticSurface3D(s,{origin:[0,0,0],direction:[0,0,0]}))
}
// Independent axial tolerance must not expand short cylinders to the size of their radius.
const wide={...solid('cylinder'),parameters:{radius:1e9,height:1}};assert.equal(g.inverseAnalyticSurface3D(wide,[1e9,0,1.1]),null);assert.equal(g.intersectAnalyticSurface3D(wide,{origin:[-1e10,0,2],direction:[1,0,0]}).length,0)
for(const kind of ['sphere','cone','cylinder']){
 const tiny={...solid(kind),parameters:kind==='sphere'?{radius:1e-9}:{radius:1e-9,height:2e-9}},uv=[.25,.4],point=g.evaluateAnalyticSurface3D(tiny,uv)
 close(g.evaluateAnalyticSurface3D(tiny,g.inverseAnalyticSurface3D(tiny,point)),point,1e-22)
}
const nearFrame={origin:[0,0,0],x_axis:[1+1e-10,0,0],y_axis:[1e-10,1,0]},frame=g.analyticFrame3D(nearFrame);close(frame.toLocal(frame.toWorld([3,4,5])),[3,4,5],1e-12)
assert.throws(()=>g.evaluateAnalyticSurface3D({...solid('sphere'),frame:{...fixtures.frames[0],origin:[1e12,0,0]},parameters:{radius:1e-9}},[0,.5]))
const future=ribbon.GEOMETRY_RIBBON.find(g=>g.label==='3D').groups.flatMap(g=>g.items).filter(i=>['Silindr','Konus','Sfera','Kürə'].includes(i.label));assert.equal(future.length,4);assert.equal(future.find(i=>i.label==='Silindr').action3D,'cylinder');assert.equal(future.find(i=>i.label==='Konus').action3D,'cone');assert.equal(future.find(i=>i.label==='Kürə').action3D,'sphere');assert.ok(!future.find(i=>i.label==='Sfera').action3D)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(records))
console.log(`PASS: analytic UV/frame/inverse, seams/poles/apex, finite lateral rays/tangent/linear/coincident/clipping, tight bounds/pivots, sparse identities, ${records.length} parity records; cylinder/cone/sphere solids enabled; sphere surface authoring enabled`)
