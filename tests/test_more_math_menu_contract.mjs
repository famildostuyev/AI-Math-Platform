import assert from 'node:assert/strict'
import { getMoreMathRibbonActions } from '../frontend/src/components/mathLiveRibbonMenu.ts'

const items = getMoreMathRibbonActions([])
assert.deepEqual([...new Set(items.map(a => a.section))], ['Üst və alt işarələr', 'Çərçivələr'])
assert.equal(items.length, 15)
assert.ok(items.every(a => !a.enabled && a.run(null) === false))
const native = { ...items[0], enabled: true, run: target => target === 'valid' }
const populated = getMoreMathRibbonActions([native, { ...native, id: 'mode-math', section: 'Giriş rejimi' }])
assert.equal(populated[0], native)
assert.deepEqual(populated.map(a => [a.id, a.label, a.section]), items.map(a => [a.id, a.label, a.section]))
assert.equal(populated[0].run(null), false)
assert.equal(populated[0].run('valid'), true)
console.log('PASS: permanent two-group catalog, preserved native handler, disabled missing actions, no mode group')
