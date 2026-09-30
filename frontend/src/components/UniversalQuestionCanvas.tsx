import { ArrowDown, ArrowUp, Pencil, Save, Trash2, X } from 'lucide-react'
import { useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { StructuredTextDocument } from '../api/questionEditor'
import GeometryEditor from './GeometryEditor'
import MathContent from './MathContent'
import StructuredContinuousTextEditor from './StructuredContinuousTextEditor'
import VisualContentRenderer from './VisualContentRenderer'
import VisualMathInput from './VisualMathInput'
import type { StructuredContinuousTextCommands, StructuredContinuousTextEditorState } from './structuredContinuousTextEditorModel'
import { UniversalEditorSessionContext } from './universalEditorSession'
import { structuredTextDocumentToTiptap, tiptapToStructuredTextDocument } from './structuredTextTiptapAdapter'
import type { UniversalDocumentNode, UniversalEditorDocument } from './universalEditorDocument'
import { traceContext } from './universalContextTrace'
import VisualFrame from './VisualFrame'
import GeometryRenderer from './GeometryRenderer'
import { containGeometry, defaultGeometryPlacement, geometryFrameMetrics } from './geometryFrameModel'
import type { PersistedVisualPlacement } from './visualPlacement'

type UniversalQuestionCanvasProps = {
  framePlacements?: Record<string, PersistedVisualPlacement>
  onFramePlacementChange?: (id: string, placement: PersistedVisualPlacement) => void
  onSaveFrame?: (id: string) => void
  document: UniversalEditorDocument
  selectedNodeId: string | null
  editingNodeId: string | null
  editingValue: string
  editingGeometry: Extract<UniversalDocumentNode, { type: 'geometry' }>['geometryV1']
  textAuthoringEnabled: boolean
  disabled: boolean
  onSelectNode: (nodeId: string | null) => void
  onEditingValueChange: (value: string) => void
  onEditingGeometryChange: (value: NonNullable<UniversalQuestionCanvasProps['editingGeometry']>) => void
  onCreateText: (document: StructuredTextDocument) => Promise<boolean>
  onUpdateText: (nodeId: string, document: StructuredTextDocument) => Promise<boolean>
  onStartEdit: (nodeId: string) => void
  onCancelEdit: () => void
  onSaveEdit: (nodeId: string) => void
  onDelete: (nodeId: string) => void
  onMove: (nodeId: string, direction: -1 | 1) => void
}

const EMPTY_TEXT_DOCUMENT: StructuredTextDocument = {
  type: 'document',
  content: [{ type: 'paragraph', attrs: null, content: [] }],
}


function hasMeaningfulContent(document: StructuredTextDocument): boolean {
  return document.content.some((block) => {
    const paragraphs = block.type === 'paragraph'
      ? [block]
      : block.content.flatMap((item) => item.content)
    return paragraphs.some((paragraph) => paragraph.content.some((inline) =>
      inline.type === 'inline_math'
        ? inline.latex.trim().length > 0
        : inline.type === 'text' && inline.text.trim().length > 0))
  })
}

function isEditorChrome(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[data-editor-ribbon], .universal-editor-modules')
}

type StructuredTextRegionProps = {
  targetId: string
  document: StructuredTextDocument
  disabled: boolean
  ariaLabel: string
  requireMeaningful?: boolean
  onCommit: (document: StructuredTextDocument) => Promise<boolean>
}

function StructuredTextRegion({
  targetId,
  document,
  disabled,
  ariaLabel,
  requireMeaningful = false,
  onCommit,
}: StructuredTextRegionProps) {
  const regionRef = useRef<HTMLDivElement>(null)
  const [editorState, setEditorState] = useState<StructuredContinuousTextEditorState>(
    () => structuredTextDocumentToTiptap(document),
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const session = useContext(UniversalEditorSessionContext)
  const commandsRef = useRef<StructuredContinuousTextCommands | null>(null)
  const commitRef = useRef<() => Promise<void>>(async () => {})
  const activateText = session?.activateText
  const unregisterText = session?.unregisterText
  const onCommandsReady = useCallback((commands: StructuredContinuousTextCommands | null) => {
    if (!commands) unregisterText?.(commandsRef.current)
    commandsRef.current = commands
  }, [unregisterText])

  const commit = async () => {
    if (!dirty || disabled || savingRef.current) {
      traceContext('region-commit-skipped', { reason: !dirty ? 'clean' : disabled ? 'disabled' : 'already-saving', targetKind: session?.activeContext.current?.kind ?? null })
      return
    }
    const canonical = tiptapToStructuredTextDocument(editorState.document)
    if (requireMeaningful && !hasMeaningfulContent(canonical)) {
      traceContext('region-commit-skipped', { reason: 'empty-required-content', targetKind: session?.activeContext.current?.kind ?? null })
      return
    }
    traceContext('region-commit-start', { targetKind: session?.activeContext.current?.kind ?? null })
    savingRef.current = true
    setSaving(true)
    try {
      const succeeded = await onCommit(canonical)
      traceContext(succeeded ? 'region-commit-success' : 'region-commit-failure', { targetKind: session?.activeContext.current?.kind ?? null })
      if (succeeded) setDirty(false)
    } catch (error) {
      traceContext('region-commit-failure', { reason: 'exception', targetKind: session?.activeContext.current?.kind ?? null })
      throw error
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useEffect(() => { commitRef.current = commit })
  useEffect(() => {
    if (!dirty) return
    const handleFocusIn = (event: FocusEvent) => {
      if (!isEditorChrome(event.relatedTarget)) return
      if (event.target instanceof Node && regionRef.current?.contains(event.target)) return
      if (isEditorChrome(event.target)) return
      traceContext('region-workflow-departure-commit', { reason: 'focus-outside-editor-chrome' })
      void commitRef.current()
    }
    window.document.addEventListener('focusin', handleFocusIn, true)
    return () => window.document.removeEventListener('focusin', handleFocusIn, true)
  }, [dirty])
  useEffect(() => {
    traceContext(disabled || saving ? 'region-disabled' : 'region-editable', { disabledByParent: disabled, saving })
  }, [disabled, saving])

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void commit()
    }
  }

  return <div
    ref={regionRef}
    className="universal-question-node__structured-text"
    data-dirty={dirty || undefined}
    aria-busy={saving}
    onClick={(event) => event.stopPropagation()}
    onFocusCapture={(event) => {
      const insideMath = event.target instanceof Element && !!event.target.closest('math-field')
      if (commandsRef.current) activateText?.(commandsRef.current, () => commitRef.current(), insideMath, targetId)
    }}
    onKeyDownCapture={handleKeyDownCapture}
    onBlur={(event) => {
      traceContext('region-blur-commit-considered', { dirty, disabled, saving, targetKind: session?.activeContext.current?.kind ?? null })
      if (isEditorChrome(event.relatedTarget)) {
        traceContext('region-blur-commit-skipped', { reason: 'editor-chrome' })
        return
      }
      window.requestAnimationFrame(() => {
        if (isEditorChrome(window.document.activeElement)) {
          traceContext('region-blur-commit-skipped', { reason: 'editor-chrome' })
          return
        }
        if (window.mathVirtualKeyboard?.visible) {
          traceContext('region-blur-commit-skipped', { reason: 'virtual-keyboard' })
          return
        }
        if (!regionRef.current?.contains(window.document.activeElement)) void commitRef.current()
        else traceContext('region-blur-commit-skipped', { reason: 'focus-inside-region' })
      })
    }}
  >
    <StructuredContinuousTextEditor
      initialState={editorState}
      onChange={(nextState) => {
        setEditorState(nextState)
        setDirty(true)
      }}
      disabled={disabled || saving}
      ariaLabel={ariaLabel}
      onCommandsReady={onCommandsReady}
      onActiveStateChange={(state) => {
        if (session?.commands.current === commandsRef.current) {
          session?.setFormat(state)
          if (commandsRef.current) session?.captureTextSelection(commandsRef.current)
        }
      }}
    />
  </div>
}

function DocumentNodeContent({ node }: { node: Exclude<UniversalDocumentNode, { type: 'paragraph' }> }) {
  switch (node.type) {
    case 'display_formula':
      return <div className="universal-question-node__formula"><MathContent
        content={{ format_version: 1, segments: [{ type: 'math', latex: node.latex, source_text: node.latex, display_mode: true }] }}
        fallbackText={node.latex}
      /></div>
    case 'geometry':
      return <VisualContentRenderer node={node} />
    case 'image':
      return <figure className="universal-question-node__image"><figcaption>{node.altText || 'Şəkil'}</figcaption><span>Media elementi</span></figure>
    case 'graph':
      return <p className="universal-question-node__placeholder">Qrafik məzmunu bu redaktorda hələ göstərilmir.</p>
    case 'table':
      return <p className="universal-question-node__placeholder">Cədvəl məzmunu bu redaktorda hələ göstərilmir.</p>
    case 'diagram':
      return <p className="universal-question-node__placeholder">Diaqram məzmunu bu redaktorda hələ göstərilmir.</p>
    default:
      return <p className="universal-question-node__placeholder">Bu məzmun təhlükəsiz baxış üçün hələ dəstəklənmir.</p>
  }
}

export default function UniversalQuestionCanvas({
  document, selectedNodeId, editingNodeId, editingValue, editingGeometry,
  textAuthoringEnabled, disabled, onSelectNode, onEditingValueChange,
  onEditingGeometryChange, onCreateText, onUpdateText, onStartEdit,
  onCancelEdit, onSaveEdit, onDelete, onMove,
  framePlacements = {}, onFramePlacementChange, onSaveFrame,
}: UniversalQuestionCanvasProps) {
  const hasTextNode = document.nodes.some((node) => node.type === 'paragraph')
  return <section
    className="universal-question-canvas"
    style={{ minHeight: Math.max(0, ...document.nodes.map(node => {
      const p = framePlacements[node.id] ?? ('placement' in node ? node.placement : undefined)
      return p?.position && p?.size ? p.position.y + p.size.height + 280 : 0
    })) || undefined }}
    aria-label="Sual sənədi"
    onClick={(event) => { if (event.target === event.currentTarget) onSelectNode(null) }}
  >
    {document.nodes.map((node, index) => {
      const isSelected = selectedNodeId === node.id
      const isEditing = editingNodeId === node.id
      const isEditable = node.type === 'display_formula'
        || (node.type === 'geometry' && node.geometryV1 !== null)
      if (node.type === 'geometry' && node.geometryV1) {
        const geometry = isEditing && editingGeometry ? editingGeometry : node.geometryV1
        const saved = node.placement?.version === 1 ? node.placement as PersistedVisualPlacement : undefined
        const draft = framePlacements[node.id] ?? saved
        const placement = containGeometry(draft ?? defaultGeometryPlacement(geometry), geometry)
        return <article key={node.id} id={`universal-node-${node.id}`} className="universal-question-node--geometry">
          <VisualFrame id={node.id} placement={placement} floating={!!draft} selected={isSelected} disabled={disabled || (!!editingNodeId && editingNodeId !== node.id)}
            minimum={geometryFrameMetrics(geometry).minimum} onSelect={() => onSelectNode(node.id)}
            onChange={next => onFramePlacementChange?.(node.id, next)}>
            {isEditing ? <GeometryEditor key={node.id} value={geometry} onChange={next => {
              onEditingGeometryChange(next)
              if (draft) onFramePlacementChange?.(node.id, containGeometry(placement, next))
            }} disabled={disabled} targetId={node.id} frameSize={placement.size} />
              : <GeometryRenderer geometry={geometry} blockId={node.id} frameSize={placement.size} />}
            {isSelected && <div className="visual-frame__actions" data-frame-chrome="">
              {isEditing ? <>
                <button type="button" disabled={disabled || !geometry.description.trim()} onClick={() => onSaveEdit(node.id)}><Save size={15} /> Yadda saxla</button>
                <button type="button" onClick={onCancelEdit}><X size={15} /> Ləğv et</button>
              </> : <>
                <button type="button" disabled={disabled} onClick={() => onStartEdit(node.id)}><Pencil size={15} /> Redaktə et</button>
                <button type="button" disabled={disabled} onClick={() => onSaveFrame?.(node.id)}><Save size={15} /> Yadda saxla</button>
                <button type="button" disabled={disabled} onClick={() => onDelete(node.id)}><Trash2 size={15} /> Sil</button>
              </>}
            </div>}
          </VisualFrame>
        </article>
      }
      return <article
        id={`universal-node-${node.id}`}
        className={`universal-question-node${node.type === 'paragraph' ? ' universal-question-node--text' : ''}${isSelected ? ' is-selected' : ''}${isEditing ? ' is-editing' : ''}`}
        key={node.id}
        tabIndex={node.type === 'paragraph' ? -1 : 0}
        aria-selected={isSelected}
        onClick={(event) => {
          event.stopPropagation()
          if (node.type !== 'paragraph') onSelectNode(node.id)
        }}
        onFocus={() => { if (node.type !== 'paragraph') onSelectNode(node.id) }}
      >
        {node.type === 'paragraph' ? <StructuredTextRegion
          targetId={node.id}
          document={node.document}
          disabled={disabled}
          ariaLabel="Sual mətnini redaktə et"
          onCommit={(nextDocument) => onUpdateText(node.id, nextDocument)}
        /> : isEditing ? <div className="universal-question-node__editor">
          {node.type === 'display_formula' ? <VisualMathInput value={editingValue} onChange={onEditingValueChange} disabled={disabled} ariaLabel="Düsturu redaktə et" targetId={node.id} />
            : node.type === 'geometry' && editingGeometry && <GeometryEditor value={editingGeometry} onChange={onEditingGeometryChange} disabled={disabled} targetId={node.id} />}
          <div className="universal-question-node__editor-actions">
            <button type="button" onClick={() => onSaveEdit(node.id)} disabled={disabled}><Save size={15} /> Yadda saxla</button>
            <button type="button" onClick={onCancelEdit}><X size={15} /> Ləğv et</button>
          </div>
        </div> : <DocumentNodeContent node={node} />}

        {node.type !== 'paragraph' && isSelected && !isEditing && <div className="universal-question-node__actions" aria-label="Seçilmiş məzmun əməliyyatları">
          {isEditable && <button type="button" onClick={() => onStartEdit(node.id)} disabled={disabled}><Pencil size={15} /> Redaktə et</button>}
          <button type="button" onClick={() => onMove(node.id, -1)} disabled={disabled || index === 0} aria-label="Yuxarı köçür"><ArrowUp size={15} /></button>
          <button type="button" onClick={() => onMove(node.id, 1)} disabled={disabled || index === document.nodes.length - 1} aria-label="Aşağı köçür"><ArrowDown size={15} /></button>
          <button type="button" className="danger" onClick={() => onDelete(node.id)} disabled={disabled}><Trash2 size={15} /> Sil</button>
        </div>}
      </article>
    })}
    {textAuthoringEnabled && !hasTextNode && <div className="universal-question-canvas__empty-text">
      <StructuredTextRegion
        targetId="new-text"
        document={EMPTY_TEXT_DOCUMENT}
        disabled={disabled}
        ariaLabel="Sual mətnini yazmağa başlayın"
        requireMeaningful
        onCommit={onCreateText}
      />
    </div>}
  </section>
}
