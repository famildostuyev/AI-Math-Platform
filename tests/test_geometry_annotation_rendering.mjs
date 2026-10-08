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
