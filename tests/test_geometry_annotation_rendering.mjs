import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {loadGeometryComponent} from './geometry_component_test_modules.mjs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const require=createRequire(new URL('../frontend/package.json',import.meta.url)),{createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const Renderer=await loadGeometryComponent('GeometryRenderer'),{emptyGeometryV1}=await loadGeometryModule('geometryV1')
const g={...emptyGeometryV1(),description:'Mixed',texts:[{id:'note',x:20,y:30,content:'Area x units',runs:[{type:'text',text:'Area ',marks:[]},{type:'inline_math',latex:'x'},{type:'text',text:' units',marks:[]}],layout_width:50,scale:2,rotation:Math.PI/2},{id:'old',x:1,y:2,content:'Legacy'}]}
const before=structuredClone(g)
for(const frameSize of [undefined,{width:480,height:360}]){
 const svg=renderToStaticMarkup(createElement(Renderer,{geometry:g,frameSize,blockId:'test'}))
 assert.equal((svg.match(/data-annotation-id="note"/g)||[]).length,1)
 assert.ok(svg.includes('rotate(90) scale(2)'));assert.ok(svg.includes('katex'));assert.ok(svg.includes('Area '));assert.ok(svg.includes(' units'));assert.ok(svg.includes('Legacy'))
 assert.ok(svg.indexOf('geometry-annotations')>svg.indexOf('geometry-points'));assert.deepEqual(g,before)
}
console.log('PASS: mixed positioned single object, real math rendering, whole-content transforms, legacy text and immutable annotation stacking')
const {attachAnnotation,setAnnotationOrientation,annotationPose}=await loadGeometryModule('geometryAnnotationModel')
const edgeGeometry={...g,points:[{id:'a',x:20,y:20,label:'A'},{id:'b',x:0,y:20,label:'B'},{id:'c',x:10,y:0,label:'C'}],polygons:[{id:'triangle',point_ids:['a','b','c']}],texts:[{...g.texts[0],rotation:0,scale:1}]}
const edgeAttached=attachAnnotation(edgeGeometry,'note',{target_kind:'polygon_edge',target_id:'triangle',start_point_id:'a',end_point_id:'b'})
const follow=setAnnotationOrientation(edgeAttached,'note','follow_target')
const moved={...follow,points:follow.points.map(p=>({...p,x:p.x+10,y:p.y+5}))}
for(const geometry of [edgeAttached,follow,moved])for(const frameSize of [undefined,{width:480,height:360}]){
 const original=structuredClone(geometry),pose=annotationPose(geometry,geometry.texts[0]),svg=renderToStaticMarkup(createElement(Renderer,{geometry,frameSize,blockId:'test'}))
 assert.ok(svg.includes(`translate(${pose.x} ${pose.y}) rotate(${pose.rotation*180/Math.PI}) scale(1)`));assert.ok(Math.abs(pose.rotation)<1e-9);assert.deepEqual(geometry,original)
}
console.log('PASS: semantic edge anchors, opted-in upright and shared framed/unframed immutable pose rendering')
