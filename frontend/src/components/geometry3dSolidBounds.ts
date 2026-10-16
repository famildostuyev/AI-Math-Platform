import type {GeometryCamera3D,GeometryScene3D} from './geometry3dContract'
import {solidBounds3D} from './geometry3dSolidAuthoring'
import {createProjection3D} from './geometry3dProjection'

/** Shared drawing/picking positions. Handles sit outside semantic vertices, with short leaders. */
export function projectedSolidBounds3D(scene:GeometryScene3D,camera:GeometryCamera3D,width:number,height:number,id:string){
  try{
    const bounds=solidBounds3D(scene,id);if(!bounds)return null
    const projection=createProjection3D(camera,width,height),center=projection.screen(projection.view(bounds.pivot))
    const vertices=scene.points.filter(p=>projection.visible(p.position)).map(p=>projection.screen(projection.view(p.position)))
    const lines=bounds.edges.flatMap(([a,b])=>{const clipped=projection.line(bounds.corners[a],bounds.corners[b],'segment');return clipped?[clipped.map(v=>projection.screen(v))]:[]})
    const handles=bounds.corners.flatMap((world,index)=>{
      if(!projection.visible(world))return []
      const screen=projection.screen(projection.view(world)),dx=screen[0]-center[0],dy=screen[1]-center[1],length=Math.hypot(dx,dy)
      if(length<8)return []
      for(const offset of [16,24,32]){
        const x=screen[0]+dx/length*offset,y=screen[1]+dy/length*offset
        if(x<9||y<9||x>width-9||y>height-9||vertices.some(v=>Math.hypot(v[0]-x,v[1]-y)<13))continue
        return [{index,world,screen,x,y,depth:screen[2]}]
      }
      return []
    }).sort((a,b)=>a.depth-b.depth||a.index-b.index).filter((h,i,all)=>!all.slice(0,i).some(v=>Math.hypot(v.x-h.x,v.y-h.y)<18))
    return {...bounds,lines,handles}
  }catch{return null}
}
