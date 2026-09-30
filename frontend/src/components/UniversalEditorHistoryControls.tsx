import { useContext } from 'react'
import { Undo2, Redo2 } from 'lucide-react'
import { UniversalEditorSessionContext } from './universalEditorSession'

export default function UniversalEditorHistoryControls({ disabled = false }: { disabled?: boolean }) {
  const session = useContext(UniversalEditorSessionContext)
  return <div className="universal-editor-history-controls" data-editor-ribbon="" role="group" aria-label="Redaktə tarixçəsi">
    <button type="button" aria-label="Geri al" title="Geri al" disabled={disabled || !session?.history.canUndo}
      onMouseDown={(event) => event.preventDefault()} onClick={() => session?.history.undo()}><Undo2 size={16} /></button>
    <button type="button" aria-label="Yenidən et" title="Yenidən et" disabled={disabled || !session?.history.canRedo}
      onMouseDown={(event) => event.preventDefault()} onClick={() => session?.history.redo()}><Redo2 size={16} /></button>
  </div>
}
