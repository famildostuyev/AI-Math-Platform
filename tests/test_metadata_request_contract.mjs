import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'

const root = resolve(import.meta.dirname, '..')
const frontendRequire = createRequire(resolve(root, 'frontend/package.json'))
const ts = frontendRequire('typescript')
const source = readFileSync(resolve(root, 'frontend/src/api/questionEditor.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

let captured
const exports = {}
runInNewContext(compiled, {
  exports,
  require: (name) => {
    assert.equal(name, './client')
    return { requestJson: (path, options) => {
      captured = { path, options }
      return Promise.resolve({})
    } }
  },
})

const metadata = { difficulty: 'medium', expected_revision_updated_at: '2026-09-19T12:00:00Z' }
await exports.updateQuestionMetadata('access-token', 'revision-id', metadata)
assert.equal(captured.path, '/api/v1/question-editor/revisions/revision-id/metadata')
assert.equal(captured.options.method, 'PATCH')
assert.equal(captured.options.headers.Authorization, 'Bearer access-token')
assert.equal(captured.options.headers['Content-Type'], 'application/json')
assert.equal(captured.options.body, JSON.stringify(metadata))
