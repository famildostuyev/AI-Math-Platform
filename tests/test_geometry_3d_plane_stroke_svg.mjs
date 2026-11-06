import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),p=load('geometry3dProjection'),solid=load('geometry3dSolidAuthoring'),print=load('printableDocumentModel'),math=load('geometry3dConstructedPlane')
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const tags=svg=>[...svg.matchAll(/<(polygon|path)\b[^>]*>/g)].map(q=>({tag:q[1],...Object.fromEntries([...q[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))}))
const geometry=svg=>tags(svg).map(q=>Object.fromEntries(['tag','data-id','d','points','fill','fill-opacity','mask'].filter(k=>k in q).map(k=>[k,q[k]])))
const byId=(svg,id,tag)=>tags(svg).filter(q=>q['data-id']===id&&(!tag||q.tag===tag))
function fixture(mode='cross',projection='orthographic',analytic=false,offset=4){
 let s=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 s=m.transactGeometryScene3D(s,d=>d.points.push({id:'P',position:[0,0,offset],label:null,visibility:'hidden'}))
 s=a.createPerpendicularPlaneThroughPoint3D(s,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
 s=a.createParallelPlaneThroughPoint3D(s,'P',{kind:'plane',id:'alpha'},'parallel').scene
 s=m.transactGeometryScene3D(s,d=>{d.planes.find(q=>q.id==='beta').display.intersection_mode=mode;d.print_camera={...d.print_camera,projection,position:[8,-10,12],target:[0,0,2],vertical_span:16}})
 return analytic?solid.createSphereAt3D(s,[4,0,0],'XY','sphere').scene:s
}
// Captured from the pre-styling SVG emitter, including analytic mask/hash paths.
const legacy={
 'cross/orthographic/false':'97500b86bf1094d21c2c5b1ab057d62b72207f75c7e9795edad2ab394fd07395',
 'cross/orthographic/true':'cd936c759534bc833a474ef9b022e29c91922bb72ceccc217b06afc82ab8ab82',
 'cross/perspective/false':'2df30f24884901fa56a8b3331112842bac2a67007a0612740b93b3bd7390d1ec',
 'cross/perspective/true':'21585910702c206e2e8648e3f95ea5660f2404502fca80b1f4f36b8ac6d7e3db',
 'first/orthographic/false':'4e4cef7fb45ca5410b8635db4b0a251dfad942c39bc176c885cb0d3ccc193c58',
 'first/orthographic/true':'729607319eea0cf148e02f4c42a29f08b523487800d573406264bc4eae81ca7d',
 'first/perspective/false':'be80f4bbf720d89eae9f6b84ba15ba9c00c1cf0b4b9c5e2eec31ff5ea080f831',
 'first/perspective/true':'8922c6697b0a4dd4f913f475c96740c0d2e1590d1776f4a44a7ff323c7b94750',
 'opposite/orthographic/false':'8d50d0f2dff0af937b23a0f58c616a803d0be0c641317e36cb892623af5c918e',
 'opposite/orthographic/true':'7143aa9b95daddcab81ffab98afd7e5c198e8c692fb6c45170472ecb38652355',
 'opposite/perspective/false':'e2a210a683597673390034fcbdc6183d0b7d795c5d4052f6b14886ac8b3e11b5',
 'opposite/perspective/true':'b2b81e6f4ca581159564deb149c1f153f248bcb51f4a5849e52a5ec8763f10b2',
}
for(const [key,hash] of Object.entries(legacy)){
 const [mode,projection,analytic]=key.split('/'),svg=p.geometrySceneSVG3D(fixture(mode,projection,analytic==='true'),800,600)
 const actual=crypto.createHash('sha256').update(svg).digest('hex')
 if(svg.includes('data-plane-boundary="hidden"'))assert.notEqual(actual,hash,`${key}: newly occluded boundaries change output`)
 else assert.equal(actual,hash,key)
}
for(const mode of ['cross','first','opposite'])for(const camera of ['orthographic','perspective'])for(const offset of [-4,4])for(const style of ['solid','dashed','dotted']){
 const base=fixture(mode,camera,false,offset),width=style==='solid'?.25:style==='dashed'?2:8
 const scene=m.transactGeometryScene3D(base,s=>{for(const q of s.planes)q.display.stroke={color:q.id==='beta'?'#ABC123':'#123ABC',width,style}}),before=structuredClone(scene)
 const svg=p.geometrySceneSVG3D(freeze(scene),800,600),again=p.geometrySceneSVG3D(scene,800,600)
 assert.equal(svg,again);assert.deepEqual(geometry(svg),geometry(p.geometrySceneSVG3D(base,800,600)))
 for(const q of [...byId(svg,'alpha'),...byId(svg,'parallel'),...byId(svg,'beta','path')].filter(q=>q.stroke!=='none'&&!q['data-render-curve'])){
  assert.equal(q.stroke,q['data-id']==='beta'?'#ABC123':'#123ABC');assert.equal(q['stroke-width'],String(width))
  const hidden=q['data-plane-boundary']==='hidden'
  assert.equal(q['stroke-linecap'],!hidden&&style==='dotted'?'round':'butt')
  assert.equal(q['stroke-dasharray'],hidden?(style==='solid'?'4 3':`${6*width} ${3*width} ${width} ${3*width}`):style==='solid'?undefined:style==='dashed'?`${4*width} ${3*width}`:`${width} ${3*width}`)
 }
 assert.ok(byId(svg,'beta','path').some(q=>!q['data-render-curve']))
 for(const q of byId(svg,'beta','polygon')){assert.equal(q.stroke,'none');assert.equal(q['fill-opacity'],'0.35')}
 assert.equal(byId(svg,'beta','polygon').length,mode==='cross'?2:1)
 const highlighted=p.geometrySceneSVG3D(scene,800,600,new Set(['beta','alpha']))
 for(const q of byId(highlighted,'beta','path').filter(q=>!q['data-render-curve'])){assert.equal(q.stroke,'#f97316');assert.equal(q['stroke-width'],String(width))}
 for(const q of byId(highlighted,'alpha').filter(q=>q.stroke!=='none'))assert.equal(q.stroke,'#123ABC')
 assert.deepEqual(scene,before)
 // Printable preparation must use the exact saved-camera SVG styles.
 const snapshot=freeze({version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:scene}}]}]})
 const plan=print.preparePrintableDocument(snapshot,'stroke-print');assert.equal(plan.issues.length,0)
 const block=plan.revisions[0].blocks[0]
 assert.equal(block.svg,print.namespacePrintableSVG(p.geometrySceneSVG3D(scene,block.size.width,block.size.height),block.scope))
 for(const q of byId(block.svg,'alpha').filter(q=>q.stroke!=='none'))assert.equal(q.stroke,'#123ABC')
}
// One existing segment representative, explicit owners first, then lexical ID.
let coincident=a.createPerpendicularPlaneThroughPoint3D(fixture(),'P',{kind:'plane',id:'alpha'},.4,'beta2').scene
function competing(first,second){return m.transactGeometryScene3D(coincident,s=>{for(const [id,stroke] of [['beta',first],['beta2',second]]){const q=s.planes.find(p=>p.id===id);if(stroke)q.display.stroke=stroke;else delete q.display.stroke}})}
const blue={color:'#123ABC',width:2,style:'dashed'},red={color:'#ABC123',width:3,style:'dotted'}
for(const [first,second,expected] of [[blue,red,blue],[null,red,red],[red,blue,red]]){
 const s=competing(first,second),adapter=p.displayPrimitives3D(p.scenePrimitives3D(s).primitives),before=structuredClone(s),svg=p.geometrySceneSVG3D(s)
 assert.ok(adapter.aliases.get('beta').includes('beta2'))
 const lines=byId(svg,'beta','path').filter(q=>!q['data-render-curve']);assert.ok(lines.length)
 assert.ok(!byId(svg,'beta2','path').length)
 for(const q of lines){assert.equal(q.stroke,expected.color);assert.equal(q['stroke-width'],String(expected.width))}
 for(const q of adapter.primitives.filter(q=>q.kind==='segment'&&q.planeBoundaries))assert.ok(q.planeBoundaries.some(o=>o.ownerId==='beta2'))
 assert.deepEqual(s,before)
}
// Exactly coincident inline outlines retain both fills, but emit one explicit
// stroke. Their existing painter-order IDs and geometry remain unchanged.
let outlines=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','A').scene
outlines=plane.createPlaneAt3D(outlines,[0,0,0],'XY','B').scene
outlines=m.transactGeometryScene3D(outlines,s=>{s.planes[0].display.stroke=blue;s.planes[1].display.stroke=red})
const polygons=tags(p.geometrySceneSVG3D(outlines)).filter(q=>q.tag==='polygon')
assert.equal(polygons.length,2);assert.equal(polygons.filter(q=>q.stroke!=='none').length,1);assert.equal(polygons.find(q=>q.stroke!=='none').stroke,blue.color)
// Existing polyhedron occlusion stays dashed, retaining stored color/width and
// continuous phase across split fragments. No plane occluders are introduced.
let hidden=fixture(),cube=solid.defaultSolid3D('cube','cube');cube.parameters.side=6
hidden=solid.createSolid3D(hidden,cube).scene
hidden=m.transactGeometryScene3D(hidden,s=>s.planes.find(q=>q.id==='beta').display.stroke={color:'#ABC123',width:2,style:'dotted'})
const strokes=byId(p.geometrySceneSVG3D(hidden,800,600),'beta','path').filter(q=>!q['data-render-curve']),obscured=strokes.filter(q=>q.opacity==='0.45')
assert.ok(obscured.length,'fixture must exercise existing hidden boundary intervals')
for(const q of obscured){assert.equal(q.stroke,'#ABC123');assert.equal(q['stroke-width'],'2');assert.equal(q['stroke-dasharray'],q['data-plane-boundary']?'12 6 2 6':'4 3');assert.equal(q['stroke-linecap'],'butt')}
assert.ok(strokes.some(q=>Number(q['stroke-dashoffset'])<0),'split explicit patterns retain their dash phase')
let disconnected
for(let v=.7;v<1;v+=.005){
 let s=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 s=plane.resizePlaneDisplay3D(s,'alpha',2,2);s=plane.setPlaneShape3D(s,'alpha','cloud',0)
 s=m.transactGeometryScene3D(s,d=>{d.points.push({id:'P',position:[0,v,4],label:null,visibility:'hidden'});d.print_camera={...d.print_camera,position:[8,-10,12],target:[0,0,2],vertical_span:16}})
 s=a.createPerpendicularPlaneThroughPoint3D(s,'P',{kind:'plane',id:'alpha'},0,'beta').scene
 if(math.perpendicularPlaneSurface3D(s,'P',{kind:'plane',id:'alpha'},0).segments.length>1){disconnected=s;break}
}
assert.ok(disconnected)
for(const mode of ['cross','first','opposite']){
 const plain=m.transactGeometryScene3D(disconnected,s=>s.planes.find(q=>q.id==='beta').display.intersection_mode=mode)
 const styled=m.transactGeometryScene3D(plain,s=>s.planes.find(q=>q.id==='beta').display.stroke={color:'#ABC123',width:3,style:'dotted'})
 const svg=p.geometrySceneSVG3D(styled,800,600),surface=math.perpendicularPlaneSurface3D(styled,'P',{kind:'plane',id:'alpha'},0,undefined,mode)
 assert.equal(byId(svg,'beta','polygon').length,surface.polygons.length)
 assert.deepEqual(geometry(svg),geometry(p.geometrySceneSVG3D(plain,800,600)))
 for(const q of byId(svg,'beta','path').filter(q=>!q['data-render-curve'])){assert.equal(q.stroke,'#ABC123');assert.equal(q['stroke-dasharray'],q['data-plane-boundary']==='hidden'?'18 9 3 9':'3 9')}
}
console.log('PASS: SVG styles/caps/phase, legacy hashes where unoccluded, all modes/cameras/signed offsets, coincidence precedence, transient selection, saved printing, hidden visibility treatment and immutable geometry')
