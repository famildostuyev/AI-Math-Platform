import assert from 'node:assert/strict'
import {printableComponent as load} from './printable_test_modules.mjs'
const p=load('geometry3dProjection'),m=load('geometry3dModel'),plane=load('geometry3dPlaneAuthoring'),a=load('geometry3dConstructedPlaneAuthoring'),print=load('printableDocumentModel'),math=load('geometry3dConstructedPlane')
const tags=svg=>[...svg.matchAll(/<(polygon|path)\b[^>]*>/g)].map(q=>({tag:q[1],...Object.fromEntries([...q[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]]))}))
const num=v=>String(Math.abs(v)<.0000005?0:Number(v.toFixed(6))),xy=v=>v.slice(0,2).map(num).join(',')
const path=l=>`M${xy(l.a)} L${xy(l.b)}`
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const decode=s=>JSON.parse(s.replaceAll('&quot;','"').replaceAll('&amp;','&'))
function fixture(mode='cross',projection='orthographic',sign=1,style='solid',offset=4){
 let s=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
 s=plane.resizePlaneDisplay3D(s,'alpha',2,2)
 s=m.transactGeometryScene3D(s,d=>d.points.push({id:'P',position:[0,0,offset],label:null,visibility:'hidden'}))
 s=a.createPerpendicularPlaneThroughPoint3D(s,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
 return m.transactGeometryScene3D(s,d=>{
  for(const q of d.planes)q.display.stroke={color:q.id==='alpha'?'#123ABC':'#ABC123',width:2,style}
  d.planes.find(q=>q.id==='beta').display.intersection_mode=mode
  d.print_camera={...d.print_camera,projection,position:[8,-10,sign*12],target:[0,0,0],vertical_span:24}
 })
}
let comparisons=0
for(const mode of ['cross','first','opposite'])for(const projection of ['orthographic','perspective'])for(const sign of [-1,1])for(const style of ['solid','dashed','dotted'])for(const offset of [-4,4]){
 const s=fixture(mode,projection,sign,style,offset),before=structuredClone(s)
 const q=p.projectScene3D(s,s.print_camera,800,600,true),display=p.displayPrimitives3D(p.scenePrimitives3D(s).primitives),classified=p.projectedPlaneBoundaryStrokes3D(q,projection,display.aliases)
 const svg=p.geometrySceneSVG3D(freeze(s),800,600),all=tags(svg),boundaries=all.filter(t=>t['data-plane-boundary'])
 assert.ok(boundaries.some(t=>t['data-plane-boundary']==='hidden'),'finite planes produce hidden intervals')
 for(const t of boundaries){
  const l=classified.find(l=>l.id===t['data-id']&&path(l)===t.d&&l.hidden===(t['data-plane-boundary']==='hidden'));assert.ok(l,'SVG endpoints and hidden state exactly match classifier')
  const outline=l.planeBoundaries.some(o=>o.representation==='outline'),hidden=l.hidden
  assert.equal(t.stroke,t['data-id']==='alpha'?'#123ABC':'#ABC123');assert.equal(t['stroke-width'],'2')
  assert.deepEqual(decode(t['data-selection-aliases']),l.selectionAliases)
  assert.equal(t['stroke-linecap'],hidden?'butt':style==='dotted'?'round':'butt')
  assert.equal(t['stroke-dasharray'],hidden?(style==='solid'?'4 3':'12 6 2 6'):style==='solid'?undefined:style==='dashed'?'8 6':'2 6')
  if(t['stroke-dasharray'])assert.equal(t['stroke-dashoffset'],num(-l.dashOffset))
  assert.equal(t.opacity,hidden?'0.45':undefined)
  if(outline)assert.ok(all.filter(t=>t.tag==='polygon'&&t['data-id']===l.id).every(t=>t.stroke==='none'))
  comparisons++
 }
 // Every generated boundary is represented once, including split endpoints.
 for(const id of new Set(boundaries.map(t=>t['data-id'])))assert.equal(all.filter(t=>t.tag==='path'&&t['data-id']===id&&!t['data-render-curve']).length,classified.filter(l=>l.id===id).length)
 const polygons=all.filter(t=>t.tag==='polygon')
 assert.deepEqual(polygons.map(t=>t.points),[...q.faces].sort((a,b)=>b.vertices.reduce((s,v)=>s+v[2],0)/b.vertices.length-a.vertices.reduce((s,v)=>s+v[2],0)/a.vertices.length||a.id.localeCompare(b.id)).map(f=>f.vertices.map(xy).join(' ')))
 assert.ok(polygons.every(t=>t['fill-opacity']==='0.35'))
 assert.equal(svg,p.geometrySceneSVG3D(s,800,600));assert.deepEqual(s,before)
 const selected=tags(p.geometrySceneSVG3D(s,800,600,new Set(['alpha','beta']))).filter(t=>t['data-plane-boundary'])
 for(const t of selected)assert.equal(t.stroke,t['data-id']==='alpha'?'#123ABC':'#f97316')
 if(mode==='cross'&&style==='dotted'&&sign===1&&offset===4){
  const snapshot=freeze({version:1,revisions:[{revision_id:'11111111-1111-4111-8111-111111111111',revision_number:1,blocks:[{id:'geometry',sort_order:0,block_type:'geometry',payload:{format_version:1,source_data:s}}]}]})
  const plan=print.preparePrintableDocument(snapshot,'hidden-planes');assert.equal(plan.issues.length,0)
  const block=plan.revisions[0].blocks[0]
  assert.equal(block.svg,print.namespacePrintableSVG(p.geometrySceneSVG3D(s,block.size.width,block.size.height),block.scope))
  assert.ok(block.svg.includes('data-plane-boundary="hidden"'))
 }
}
// Exact coincident ordinary contours: one boundary representative, all owners,
// explicit before legacy, lexical owner ID before painter-order representative.
for(const firstExplicit of [false,true]){
 let s=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','A').scene
 s=plane.createPlaneAt3D(s,[0,0,0],'XY','B').scene
 s=plane.createPlaneAt3D(s,[0,0,1],'XY','front').scene
 s=plane.resizePlaneDisplay3D(s,'front',2.5,2.5)
 s=m.transactGeometryScene3D(s,d=>{d.planes.find(q=>q.id==='B').display.stroke={color:'#ABC123',width:3,style:'dotted'};if(firstExplicit)d.planes.find(q=>q.id==='A').display.stroke={color:'#123ABC',width:2,style:'dashed'};d.print_camera={...d.print_camera,position:[8,-10,12],target:[0,0,0],vertical_span:16}})
 const ts=tags(p.geometrySceneSVG3D(s,800,600)),bs=ts.filter(t=>t['data-plane-boundary']&&['A','B'].includes(t['data-id']))
 assert.ok(bs.some(t=>t['data-plane-boundary']==='hidden'))
 assert.ok(bs.every(t=>t['data-id']==='B'&&t.stroke===(firstExplicit?'#123ABC':'#ABC123')))
 for(const t of bs)assert.deepEqual(decode(t['data-selection-aliases']),['A','B'])
 assert.ok(ts.filter(t=>t.tag==='polygon'&&['A','B'].includes(t['data-id'])).every(t=>t.stroke==='none'))
}
let s=a.createPerpendicularPlaneThroughPoint3D(fixture(),'P',{kind:'plane',id:'alpha'},.4,'beta2').scene
s=m.transactGeometryScene3D(s,d=>d.planes.find(q=>q.id==='beta2').display.stroke={color:'#FF0000',width:8,style:'dotted'})
const coincident=tags(p.geometrySceneSVG3D(s,800,600,new Set(['beta2']))).filter(t=>t['data-plane-boundary']&&t['data-id']==='beta')
assert.ok(coincident.length);assert.ok(coincident.every(t=>decode(t['data-selection-aliases']).includes('beta2')&&t.stroke==='#f97316'&&t['stroke-width']==='2'))
// Isolated/copanar planes retain inline strokes, with no new boundary paths.
let single=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','only').scene
for(const projection of ['orthographic','perspective']){
 single=m.transactGeometryScene3D(single,d=>d.print_camera.projection=projection)
 for(const scene of [single,plane.createPlaneAt3D(single,[0,0,0],'XY','coincident').scene]){
  const svg=p.geometrySceneSVG3D(scene),ts=tags(svg)
  assert.ok(!svg.includes('data-plane-boundary'))
  assert.ok(ts.filter(t=>t.tag==='polygon').every(t=>t.stroke==='#94a3b8'))
 }
}
// Empty constructed surfaces fabricate neither fills nor boundaries.
let empty=fixture()
empty=m.transactGeometryScene3D(empty,d=>d.points.find(q=>q.id==='P').position=[0,20,4])
assert.equal(math.perpendicularPlaneSurface3D(empty,'P',{kind:'plane',id:'alpha'},.4).polygons.length,0)
assert.ok(!tags(p.geometrySceneSVG3D(empty)).some(t=>t['data-id']==='beta'))
console.log(`PASS: ${comparisons} classified SVG intervals, patterns/phase, camera reversal, all modes, ownership precedence/aliases, immutable fills, saved print and unoccluded legacy paths`)
