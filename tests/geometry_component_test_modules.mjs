import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
import {loadGeometryModule} from './geometry_test_modules.mjs'
const require=createRequire(new URL('../frontend/package.json',import.meta.url))
export async function loadGeometryComponent(name){
 const file=new URL(`../frontend/src/components/${name}.tsx`,import.meta.url),source=await fs.readFile(file,'utf8'),dependencies={}
 for(const match of source.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)){
  const dependency=match[1]
  try{await fs.access(new URL(`../frontend/src/components/${dependency}.tsx`,import.meta.url));dependencies[`./${dependency}`]={__esModule:true,default:await loadGeometryComponent(dependency)}}
  catch{dependencies[`./${dependency}`]=await loadGeometryModule(dependency)}
 }
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,exports={}
 vm.runInNewContext(code,{exports,require:n=>n.endsWith('.css')?{}:dependencies[n]??require(n),Set,Math})
 return exports.default
}
