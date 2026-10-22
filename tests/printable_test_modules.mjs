import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Exercise production TS/TSX using the installed React/KaTeX packages, in memory.
export const requireFrontend = createRequire(new URL('../frontend/package.json', import.meta.url))
const ts = requireFrontend('typescript'), cache = new Map()
function load(file) {
  if (file.endsWith('?raw')) return fs.readFileSync(file.slice(0, -4), 'utf8')
  if (file.endsWith('.css')) return {}
  if (!path.extname(file)) file += fs.existsSync(file + '.tsx') ? '.tsx' : '.ts'
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText
  const localRequire = specifier => specifier.startsWith('.') ? load(path.resolve(path.dirname(file), specifier))
    : specifier.endsWith('.css') ? {} : requireFrontend(specifier)
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports)
  return module.exports
}
export const printableComponent = name => load(fileURLToPath(new URL(`../frontend/src/components/${name}`, import.meta.url)))
