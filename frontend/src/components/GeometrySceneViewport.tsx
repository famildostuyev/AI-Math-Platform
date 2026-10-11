import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GeometryCamera3D, GeometryScene3D, Vec3 } from './geometry3dContract'
import { normalizeGeometryEditingCamera3D } from './geometry3d'
import { createProjection3D, geometrySceneSVG3D, scenePrimitives3D, sub, unit, cross, dot } from './geometry3dProjection'
import './GeometrySceneViewport.css'

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    const item = object as THREE.Mesh
    item.geometry?.dispose()
    if (Array.isArray(item.material)) item.material.forEach(m=>m.dispose()); else item.material?.dispose()
  })
  group.clear()
}
function populate(group: THREE.Group, source: GeometryScene3D, camera: GeometryCamera3D, width: number, height: number) {
  disposeGroup(group)
  const adapter=scenePrimitives3D(source), projection=createProjection3D(camera,width,height)
  const geometry = (vertices: Vec3[]) => new THREE.BufferGeometry().setFromPoints(vertices.map(v=>new THREE.Vector3(...v)))
  for (const p of adapter.primitives) {
    let object: THREE.Object3D | null = null
    if(p.kind==='point') object=new THREE.Points(geometry([p.position]),new THREE.PointsMaterial({color:0x2563eb,size:6,sizeAttenuation:false}))
    else if('a' in p) {
      const clipped=projection.line(p.a,p.b,p.kind)
      if(clipped) {
        object=new THREE.Line(geometry(clipped.map(projection.world)),new THREE.LineBasicMaterial({color:0x334155}))
        if(p.kind==='vector' && projection.visible(p.b)) {
          const direction=new THREE.Vector3(...sub(p.b,p.a)).normalize(), length=Math.hypot(...sub(p.b,p.a)), head=Math.min(length*.2,camera.vertical_span*.025)
          const arrow=new THREE.ArrowHelper(direction,new THREE.Vector3(...p.a),length,0x334155,head,head*.5)
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
        object=new THREE.Mesh(meshGeometry,new THREE.MeshBasicMaterial({color:0xcbd5e1,side:THREE.DoubleSide,transparent:true,opacity:p.kind==='plane'?.15:.35,depthWrite:false}))
        const outline=new THREE.LineLoop(geometry(vertices),new THREE.LineBasicMaterial({color:0x94a3b8})); outline.userData.semanticId=p.id; group.add(outline)
      }
    }
    if(object) { object.userData.semanticId=p.id; group.add(object) }
  }
}

export default function GeometrySceneViewport({ scene, camera, interactive=false, onNavigate }: {
  scene: GeometryScene3D; camera: GeometryCamera3D; interactive?: boolean; onNavigate?: (camera: GeometryCamera3D)=>void
}) {
  const host=useRef<HTMLDivElement>(null), callback=useRef(onNavigate), cameraRef=useRef(camera)
  callback.current=onNavigate; cameraRef.current=camera
  const [size,setSize]=useState({width:520,height:300}), [failure,setFailure]=useState(false)
  const adapter=useMemo(()=>scenePrimitives3D(scene),[scene])
  const svg=useMemo(()=>{try{return geometrySceneSVG3D(scene,size.width,size.height)}catch{return ''}},[scene,size])
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
  const controller=useRef<{ setCamera:(camera:GeometryCamera3D)=>void } | null>(null)
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
      const draw=()=>{ frame=0; if(dead)return; try { populate(group!,scene,current,width,height); renderer!.render(world,view);renderer!.domElement.dataset.renderCount=String(Number(renderer!.domElement.dataset.renderCount ?? 0)+1) } catch { setFailure(true) } }
      const request=()=>{if(!frame&&!dead)frame=requestAnimationFrame(draw)}
      const changed=()=>{
        if(suppress || dead)return
        const candidate={...current,position:view.position.toArray() as Vec3,target:controls!.target.toArray() as Vec3,up:view.up.toArray() as Vec3,vertical_span:view instanceof THREE.OrthographicCamera ? (view.top-view.bottom)/view.zoom : current.vertical_span}
        const next=normalizeGeometryEditingCamera3D(candidate)
        if(next) {current=next;callback.current?.(structuredClone(next));request()}
      }
      const bind=()=>{
        controls=new OrbitControls(view,renderer!.domElement); controls.target.set(...current.target)
        controls.enableDamping=false; controls.minDistance=Math.max(current.near*2,0.001); controls.maxDistance=Math.min(current.far*.8,1e10); controls.minZoom=0.001; controls.maxZoom=1e6
        suppress=true;controls.update();suppress=false;controls.addEventListener('change',changed)
      }
      configure();bind()
      controller.current={setCamera(next){
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
  },[scene,interactive,adapter.status])
  useEffect(()=>{controller.current?.setCamera(camera)},[camera])
  return <div className="geometry-3d-view" data-geometry-version="2" data-render-status={adapter.status}>
    <div ref={host} className="geometry-3d-viewport" data-webgl-fallback={failure} data-editing-camera={JSON.stringify(camera)}
      onPointerDown={event=>{if(interactive)event.stopPropagation()}} onWheel={event=>{if(interactive)event.stopPropagation()}} onContextMenu={event=>{if(interactive)event.preventDefault()}}>
      <div className={`geometry-3d-static${interactive&&!failure&&adapter.status==='ok'?' is-print-only':''}`} dangerouslySetInnerHTML={{__html:svg}} />
      {interactive&&!failure&&<div className="geometry-3d-labels" aria-hidden="true">{labels.map(label=><span key={label.id} data-label-id={label.id} style={{left:label.x,top:label.y}}>{label.text}</span>)}</div>}
    </div>
    {adapter.status==='invalid' && <p role="alert">Səhnənin hesablanması etibarsızdır.</p>}
    {adapter.status==='unavailable' && <p role="status">Bu səhnənin hesablanması hələ əlçatan deyil. Məlumatlar qorunur.</p>}
    {adapter.status==='ok' && !adapter.primitives.length && <p role="status">3D səhnə boşdur.</p>}
    {interactive&&failure&&<p role="status">WebGL əlçatan deyil. Saxlanılan sual görünüşünün statik təsviri göstərilir; səhnə məlumatları qorunur.</p>}
  </div>
}
