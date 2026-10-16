import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { normalizeGeometryEditingCamera3D } from './geometry3d'
import { createProjection3D, geometrySceneSVG3D, scenePrimitives3D, displayPrimitives3D, projectScene3D, projectedEdgeStrokes3D, sub, unit, cross, dot } from './geometry3dProjection'
import './GeometrySceneViewport.css'
import type { Pointer3D, PointerPhase3D } from './geometry3dAuthoring'
import { pickGeometry3D } from './geometry3dAuthoring'
import { GeometryFrameMenuContext } from './GeometryEditorPanels'
import { projectedSolidBounds3D } from './geometry3dSolidBounds'

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    const item = object as THREE.Mesh
    item.geometry?.dispose()
    if (Array.isArray(item.material)) item.material.forEach(m=>m.dispose()); else item.material?.dispose()
  })
  group.clear()
}
function populate(group: THREE.Group, source: GeometryScene3D, camera: GeometryCamera3D, width: number, height: number, highlighted: Set<string>) {
  disposeGroup(group)
  const adapter=scenePrimitives3D(source), display=displayPrimitives3D(adapter.primitives), projection=createProjection3D(camera,width,height)
  const geometry = (vertices: Vec3[]) => new THREE.BufferGeometry().setFromPoints(vertices.map(v=>new THREE.Vector3(...v)))
  for(const stroke of projectedEdgeStrokes3D(projectScene3D(source,camera,width,height,true),camera.projection)){
    if(!stroke.viewA||!stroke.viewB)continue
    const vertices=[stroke.viewA,stroke.viewB].map(projection.world),pixelLength=Math.hypot(stroke.b[0]-stroke.a[0],stroke.b[1]-stroke.a[1])
    if(pixelLength<=1e-6)continue
    const color=highlighted.has(stroke.id)||display.aliases.get(stroke.id)?.some(id=>highlighted.has(id))?0xf97316:0x334155,perPixel=Math.hypot(...sub(vertices[1],vertices[0]))/pixelLength
    const material=stroke.hidden?new THREE.LineDashedMaterial({color,dashSize:4*perPixel,gapSize:3*perPixel,transparent:true,opacity:.45,depthTest:false}):new THREE.LineBasicMaterial({color,transparent:true,depthTest:false})
    const line=new THREE.Line(geometry(vertices),material);if(stroke.hidden)line.computeLineDistances()
    line.userData.semanticId=stroke.id;line.renderOrder=stroke.hidden?2:3;group.add(line)
  }
  for (const p of display.primitives) {
    const color=highlighted.has(p.id)||display.aliases.get(p.id)?.some(id=>highlighted.has(id))?0xf97316:0x334155
    let object: THREE.Object3D | null = null
    if(p.kind==='point') object=new THREE.Points(geometry([p.position]),new THREE.PointsMaterial({color:highlighted.has(p.id)?0xf97316:0x2563eb,size:highlighted.has(p.id)?10:6,sizeAttenuation:false}))
    else if('a' in p) {
      const clipped=projection.line(p.a,p.b,p.kind)
      if(clipped) {
        if(p.kind==='vector' && projection.visible(p.b)) {
          const direction=new THREE.Vector3(...sub(p.b,p.a)).normalize(), length=Math.hypot(...sub(p.b,p.a)), head=Math.min(length*.2,camera.vertical_span*.025)
          const arrow=new THREE.ArrowHelper(direction,new THREE.Vector3(...p.a),length,color,head,head*.5)
          arrow.userData.semanticId=p.id; group.add(arrow)
        }
      }
    } else {
      const vertices=p.kind==='plane' ? projection.planePatch(p.vertices) : p.vertices
      if(vertices.length>=3) {
        const x=unit(sub(vertices[1],vertices[0])), n=unit(cross(x,sub(vertices[2],vertices[0]))), y=cross(n,x)
        const contour=vertices.map(v=>{ const d=sub(v,vertices[0]); return new THREE.Vector2(dot(d,x),dot(d,y)) })
        const triangles=THREE.ShapeUtils.triangulateShape(contour,[])
        const meshGeometry=geometry(vertices); meshGeometry.setIndex(triangles.flat()); meshGeometry.computeVertexNormals()
        object=new THREE.Mesh(meshGeometry,new THREE.MeshBasicMaterial({color:highlighted.has(p.id)?0xf97316:0xcbd5e1,side:THREE.DoubleSide,transparent:true,opacity:p.kind==='plane'?.15:.35,depthWrite:false}))
        if(p.outline!==false){const outline=new THREE.LineLoop(geometry(vertices),new THREE.LineBasicMaterial({color:0x94a3b8})); outline.userData.semanticId=p.id; group.add(outline)}
      }
    }
    if(object) { object.userData.semanticId=p.id; group.add(object) }
  }
}

export default function GeometrySceneViewport({ scene, camera, cameraOrigin, interactive=false, onNavigate, onInteraction, onContextSelect, highlightedIds=[], interactionTool='camera', constructionPreview=[], selectedSolidId }: {
  scene: GeometryScene3D; camera: GeometryCamera3D; cameraOrigin?: symbol; interactive?: boolean; onNavigate?: (camera: GeometryCamera3D, origin: symbol)=>void
  onInteraction?: (phase:PointerPhase3D,pointer:Pointer3D)=>boolean; highlightedIds?:string[]; interactionTool?:string
  onContextSelect?: (id:string|null)=>void
  constructionPreview?:Vec3[]
  selectedSolidId?:string
}) {
  const host=useRef<HTMLDivElement>(null), callback=useRef(onNavigate), cameraRef=useRef(camera)
  const navigationOrigin=useRef(Symbol('OrbitControls navigation'))
  const captureAt=useContext(GeometryFrameMenuContext)?.captureAt,contextCallback=useRef(onContextSelect)
  contextCallback.current=onContextSelect
  const sceneRef=useRef(scene), highlightedRef=useRef(highlightedIds), interactionRef=useRef(onInteraction)
  sceneRef.current=scene;highlightedRef.current=highlightedIds;interactionRef.current=onInteraction
  callback.current=onNavigate; cameraRef.current=camera
  const [size,setSize]=useState({width:520,height:300}), [failure,setFailure]=useState(false)
  const failureRef=useRef(failure);failureRef.current=failure
  const adapter=useMemo(()=>scenePrimitives3D(scene),[scene])
  const solidBounds=useMemo(()=>interactive&&selectedSolidId?projectedSolidBounds3D(scene,camera,size.width,size.height,selectedSolidId):null,[scene,camera,size,interactive,selectedSolidId])
  const svg=useMemo(()=>{try{return geometrySceneSVG3D(scene,size.width,size.height)}catch{return ''}},[scene,size])
  const screenSVG=useMemo(()=>{if(interactive)return '';try{return geometrySceneSVG3D({...scene,print_camera:camera},size.width,size.height)}catch{return ''}},[scene,camera,size,interactive])
  const previewPoints=useMemo(()=>{
    try{const projection=createProjection3D(camera,size.width,size.height);return constructionPreview.every(p=>projection.visible(p))?constructionPreview.map(p=>projection.screen(projection.view(p))):[]}catch{return []}
  },[constructionPreview,camera,size])
  const labels=useMemo(()=>{
    const output: {id:string;text:string;x:number;y:number}[]=[]
    try {
      const projection=createProjection3D(camera,size.width,size.height)
      for(const point of adapter.primitives) if(point.kind==='point'&&point.label&&projection.visible(point.position)) {
        const position=projection.screen(projection.view(point.position));output.push({id:point.id,text:point.label,x:position[0]+6,y:position[1]-18})
      }
    } catch { /* Invalid input is handled by the scene/fallback status below. */ }
    return output
  },[adapter,camera,size])
  const controller=useRef<{ setCamera:(camera:GeometryCamera3D)=>void; refresh:()=>void } | null>(null)
  useEffect(()=>{
    if(!captureAt||!interactive)return
    const pick=(event:MouseEvent)=>{
      const element=host.current;if(!element)return ()=>{}
      const box=element.getBoundingClientRect(),inside=element.contains(event.target as Node)
      const hit=inside&&!failureRef.current?pickGeometry3D(sceneRef.current,cameraRef.current,{x:event.clientX-box.left,y:event.clientY-box.top,width:box.width,height:box.height}):null
      // Capture the semantic result now; release coordinates must not retarget it.
      return ()=>contextCallback.current?.(hit?.id??null)
    }
    captureAt.current=pick
    return()=>{if(captureAt.current===pick)captureAt.current=null}
  },[captureAt,interactive])
  useEffect(()=>{
    const element=host.current;if(!element||!interactive)return
    const listeners: [string,EventListener][]=[]
    let owned:number|null=null
    for(const [name,phase] of [['pointerdown','down'],['pointermove','move'],['pointerup','up'],['pointercancel','cancel'],['lostpointercapture','cancel'],['wheel','wheel']] as [string,PointerPhase3D][]){
      const listener:EventListener=event=>{
        // Static fallback uses the saved camera; do not author through a different session camera.
        if(failureRef.current)return
        const input=event as PointerEvent,box=element.getBoundingClientRect()
        const pointer={pointerId:input.pointerId,button:input.button,x:input.clientX-box.left,y:input.clientY-box.top,width:box.width,height:box.height,altKey:input.altKey,shiftKey:input.shiftKey}
        const handled=interactionRef.current?.(phase,pointer)
        if(!handled)return
        event.preventDefault();event.stopImmediatePropagation()
        if(phase==='down'){owned=input.pointerId;element.focus({preventScroll:true});element.setPointerCapture(input.pointerId)}
        if((phase==='up'||phase==='cancel')&&owned!==null){const id=owned;owned=null;if(element.hasPointerCapture(id))element.releasePointerCapture(id)}
      }
      listeners.push([name,listener]);element.addEventListener(name,listener,{capture:true,passive:false})
    }
    return ()=>{listeners.forEach(([name,listener])=>element.removeEventListener(name,listener,true));if(owned!==null&&element.hasPointerCapture(owned))element.releasePointerCapture(owned)}
  },[interactive])
  useEffect(()=>{
    const element=host.current; if(!element)return
    const observer=new ResizeObserver(entries=>{const box=entries[0].contentRect; if(box.width>0&&box.height>0)setSize({width:box.width,height:box.height})})
    observer.observe(element); return ()=>observer.disconnect()
  },[])
  useEffect(()=>{
    const element=host.current
    if(!element || !interactive || adapter.status!=='ok')return
    let renderer: THREE.WebGLRenderer | undefined, controls: OrbitControls | undefined, observer: ResizeObserver | undefined, group: THREE.Group | undefined
    let frame=0, dead=false, current=structuredClone(cameraRef.current), width=element.clientWidth || 520, height=element.clientHeight || 300, suppress=false
    let lost: ((event:Event)=>void) | undefined
    try {
      renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); renderer.setClearColor(0xffffff,1)
      element.appendChild(renderer.domElement)
      const world=new THREE.Scene(); group=new THREE.Group(); world.add(group)
      let view: THREE.OrthographicCamera | THREE.PerspectiveCamera
      const makeCamera=()=> current.projection==='orthographic' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera()
      view=makeCamera()
      const configure=()=>{
        const aspect=width/height
        if(view instanceof THREE.OrthographicCamera) { view.top=current.vertical_span/2; view.bottom=-view.top; view.right=view.top*aspect; view.left=-view.right; view.zoom=1 }
        else { view.aspect=aspect; view.fov=current.fov_degrees }
        view.near=current.near; view.far=current.far; view.position.set(...current.position); view.up.set(...current.up); view.lookAt(new THREE.Vector3(...current.target)); view.updateProjectionMatrix()
      }
      const draw=()=>{ frame=0; if(dead)return; try { populate(group!,sceneRef.current,current,width,height,new Set(highlightedRef.current)); renderer!.render(world,view);renderer!.domElement.dataset.renderCount=String(Number(renderer!.domElement.dataset.renderCount ?? 0)+1) } catch { setFailure(true) } }
      const request=()=>{if(!frame&&!dead)frame=requestAnimationFrame(draw)}
      const changed=()=>{
        if(suppress || dead)return
        const candidate={...current,position:view.position.toArray() as Vec3,target:controls!.target.toArray() as Vec3,up:view.up.toArray() as Vec3,vertical_span:view instanceof THREE.OrthographicCamera ? (view.top-view.bottom)/view.zoom : current.vertical_span}
        const next=normalizeGeometryEditingCamera3D(candidate)
        if(next) {current=next;callback.current?.(structuredClone(next),navigationOrigin.current);request()}
      }
      const bind=()=>{
        controls=new OrbitControls(view,renderer!.domElement); controls.target.set(...current.target)
        controls.enableDamping=false; controls.minDistance=Math.max(current.near*2,0.001); controls.maxDistance=Math.min(current.far*.8,1e10); controls.minZoom=0.001; controls.maxZoom=1e6
        suppress=true;controls.update();suppress=false;controls.addEventListener('change',changed)
      }
      configure();bind()
      controller.current={refresh:request,setCamera(next){
        current=structuredClone(next)
        const switchProjection=(view instanceof THREE.OrthographicCamera)!==(current.projection==='orthographic')
        suppress=true
        if(switchProjection){controls!.removeEventListener('change',changed);controls!.dispose();view=makeCamera();configure();bind()}
        else {configure();controls!.target.set(...current.target);controls!.update()}
        suppress=false;request()
      }}
      observer=new ResizeObserver(entries=>{const box=entries[0].contentRect;if(box.width<=0||box.height<=0)return; width=box.width;height=box.height;renderer!.setSize(width,height,false);configure();request()})
      observer.observe(element);renderer.setSize(width,height,false)
      lost=event=>{event.preventDefault();setFailure(true);controls!.enabled=false}
      renderer.domElement.addEventListener('webglcontextlost',lost)
      setFailure(false);request()
    } catch {setFailure(true)}
    return ()=>{
      dead=true;cancelAnimationFrame(frame);observer?.disconnect();controller.current=null
      controls?.dispose();if(group)disposeGroup(group)
      if(renderer){if(lost)renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.domElement.remove()}
    }
  },[interactive,adapter.status])
  useEffect(()=>{
    // React may commit an older navigation snapshot after the controls have moved again.
    // Only external commands write back; navigation echoes update the editor/session only.
    if(cameraOrigin!==navigationOrigin.current)controller.current?.setCamera(camera)
  },[camera,cameraOrigin])
  useEffect(()=>{controller.current?.refresh()},[scene,highlightedIds])
  return <div className="geometry-3d-view" data-geometry-version="2" data-render-status={adapter.status}>
    <div ref={host} tabIndex={interactive?0:undefined} className="geometry-3d-viewport" data-interaction-tool={interactionTool} data-webgl-fallback={failure} data-editing-camera={JSON.stringify(camera)}
      onPointerDown={event=>{if(interactive)event.stopPropagation()}} onWheel={event=>{if(interactive)event.stopPropagation()}} onContextMenu={event=>{if(interactive)event.preventDefault()}}>
      <div className={`geometry-3d-static geometry-3d-print${interactive&&failure?'':' is-print-only'}`} dangerouslySetInnerHTML={{__html:svg}} />
      {!interactive&&<div className="geometry-3d-static geometry-3d-screen" dangerouslySetInnerHTML={{__html:screenSVG}} />}
      {interactive&&!failure&&<div className="geometry-3d-labels" aria-hidden="true">{labels.map(label=><span key={label.id} data-label-id={label.id} style={{left:label.x,top:label.y}}>{label.text}</span>)}</div>}
      {interactive&&!failure&&solidBounds&&<svg className="geometry-3d-solid-bounds" data-solid-bounds={selectedSolidId} aria-hidden="true" viewBox={`0 0 ${size.width} ${size.height}`}>
        {solidBounds.lines.map(([a,b],i)=><line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0891b2" strokeWidth="1" strokeDasharray="3 3"/>)}
        {solidBounds.handles.map(h=><g key={h.index}>
          <line x1={h.screen[0]} y1={h.screen[1]} x2={h.x} y2={h.y} stroke="#0891b2" strokeWidth="1"/>
          <rect data-resize-handle={h.index} x={h.x-4} y={h.y-4} width="8" height="8" rx="1" fill={interactionTool==='select'?'white':'#e0f2fe'} stroke="#0891b2" strokeWidth="2"/>
        </g>)}
      </svg>}
      {interactive&&!failure&&previewPoints.length>0&&<svg className="geometry-3d-construction-preview" aria-hidden="true" viewBox={`0 0 ${size.width} ${size.height}`}>
        <polyline points={previewPoints.map(p=>`${p[0]},${p[1]}`).join(' ')} fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5 3"/>
        {previewPoints.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="5" fill={i===0?'#f97316':'white'} stroke="#f97316"/>)}
      </svg>}
    </div>
    {adapter.status==='invalid' && <p role="alert">Səhnənin hesablanması etibarsızdır.</p>}
    {adapter.status==='unavailable' && <p role="status">Bu səhnənin hesablanması hələ əlçatan deyil. Məlumatlar qorunur.</p>}
    {adapter.status==='ok' && !adapter.primitives.length && <p role="status">3D səhnə boşdur.</p>}
    {interactive&&failure&&<p role="status">WebGL əlçatan deyil. Saxlanılan sual görünüşünün statik təsviri göstərilir; səhnə məlumatları qorunur.</p>}
  </div>
}
