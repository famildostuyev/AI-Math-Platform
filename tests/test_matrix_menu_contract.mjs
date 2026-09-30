import assert from 'node:assert/strict'
import { matrixMenuTemplate, matrixMenuDimensions } from '../frontend/src/components/matrixMenuTemplate.ts'

for (const [rows, columns] of [[2, 2], [3, 3], [3, 4], [4, 5], [5, 7], [11, 10]]) {
  const latex = matrixMenuTemplate(String(rows), String(columns))
  const cells = latex.slice('\\begin{pmatrix}'.length, -'\\end{pmatrix}'.length).split('\\\\').map(row => row.split('&'))
  assert.equal(cells.length, rows)
  assert.ok(cells.every(row => row.length === columns && row.every(cell => cell === '#?')))
}
for (const invalid of ['', '0', '-1', '1.5', 'abc', 'NaN', 'Infinity', '1e2']) {
  assert.equal(matrixMenuTemplate(invalid, '2'), null)
  assert.equal(matrixMenuTemplate('2', invalid), null)
}
assert.equal(matrixMenuTemplate('2', '11'), null)
assert.deepEqual(matrixMenuDimensions('2', '11', 12), [2, 11])
console.log('PASS: preset/custom matrix dimensions, placeholders, invalid values and existing column limit')
