// MathLive's existing default; an active field can supply its configured limit.
export const DEFAULT_MATRIX_COLUMNS = 10

export function matrixMenuDimensions(rows: string, columns: string, maxColumns = DEFAULT_MATRIX_COLUMNS): [number, number] | null {
  if (!/^\d+$/.test(rows) || !/^\d+$/.test(columns)) return null
  const r = Number(rows)
  const c = Number(columns)
  if (!Number.isSafeInteger(r) || !Number.isSafeInteger(c) || r < 1 || c < 1 || c > maxColumns) return null
  return [r, c]
}

export function matrixMenuTemplate(rows: string, columns: string, maxColumns = DEFAULT_MATRIX_COLUMNS): string | null {
  const dimensions = matrixMenuDimensions(rows, columns, maxColumns)
  if (!dimensions) return null
  const [r, c] = dimensions
  const row = Array.from({ length: c }, () => '#?').join('&')
  return `\\begin{pmatrix}${Array.from({ length: r }, () => row).join('\\\\')}\\end{pmatrix}`
}
