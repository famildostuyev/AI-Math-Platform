import { useContext, useState } from 'react'
import MathContent from './MathContent'
import { UniversalEditorSessionContext } from './universalEditorSession'
import { DEFAULT_MATRIX_COLUMNS, matrixMenuDimensions, matrixMenuTemplate } from './matrixMenuTemplate'

export default function MatrixMenu({ disabled, onClose }: { disabled: boolean; onClose: () => void }) {
  const session = useContext(UniversalEditorSessionContext)
  const [custom, setCustom] = useState(false)
  const [rows, setRows] = useState('')
  const [columns, setColumns] = useState('')
  const maxColumns = session?.math.current?.maxMatrixCols ?? DEFAULT_MATRIX_COLUMNS
  const insert = (r: string, c: string) => {
    const latex = matrixMenuTemplate(r, c, maxColumns)
    if (disabled || !latex) return
    session?.insertMath(latex)
    onClose()
  }
  return <>
    {[[2, 2], [3, 3], [3, 4]].map(([r, c]) => {
      const label = `${r} × ${c}`
      const latex = matrixMenuTemplate(String(r), String(c))!.replaceAll('#?', '\\square')
      return <button className="universal-editor-matrix-preset" type="button" key={label} disabled={disabled || c > maxColumns} onClick={() => insert(String(r), String(c))}>
        <span className="universal-editor-matrix-preview" aria-hidden="true"><MathContent fallbackText="" content={{ format_version: 1, segments: [{ type: 'math', latex, source_text: latex, display_mode: false }] }} /></span> <span className="universal-editor-matrix-dimensions">{label}</span>
      </button>
    })}
    <details className="universal-editor-ribbon-submenu" open={custom}>
      <summary aria-expanded={custom} onClick={(event) => { event.preventDefault(); setCustom(!custom) }}>Matris əlavə et</summary>
      {custom && <form className="universal-editor-matrix-custom" onSubmit={(event) => { event.preventDefault(); insert(rows, columns) }}>
        <label>Sətir sayı <input type="number" min="1" step="1" required value={rows} onChange={(event) => setRows(event.target.value)} /></label>
        <label>Sütun sayı <input type="number" min="1" max={maxColumns} step="1" required value={columns} onChange={(event) => setColumns(event.target.value)} /></label>
        <button type="submit" disabled={disabled || !matrixMenuDimensions(rows, columns, maxColumns)}>Əlavə et</button>
      </form>}
    </details>
  </>
}
