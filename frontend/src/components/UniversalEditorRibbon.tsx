import { useContext, useEffect, useRef, useState } from 'react'
import type { MathfieldElement } from 'mathlive'
import MathContent from './MathContent'
import MatrixMenu from './MatrixMenu'
import { GEOMETRY_RIBBON, GEOMETRY_FUTURE_TITLE, type GeometryRibbonItem } from './geometryRibbonMenu'
import { Bold, Italic, Underline, Keyboard, Plus, Highlighter, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'
import { FORMULA_FONT_SIZES, UniversalEditorSessionContext, type ActiveContextCapability } from './universalEditorSession'
import { getMathRibbonActions, getMoreMathRibbonActions, type MathRibbonAction } from './mathLiveRibbonMenu'
import type { StructuredTextFontFamily, StructuredTextFontSize, StructuredTextAlignment } from './structuredContinuousTextEditorModel'
import { fieldTraceState, traceContext } from './universalContextTrace'
import { EDITOR_SYMBOL_CATEGORIES } from './universalEditorSymbols'
import { STANDARD_COLORS, TEXT_COLOR_HEX, THEME_COLORS } from './universalEditorColors'
import { fontSizePoints, TEXT_SIZE_PRESETS } from './structuredTextTypography'
import { FORMULA_CLIPBOARD_MIME, FORMULA_WEB_CLIPBOARD_MIME, formulaClipboardHtml, parseFormulaClipboard, parseFormulaClipboardHtml } from './formulaClipboard'

const MATH_GROUPS = [
  ['Kəsr', [['Böyük kəsr', '\\frac{#0}{#?}'], ['Kiçik kəsr', '\\tfrac{#0}{#?}']]],
  ['Qüvvət', [['Kvadrat', '#0^2'], ['Qüvvət', '#0^{#?}'], ['İndeks', '#0_{#?}'], ['Qüvvət və indeks', '#0_{#?}^{#?}']]],
  ['Kök', [['Kvadrat kök', '\\sqrt{#0}'], ['n-ci dərəcədən kök', '\\sqrt[#?]{#0}']]],
  ['Mötərizə', [['Dairəvi mötərizə', '\\left(#0\\right)'], ['Sol dairəvi, sağ kvadrat', '\\left(#0\\right]'], ['Sol kvadrat, sağ dairəvi', '\\left[#0\\right)'], ['Kvadrat mötərizə', '\\left[#0\\right]'], ['Fiqurlu mötərizə', '\\left\\{#0\\right\\}']]],
  ['Funksiya', [['Loqarifm', '\\log(#0)']]],
  ['Cəm/hasil', [['Cəm', '\\sum_{#?}^{#?}#0'], ['Hasil', '\\prod_{#?}^{#?}#0']]],
  ['İnteqral', [['İnteqral', '\\int #0\\,dx'], ['Müəyyən inteqral', '\\int_{#?}^{#?}#0\\,dx']]],
  ['Limit', [['Limit', '\\lim_{x\\to #?}#0']]],
  ['Matris', [['2 × 2', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}']]],
] as const

const MATH_GROUP_GLYPHS: Record<string, string> = {
  'Kəsr': '½', 'Qüvvət': 'x²', 'Kök': '√', 'Mötərizə': '( )', 'Funksiya': 'f(x)',
  'Cəm/hasil': 'Σ', 'İnteqral': '∫', 'Limit': 'lim', 'Matris': '▦',
}

const FUNCTION_GROUPS = [
  ['Triqonometrik funksiyalar', [['sin', '\\sin(#0)'], ['cos', '\\cos(#0)'], ['tan', '\\tan(#0)'], ['cot', '\\cot(#0)'], ['sec', '\\sec(#0)'], ['cosec', '\\operatorname{cosec}(#0)']]],
  ['Tərs triqonometrik funksiyalar', [['arcsin', '\\arcsin(#0)'], ['arccos', '\\arccos(#0)'], ['arctan', '\\arctan(#0)'], ['arccot', '\\operatorname{arccot}(#0)']]],
] as const

const MENU_PREVIEWS: Record<string, string> = {
  'sin': '\\sin x', 'cos': '\\cos x', 'tan': '\\tan x', 'cot': '\\cot x', 'sec': '\\sec x', 'cosec': '\\operatorname{cosec} x',
  'arcsin': '\\arcsin x', 'arccos': '\\arccos x', 'arctan': '\\arctan x', 'arccot': '\\operatorname{arccot} x',
  'Loqarifm': '\\log x', 'Əsaslı loqarifm': '\\log_a x',
  'Kvadrat': 'x^2',
  'Qüvvət': 'x^n',
  'İndeks': 'x_i',
  'Qüvvət və indeks': 'x_i^n',
  'Dairəvi mötərizə': '\\left(\\,\\right)',
  'Sol dairəvi, sağ kvadrat': '\\left(\\,\\right]',
  'Sol kvadrat, sağ dairəvi': '\\left[\\,\\right)',
  'Kvadrat mötərizə': '\\left[\\,\\right]',
  'Fiqurlu mötərizə': '\\left\\{\\,\\right\\}',
  'Modul / mütləq qiymət': '\\left|\\,\\right|',
  'Böyük kəsr': '\\displaystyle\\frac{a}{b}',
  'Kiçik kəsr': '\\tfrac{a}{b}',
  'Kvadrat kök': '\\sqrt{x}',
  'n-ci dərəcədən kök': '\\sqrt[n]{x}',
  'n-ci dərəcədən kök şablonu': '\\sqrt[\\square]{\\square}',
}

function MenuPreview({ label }: { label: string }) {
  const latex = MENU_PREVIEWS[label]
  if (!latex) return null
  return <span aria-hidden="true"><MathContent fallbackText="" content={{ format_version: 1, segments: [{ type: 'math', latex, source_text: latex, display_mode: false }] }} />{' '}</span>
}

function NativeFormulaActions({ actions, disabled, onClose, ungrouped = false }: { actions: MathRibbonAction[]; disabled: boolean; onClose: () => void; ungrouped?: boolean }) {
  const session = useContext(UniversalEditorSessionContext)
  const sections = [...new Set(actions.map((action) => action.section))]
  const buttons = (section?: string) => actions.filter((action) => ungrouped || action.section === section).map((action) =>
    <button key={action.key} type="button" disabled={disabled || !action.enabled} aria-pressed={action.checked} onClick={() => {
      traceContext('ribbon-command-start', { commandCategory: 'native-formula', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
      const succeeded = action.run(session?.restoreMathTarget() ?? null)
      traceContext('ribbon-command-end', { commandCategory: 'native-formula', succeeded, targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
      if (succeeded) onClose()
    }}>{(action.id === 'insert-nth-root' || action.id === 'insert-abs' || action.id === 'insert-log-base') && <MenuPreview label={action.label} />}{action.label}</button>)
  if (ungrouped) return <div className="universal-editor-ribbon-commands">{buttons()}</div>
  return <>{sections.map((section) => section
    ? <details className="universal-editor-ribbon-submenu" key={section}><summary>{section} ▾</summary><div>{buttons(section)}</div></details>
    : <div key="commands" className="universal-editor-ribbon-commands">{buttons()}</div>)}</>
}

export default function UniversalEditorRibbon({ module, disabled, onCreateGeometryFrame }: { module: string; disabled: boolean; onCreateGeometryFrame?: () => void }) {
  const session = useContext(UniversalEditorSessionContext)
  const activeContext = session?.getActiveContext()
  const activeText = activeContext?.kind === 'text'
  const activeMath = activeContext?.kind === 'formula' ? activeContext.field : null
  const textCommands = activeContext?.kind === 'text' ? activeContext.commands : null
  const canFormat = (capability: ActiveContextCapability) => !disabled && !!session?.canRun(capability)
  const formulaBold = !!activeMath && (activeMath.queryStyle({ variantStyle: 'bold' }) === 'all' || activeMath.queryStyle({ variantStyle: 'bolditalic' }) === 'all')
  const formulaItalic = !!activeMath && (activeMath.queryStyle({ variantStyle: 'italic' }) === 'all' || activeMath.queryStyle({ variantStyle: 'bolditalic' }) === 'all')
  const formulaFontSize = activeMath
    ? (Object.entries(FORMULA_FONT_SIZES).find(([, size]) => activeMath.queryStyle({ fontSize: size }) === 'all')?.[0] as StructuredTextFontSize | undefined) ?? 'normal'
    : 'normal'
  const textFontSize = fontSizePoints(session?.format?.fontSize ?? 'normal')
  const mathActions = getMathRibbonActions(activeMath)
  const ribbonRef = useRef<HTMLDivElement>(null)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [lastColor, setLastColor] = useState({ foreground: 'black', background: 'yellow' })
  const [clipboardNotice, setClipboardNotice] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; kind: 'text' | 'formula'; target: HTMLElement } | null>(null)
  const context = `${module}:${disabled}:${!!activeMath}:${!!activeText}`
  const [menuContext, setMenuContext] = useState(context)
  if (menuContext !== context) {
    if (activeMenu) traceContext('ribbon-dropdown-close', { reason: 'context-change', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
    setMenuContext(context)
    setActiveMenu(null)
  }
  const closeMenu = () => {
    traceContext('ribbon-dropdown-close', { reason: 'command', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
    setActiveMenu(null)
  }
  const menuAvailable = !disabled && (!!session?.canRun('insert-inline-formula') || !!session?.canRun('formula-insert'))
  useEffect(() => {
    if (!activeMenu) return
    const outside = (event: Event) => {
      const dropdown = event.target instanceof Element
        ? event.target.closest('.universal-editor-math-ribbon > details, .universal-editor-geometry-ribbon > details, .universal-editor-formatbar details') : null
      if (!dropdown || !ribbonRef.current?.contains(dropdown)) {
        traceContext('ribbon-dropdown-close', { reason: 'outside', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
        setActiveMenu(null)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const openDropdown = ribbonRef.current?.querySelector('.universal-editor-math-ribbon > details[open], .universal-editor-geometry-ribbon > details[open], .universal-editor-formatbar details[open]')
      if (openDropdown?.contains(document.activeElement)) openDropdown.querySelector('summary')?.focus()
      traceContext('ribbon-dropdown-close', { reason: 'escape', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
      setActiveMenu(null)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('click', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('click', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [activeMenu, session?.activeContext, session?.math])
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null
      if (!element?.closest('.universal-editor')) return
      const field = (event.composedPath().find((item) => item instanceof Element && item.matches('math-field')) ?? element.closest('math-field')) as MathfieldElement | null
      const text = element.closest('.ProseMirror')
      if (!field && !text) return
      event.preventDefault()
      if (field) {
        const current = session?.getActiveContext()
        session?.activateMath(field, current?.kind === 'formula' && current.field === field ? current.history : null, field.closest('[data-node-id]')?.getAttribute('data-node-id') ?? 'formula')
      } else if (text instanceof HTMLElement) text.focus({ preventScroll: true })
      setActiveMenu(null)
      setClipboardNotice('')
      setContextMenu({ x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 180)), kind: field ? 'formula' : 'text', target: (field ?? text) as HTMLElement })
    }
    const close = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.universal-editor-context-menu')) setContextMenu(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextMenu(null) }
    document.addEventListener('contextmenu', open, true)
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('contextmenu', open, true)
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [session])
  const trigger = (name: string, available = menuAvailable) => ({
    'aria-expanded': activeMenu === name,
    'aria-haspopup': true as const,
    'aria-disabled': !available,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault()
      if (available) {
        traceContext(activeMenu === name ? 'ribbon-dropdown-close' : 'ribbon-dropdown-open', { reason: 'trigger', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
        setActiveMenu((current) => current === name ? null : name)
      }
    },
  })
  const applyColor = (kind: 'foreground' | 'background', color: string) => {
    const applied = activeText
      ? textCommands?.setColor(kind, color === 'none' ? null : TEXT_COLOR_HEX[color])
      : session?.formatMathColor(kind, color)
    if (!applied) return
    if (color !== 'none') setLastColor((current) => ({ ...current, [kind]: color }))
    closeMenu()
  }
  const selectFormulaAll = () => {
    const field = session?.restoreMathTarget()
    if (!field) return
    field.executeCommand('selectAll')
    setClipboardNotice('')
    closeMenu()
  }
  const copyOrCutFormulaFromMenu = async (cut: boolean) => {
    const field = session?.restoreMathTarget()
    if (!field) return
    const latex = cut ? field.getValue(field.selection, 'latex') : field.selectionIsCollapsed ? field.value : field.getValue(field.selection, 'latex')
    const payload = parseFormulaClipboard(JSON.stringify({ version: 1, type: 'inline_math', latex }))
    if (!payload) return
    try {
      if (!navigator.clipboard?.write) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.write([new ClipboardItem({
        [FORMULA_WEB_CLIPBOARD_MIME]: new Blob([JSON.stringify(payload)], { type: FORMULA_CLIPBOARD_MIME }),
        'text/plain': new Blob([latex], { type: 'text/plain' }),
        'text/html': new Blob([formulaClipboardHtml(latex)], { type: 'text/html' }),
      })])
      if (cut && session?.restoreMathTarget() === field) {
        field.executeCommand('deleteBackward')
        field.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setClipboardNotice('')
      closeMenu()
    } catch {
      setClipboardNotice(cut ? 'Kəsmək üçün Ctrl+X istifadə edin' : 'Kopyalamaq üçün Ctrl+C istifadə edin')
    }
  }
  const pasteFormulaFromMenu = async () => {
    const field = session?.restoreMathTarget()
    if (!field) return
    try {
      let value = ''
      if (navigator.clipboard?.read) {
        let items: ClipboardItems = []
        try { items = await navigator.clipboard.read() }
        catch { if (navigator.clipboard.readText) value = await navigator.clipboard.readText() }
        for (const item of items) {
          const customType = [FORMULA_CLIPBOARD_MIME, FORMULA_WEB_CLIPBOARD_MIME].find((type) => item.types.includes(type))
          if (customType) {
            const payload = parseFormulaClipboard(await (await item.getType(customType)).text())
            if (!payload) throw new Error('Invalid formula clipboard data')
            value = payload.latex
            break
          }
          if (item.types.includes('text/html')) {
            const html = await (await item.getType('text/html')).text()
            if (html.includes('data-universal-editor-inline-math')) {
              const payload = parseFormulaClipboardHtml(html)
              if (!payload) throw new Error('Invalid formula clipboard data')
              value = payload.latex
              break
            }
          }
          if (item.types.includes('text/plain')) value = await (await item.getType('text/plain')).text()
        }
      } else if (navigator.clipboard?.readText) value = await navigator.clipboard.readText()
      if (!value) throw new Error('Clipboard unavailable')
      if (session?.restoreMathTarget() !== field) return
      field.insert(value)
      field.dispatchEvent(new Event('input', { bubbles: true }))
      setClipboardNotice('')
      closeMenu()
    } catch {
      setClipboardNotice('Yapışdırmaq üçün Ctrl+V istifadə edin')
    }
  }
  // Retain the existing menu clipboard utilities; Stage 5 removes only their visible entries.
  void [selectFormulaAll, copyOrCutFormulaFromMenu, pasteFormulaFromMenu]
  const restoreClipboardTarget = () => {
    const current = session?.getActiveContext()
    if (current?.kind === 'formula') return session?.restoreMathTarget()
    if (current?.kind === 'text') {
      const commands = session?.restoreTextTarget()
      commands?.focus()
      session?.restoreTextTarget()
      return document.activeElement
    }
    return null
  }
  const runContextClipboard = async (command: 'cut' | 'copy' | 'paste' | 'selectAll') => {
    if (contextMenu?.kind === 'formula') {
      const field = contextMenu.target as MathfieldElement
      const current = session?.getActiveContext()
      if (current?.kind !== 'formula' || current.field !== field) {
        session?.activateMath(field, null, field.closest('[data-node-id]')?.getAttribute('data-node-id') ?? 'formula')
      }
    }
    const target = restoreClipboardTarget()
    if (!target) return
    if (command !== 'paste') {
      if (command === 'selectAll' && contextMenu?.kind === 'formula') {
        const field = target as MathfieldElement
        const current = session?.getActiveContext()
        const history = current?.kind === 'formula' && current.field === field ? current.history : null
        setContextMenu(null)
        requestAnimationFrame(() => {
          field.focus()
          session?.activateMath(field, history, field.closest('[data-node-id]')?.getAttribute('data-node-id') ?? 'formula')
          field.selection = { ranges: [[0, field.lastOffset]] }
        })
        return
      }
      else document.execCommand(command === 'selectAll' ? 'selectAll' : command)
      setContextMenu(null)
      return
    }
    try {
      const transfer = new DataTransfer()
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read()
        for (const item of items) for (const type of item.types) transfer.setData(type, await (await item.getType(type)).text())
      } else if (navigator.clipboard?.readText) transfer.setData('text/plain', await navigator.clipboard.readText())
      if (transfer.types.length === 0) throw new Error('Clipboard unavailable')
      const restored = restoreClipboardTarget()
      if (!(restored instanceof EventTarget)) return
      restored.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true, composed: true }))
      setClipboardNotice('')
      setContextMenu(null)
    } catch {
      setClipboardNotice('Yapışdırmaq üçün Ctrl+V istifadə edin')
    }
  }
  const traceRibbonInteraction = (phase: 'pointerdown' | 'click', target: EventTarget) => {
    const element = target instanceof Element ? target : null
    traceContext(`ribbon-${phase}`, { control: element?.closest('summary') ? 'summary' : element?.closest('button') ? 'button' : element?.closest('select') ? 'select' : 'other', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
  }
  const geometry = activeContext?.kind === 'geometry' && session?.geometryCommands?.id === activeContext.id ? session.geometryCommands : null
  const geometryButton = (item: GeometryRibbonItem) => <button type="button" key={item.label}
    disabled={disabled || !item.action || (item.action !== 'select' && (!geometry || geometry.disabled)) || (item.action === 'delete' && !geometry?.canDelete)}
    aria-pressed={item.action && item.action !== 'delete' ? geometry?.tool === item.action : undefined}
    title={!item.action ? [item.title, GEOMETRY_FUTURE_TITLE].filter(Boolean).join(' — ') : undefined}
    onClick={() => { if (item.action && !disabled) geometry?.run(item.action); closeMenu() }}>{item.label}</button>
  return <div ref={ribbonRef} className="universal-editor-ribbon" data-editor-ribbon="" onPointerDownCapture={(event) => traceRibbonInteraction('pointerdown', event.target)} onClickCapture={(event) => traceRibbonInteraction('click', event.target)} onMouseDown={(event) => {
    if ((event.target as HTMLElement).closest('button')) event.preventDefault()
  }}>
    {module === 'text' && <div className="universal-editor-formatbar" role="toolbar" aria-label="Mətn formatı">
      <select aria-label="Şrift" disabled={!canFormat('format-font-family')} value={activeText ? session?.format?.fontFamily ?? 'default' : 'default'} onChange={(e) => textCommands?.setFontFamily(e.target.value as StructuredTextFontFamily)}>
        <option value="default">Sənəd şrifti</option><option value="times-new-roman">Times New Roman</option><option value="arial">Arial</option><option value="calibri">Calibri</option><option value="cambria">Cambria</option><option value="georgia">Georgia</option><option value="verdana">Verdana</option><option value="serif">Serif</option><option value="sans">Sans-serif</option><option value="math-compatible">Riyazi şrift</option>
      </select>
      <select aria-label="Şrift ölçüsü" title={activeMath ? 'Formula ölçüsü' : 'Şrift ölçüsü (pt)'} disabled={!canFormat('format-font-size')} value={activeMath ? formulaFontSize : textFontSize} onChange={(e) => activeMath ? session?.formatMath('font-size', e.target.value as StructuredTextFontSize) : textCommands?.setFontSize(Number(e.target.value))}>
        {activeMath ? <><option value="small">Kiçik</option><option value="normal">Normal</option><option value="large">Böyük</option><option value="x-large">Çox böyük</option></> : <>{!TEXT_SIZE_PRESETS.some((size) => size === textFontSize) && <option value={textFontSize}>{textFontSize}</option>}{TEXT_SIZE_PRESETS.map((size) => <option key={size} value={size}>{size}</option>)}</>}
      </select>
      <button type="button" aria-label="Qalın" aria-pressed={activeMath ? formulaBold : activeText ? session?.format?.bold ?? false : false} disabled={!canFormat('format-bold')} onClick={() => activeMath ? session?.formatMath('bold') : textCommands?.toggleBold()}><Bold size={16} /></button>
      <button type="button" aria-label="Kursiv" aria-pressed={activeMath ? formulaItalic : activeText ? session?.format?.italic ?? false : false} disabled={!canFormat('format-italic')} onClick={() => activeMath ? session?.formatMath('italic') : textCommands?.toggleItalic()}><Italic size={16} /></button>
      <button type="button" aria-label="Altından xətt" aria-pressed={activeText ? session?.format?.underline ?? false : false} disabled={!canFormat('format-underline')} onClick={() => textCommands?.toggleUnderline()}><Underline size={16} /></button>
      {(['foreground', 'background'] as const).map((kind) => {
        const supported = canFormat(kind === 'foreground' ? 'format-foreground-color' : 'format-background-color')
        const label = kind === 'foreground' ? 'Mətn/Formula rəngi' : 'Fon rəngi'
        const menu = `color-${kind}`
        return <div className="universal-editor-color-control" key={kind}>
          <details open={activeMenu === menu}>
            <summary aria-label={`${label} palitrası`} title={`${label} palitrası`} aria-haspopup="true" aria-expanded={activeMenu === menu} aria-disabled={!supported} onClick={(event) => {
              event.preventDefault()
              if (supported) setActiveMenu((current) => current === menu ? null : menu)
            }}><span className="universal-editor-color-icon" aria-hidden="true">
              {kind === 'foreground' ? <span className="universal-editor-color-letter">A</span> : <Highlighter size={16} />}
              <span className="universal-editor-color-indicator" style={{ backgroundColor: lastColor[kind] }} />
            </span><span aria-hidden="true">▾</span></summary>
            <div className="universal-editor-ribbon-menu universal-editor-color-palette">
              <button type="button" onClick={() => applyColor(kind, 'none')}>Avtomatik</button>
              {([['Mövzu rəngləri', THEME_COLORS], ['Standart rənglər', STANDARD_COLORS]] as const).map(([group, colors]) => <section key={group} aria-label={group}>
                <h3>{group}</h3><div className="universal-editor-color-grid">{colors.map((color) => <button type="button" key={`${group}-${color.value}`} title={color.name} aria-label={`${label}: ${color.name}`} aria-pressed={lastColor[kind] === color.value} style={{ backgroundColor: color.value }} onClick={() => applyColor(kind, color.value)} />)}</div>
              </section>)}
            </div>
          </details>
        </div>
      })}
      {!!activeMath && <details className="universal-editor-formula-style" open={activeMenu === 'Formula üslubu'}><summary {...trigger('Formula üslubu')}>Formula üslubu ▾</summary><div className="universal-editor-ribbon-menu"><NativeFormulaActions ungrouped actions={mathActions.filter((action) => ['variant-style-up', 'variant-style-bold', 'variant-style-italic'].includes(action.id))} disabled={disabled} onClose={closeMenu} /></div></details>}
      <label className="universal-editor-alignment" title="Düzləndirmə"><span aria-hidden="true">{session?.format?.alignment === 'center' ? <AlignCenter size={16} /> : session?.format?.alignment === 'end' ? <AlignRight size={16} /> : session?.format?.alignment === 'justify' ? <AlignJustify size={16} /> : <AlignLeft size={16} />}</span><select aria-label="Düzləndirmə" disabled={!canFormat('format-alignment')} value={activeText ? session?.format?.alignment ?? 'start' : 'start'} onChange={(e) => textCommands?.setAlignment(e.target.value as StructuredTextAlignment)}><option value="start">Sola</option><option value="center">Mərkəzə</option><option value="end">Sağa</option><option value="justify">Eninə</option></select></label>
      <button type="button" aria-label="Markerli siyahı" title="Markerli siyahı" disabled={!canFormat('format-list')} aria-pressed={activeText ? session?.format?.bulletList ?? false : false} onClick={() => textCommands?.toggleBulletList()}><List size={16} /></button>
      <button type="button" aria-label="Nömrəli siyahı" title="Nömrəli siyahı" disabled={!canFormat('format-list')} aria-pressed={activeText ? session?.format?.orderedList ?? false : false} onClick={() => textCommands?.toggleOrderedList()}><ListOrdered size={16} /></button>
    </div>}
    {module === 'algebra' && <div className="universal-editor-math-ribbon" role="toolbar" aria-label="Cəbr alətləri">
      <button type="button" disabled={disabled || !session?.commands.current?.isValid()} onClick={() => session?.insertMath('', true)}><Plus size={15} /> Əlavə et</button>
      {MATH_GROUPS.map(([label, items]) => <details key={label} open={activeMenu === label}>
        <summary {...trigger(label)} title={label}><span className="universal-editor-math-glyph" aria-hidden="true">{MATH_GROUP_GLYPHS[label]}</span>{label === 'Limit' ? null : label} <span aria-hidden="true">▾</span></summary>
        <div className="universal-editor-ribbon-menu">{label === 'Matris' ? (activeMenu === label && <MatrixMenu disabled={!menuAvailable} onClose={closeMenu} />) : <>{label === 'Funksiya' && FUNCTION_GROUPS.map(([group, functions]) => <details className="universal-editor-ribbon-submenu" key={group}>
          <summary>{group} ▾</summary><div>{functions.map(([name, latex]) => <button type="button" key={name} disabled={!menuAvailable} onClick={() => { session?.insertMath(latex); closeMenu() }}>{name}</button>)}</div>
        </details>)}{items.map(([title, latex]) => <button type="button" key={title} disabled={!menuAvailable} onClick={() => {
          traceContext('ribbon-command-start', { commandCategory: 'insert-formula', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
          session?.insertMath(latex)
          traceContext('ribbon-command-end', { commandCategory: 'insert-formula', targetKind: session?.activeContext.current?.kind ?? null, field: fieldTraceState(session?.math.current) })
          closeMenu()
        }}>{(label === 'Kəsr' || label === 'Kök' || label === 'Qüvvət' || label === 'Mötərizə' || label === 'Funksiya') && <MenuPreview label={title} />}{title}</button>)}<NativeFormulaActions actions={mathActions.filter((action) => action.group === label && !(label === 'Mötərizə' && action.id === 'insert-modulus'))} disabled={disabled} onClose={closeMenu} /></>}</div>
      </details>)}
      <details className="universal-editor-symbols" open={activeMenu === 'Simvollar'}>
        <summary {...trigger('Simvollar')} title="Riyazi simvollar"><span className="universal-editor-math-glyph" aria-hidden="true">Ω</span>Simvollar <span aria-hidden="true">▾</span></summary>
        <div className="universal-editor-ribbon-menu universal-editor-symbol-palette" aria-label="Simvol palitrası">
          {EDITOR_SYMBOL_CATEGORIES.map((category) => <section key={category.name} aria-label={category.name}>
            <h3>{category.name}</h3>
            <div className="universal-editor-symbol-grid">{category.symbols.map((item) => <button
              type="button" key={`${category.name}-${item.glyph}`} title={item.name} aria-label={`${item.name} (${item.glyph})`} disabled={!menuAvailable}
              onClick={() => {
                const current = session?.getActiveContext()
                if (current?.kind === 'text') session?.restoreTextTarget()?.insertText(item.glyph)
                else if (current?.kind === 'formula') session?.insertMath(item.latex)
                else return
                closeMenu()
              }}
            >{item.glyph}</button>)}</div>
          </section>)}
        </div>
      </details>
      <details open={activeMenu === 'Daha çox'}><summary {...trigger('Daha çox', !disabled)}>Daha çox ▾</summary><div className="universal-editor-ribbon-menu"><NativeFormulaActions actions={getMoreMathRibbonActions(mathActions)} disabled={disabled} onClose={closeMenu} /></div></details>
    </div>}
    <div className="universal-editor-geometry-ribbon" hidden={module !== 'geometry'} ref={session?.setGeometryToolbarHost} role="toolbar" aria-label="Həndəsə alətləri">
      {module === 'geometry' && GEOMETRY_RIBBON.map(item => item.create
        ? <button key={item.label} type="button" disabled={disabled || !onCreateGeometryFrame} onClick={onCreateGeometryFrame}>{item.label}</button>
        : item.groups ? <details key={item.label} open={activeMenu === `geometry:${item.label}`}>
          <summary {...trigger(`geometry:${item.label}`, !disabled)}>{item.label} <span aria-hidden="true">▾</span></summary>
          <div className="universal-editor-ribbon-menu">{item.groups.map(group => <section key={group.label} aria-label={group.label || undefined}>
            {group.label && <h3>{group.label}</h3>}{group.items.map(geometryButton)}
          </section>)}</div>
        </details> : geometryButton(item))}
    </div>
    <button className="universal-editor-global-keyboard" type="button" disabled={disabled || !activeContext || (activeContext.kind !== 'text' && activeContext.kind !== 'formula')} aria-pressed={session?.bottomPanel === 'keyboard'} title="Riyazi klaviatura" onClick={() => session?.toggleKeyboard()}><Keyboard size={15} /> Klaviatura</button>
    {contextMenu && <div className="universal-editor-context-menu" role="menu" aria-label="Redaktə menyusu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.preventDefault()}>
      <button role="menuitem" type="button" disabled={disabled} onClick={() => { void runContextClipboard('cut') }}>Kəs <kbd>Ctrl+X</kbd></button>
      <button role="menuitem" type="button" disabled={disabled} onClick={() => { void runContextClipboard('copy') }}>Kopyala <kbd>Ctrl+C</kbd></button>
      <button role="menuitem" type="button" disabled={disabled} onClick={() => { void runContextClipboard('paste') }}>Yapışdır <kbd>Ctrl+V</kbd></button>
      <button role="menuitem" type="button" disabled={disabled} onClick={() => { void runContextClipboard('selectAll') }}>Hamısını seç <kbd>Ctrl+A</kbd></button>
      {clipboardNotice && <span role="status">{clipboardNotice}</span>}
    </div>}
  </div>
}
