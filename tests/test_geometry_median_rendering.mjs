import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
import {loadGeometryModule} from './geometry_test_modules.mjs'
import {g,independent} from './test_geometry_median_construction_model.mjs'
const require=createRequire(new URL('../frontend/package.json',import.meta.url))
const {createElement}=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const dependencies=Object.fromEntries(await Promise.all(['geometryFrameModel','geometryLineModel','geometryArcModel','geometryConstructionModel'].map(async name=>[`./${name}`,await loadGeometryModule(name)])))
const code=ts.transpileModule(await fs.readFile(new URL('../frontend/src/components/GeometryRenderer.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
const exports={};vm.runInNewContext(code,{exports,require:name=>name.endsWith('.css')?{}:dependencies[name]??require(name),Set})
for(const frameSize of [undefined,{width:480,height:360}])for(const geometry of [g,independent]){
 const original=structuredClone(geometry),recipe=geometry.constructions.find(c=>c.kind==='median'),m=geometry.points.find(p=>p.id===recipe.midpoint_point_id),v=geometry.points.find(p=>p.id==='v')
 const props={geometry,blockId:'test',frameSize},svg=renderToStaticMarkup(createElement(exports.default,props))
 assert.ok(svg.indexOf('geometry-segments')>svg.indexOf('geometry-polygons'))
 const segments=svg.split('<g class="geometry-segments">')[1].split('</g>')[0]
 assert.ok(segments.includes(`x1="${v.x}" y1="${v.y}" x2="${m.x}" y2="${m.y}"`))
 const points=svg.split('<g class="geometry-points">')[1].split('<g class="geometry-annotations">')[0]
 const markers=[...points.matchAll(/<circle cx="([^"]+)" cy="([^"]+)"/g)].map(match=>[Number(match[1]),Number(match[2])])
 assert.equal(markers.length,geometry.points.length)
 assert.equal(markers.filter(([x,y])=>x===m.x&&y===m.y).length,geometry===independent?2:1,'Coincident independently owned points are not coalesced')
 assert.ok(svg.indexOf('geometry-lines')<svg.indexOf('geometry-polygons'))
 const metrics=dependencies['./geometryFrameModel'].geometryFrameMetrics(geometry),scale=dependencies['./geometryFrameModel'].GEOMETRY_FRAME_SCALE
 const bounds=frameSize?{x:metrics.originX+4,y:metrics.originY+4,width:frameSize.width/scale-8,height:frameSize.height/scale-8}:{x:0,y:0,width:100,height:100}
 const [a,c]=['a','c'].map(id=>geometry.points.find(p=>p.id===id)),ends=dependencies['./geometryLineModel'].clipInfiniteLine(a,c,bounds)
 assert.ok(svg.includes(`x1="${ends[0].x}" y1="${ends[0].y}" x2="${ends[1].x}" y2="${ends[1].y}"`),'Ordinary line clipping preserved')
 assert.deepEqual(geometry,original)
 // Renderer-only fixture proves it reads persisted M, without second median mathematics.
 const supplied=structuredClone(geometry);supplied.points.find(p=>p.id===m.id).x=42
 const suppliedOriginal=structuredClone(supplied),suppliedSvg=renderToStaticMarkup(createElement(exports.default,{...props,geometry:supplied}))
 assert.ok(suppliedSvg.includes('x1="35" y1="50" x2="42" y2="20"'));assert.deepEqual(supplied,suppliedOriginal)
}
console.log('PASS: persisted finite median, framed/unframed layering, visible independent midpoint identities, ordinary clipping and rendering immutability')
