import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { FRAME_HANDLES, resizeVisualPlacement, type FrameHandle, type PersistedVisualPlacement } from './visualPlacement'
import './VisualFrame.css'

type Props = {
  id: string; placement: PersistedVisualPlacement; floating: boolean; selected: boolean; disabled: boolean
  minimum: { width: number; height: number }; children: ReactNode
  onSelect: () => void; onChange: (placement: PersistedVisualPlacement) => void
}

export default function VisualFrame({ id, placement, floating, selected, disabled, minimum, children, onSelect, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ pointer: number; x: number; y: number; start: PersistedVisualPlacement; handle: FrameHandle | 'move' } | null>(null)
  const [interacting, setInteracting] = useState(false)
  const begin = (event: PointerEvent<HTMLButtonElement>, handle: FrameHandle | 'move') => {
    if (disabled || event.button !== 0) return
    event.preventDefault(); event.stopPropagation(); onSelect()
    const start = structuredClone(placement)
    if (!floating && ref.current) {
      const canvas = ref.current.closest('.universal-question-canvas')!.getBoundingClientRect()
      const box = ref.current.getBoundingClientRect()
      start.position.x = box.left - canvas.left
      start.position.y = box.top - canvas.top
    }
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, start, handle }
    event.currentTarget.setPointerCapture(event.pointerId)
    setInteracting(true)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current
    if (!current || current.pointer !== event.pointerId) return
    const dx = event.clientX - current.x, dy = event.clientY - current.y
    onChange(current.handle === 'move'
      ? { ...current.start, position: { ...current.start.position, x: Math.max(0, current.start.position.x + dx), y: Math.max(0, current.start.position.y + dy) } }
      : resizeVisualPlacement(current.start, current.handle, dx, dy, minimum))
  }
  const end = () => { gesture.current = null; setInteracting(false) }
  return <div ref={ref} data-frame-id={id} className={`visual-frame${selected ? ' is-selected' : ''}${interacting ? ' is-interacting' : ''}`}
    style={{ position: floating ? 'absolute' : 'relative', left: floating ? placement.position.x : undefined,
      top: floating ? placement.position.y : undefined, width: placement.size.width, height: placement.size.height }}
    onClick={onSelect}>
    {children}
    {!disabled && <button type="button" className="visual-frame__move" data-frame-chrome="" aria-label="Çərçivəni hərəkət etdir"
      onPointerDown={event => begin(event, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>⠿</button>}
    {selected && !disabled && FRAME_HANDLES.map(handle => <button key={handle} type="button" data-frame-chrome="" data-handle={handle}
      className={`visual-frame__handle visual-frame__handle--${handle}`} aria-label={`Çərçivə ölçüsü: ${handle}`}
      onPointerDown={event => begin(event, handle)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />)}
  </div>
}
