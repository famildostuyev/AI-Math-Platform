import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FRAME_HANDLES, resizeVisualPlacement, type FrameHandle, type PersistedVisualPlacement } from './visualPlacement'
import './VisualFrame.css'
import { GeometryFrameMenuContext } from './GeometryEditorPanels'
import { geometryContextMenuPlacement } from './geometryContextMenuPlacement'

type Props = {
  id: string; placement: PersistedVisualPlacement; floating: boolean; selected: boolean; disabled: boolean
  minimum: { width: number; height: number }; children: ReactNode
  secondaryMenu?: ReactNode
  actions?: ReactNode
  onSelect: () => void; onChange: (placement: PersistedVisualPlacement) => void
}

export default function VisualFrame({ id, placement, floating, selected, disabled, minimum, children, secondaryMenu, actions, onSelect, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ pointer: number; x: number; y: number; start: PersistedVisualPlacement; handle: FrameHandle | 'move' } | null>(null)
  const [interacting, setInteracting] = useState(false)
  const [menuHost,setMenuHost]=useState<HTMLDivElement|null>(null)
  const popup=useRef<HTMLDivElement>(null)
  const selectAt=useRef<((event:MouseEvent)=>void)|null>(null)
  const captureAt=useRef<((event:MouseEvent)=>()=>void)|null>(null)
  const contextPick=useRef<{pointerId:number;pointerType:string;startedAt:number;pickedAt:{x:number;y:number};capture:(event:MouseEvent)=>()=>void;apply:()=>void}|null>(null)
  const [menuPosition,setMenuPosition]=useState<{x:number;y:number;protectedAt?:{x:number;y:number}}|null>(null)
  const returnFocus=useRef<HTMLElement|null>(null)
  const closeMenu=(restore=false)=>{setMenuPosition(null);if(restore)(returnFocus.current?.isConnected?returnFocus.current:ref.current)?.focus({preventScroll:true})}
  const openMenu=(x:number,y:number,protectedAt?:{x:number;y:number})=>{if(disabled)return;const active=document.activeElement;returnFocus.current=active instanceof HTMLElement&&active!==document.body&&!popup.current?.contains(active)?active:ref.current;onSelect();setMenuPosition({x,y,protectedAt})}
  useEffect(()=>{
    const close=(event:Event)=>{contextPick.current=null;if(popup.current&&!popup.current.contains(event.target as Node))setMenuPosition(null)}
    const cancel=()=>{contextPick.current=null}
    const outsideContext=(event:Event)=>{if(!ref.current?.contains(event.target as Node))cancel()}
    document.addEventListener('pointerdown',close,true)
    document.addEventListener('contextmenu',outsideContext,true)
    document.addEventListener('pointercancel',cancel,true)
    document.addEventListener('keydown',cancel,true)
    window.addEventListener('blur',cancel)
    return()=>{cancel();document.removeEventListener('pointerdown',close,true);document.removeEventListener('contextmenu',outsideContext,true);document.removeEventListener('pointercancel',cancel,true);document.removeEventListener('keydown',cancel,true);window.removeEventListener('blur',cancel)}
  },[])
  useEffect(()=>{if(!selected||disabled){setMenuPosition(null);contextPick.current=null}},[selected,disabled])
  useLayoutEffect(()=>{
    const element=popup.current;if(!menuPosition||!element)return
    const position=()=>{
      const b=element.getBoundingClientRect(),frame=ref.current?.getBoundingClientRect()
      const next=geometryContextMenuPlacement(menuPosition,b,{width:window.innerWidth,height:window.innerHeight},frame,menuPosition.protectedAt)
      element.style.left=`${next.x}px`;element.style.top=`${next.y}px`
    }
    position();element.querySelector<HTMLElement>('button:not(:disabled),summary,select:not(:disabled)')?.focus({preventScroll:true})
    const observer=new ResizeObserver(position);observer.observe(element);window.addEventListener('resize',position)
    return()=>{observer.disconnect();window.removeEventListener('resize',position)}
  },[menuPosition,menuHost])
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
    tabIndex={0} aria-label="Həndəsə çərçivəsi" aria-haspopup="dialog" aria-expanded={!!menuPosition} aria-controls={`geometry-frame-menu-${id}`}
    onPointerDownCapture={event=>{if(event.button===2&&ref.current?.contains(event.target as Node)){event.preventDefault();event.stopPropagation();const capture=captureAt.current;if(!disabled&&capture)contextPick.current={pointerId:event.pointerId,pointerType:event.pointerType,startedAt:event.timeStamp,pickedAt:{x:event.clientX,y:event.clientY},capture,apply:capture(event.nativeEvent)}}}}
    onMouseDownCapture={event=>{if(event.button===2&&ref.current?.contains(event.target as Node)){event.preventDefault();event.stopPropagation()}}}
    onContextMenuCapture={event=>{
      const pending=contextPick.current
      if(popup.current?.contains(event.target as Node)){contextPick.current=null;event.preventDefault();event.stopPropagation();return}
      if(ref.current?.contains(event.target as Node)){
        event.preventDefault();event.stopPropagation()
        const native=event.nativeEvent
        // Capture belongs to this right-button interaction, not an event-loop task.
        // Older MouseEvent implementations have no pointer identity; genuine new
        // interactions still invalidate them through the document boundary listeners.
        const matches=pending&&event.button===2&&event.timeStamp>=pending.startedAt&&
          (!(native instanceof globalThis.PointerEvent)||native.pointerId<=0||
            native.pointerId===pending.pointerId&&native.pointerType===pending.pointerType)
        if(matches)contextPick.current=null
        if(!disabled){if(captureAt.current){if(matches&&pending.capture===captureAt.current)pending.apply()}else selectAt.current?.(native)}
        openMenu(event.clientX,event.clientY,matches?pending.pickedAt:undefined)
      }
    }}
    onKeyDownCapture={event=>{
      contextPick.current=null
      if(popup.current?.contains(event.target as Node)){
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true)}
        if(event.key==='Tab'){const controls=[...popup.current.querySelectorAll<HTMLElement>('button:not(:disabled),summary,input:not(:disabled),select:not(:disabled)')].filter(e=>e.getClientRects().length);const index=controls.indexOf(document.activeElement as HTMLElement);if(controls.length&&(event.shiftKey?index<=0:index===controls.length-1)){event.preventDefault();controls[event.shiftKey?controls.length-1:0].focus()}}
        return
      }
      if((event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)&&ref.current?.contains(event.target as Node)){event.preventDefault();event.stopPropagation();const b=ref.current.getBoundingClientRect();openMenu(Math.max(8,b.left+24),Math.max(8,b.top+24))}
    }}
    onClick={onSelect}>
    <GeometryFrameMenuContext.Provider value={{host:menuHost,selected,selectAt,captureAt,closeMenu:()=>closeMenu(true)}}>{children}</GeometryFrameMenuContext.Provider>
    {selected&&createPortal(<div ref={popup} id={`geometry-frame-menu-${id}`} hidden={!menuPosition} className="geometry-frame-context-menu" data-frame-menu-owner={id} data-frame-chrome="" role="dialog" aria-label="Çərçivə kontekst menyusu" tabIndex={-1}
      onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();if((event.target as HTMLElement).closest('button'))closeMenu(true)}}>
      <div className="visual-frame__actions" role="group" aria-label="Çərçivə əməliyyatları">{actions}</div>
      {secondaryMenu}<div ref={setMenuHost}/>
    </div>,document.body)}
    {!disabled && <button type="button" className="visual-frame__move" data-frame-chrome="" aria-label="Çərçivəni hərəkət etdir"
      onPointerDown={event => begin(event, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>⠿</button>}
    {selected && !disabled && FRAME_HANDLES.map(handle => <button key={handle} type="button" data-frame-chrome="" data-handle={handle}
      className={`visual-frame__handle visual-frame__handle--${handle}`} aria-label={`Çərçivə ölçüsü: ${handle}`}
      onPointerDown={event => begin(event, handle)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />)}
  </div>
}
