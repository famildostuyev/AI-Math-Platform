import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { UniversalEditorSessionContext } from './universalEditorSession'
import './GeometryEditorPanels.css'

export const GeometryFrameMenuContext=createContext<{host:HTMLElement|null;selected:boolean;closeMenu?:()=>void;selectAt:RefObject<((event:MouseEvent)=>void)|null>;captureAt:RefObject<((event:MouseEvent)=>()=>void)|null>}|null>(null)
/** Presentation hosts only: the editor retains every field, callback and transient state. */
export default function GeometryEditorPanels({menu,properties,status,openRef,autoOpenKey,targetId}:{menu:ReactNode;properties:ReactNode;status:ReactNode;openRef?:RefObject<()=>void>;autoOpenKey?:string|null;targetId?:string}){
  const session=useContext(UniversalEditorSessionContext),frame=useContext(GeometryFrameMenuContext),frameHost=frame?.host??null,menuRef=useRef<HTMLDetailsElement>(null)
  const [localProperties,setLocalProperties]=useState(false)
  const panelRef=useRef<HTMLDialogElement>(null),returnFocus=useRef<HTMLElement|null>(null)
  const openProperties=()=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;if(panelRef.current?.open)queueMicrotask(()=>panelRef.current?.querySelector<HTMLElement>('header button')?.focus({preventScroll:true}));setLocalProperties(true);if(menuRef.current)menuRef.current.open=false}
  const closeProperties=()=>{setLocalProperties(false);const previous=returnFocus.current;if(previous?.isConnected&&previous!==document.body&&previous.getClientRects().length&&!previous.closest('.geometry-frame-context-menu'))previous.focus({preventScroll:true});else if(targetId)document.querySelector<HTMLElement>(`[data-frame-id="${CSS.escape(targetId)}"]`)?.focus({preventScroll:true});if(targetId)session?.activateGeometry(targetId)}
  const openCallback=useRef(openProperties);openCallback.current=openProperties
  useEffect(()=>{if(openRef)openRef.current=()=>openCallback.current()},[openRef])
  useEffect(()=>{if(autoOpenKey)openCallback.current()},[autoOpenKey])
  useEffect(()=>{
    if(!session)return
    if(targetId&&session.geometryPropertiesRequest.current===targetId){session.geometryPropertiesRequest.current=null;openCallback.current()}
  },[session?.geometryPropertiesRequest,targetId])
  useLayoutEffect(()=>{
    const panel=panelRef.current;if(!localProperties||!panel)return
    const position=()=>{
      const baseWidth=Math.min(340,innerWidth-16),frameElement=targetId?document.querySelector(`[data-frame-id="${CSS.escape(targetId)}"]`):null,b=frameElement?.getBoundingClientRect()
      const beside=!!b&&(innerWidth-b.right-12>=baseWidth||b.left-12>=baseWidth)
      const width=b&&!beside?Math.min(baseWidth,Math.max(140,Math.min(b.right,innerWidth-8)-Math.max(b.left,8)-32)):baseWidth
      panel.style.width=`${width}px`
      panel.style.maxHeight=`${b&&!beside?Math.max(80,Math.min(b.bottom,innerHeight-8)-Math.max(b.top,8)-32):innerHeight-16}px`
      const preferred=b&&beside?(innerWidth-b.right-12>=width?b.right+12:b.left-width-12):b?Math.min(b.right,innerWidth-8)-width-16:innerWidth-width-12
      panel.style.left=`${Math.max(8,Math.min(preferred,innerWidth-width-8))}px`
      panel.style.top=`${Math.max(8,Math.min(b?(beside?b.top:Math.max(b.top,8)+16):70,innerHeight-panel.getBoundingClientRect().height-8))}px`
    }
    position();panel.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary')?.focus({preventScroll:true})
    const observer=new ResizeObserver(position);observer.observe(panel);window.addEventListener('resize',position);window.addEventListener('scroll',position,true)
    const frameElement=targetId?document.querySelector(`[data-frame-id="${CSS.escape(targetId)}"]`):null,frameObserver=new MutationObserver(position)
    if(frameElement)frameObserver.observe(frameElement,{attributes:true,attributeFilter:['style']})
    return()=>{observer.disconnect();frameObserver.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true)}
  },[localProperties,targetId])
  useEffect(()=>{
    const close=(e:Event)=>{const d=menuRef.current;if(!d?.open)return;if(e instanceof KeyboardEvent&&e.key==='Escape'){d.open=false;d.querySelector('summary')?.focus()}else if(e.type==='pointerdown'&&!d.contains(e.target as Node))d.open=false}
    document.addEventListener('pointerdown',close,true);document.addEventListener('keydown',close)
    return()=>{document.removeEventListener('pointerdown',close,true);document.removeEventListener('keydown',close)}
  },[])
  const context=<details ref={menuRef} className="geometry-frame-menu" data-frame-chrome="" data-geometry-transient="" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <summary aria-label="Çərçivə menyusu" aria-haspopup="menu">⋮</summary>
    <div className="geometry-frame-menu__items"><button type="button" onClick={openProperties}>Xassələr</button>{menu}</div>
  </details>
  const fields=<div className="geometry-properties-content" data-geometry-transient="" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>{properties}</div>
  return <>
    {frame?frameHost?createPortal(<div className="geometry-frame-menu__items" data-geometry-transient="" onClick={event=>{event.stopPropagation();if((event.target as HTMLElement).closest('button'))frame.closeMenu?.()}}><button type="button" onClick={openProperties}>Xassələr</button>{menu}</div>,frameHost):null:<div className="geometry-editor-local-chrome">{context}</div>}
    {createPortal(<dialog ref={panelRef} open={localProperties} className="geometry-properties-dialog" aria-label="Həndəsə xassələri" data-geometry-properties-owner={targetId??''} data-frame-chrome="" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onKeyDownCapture={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeProperties()}}} onCancel={closeProperties}><header><strong>Həndəsə xassələri</strong><button type="button" onClick={closeProperties}>Xassələri bağla</button></header>{fields}</dialog>,document.body)}
    {session?.geometryStatusHost?createPortal(status,session.geometryStatusHost):<div className="geometry-editor-local-status" data-frame-chrome="">{status}</div>}
  </>
}
