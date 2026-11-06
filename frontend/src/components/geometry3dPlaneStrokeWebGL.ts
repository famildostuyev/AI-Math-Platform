import {LineMaterial} from 'three/addons/lines/LineMaterial.js'
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js'
import {LineSegments2} from 'three/addons/lines/LineSegments2.js'
import type {ProjectedLine3D,Projection3D} from './geometry3dProjection'
import type {ResolvedPlaneStroke3D} from './geometry3dPlaneStroke'
import {effectivePlaneBoundaryOwner3D,planeBoundaryIntervalShown3D,planeOutlineKey3D,projectedPlaneBoundaryStrokes3D} from './geometry3dProjection'
import type {projectScene3D,PlaneBoundaryStrokeOwner3D,ProjectedFace3D} from './geometry3dProjection'
import type {GeometryPlane3D} from './geometry3dContract'
import {planeShowsHiddenEdges3D} from './geometry3dPlaneDisplay'

/** Same replacement/owner policy as SVG, without changing its drawing path.
 * Only owners whose visibility changes are redirected from the legacy path.
 * Coincident outlined contours retain one painter-order representative and all
 * provenance. Geometry and hidden intervals come exclusively from the classifier.
 */
export function planeBoundaryVisibilityWebGL3D(projected:ReturnType<typeof projectScene3D>,aliases:ReadonlyMap<string,readonly string[]>,planes?:ReadonlyMap<string,GeometryPlane3D>){
  type Classified=ReturnType<typeof projectedPlaneBoundaryStrokes3D>[number]
  const batches:{lines:Classified[];style:ResolvedPlaneStroke3D;outline:boolean;aliases:string[]}[]=[],replaced=new Set<string>()
  if(new Set(projected.faces.filter(f=>f.kind==='plane').map(f=>f.id)).size<2&&![...(planes?.values()??[])].some(p=>!planeShowsHiddenEdges3D(p)))return {batches,replaced}
  const mode=projected.projection.camera.projection
  const classified=projectedPlaneBoundaryStrokes3D(projected,mode,aliases),baseline=projectedPlaneBoundaryStrokes3D(projected,mode,aliases,{planeOcclusion:false})
  const signatures=(lines:Classified[])=>{
    const groups=new Map<string,string[]>()
    for(const l of lines){const parts=groups.get(l.id)??[];parts.push(JSON.stringify([l.a,l.b,l.hidden]));groups.set(l.id,parts)}
    return new Map([...groups].map(([id,parts])=>[id,JSON.stringify(parts.sort())]))
  }
  const old=signatures(baseline)
  for(const [id,value] of signatures(classified))if(value!==old.get(id))replaced.add(id)
  const groups=new Map<string,ProjectedFace3D[]>(),outlines=new Map<string,readonly PlaneBoundaryStrokeOwner3D[]>()
  const sorted=[...projected.faces].sort((a,b)=>b.vertices.reduce((s,p)=>s+p[2],0)/b.vertices.length-a.vertices.reduce((s,p)=>s+p[2],0)/a.vertices.length||a.id.localeCompare(b.id))
  for(const face of sorted)if(face.kind==='plane'&&face.outline!==false){const key=planeOutlineKey3D(face);groups.set(key,[...(groups.get(key)??[]),face])}
  for(const group of groups.values())if(group.some(f=>replaced.has(f.id))||(!planeBoundaryIntervalShown3D(true,group.flatMap(f=>f.planeBoundaries??[]),planes)&&classified.some(l=>l.hidden&&group.some(f=>f.id===l.id)&&l.planeBoundaries?.some(o=>o.representation==='outline')))){
    group.forEach(f=>replaced.add(f.id))
    outlines.set(group[group.length-1].id,group.flatMap(f=>f.planeBoundaries??[]))
  }
  const batchByKey=new Map<string,(typeof batches)[number]>()
  for(const line of classified){
    if(!replaced.has(line.id))continue
    const outline=!!line.planeBoundaries?.some(o=>o.representation==='outline')
    const owners=outline?outlines.get(line.id):line.planeBoundaries
    if(!owners?.length)continue
    if(!planeBoundaryIntervalShown3D(line.hidden,owners,planes))continue
    const style=effectivePlaneBoundaryOwner3D(owners)!.stroke
    const selectionAliases=[...new Set([...line.selectionAliases,...owners.flatMap(o=>[o.ownerId,...(aliases.get(o.ownerId)??[])])])].sort()
    const key=JSON.stringify([line.id,outline,line.hidden,owners]),existing=batchByKey.get(key)
    const stroke={...line,planeBoundaries:owners,selectionAliases}
    if(existing)existing.lines.push(stroke)
    else {const batch={lines:[stroke],style,outline,aliases:selectionAliases};batchByKey.set(key,batch);batches.push(batch)}
  }
  return {batches,replaced}
}

/** Only display centerlines are subdivided. Pixel-space dash splitting avoids
 * perspective-dependent world-space dash lengths and allows round dotted caps.
 * Native one-pixel lines remain the viewport's unstyled legacy path.
 */
export type PlaneStrokeLine3D=ProjectedLine3D&{hidden?:boolean}
export function planeStrokeWebGL3D(input:PlaneStrokeLine3D|readonly PlaneStrokeLine3D[],stroke:ResolvedPlaneStroke3D,projection:Projection3D,width:number,height:number,options:{color?:string|number;outline?:boolean;aliases?:readonly string[];planeVisibility?:boolean}={}){
  const lines:readonly PlaneStrokeLine3D[]=Array.isArray(input)?input:[input as PlaneStrokeLine3D],line=lines[0]
  if(!line)return null
  // V2.3B.1 SVG policy: hidden solid/legacy 4/3; stored dashed/dotted
  // width-scaled dash-dot 6/3/1/3. This never rewrites persistent styling.
  const pattern=options.planeVisibility&&line.hidden?(stroke.source==='stored'&&stroke.style!=='solid'?[6,3,1,3].map(v=>v*stroke.width):[4,3]):line.hidden?(stroke.legacyHidden?.dashArray??stroke.pattern.dashArray):stroke.pattern.dashArray
  const cap=line.hidden?'butt':stroke.pattern.lineCap,opacity=line.hidden?(stroke.legacyHidden?.opacity??.45):1
  const positions:number[]=[],runs:{length:number;phase:number;intervals:[number,number][]}[]=[]
  for(const line of lines){
   if(!line.viewA||!line.viewB)continue
   const length=Math.hypot(line.b[0]-line.a[0],line.b[1]-line.a[1]);if(length<=1e-6)continue
   const intervals:[number,number][]=[]
   if(!pattern.length)intervals.push([0,length])
   else{
    const period=pattern.reduce((sum,v)=>sum+v,0),offset=line.dashOffset??0,phase=((offset%period)+period)%period
    for(let start=-phase;start<length;start+=period){
      let cursor=start
      for(let i=0;i<pattern.length;i+=2){const a=Math.max(0,cursor),b=Math.min(length,cursor+pattern[i]);if(b-a>1e-9)intervals.push([a,b]);cursor+=pattern[i]+pattern[i+1]}
    }
   }
   const world=(distance:number)=>{
    const t=distance/length,u=projection.camera.projection==='perspective'?t*line.a[2]/((1-t)*line.b[2]+t*line.a[2]):t
    return projection.world(line.viewA!.map((v,i)=>v+u*(line.viewB![i]-v)) as [number,number,number])
   }
   for(const [a,b] of intervals)positions.push(...world(a),...world(b))
   runs.push({length,phase:line.dashOffset??0,intervals})
  }
  if(!positions.length)return null
  const geometry=new LineSegmentsGeometry();geometry.setPositions(positions)
  // USE_DASH strips the add-on's round endcaps. With zero gap it paints every
  // pre-split segment continuously, providing butt caps without shader patches.
  const depthTest=!!options.outline&&!(options.planeVisibility&&line.hidden)
  const material=new LineMaterial({color:options.color??stroke.color,worldUnits:false,dashed:cap==='butt',dashSize:1,gapSize:0,depthTest,depthWrite:depthTest,transparent:!options.outline||opacity<1,opacity})
  material.linewidth=stroke.width;material.resolution.set(width,height)
  const object=new LineSegments2(geometry,material);object.computeLineDistances()
  object.userData.semanticId=line.id
  object.userData.selectionAliases=[...(options.aliases??[])]
  object.userData.planeBoundaries=line.planeBoundaries
  object.userData.planeStroke=stroke
  object.userData.strokeRuns=runs
  if(options.planeVisibility){object.userData.planeBoundaryVisibility=line.hidden?'hidden':'visible';object.userData.strokePattern=[...pattern]}
  object.renderOrder=options.planeVisibility&&line.hidden?2:options.outline?0:line.hidden?2:3
  return object
}
