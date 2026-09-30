// TEMPORARY browser diagnostics. Remove after the formula/ribbon failure is captured.
import type { MathfieldElement } from 'mathlive'

const startedAt = performance.now()
const prefix = '[universal-context-trace]'
let recordCount = 0
const maxRecords = 500

export function activeElementCategory(): string {
  const active = document.activeElement
  if (!(active instanceof Element)) return 'other'
  if (active.closest('math-field')) return 'math-field'
  if (active.closest('.universal-editor-module-tab')) return 'module-tab'
  if (active.closest('.universal-editor-ribbon summary')) return 'ribbon-summary'
  if (active.closest('.universal-editor-ribbon button')) return 'ribbon-button'
  if (active.closest('.ProseMirror')) return 'ProseMirror'
  if (active.closest('math-virtual-keyboard')) return 'virtual-keyboard'
  return 'other'
}

export function fieldTraceState(field: MathfieldElement | null | undefined) {
  if (!field) return { exists: false, connected: false, focused: false, disabled: null, readOnly: null, selectionExists: false }
  // MathLive's accessors are unavailable until the new element is attached.
  // Mount tracing runs before host.append(field), so avoid those accessors here.
  if (!field.isConnected) return { exists: true, connected: false, focused: false, disabled: null, readOnly: null, selectionExists: false }
  const selection = field.selection
  return {
    exists: true,
    connected: field.isConnected,
    focused: document.activeElement === field,
    disabled: field.disabled,
    readOnly: field.readOnly,
    selectionExists: selection != null,
    collapsed: field.selectionIsCollapsed,
    position: field.position,
    ranges: selection?.ranges?.map((range) => [range[0], range[1]]),
  }
}

export function traceContext(event: string, state: Record<string, unknown> = {}) {
  if (recordCount >= maxRecords) return
  recordCount += 1
  console.info(prefix, { atMs: Math.round((performance.now() - startedAt) * 10) / 10, event, activeElement: activeElementCategory(), ...state })
}
