import { useState } from 'react'
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, SquareFunction, Trash2, X } from 'lucide-react'
import {
  createSolution,
  createSolutionFormulaBlock,
  createSolutionTextBlock,
  deleteSolution,
  deleteSolutionBlock,
  reorderSolutionBlocks,
  updateSolutionFormulaBlock,
  updateSolutionTextBlock,
  type QuestionRevisionEditorRead,
  type SolutionBlockRead,
  type StructuredTextDocument,
} from '../api/questionEditor'
import MathContent from './MathContent'
import VisualMathInput from './VisualMathInput'

type RunMutation = (
  operation: (token: string, current: QuestionRevisionEditorRead) => Promise<unknown>,
  afterReload?: () => void,
  conflictMessage?: string,
) => void

type Props = {
  revision: QuestionRevisionEditorRead
  disabled: boolean
  runMutation: RunMutation
}

function textDocument(text: string): StructuredTextDocument {
  return { type: 'document', content: [{ type: 'paragraph', attrs: null, content: text ? [{ type: 'text', text, marks: [] }] : [] }] }
}

export default function SolutionEditorSection({ revision, disabled, runMutation }: Props) {
  const [newText, setNewText] = useState('')
  const [newFormula, setNewFormula] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const solution = revision.solution

  const startEdit = (block: SolutionBlockRead) => {
    setEditingId(block.id)
    setEditingValue(block.block_type === 'text' ? block.source_text : block.source_latex)
  }

  const saveEdit = (block: SolutionBlockRead) => {
    if (block.block_type === 'text') {
      runMutation((token, current) => updateSolutionTextBlock(token, current.revision_id, block.id, {
        payload: { document: textDocument(editingValue), format_version: 1 },
        expected_revision_updated_at: current.updated_at,
      }), () => { setEditingId(null); setEditingValue('') })
    } else {
      runMutation((token, current) => updateSolutionFormulaBlock(token, current.revision_id, block.id, {
        payload: { source_latex: editingValue, format_version: 1 },
        expected_revision_updated_at: current.updated_at,
      }), () => { setEditingId(null); setEditingValue('') })
    }
  }

  const move = (index: number, direction: -1 | 1) => {
    if (!solution) return
    const target = index + direction
    if (target < 0 || target >= solution.blocks.length) return
    const ids = solution.blocks.map((block) => block.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    runMutation((token, current) => reorderSolutionBlocks(token, current.revision_id, {
      block_ids: ids, expected_revision_updated_at: current.updated_at,
    }))
  }

  if (!solution) {
    return <section className="admin-solution-empty" aria-labelledby="solution-title">
      <FileText size={36} />
      <h2 id="solution-title">Əsas həll əlavə edilməyib</h2>
      <p>Bu reviziya üçün ADF-1 əsas həllini yaradın.</p>
      <button type="button" disabled={disabled} onClick={() => runMutation(
        (token, current) => createSolution(token, current.revision_id, { expected_revision_updated_at: current.updated_at }),
        undefined,
        'Bu reviziya üçün həll artıq mövcuddur.',
      )}><Plus size={16} /> Həll əlavə et</button>
    </section>
  }

  return <section className="admin-solution-editor" aria-labelledby="solution-title">
    <div className="admin-editor-section-heading">
      <div><span>ADF-1</span><h2 id="solution-title">Əsas həll</h2></div>
      <button className="danger" type="button" disabled={disabled} onClick={() => {
        if (!window.confirm('Əsas həlli silmək istədiyinizə əminsiniz?')) return
        runMutation((token, current) => deleteSolution(token, current.revision_id, {
          expected_revision_updated_at: current.updated_at,
        }), () => { setEditingId(null); setEditingValue('') })
      }}><Trash2 size={15} /> Həlli sil</button>
    </div>

    <div className="admin-editor-authoring">
      <form onSubmit={(event) => {
        event.preventDefault()
        runMutation((token, current) => createSolutionTextBlock(token, current.revision_id, {
          block_type: 'text', payload: { document: textDocument(newText), format_version: 1 },
          expected_revision_updated_at: current.updated_at,
        }), () => setNewText(''))
      }}>
        <label><span><FileText size={17} /> Mətn addımı</span><textarea value={newText} onChange={(event) => setNewText(event.target.value)} disabled={disabled} /></label>
        <button type="submit" disabled={disabled || !newText.trim()}><Plus size={16} /> Mətn əlavə et</button>
      </form>
      <form onSubmit={(event) => {
        event.preventDefault()
        runMutation((token, current) => createSolutionFormulaBlock(token, current.revision_id, {
          block_type: 'formula', payload: { source_latex: newFormula, format_version: 1 },
          expected_revision_updated_at: current.updated_at,
        }), () => setNewFormula(''))
      }}>
        <label><span><SquareFunction size={17} /> Formula addımı</span><VisualMathInput value={newFormula} onChange={setNewFormula} disabled={disabled} ariaLabel="Yeni həll formulası" /></label>
        <button type="submit" disabled={disabled || !newFormula.trim()}><Plus size={16} /> Formula əlavə et</button>
      </form>
    </div>

    {solution.blocks.length === 0 ? <div className="admin-editor-empty"><strong>Həll bloku yoxdur</strong><p>İlk mətn və ya formula addımını əlavə edin.</p></div> :
      <div className="admin-editor-block-list">{solution.blocks.map((block, index) => <article className="admin-editor-block" key={block.id}>
        <header><span>{block.block_type === 'text' ? <FileText size={18} /> : <SquareFunction size={18} />}{block.block_type === 'text' ? 'Mətn addımı' : 'Formula addımı'}</span><small>Sıra: {block.sort_order}</small></header>
        {editingId === block.id ? <div className="admin-editor-inline-edit">
          {block.block_type === 'text'
            ? <textarea value={editingValue} onChange={(event) => setEditingValue(event.target.value)} disabled={disabled} />
            : <VisualMathInput value={editingValue} onChange={setEditingValue} disabled={disabled} ariaLabel="Həll formulasını redaktə et" />}
          <div><button type="button" disabled={disabled} onClick={() => saveEdit(block)}>Yadda saxla</button><button type="button" className="secondary" onClick={() => { setEditingId(null); setEditingValue('') }}><X size={15} /> Ləğv et</button></div>
        </div> : block.block_type === 'text' ? <p className="admin-editor-block__text">{block.source_text}</p> : <div className="admin-editor-formula-preview"><MathContent content={{ format_version: 1, segments: [{ type: 'math', latex: block.source_latex, source_text: block.source_latex, display_mode: true }] }} fallbackText={block.source_latex} /></div>}
        <div className="admin-editor-block__actions">
          <button type="button" disabled={disabled || editingId === block.id} onClick={() => startEdit(block)}><Pencil size={15} /> Redaktə et</button>
          <button type="button" disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /> Yuxarı</button>
          <button type="button" disabled={disabled || index === solution.blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /> Aşağı</button>
          <button type="button" className="danger" disabled={disabled} onClick={() => {
            if (!window.confirm('Bu həll blokunu silmək istədiyinizə əminsiniz?')) return
            runMutation((token, current) => deleteSolutionBlock(token, current.revision_id, block.id, current.updated_at), () => {
              if (editingId === block.id) { setEditingId(null); setEditingValue('') }
            })
          }}><Trash2 size={15} /> Sil</button>
        </div>
      </article>)}</div>}
  </section>
}
