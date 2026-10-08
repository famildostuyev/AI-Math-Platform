import {loadGeometryComponent} from './geometry_component_test_modules.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
import { loadGeometryModule } from './geometry_test_modules.mjs'
const require=createRequire(new URL('../frontend/package.json',import.meta.url))
const { createElement }=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const dependencies=Object.fromEntries(await Promise.all(['geometryFrameModel','geometryLineModel','geometryArcModel','geometryConstructionModel', 'geometryAnnotationModel'].map(async name=>[`./${name}`,await loadGeometryModule(name)])))
dependencies['./GeometryAnnotationContent']={default:await loadGeometryComponent('GeometryAnnotationContent')}
const code=ts.transpileModule(await fs.readFile(new URL('../frontend/src/components/GeometryRenderer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
const exports={};vm.runInNewContext(code,{exports,require:name=>name.endsWith('.css')?{}:dependencies[name]??require(name),Set})
const {emptyGeometryV1,normalizeGeometrySourceDataV1:normalize}=await loadGeometryModule('geometryV1')
const geometry={...emptyGeometryV1(),description:'Legacy filled circular figures',points:[{id:'a',x:0,y:0,label:'Legacy A'},{id:'b',x:30,y:0,label:null},{id:'c',x:0,y:30,label:null}],polygons:[{id:'triangle',point_ids:['a','b','c']}],lines:[{id:'line',kind:'line',start_point_id:'a',end_point_id:'b'}],circles:[{id:'disk',kind:'disk',center_point_id:'a',radius:15}],arcs:[{id:'sector',kind:'sector',center_point_id:'a',radius:20,start_angle:0,sweep_angle:1}],texts:[{id:'note',x:5,y:5,content:'Annotation'}]}
assert.ok(normalize(geometry));const original=structuredClone(geometry)
geometry.points.push({id:'internal',x:3,y:4,label:'Internal',role:'implicit'})
original.points.push({id:'internal',x:3,y:4,label:'Internal',role:'implicit'})
for(const frameSize of [undefined,{width:480,height:360}]) {
 const svg=renderToStaticMarkup(createElement(exports.default,{geometry,blockId:'test',frameSize}))
 const fills=svg.indexOf('class="geometry-fills"'),lines=svg.indexOf('class="geometry-lines"')
 assert.ok(fills<lines)
 assert.ok(svg.includes('data-geometry-fill="disk"'));assert.ok(svg.includes('data-geometry-fill="sector"'))
 assert.equal((svg.match(/fill-opacity="0.45"/g)??[]).length,2)
 assert.ok(/<polygon[^>]*fill="none"/.test(svg))
 assert.ok(svg.includes('Legacy A'));assert.ok(svg.includes('Annotation'))
 assert.ok(!svg.includes('Internal'))
 assert.ok(svg.indexOf('class="geometry-points"')>lines)
 assert.deepEqual(geometry,original)
}
console.log('PASS: framed/unframed outline polygons, intentional disk/sector fills below strokes, legacy labels, annotations and immutable rendering')

const {commitGeometryLine}=await loadGeometryModule('geometryLineModel')
const {commitGeometryTemplate}=await loadGeometryModule('geometryTemplateModel')
const {commitGeometryCircle}=await loadGeometryModule('geometryCircleModel')
const {commitGeometryArc}=await loadGeometryModule('geometryArcModel')
const anchors=commitGeometryLine({...emptyGeometryV1(),description:'Promoted anchors'},'line',[{x:10,y:10},{x:30,y:10}])
for(const next of [
 commitGeometryLine(anchors,'polyline',[{x:10,y:10},{x:20,y:30}]),
 commitGeometryTemplate(anchors,'triangle',{x:10,y:10},{x:30,y:10}),
 commitGeometryCircle(anchors,'circle',{x:10,y:10},{x:20,y:10}),
 commitGeometryArc(anchors,'arc',{x:10,y:10},{x:20,y:10},{x:10,y:20}),
]){
 const snapshot=structuredClone(next)
 for(const frameSize of [undefined,{width:480,height:360}]){
  const svg=renderToStaticMarkup(createElement(exports.default,{geometry:next,blockId:'promotion',frameSize}))
  const markers=svg.slice(svg.indexOf('class="geometry-points"'))
  assert.ok(markers.includes('<circle cx="10" cy="10"'),'Promoted point has a visible SVG marker')
  assert.deepEqual(next,snapshot)
 }
}
console.log('PASS: promoted polyline/template vertices and circle/arc centers render visibly framed/unframed without mutation')
