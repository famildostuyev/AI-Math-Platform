import fs from 'node:fs/promises'
import ts from '../frontend/node_modules/typescript/lib/typescript.js'
const cache = new Map()
const encode = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64')
async function moduleUrl(file) {
  if (cache.has(file.href)) return cache.get(file.href)
  let code = ts.transpileModule(await fs.readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
  for (const match of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)]) {
    if (!match[1].startsWith('.')) throw Error('Unexpected test dependency: ' + match[1])
    const target = new URL(match[1].replace(/\?raw$/, ''), file)
    const dependency = match[1].endsWith('?raw')
      ? encode('export default ' + JSON.stringify(await fs.readFile(target, 'utf8')))
      : await moduleUrl(new URL(target.href + '.ts'))
    code = code.replace(match[0], 'from ' + JSON.stringify(dependency))
  }
  const result = encode(code); cache.set(file.href, result); return result
}
export async function loadGeometryModule(name) {
  return import(await moduleUrl(new URL(`../frontend/src/components/${name}.ts`, import.meta.url)))
}
