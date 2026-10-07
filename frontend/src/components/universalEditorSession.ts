import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import type { MathfieldElement } from 'mathlive'
import type { GeometrySelection } from './geometryAuthoringModel'
import type { GeometryRibbonAction } from './geometryRibbonMenu'

export type GeometryRibbonCommands = {
  id: string
  tool: GeometryRibbonAction
  disabled: boolean
  canDelete: boolean
  run: (action: GeometryRibbonAction) => void
}
import { useUniversalEditorHistory, type EditorHistoryProvider } from './universalEditorHistory'
import type { StructuredContinuousTextCommands, StructuredContinuousTextActiveState, StructuredTextFontSize } from './structuredContinuousTextEditorModel'
import { fieldTraceState, traceContext } from './universalContextTrace'

export type ActiveContextCapability = 'text-format' | 'insert-inline-formula' | 'formula-insert' | 'formula-format' | 'geometry-edit'
  | 'format-font-family' | 'format-font-size' | 'format-bold' | 'format-italic' | 'format-underline' | 'format-alignment' | 'format-list'
  | 'format-foreground-color' | 'format-background-color'
const TEXT_FORMAT_CAPABILITIES: readonly ActiveContextCapability[] = ['text-format', 'insert-inline-formula', 'format-font-family', 'format-font-size', 'format-bold', 'format-italic', 'format-underline', 'format-alignment', 'format-list', 'format-foreground-color', 'format-background-color']
const FORMULA_FORMAT_CAPABILITIES: readonly ActiveContextCapability[] = ['formula-insert', 'formula-format', 'format-font-size', 'format-bold', 'format-italic', 'format-foreground-color', 'format-background-color']
export const FORMULA_FONT_SIZES = { small: 4, normal: 5, large: 6, 'x-large': 7 } as const
export type PersistentActiveContext =
  | { kind: 'text'; id: string; commands: StructuredContinuousTextCommands; selection: { from: number; to: number }; history: EditorHistoryProvider; capabilities: readonly ActiveContextCapability[] }
  | { kind: 'formula'; id: string; field: MathfieldElement; selection: MathfieldElement['selection']; history: EditorHistoryProvider | null; capabilities: readonly ActiveContextCapability[] }
  | { kind: 'geometry'; id: string; selection: GeometrySelection | null; history: EditorHistoryProvider | null; capabilities: readonly ActiveContextCapability[] }

export function useUniversalEditorSession() {
  const history = useUniversalEditorHistory()
  const activateHistory = history.activate
  const commands = useRef<StructuredContinuousTextCommands | null>(null)
  const save = useRef<(() => Promise<void>) | null>(null)
  const math = useRef<MathfieldElement | null>(null)
  const [format, setFormat] = useState<StructuredContinuousTextActiveState | null>(null)
  const [bottomPanel, setBottomPanel] = useState<'compact' | 'ai' | 'keyboard'>('compact')
  const [mathContext, setMathContext] = useState('')
  const [hasMath, setHasMath] = useState(false)
  const [geometryToolbarHost, setGeometryToolbarHost] = useState<HTMLDivElement | null>(null)
  const [geometryCommands, setGeometryCommands] = useState<GeometryRibbonCommands | null>(null)
  const [mathSelectionVersion, setMathSelectionVersion] = useState(0)
  const activeContext = useRef<PersistentActiveContext | null>(null)
  const geometryHistoryProviders = useRef(new Map<string, EditorHistoryProvider>())
  const [activeContextVersion, setActiveContextVersion] = useState(0)
  const setActiveContext = useCallback((next: PersistentActiveContext | null) => {
    traceContext(next ? 'session-target-replace' : 'session-target-clear', { previousKind: activeContext.current?.kind ?? null, nextKind: next?.kind ?? null, field: fieldTraceState(next?.kind === 'formula' ? next.field : math.current) })
    activeContext.current = next
    activateHistory(next?.history ?? null)
    setActiveContextVersion((current) => current + 1)
  }, [activateHistory])
  const getActiveContext = () => {
    const current = activeContext.current
    if (current?.kind === 'formula' && (!current.field.isConnected || current.field.disabled || current.field.readOnly)) return null
    if (current?.kind === 'text' && !current.commands.isValid()) return null
    return current
  }
  const canRun = (capability: ActiveContextCapability) => getActiveContext()?.capabilities.includes(capability) ?? false
  const captureTextSelection = (source: StructuredContinuousTextCommands) => {
    const current = activeContext.current
    if (current?.kind === 'text' && current.commands === source) current.selection = source.getSelection()
  }
  const restoreTextTarget = () => {
    const current = getActiveContext()
    if (current?.kind !== 'text') return null
    current.commands.restoreSelection(current.selection)
    return current.commands
  }
  const restoreMathTarget = () => {
    const current = getActiveContext()
    traceContext('session-restore-start', { targetKind: current?.kind ?? null, field: fieldTraceState(current?.kind === 'formula' ? current.field : math.current), savedSelection: current?.kind === 'formula' ? { ranges: current.selection?.ranges?.map((range) => [range[0], range[1]]) } : null })
    if (current?.kind !== 'formula') return null
    current.field.focus()
    traceContext('session-restore-after-focus', { field: fieldTraceState(current.field), savedRanges: current.selection?.ranges?.map((range) => [range[0], range[1]]) })
    current.field.selection = current.selection
    traceContext('session-restore-after-selection', { field: fieldTraceState(current.field) })
    return current.field
  }
  const formatMath = (command: 'bold' | 'italic' | 'font-size', size?: StructuredTextFontSize) => {
    const capability: ActiveContextCapability = command === 'bold' ? 'format-bold' : command === 'italic' ? 'format-italic' : 'format-font-size'
    if (!canRun(capability) || getActiveContext()?.kind !== 'formula') return false
    const field = restoreMathTarget()
    if (!field) return false
    if (command === 'font-size') {
      if (typeof size !== 'string' || !(size in FORMULA_FONT_SIZES)) return false
      field.applyStyle({ fontSize: FORMULA_FONT_SIZES[size as keyof typeof FORMULA_FONT_SIZES] })
    } else {
      const bold = field.queryStyle({ variantStyle: 'bold' }) === 'all' || field.queryStyle({ variantStyle: 'bolditalic' }) === 'all'
      const italic = field.queryStyle({ variantStyle: 'italic' }) === 'all' || field.queryStyle({ variantStyle: 'bolditalic' }) === 'all'
      const nextBold = command === 'bold' ? !bold : bold
      const nextItalic = command === 'italic' ? !italic : italic
      field.applyStyle({ variantStyle: nextBold && nextItalic ? 'bolditalic' : nextBold ? 'bold' : nextItalic ? 'italic' : '' })
    }
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }
  const formatMathColor = (kind: 'foreground' | 'background', color: string) => {
    if (!canRun(kind === 'foreground' ? 'format-foreground-color' : 'format-background-color')) return false
    const field = restoreMathTarget()
    if (!field) return false
    field.applyStyle(kind === 'foreground' ? { color } : { backgroundColor: color })
    field.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }
  const activateGeometry = (id: string, selection: GeometrySelection | null = null) => {
    setActiveContext({ kind: 'geometry', id, selection, history: geometryHistoryProviders.current.get(id) ?? null, capabilities: ['geometry-edit'] })
  }
  const registerGeometryHistory = (id: string, provider: EditorHistoryProvider) => { geometryHistoryProviders.current.set(id, provider) }
  const unregisterGeometry = (id: string) => {
    geometryHistoryProviders.current.delete(id)
    if (activeContext.current?.kind === 'geometry' && activeContext.current.id === id) setActiveContext(null)
  }
  const unregisterMath = useCallback((field: MathfieldElement) => {
    traceContext('session-unregister-formula', { registered: math.current === field, targetKind: activeContext.current?.kind ?? null, field: fieldTraceState(field) })
    if (math.current !== field) return
    math.current = null
    if (activeContext.current?.kind === 'formula' && activeContext.current.field === field) setActiveContext(null)
    setHasMath(false)
    setMathContext('')
    window.mathVirtualKeyboard?.hide()
    setBottomPanel((current) => current === 'keyboard' ? 'compact' : current)
  }, [setActiveContext])
  const activateText = useCallback((next: StructuredContinuousTextCommands | null, commit: (() => Promise<void>) | null, preserveMath = false, id = 'text') => {
    commands.current = next
    save.current = commit
    setFormat(next?.getActiveState() ?? null)
    if (preserveMath) return
    setActiveContext(next ? { kind: 'text', id, commands: next, selection: next.getSelection(), history: next.history, capabilities: TEXT_FORMAT_CAPABILITIES } : null)
    math.current = null
    setHasMath(false)
    setMathContext('')
    window.mathVirtualKeyboard?.hide()
    setBottomPanel((current) => current === 'keyboard' ? 'compact' : current)
  }, [setActiveContext])
  const unregisterText = useCallback((previous: StructuredContinuousTextCommands | null) => {
    if (!previous || commands.current !== previous) return
    commands.current = null
    save.current = null
    setFormat(null)
    if (activeContext.current?.kind === 'text' && activeContext.current.commands === previous) setActiveContext(null)
  }, [setActiveContext])
  const activateMath = (field: MathfieldElement, provider: EditorHistoryProvider | null = null, id = 'formula') => {
    traceContext('session-activate-formula', { previousKind: activeContext.current?.kind ?? null, field: fieldTraceState(field) })
    if (!field.isConnected || field.disabled || field.readOnly) return
    math.current = field
    traceContext('session-selection-snapshot-update', { field: fieldTraceState(field) })
    setActiveContext({ kind: 'formula', id, field, selection: field.selection, history: provider, capabilities: FORMULA_FORMAT_CAPABILITIES })
    setHasMath(true)
    setMathContext(field.value)
    setMathSelectionVersion((current) => current + 1)
  }
  const showAI = (expanded: boolean) => {
    window.mathVirtualKeyboard?.hide()
    setBottomPanel(expanded ? 'ai' : 'compact')
  }
  const toggleKeyboard = () => {
    if (bottomPanel === 'keyboard') {
      window.mathVirtualKeyboard?.hide()
      setBottomPanel('compact')
    } else {
      const current = getActiveContext()
      if (current?.kind === 'formula') {
        const field = restoreMathTarget()
        if (!field) return false
        setBottomPanel('keyboard')
        window.mathVirtualKeyboard?.show()
        return true
      }
      if (current?.kind === 'text') {
        const text = restoreTextTarget()
        if (!text?.insertInlineMath('', (element) => {
          const field = element as MathfieldElement
          activateMath(field, text.history, current.id)
          requestAnimationFrame(() => {
            field.focus()
            setBottomPanel('keyboard')
            window.mathVirtualKeyboard?.show()
          })
        })) return false
        return true
      }
      return false
    }
    return true
  }
  const insertMath = (latex: string, newNode = false) => {
    const field = !newNode ? restoreMathTarget() : null
    if (field) {
      field.insert(latex, { selectionMode: 'placeholder' })
      field.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }
    const current = getActiveContext()
    const text = current?.kind === 'text' ? restoreTextTarget() : newNode && commands.current?.isValid() ? commands.current : null
    text?.insertInlineMath(latex)
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        window.mathVirtualKeyboard?.hide()
        setBottomPanel('compact')
      }
    }
    const sync = () => setBottomPanel((current) => window.mathVirtualKeyboard.visible
      ? 'keyboard' : current === 'keyboard' ? 'compact' : current)
    window.addEventListener('keydown', close, true)
    window.mathVirtualKeyboard?.addEventListener('virtual-keyboard-toggle', sync)
    return () => {
      window.removeEventListener('keydown', close, true)
      window.mathVirtualKeyboard?.removeEventListener('virtual-keyboard-toggle', sync)
      window.mathVirtualKeyboard?.hide()
    }
  }, [])
  return { commands, save, math, format, setFormat, activateText, activateMath, unregisterMath, unregisterText, mathSelectionVersion, history,
    activeContext, activeContextVersion, getActiveContext, canRun, captureTextSelection, restoreTextTarget, restoreMathTarget, activateGeometry, registerGeometryHistory, unregisterGeometry,
    bottomPanel, showAI, toggleKeyboard, insertMath, formatMath, formatMathColor, mathContext, hasMath,
    geometryToolbarHost, setGeometryToolbarHost, geometryCommands, setGeometryCommands }
}

export const UniversalEditorSessionContext = createContext<ReturnType<typeof useUniversalEditorSession> | null>(null)
