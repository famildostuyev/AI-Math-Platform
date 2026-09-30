import { forwardRef, useContext, useEffect, useId, useImperativeHandle, useRef } from 'react'
import { MathfieldElement } from 'mathlive'
import { UniversalEditorSessionContext } from './universalEditorSession'
import type { EditorHistoryProvider } from './universalEditorHistory'
import { fieldTraceState, traceContext } from './universalContextTrace'
import { FORMULA_CLIPBOARD_MIME, FORMULA_WEB_CLIPBOARD_MIME, parseFormulaClipboard, parseFormulaClipboardHtml, writeFormulaClipboard } from './formulaClipboard'

export type MathLiveFieldHandle = {
  focus: () => void
  insert: (latex: string) => boolean
}

type MathLiveFieldProps = {
  historyProvider?: EditorHistoryProvider
  targetId?: string
  value: string
  onChange: (latex: string) => void
  disabled?: boolean
  readOnly?: boolean
  compact?: boolean
  ariaLabel?: string
  onExitBefore?: () => void
  onExitAfter?: () => void
}

const MathLiveField = forwardRef<MathLiveFieldHandle, MathLiveFieldProps>(function MathLiveField({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  compact = false,
  ariaLabel = 'Riyazi ifadə redaktoru',
  onExitBefore,
  onExitAfter,
  historyProvider,
  targetId,
}, forwardedRef) {
  const generatedId = useId()
  const activeId = targetId ?? generatedId
  const hostRef = useRef<HTMLSpanElement>(null)
  const session = useContext(UniversalEditorSessionContext)
  const sessionRef = useRef(session)
  const historyRef = useRef(historyProvider)
  useEffect(() => { historyRef.current = historyProvider }, [historyProvider])
  useEffect(() => { sessionRef.current = session }, [session])
  const fieldRef = useRef<MathfieldElement | null>(null)
  const onChangeRef = useRef(onChange)
  const onExitBeforeRef = useRef(onExitBefore)
  const onExitAfterRef = useRef(onExitAfter)

  useEffect(() => {
    onChangeRef.current = onChange
    onExitBeforeRef.current = onExitBefore
    onExitAfterRef.current = onExitAfter
  }, [onChange, onExitAfter, onExitBefore])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const field = new MathfieldElement()
    traceContext('mathlive-mount', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(field) })
    field.className = compact
      ? 'mathlive-field mathlive-field--compact'
      : 'mathlive-field'
    field.setAttribute('aria-label', ariaLabel)
    field.mathVirtualKeyboardPolicy = 'manual'
    if (!sessionRef.current) field.mathVirtualKeyboardPolicy = 'auto'
    field.smartFence = true
    const handleInput = () => {
      traceContext('mathlive-input', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(field) })
      onChangeRef.current(field.value)
      sessionRef.current?.activateMath(field, historyRef.current, activeId)
    }
    const handleFocus = () => {
      traceContext('mathlive-focusin', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(field) })
      sessionRef.current?.activateMath(field, historyRef.current, activeId)
    }
    const handleFocusOut = () => traceContext('mathlive-focusout', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(field) })
    const handleSelection = () => {
      traceContext('mathlive-selection-change', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(field) })
      if (sessionRef.current?.math.current === field) sessionRef.current.activateMath(field, historyRef.current, activeId)
    }
    // Embedded fields use their owning ProseMirror history. Standalone fields
    // retain native history; no second project-owned formula stack is created.
    const handleHistoryInput = (event: Event) => {
      const provider = historyRef.current
      const inputType = (event as InputEvent).inputType
      if (!provider || (inputType !== 'historyUndo' && inputType !== 'historyRedo')) return
      event.preventDefault()
      event.stopPropagation()
      if (inputType === 'historyUndo') provider.undo()
      else provider.redo()
    }
    const handleHistoryKey = (event: KeyboardEvent) => {
      const provider = historyRef.current
      if (!provider || !(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      event.preventDefault()
      event.stopPropagation()
      if (key === 'y' || event.shiftKey) provider.redo()
      else provider.undo()
    }
    const handleFormulaCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      const latex = field.selectionIsCollapsed ? field.value : field.getValue(field.selection, 'latex')
      if (event.type === 'cut' && field.selectionIsCollapsed) return
      writeFormulaClipboard(event.clipboardData, latex)
    }
    const handleFormulaPaste = (event: ClipboardEvent) => {
      const clipboard = event.clipboardData
      const customType = clipboard && [FORMULA_CLIPBOARD_MIME, FORMULA_WEB_CLIPBOARD_MIME].find((type) => Array.from(clipboard.types).includes(type))
      const html = clipboard?.getData('text/html') ?? ''
      if (!clipboard || (!customType && !html.includes('data-universal-editor-inline-math'))) return
      const payload = customType ? parseFormulaClipboard(clipboard.getData(customType)) : parseFormulaClipboardHtml(html)
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!payload || field.readOnly || field.disabled) return
      field.insert(payload.latex, { insertionMode: 'replaceSelection' })
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      const collapsed = field.selectionIsCollapsed
      if (event.key === 'ArrowLeft' && collapsed && field.position === 0) {
        event.preventDefault()
        event.stopPropagation()
        onExitBeforeRef.current?.()
        return
      }
      if (event.key === 'ArrowRight' && collapsed && field.position === field.lastOffset) {
        event.preventDefault()
        event.stopPropagation()
        onExitAfterRef.current?.()
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) onExitBeforeRef.current?.()
        else onExitAfterRef.current?.()
        return
      }
      event.stopPropagation()
    }
    field.addEventListener('input', handleInput)
    field.addEventListener('focusin', handleFocus)
    field.addEventListener('focusout', handleFocusOut)
    field.addEventListener('selection-change', handleSelection)
    field.addEventListener('keydown', handleKeyDown)
    field.addEventListener('keydown', handleHistoryKey, true)
    field.addEventListener('beforeinput', handleHistoryInput)
    field.addEventListener('copy', handleFormulaCopy, true)
    field.addEventListener('cut', handleFormulaCopy, true)
    field.addEventListener('paste', handleFormulaPaste, true)
    host.append(field)
    fieldRef.current = field
    traceContext('mathlive-registration', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(field) })
    return () => {
      traceContext('mathlive-unregister', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(field) })
      sessionRef.current?.unregisterMath(field)
      field.removeEventListener('input', handleInput)
      field.removeEventListener('focusin', handleFocus)
      field.removeEventListener('focusout', handleFocusOut)
      field.removeEventListener('selection-change', handleSelection)
      field.removeEventListener('keydown', handleKeyDown)
      field.removeEventListener('keydown', handleHistoryKey, true)
      field.removeEventListener('beforeinput', handleHistoryInput)
      field.removeEventListener('copy', handleFormulaCopy, true)
      field.removeEventListener('cut', handleFormulaCopy, true)
      field.removeEventListener('paste', handleFormulaPaste, true)
      field.remove()
      traceContext('mathlive-unmount', { field: fieldTraceState(field) })
      fieldRef.current = null
    }
  }, [activeId, ariaLabel, compact])

  useEffect(() => {
    const field = fieldRef.current
    if (field && field.value !== value) field.setValue(value, { silenceNotifications: true })
  }, [value])

  useEffect(() => {
    if (fieldRef.current) fieldRef.current.disabled = disabled
    traceContext('mathlive-disabled-state', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(fieldRef.current) })
    if (disabled && fieldRef.current) sessionRef.current?.unregisterMath(fieldRef.current)
  }, [disabled])

  useEffect(() => {
    if (fieldRef.current) fieldRef.current.readOnly = readOnly
    traceContext('mathlive-readonly-state', { targetKind: sessionRef.current?.activeContext.current?.kind ?? null, field: fieldTraceState(fieldRef.current) })
    if (readOnly && fieldRef.current) sessionRef.current?.unregisterMath(fieldRef.current)
  }, [readOnly])

  useImperativeHandle(forwardedRef, () => ({
    focus: () => fieldRef.current?.focus(),
    insert: (latex) => {
      const field = fieldRef.current
      if (!field || disabled || readOnly) return false
      field.focus()
      const inserted = field.insert(latex, { selectionMode: 'placeholder' })
      if (inserted) onChangeRef.current(field.value)
      return inserted
    },
  }), [disabled, readOnly])

  return <span
    ref={hostRef}
    className={`mathlive-field-host${compact ? ' mathlive-field-host--compact' : ''}`}
  />
})

export default MathLiveField
