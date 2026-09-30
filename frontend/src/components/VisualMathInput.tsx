import { useRef } from 'react'
import MathLiveField, { type MathLiveFieldHandle } from './MathLiveField'

type VisualMathInputProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  targetId?: string
}

const SYMBOLS = [
  { label: 'Toplama', display: '+', value: '+' },
  { label: 'Çıxma', display: '−', value: '-' },
  { label: 'Vurma', display: '×', value: '\\times' },
  { label: 'Bölmə', display: '÷', value: '\\div' },
  { label: 'Bərabərdir', display: '=', value: '=' },
  { label: 'Bərabər deyil', display: '≠', value: '\\ne' },
  { label: 'Kiçikdir', display: '<', value: '<' },
  { label: 'Böyükdür', display: '>', value: '>' },
  { label: 'Kiçik və ya bərabərdir', display: '≤', value: '\\le' },
  { label: 'Böyük və ya bərabərdir', display: '≥', value: '\\ge' },
  { label: 'Kəsr', display: 'a⁄b', value: '\\frac{#0}{#?}' },
  { label: 'Qüvvət', display: 'xⁿ', value: '^{#?}' },
  { label: 'Kvadrat kök', display: '√', value: '\\sqrt{#0}' },
  { label: 'Mötərizələr', display: '( )', value: '\\left(#0\\right)' },
  { label: 'Pi', display: 'π', value: '\\pi' },
  { label: 'Bucaq', display: '∠', value: '\\angle' },
  { label: 'Perpendikulyar', display: '⊥', value: '\\perp' },
  { label: 'Paralel', display: '∥', value: '\\parallel' },
] as const

export default function VisualMathInput({ value, onChange, disabled = false, ariaLabel = 'Vizual formula redaktoru', targetId }: VisualMathInputProps) {
  const fieldRef = useRef<MathLiveFieldHandle>(null)

  const insert = (serializedValue: string) => {
    if (disabled) return
    fieldRef.current?.insert(serializedValue)
  }

  return <div className="visual-math-input">
    <MathLiveField ref={fieldRef} value={value} onChange={onChange} disabled={disabled} ariaLabel={ariaLabel} targetId={targetId} />
    <div className="visual-math-input__palette" role="toolbar" aria-label="Riyazi simvollar">
      {SYMBOLS.map((symbol) => <button key={symbol.label} type="button" title={symbol.label} aria-label={symbol.label} disabled={disabled} onClick={() => insert(symbol.value)}>{symbol.display}</button>)}
    </div>
  </div>
}
