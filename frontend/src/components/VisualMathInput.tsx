import { useEffect, useRef } from 'react'
import { MathfieldElement } from 'mathlive'

type VisualMathInputProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
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

export default function VisualMathInput({ value, onChange, disabled = false, ariaLabel = 'Vizual formula redaktoru' }: VisualMathInputProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<MathfieldElement | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const field = new MathfieldElement()
    field.className = 'visual-math-input__field'
    field.setAttribute('aria-label', ariaLabel)
    field.setAttribute('virtual-keyboard-mode', 'onfocus')
    field.smartFence = true
    field.value = value
    field.disabled = disabled
    const handleInput = () => onChangeRef.current(field.value)
    field.addEventListener('input', handleInput)
    host.append(field)
    fieldRef.current = field
    return () => {
      field.removeEventListener('input', handleInput)
      field.remove()
      fieldRef.current = null
    }
  }, [ariaLabel])

  useEffect(() => {
    const field = fieldRef.current
    if (field && field.value !== value) field.setValue(value, { silenceNotifications: true })
  }, [value])

  useEffect(() => {
    if (fieldRef.current) fieldRef.current.disabled = disabled
  }, [disabled])

  const insert = (serializedValue: string) => {
    const field = fieldRef.current
    if (!field || disabled) return
    field.focus()
    field.insert(serializedValue, { selectionMode: 'placeholder' })
    onChange(field.value)
  }

  return <div className="visual-math-input">
    <div ref={hostRef} />
    <div className="visual-math-input__palette" role="toolbar" aria-label="Riyazi simvollar">
      {SYMBOLS.map((symbol) => <button key={symbol.label} type="button" title={symbol.label} aria-label={symbol.label} disabled={disabled} onClick={() => insert(symbol.value)}>{symbol.display}</button>)}
    </div>
  </div>
}
