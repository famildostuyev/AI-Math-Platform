import assert from 'node:assert/strict'
import fs from 'node:fs'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),n=load('geometry3d'),display=load('geometry3dPlaneDisplay'),projection=load('geometry3dProjection')
let base=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
base=m.transactGeometryScene3D(base,s=>s.points.push({id:'P',position:[0,0,4],label:null},{id:'Q',position:[1,0,4],label:null}))
base=a.createPerpendicularPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
base=a.createParallelPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},'parallel').scene
base=a.createGuidedPerpendicularPlane3D(base,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
base=m.transactGeometryScene3D(base,s=>s.planes.push({id:'bare',point_ids:[...s.planes.find(p=>p.id==='alpha').point_ids]},{id:'half',kind:'half_plane',point_ids:[...s.planes.find(p=>p.id==='alpha').point_ids]}))
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}
const before=structuredClone(base),legacy=n.serializeGeometryScene3D(base)
for(const p of freeze(base).planes){assert.equal(display.planeShowsHiddenEdges3D(p),true);assert.ok(!Object.hasOwn(p.display??{},'show_hidden_edges'))}
assert.deepEqual(n.normalizeGeometryScene3D(base),base);assert.equal(n.serializeGeometryScene3D(base),legacy);assert.ok(!legacy.includes('show_hidden_edges'));assert.deepEqual(base,before)
const scenes=[]
for(const stroke of [false,true])for(const shape of [false,true])for(const visibility of [false,true])for(const lower of [false,true])for(const mode of [undefined,'cross','first','opposite'])for(const value of [false,true]){
 const input=structuredClone(base)
 for(const p of input.planes)p.display={width:4,height:3,...(shape?{shape:'parallelogram',skew:.4}:{}),...(visibility?{intersection_visibility:'hidden'}:{}),...(lower?{lower_portion:'upper'}:{}),...(mode?{intersection_mode:mode}:{}),...(stroke?{stroke:{color:'#123ABC',width:2,style:'dotted'}}:{}),show_hidden_edges:value}
 const snapshot=structuredClone(input),result=n.normalizeGeometryScene3D(input)
 assert.ok(result)
 for(const p of result.planes){assert.equal(p.display.show_hidden_edges,value);assert.equal(display.planeShowsHiddenEdges3D(p),value);assert.equal(typeof p.display.show_hidden_edges,'boolean');if(stroke)assert.deepEqual(p.display.stroke,{color:'#123ABC',width:2,style:'dotted'});if(mode)assert.equal(p.display.intersection_mode,mode)}
 assert.deepEqual(result.points,base.points);assert.deepEqual(result.constructions,base.constructions)
 assert.deepEqual(n.normalizeGeometryScene3D(result),result);assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(result))),result)
 assert.deepEqual(structuredClone(result),result);assert.deepEqual(input,snapshot);scenes.push(result)
}
const invalid=[null,0,1,-1,NaN,Infinity,'true','false','0','',[],{},[true]]
for(const value of invalid)for(const id of ['alpha','beta','half']){
 const input=structuredClone(base),p=input.planes.find(q=>q.id===id);p.display={...(p.display??{width:4,height:3}),show_hidden_edges:value}
 assert.equal(n.normalizeGeometryScene3D(input),null);assert.equal(n.serializeGeometryScene3D(input),null)
}
for(const key of ['showHiddenEdges','show_hidden_edges']){
 const input=structuredClone(base);input.planes[0][key]=true;assert.equal(n.normalizeGeometryScene3D(input),null)
}
const misspelled=structuredClone(base);misspelled.planes[0].display.showHiddenEdges=true;assert.equal(n.normalizeGeometryScene3D(misspelled),null)
// Independent settings, existing stroke/mode fields, clone isolation and history.
const mixed=m.transactGeometryScene3D(base,s=>{for(const [id,value] of [['alpha',false],['beta',true],['half',false]]){const p=s.planes.find(q=>q.id===id);p.display={...(p.display??{width:4,height:3}),stroke:{color:'#ABC123',width:3,style:'dashed'},show_hidden_edges:value};if(id==='beta')p.display.intersection_mode='opposite'}})
assert.ok(mixed);assert.equal(mixed.planes.find(p=>p.id==='parallel').display.show_hidden_edges,undefined)
const history=m.createGeometryHistory3D(base,()=>{});assert.ok(history.commit(mixed));assert.equal(history.commit(structuredClone(mixed)),false)
const clone=history.getScene();clone.planes.find(p=>p.id==='alpha').display.show_hidden_edges=true
assert.equal(history.getScene().planes.find(p=>p.id==='alpha').display.show_hidden_edges,false)
assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),base);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),mixed)
const moved=m.transactGeometryScene3D(mixed,s=>s.points.find(p=>p.id==='P').position=[0,0,-7])
assert.equal(moved.planes.find(p=>p.id==='alpha').display.show_hidden_edges,false);assert.equal(moved.planes.find(p=>p.id==='beta').display.show_hidden_edges,true)
const absent=m.transactGeometryScene3D(mixed,s=>{delete s.planes.find(p=>p.id==='alpha').display.show_hidden_edges})
assert.ok(history.commit(absent));assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),mixed);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),absent)
assert.equal(display.planeShowsHiddenEdges3D(absent.planes.find(p=>p.id==='alpha')),true)
// The presentation setting never changes visibility classification.
const enabled=m.transactGeometryScene3D(mixed,s=>{for(const p of s.planes)if(p.display)p.display.show_hidden_edges=true})
const disabled=m.transactGeometryScene3D(enabled,s=>{for(const p of s.planes)if(p.display)p.display.show_hidden_edges=false})
assert.ok(!projection.geometrySceneSVG3D(disabled).includes('data-plane-boundary="hidden"'))
const classify=s=>{const q=projection.projectScene3D(s,s.print_camera,800,600,true);return projection.projectedPlaneBoundaryStrokes3D(q,s.print_camera.projection,projection.displayPrimitives3D(projection.scenePrimitives3D(s).primitives).aliases)}
assert.deepEqual(classify(disabled),classify(enabled))
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({base,scenes,mixed}))
console.log(`PASS: ${scenes.length} strict hidden-edge fixtures, all plane kinds/display combinations, absent=true without materialization, immutable round trips, independent settings and Undo/Redo; classification unchanged`)
