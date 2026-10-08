import {loadGeometryComponent} from './geometry_component_test_modules.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
import {loadGeometryModule} from './geometry_test_modules.mjs'
import {g,right,obtuse,rightC,obtuseC} from './test_geometry_altitude_construction_model.mjs'
const require=createRequire(new URL('../frontend/package.json',import.meta.url))
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const dependencies=Object.fromEntries(await Promise.all(['geometryFrameModel','geometryLineModel','geometryArcModel','geometryConstructionModel', 'geometryAnnotationModel'].map(async name=>[`./${name}`,await loadGeometryModule(name)])))
dependencies['./GeometryAnnotationContent']={default:await loadGeometryComponent('GeometryAnnotationContent')}
const code=ts.transpileModule(await fs.readFile(new URL('../frontend/src/components/GeometryRenderer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
const exports={};vm.runInNewContext(code,{exports,require:name=>name.endsWith('.css')?{}:dependencies[name]??require(name),Set})
for(const frameSize of [undefined,{width:480,height:360}]) for(const geometry of [g,right,obtuse,rightC,obtuseC]){
 const coincident=geometry===right||geometry===rightC,external=geometry===obtuse||geometry===obtuseC
 const original=structuredClone(geometry),recipe=geometry.constructions[0],h=geometry.points.find(p=>p.id===recipe.foot_point_id),v=geometry.points.find(p=>p.id==='v')
 const svg=renderToStaticMarkup(createElement(exports.default,{geometry,blockId:'test',frameSize}))
 assert.ok(svg.indexOf('geometry-segments')>svg.indexOf('geometry-polygons'))
 const segments=svg.split('<g class="geometry-segments">')[1].split('</g>')[0]
 assert.ok(segments.includes(`x1="${v.x}" y1="${v.y}" x2="${h.x}" y2="${h.y}"`))
 const pointOutput=svg.split('<g class="geometry-points">')[1].split('<g class="geometry-annotations">')[0]
 const markers=[...pointOutput.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)].map(m=>[Number(m[1]),Number(m[2])])
 assert.equal(markers.length,coincident?4:5)
 assert.equal(markers.filter(([x,y])=>x===h.x&&y===h.y).length,1)
 assert.ok(pointOutput.includes('>A</text>'),'Source label remains visible')
 const extension=svg.split('<g class="geometry-altitude-extensions"')[1].split('</g>')[0]
 assert.equal((extension.match(/<line /g)??[]).length,external?1:0)
 if(external){assert.ok(extension.includes('stroke-dasharray="2 2"'));assert.ok(extension.includes(`x1="${geometry===obtuse?10:70}" y1="20" x2="${h.x}" y2="${h.y}"`))}
 assert.ok(svg.indexOf('geometry-lines')<svg.indexOf('geometry-polygons'),'Ordinary line order unchanged')
 assert.deepEqual(geometry,original)
}
console.log('PASS: acute/right/obtuse finite altitude, marker coalescing, source labels, dashed extension, framed/unframed order and immutable rendering')
