import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {loadGeometryComponent} from './geometry_component_test_modules.mjs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const require=createRequire(new URL('../frontend/package.json',import.meta.url))
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const Renderer=await loadGeometryComponent('GeometryRenderer')
const {emptyGeometryV1}=await loadGeometryModule('geometryV1')
const {commitPointOnLine}=await loadGeometryModule('geometryConstructionModel')
const {deleteGeometrySelection}=await loadGeometryModule('geometryAuthoringModel')
const base={...emptyGeometryV1(),points:[{id:'a',x:10,y:20,label:'A'},{id:'b',x:30,y:20,label:'B'}],lines:[{id:'ab',kind:'line',start_point_id:'a',end_point_id:'b'}]}
for(const x of [0,40]){
 const g=commitPointOnLine(base,{kind:'line',line_id:'ab'},x,80)
 for(const geometry of [g,deleteGeometrySelection(g,{kind:'line',id:'ab'})])for(const frameSize of [undefined,{width:480,height:360}]){
  const before=structuredClone(geometry),svg=renderToStaticMarkup(createElement(Renderer,{geometry,frameSize,blockId:'test'}))
  assert.equal((svg.match(/<circle /g)||[]).length,3);assert.ok(svg.includes(`cx="${x}" cy="20"`))
  assert.equal(svg.includes('data-geometry-kind="line"'),geometry.lines.length>0);assert.deepEqual(geometry,before)
 }
}
console.log('PASS: both infinite extensions and detached stable point render in framed/unframed canvases')
