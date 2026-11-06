import assert from 'node:assert/strict'
import fs from 'node:fs'
import {printableComponent as load} from './printable_test_modules.mjs'
const m=load('geometry3dModel'),a=load('geometry3dConstructedPlaneAuthoring'),plane=load('geometry3dPlaneAuthoring'),n=load('geometry3d'),projection=load('geometry3dProjection')
let base=plane.createPlaneAt3D(m.emptyGeometryScene3D(),[0,0,0],'XY','alpha').scene
base=m.transactGeometryScene3D(base,s=>s.points.push({id:'P',position:[0,0,6],label:'P'},{id:'Q',position:[1,0,6],label:null}))
base=a.createPerpendicularPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},.4,'beta').scene
base=a.createParallelPlaneThroughPoint3D(base,'P',{kind:'plane',id:'alpha'},'parallel').scene
base=a.createGuidedPerpendicularPlane3D(base,{kind:'plane',id:'alpha'},{kind:'points',a:'P',b:'Q'},'guided').scene
base=m.transactGeometryScene3D(base,s=>s.planes.push({id:'half',kind:'half_plane',point_ids:[...s.planes.find(p=>p.id==='alpha').point_ids]}))
assert.ok(base);assert.deepEqual(n.normalizeGeometryScene3D(base),base)
assert.ok(base.planes.every(p=>p.display?.stroke===undefined))
const scenes=[]
// Every existing display-field combination remains accepted with stroke.
for(const shaped of [false,true])for(const visibility of [false,true])for(const lower of [false,true])for(const mode of [undefined,'cross','first','opposite']){
 const input=structuredClone(base)
 for(const p of input.planes)p.display={width:4,height:3,...(shaped?{shape:'parallelogram',skew:.6}:{}),...(visibility?{intersection_visibility:'hidden'}:{}),...(lower?{lower_portion:'upper'}:{}),...(mode?{intersection_mode:mode}:{}),stroke:{color:'#1aB2cD',width:.25,style:'dotted'}}
 const before=structuredClone(input),result=n.normalizeGeometryScene3D(input)
 assert.ok(result);assert.deepEqual(input,before)
 for(const p of result.planes){assert.deepEqual(p.display.stroke,{color:'#1AB2CD',width:.25,style:'dotted'});const original=input.planes.find(q=>q.id===p.id).display;assert.deepEqual({...p.display,stroke:undefined,intersection_mode:undefined},{...original,stroke:undefined,intersection_mode:undefined});if(mode)assert.equal(p.display.intersection_mode,mode)}
 assert.deepEqual(result.points,base.points);assert.deepEqual(result.constructions,base.constructions)
 assert.deepEqual(n.normalizeGeometryScene3D(result),result)
 assert.deepEqual(n.normalizeGeometryScene3D(JSON.parse(n.serializeGeometryScene3D(result))),result)
 scenes.push(result)
}
for(const width of [.25,.5,1,2.5,8])for(const style of ['solid','dashed','dotted']){
 const input=structuredClone(base);input.planes.find(p=>p.id==='alpha').display.stroke={color:'#abcdef',width,style}
 const result=n.normalizeGeometryScene3D(input);assert.equal(result.planes.find(p=>p.id==='alpha').display.stroke.color,'#ABCDEF');scenes.push(result)
}
const invalidStrokes=[null,[],{},'red',
 ...['red','#123','#12345678','123456','#12GG56','#123456\n',' #123456','#123456 ',true,123,null].map(color=>({color,width:1,style:'solid'})),
 ...[0,-1,.249999,8.000001,NaN,Infinity,-Infinity,true,'1',null].map(width=>({color:'#123456',width,style:'solid'})),
 ...['','dash','SOLID',true,1,null].map(style=>({color:'#123456',width:1,style})),
 {color:'#123456',width:1},{color:'#123456',style:'solid'},{width:1,style:'solid'},
 {color:'#123456',width:1,style:'solid',highlighted:true}]
for(const stroke of invalidStrokes)for(const id of ['alpha','beta','half']){
 const input=structuredClone(base),target=input.planes.find(p=>p.id===id);target.display={...(target.display??{width:4,height:3}),stroke}
 assert.equal(n.normalizeGeometryScene3D(input),null);assert.equal(n.serializeGeometryScene3D(input),null)
}
const invalidLocation=structuredClone(base);invalidLocation.planes[0].stroke={color:'#123456',width:1,style:'solid'};assert.equal(n.normalizeGeometryScene3D(invalidLocation),null)
const styled=m.transactGeometryScene3D(base,s=>{s.planes.find(p=>p.id==='beta').display.stroke={color:'#123ABC',width:8,style:'dashed'}})
const oldSvg=projection.geometrySceneSVG3D(base),styleBefore=structuredClone(styled)
assert.notEqual(projection.geometrySceneSVG3D(styled),oldSvg,'explicit stroke styling is consumed by SVG')
projection.geometrySceneSVG3D(styled,520,300,new Set(['beta']));assert.deepEqual(styled,styleBefore)
const history=m.createGeometryHistory3D(base,()=>{});assert.ok(history.commit(styled));assert.equal(history.commit(styled),false);assert.ok(history.provider.undo());assert.deepEqual(history.getScene(),base);assert.ok(history.provider.redo());assert.deepEqual(history.getScene(),styled)
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({base,scenes,styled}))
console.log(`PASS: ${scenes.length} stroke fixtures; all plane kinds/display combinations, canonical colors, strict widths/styles, immutable round trips, legacy defaults, SVG styling and unchanged history`)
