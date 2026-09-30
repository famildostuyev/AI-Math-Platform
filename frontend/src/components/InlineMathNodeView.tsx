import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react'
import { useContext, useEffect, useState } from 'react'
import MathLiveField from './MathLiveField'
import { getStructuredEditorHistory } from './structuredEditorHistory'
import { traceContext } from './universalContextTrace'
import { UniversalEditorSessionContext } from './universalEditorSession'

export default function InlineMathNodeView({
  node,
  editor,
  getPos,
  updateAttributes,
}: NodeViewProps) {
  const session = useContext(UniversalEditorSessionContext)
  const [wrapperElement, setWrapperElement] = useState<HTMLSpanElement | null>(null)
  const activeContext = session?.getActiveContext()
  const ownsActiveFormula = activeContext?.kind === 'formula' && !!wrapperElement?.contains(activeContext.field)
  const editable = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor.isEditable,
  })
  useEffect(() => {
    traceContext('nodeview-mount', { editable: editor.isEditable })
    return () => traceContext('nodeview-unmount', { editable: editor.isEditable })
  }, [editor])
  useEffect(() => {
    traceContext('nodeview-editable-state', { editable })
  }, [editable])
  const latex = typeof node.attrs.latex === 'string' ? node.attrs.latex : ''
  const moveOuterSelection = (side: 'before' | 'after') => {
    const position = getPos()
    if (typeof position !== 'number') return
    editor.chain()
      .setTextSelection(side === 'before' ? position : position + node.nodeSize)
      .focus()
      .run()
  }

  return <NodeViewWrapper
    as="span"
    ref={setWrapperElement}
    className="structured-inline-math"
    data-inline-math-node=""
    data-active-formula={ownsActiveFormula || undefined}
    contentEditable={false}
  >
    <MathLiveField
      historyProvider={getStructuredEditorHistory(editor)}
      compact
      value={latex}
      onChange={(nextLatex) => updateAttributes({ latex: nextLatex })}
      readOnly={!editable}
      ariaLabel="Sətirdaxili riyazi ifadə"
      onExitBefore={() => moveOuterSelection('before')}
      onExitAfter={() => moveOuterSelection('after')}
    />
  </NodeViewWrapper>
}
