import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {loadGeometryComponent} from './geometry_component_test_modules.mjs'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const require=createRequire(new URL('../frontend/package.json',import.meta.url))
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const Renderer=await loadGeometryComponent('GeometryRenderer')
const {emptyGeometryV1}=await loadGeometryModule('geometryV1')
const {commitPointOnSegment}=await loadGeometryModule('geometryConstructionModel')
const {deleteGeometrySelection}=await loadGeometryModule('geometryAuthoringModel')
const base={...emptyGeometryV1(),points:[{id:'a',x:0,y:0,label:'A'},{id:'b',x:20,y:0,label:'B'},{id:'c',x:10,y:20,label:'C'}],segments:[{id:'ab',start_point_id:'a',end_point_id:'b'}],polygons:[{id:'triangle',point_ids:['a','b','c']}]}
const g=commitPointOnSegment(base,{kind:'segment',segment_id:'ab'},5,2)
for(const geometry of [g,deleteGeometrySelection(g,{kind:'segment',id:'ab'})])for(const frameSize of [undefined,{width:480,height:360}]){
 const before=structuredClone(geometry),svg=renderToStaticMarkup(createElement(Renderer,{geometry,frameSize,blockId:'test'}))
 assert.equal((svg.match(/<circle /g)||[]).length,4);assert.ok(svg.includes('cx="5" cy="0"'));assert.ok(svg.indexOf('geometry-points')>svg.indexOf('geometry-polygons'));assert.deepEqual(geometry,before)
}
console.log('PASS: persisted constrained/detached point primitives, framed/unframed rendering, polygon stacking and source immutability')
