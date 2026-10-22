import type {GeometryCamera3D,GeometryScene3D,Vec3} from './geometry3dContract'
import {solidBounds3D} from './geometry3dSolidAuthoring'
import {createProjection3D,add,scale,cross,unit} from './geometry3dProjection'

/** Shared drawing/picking positions. Handles sit outside semantic vertices, with short leaders. */
export function projectedSolidBounds3D(scene:GeometryScene3D,camera:GeometryCamera3D,width:number,height:number,id:string){
  try{
    const bounds=solidBounds3D(scene,id);if(!bounds)return null
    const projection=createProjection3D(camera,width,height),center=projection.screen(projection.view(bounds.pivot))
    const vertices=scene.points.filter(p=>projection.visible(p.position)).map(p=>projection.screen(projection.view(p.position)))
    const lines=bounds.edges.flatMap(([a,b])=>{const clipped=projection.line(bounds.corners[a],bounds.corners[b],'segment');return clipped?[clipped.map(v=>projection.screen(v))]:[]})
    const solid=scene.solids.find(s=>s.id===id)
    const dimensions: {world:Vec3;index:number;kind:'radius'|'height';direction:Vec3;length:number}[]=[]
    if(solid?.mode==='parametric'&&solid.kind==='sphere'){
      // Every radius direction is valid for a sphere. Camera-right gives one
      // well-conditioned handle even when a local axis points toward the eye.
      const direction=unit(add(projection.world([1,0,0]),scale(projection.world([0,0,0]),-1)))
      dimensions.push({index:8,kind:'radius',direction,length:solid.parameters.radius,world:add(bounds.pivot,scale(direction,solid.parameters.radius))})
    }
    if(solid?.mode==='parametric'&&solid.kind==='cylinder'){
      for(const [i,direction] of [solid.frame.x_axis,solid.frame.y_axis,scale(solid.frame.x_axis,-1),scale(solid.frame.y_axis,-1)].entries()){
        dimensions.push({index:8+i,kind:'radius',direction,length:solid.parameters.radius,world:add(bounds.pivot,scale(direction,solid.parameters.radius))})
      }
      const axis=unit(cross(solid.frame.x_axis,solid.frame.y_axis))
      for(const sign of [1,-1]){const direction=scale(axis,sign);dimensions.push({index:sign===1?12:13,kind:'height',direction,length:solid.parameters.height/2,world:add(bounds.pivot,scale(direction,solid.parameters.height/2))})}
    }
    if(solid?.mode==='parametric'&&solid.kind==='cone'){
      for(const [i,direction] of [solid.frame.x_axis,solid.frame.y_axis,scale(solid.frame.x_axis,-1),scale(solid.frame.y_axis,-1)].entries())dimensions.push({index:8+i,kind:'radius',direction,length:solid.parameters.radius,world:add(solid.frame.origin,scale(direction,solid.parameters.radius))})
      dimensions.push({index:13,kind:'height',direction:scale(unit(cross(solid.frame.x_axis,solid.frame.y_axis)),-1),length:solid.parameters.height,world:solid.frame.origin})
    }
    const candidates=[...dimensions,...bounds.corners.map((world,index)=>({world,index,kind:'uniform' as const,direction:unit(add(world,scale(bounds.pivot,-1))),length:Math.hypot(...add(world,scale(bounds.pivot,-1)))}))]
    const handles=candidates.flatMap(({world,index,kind,direction,length:worldLength})=>{
      if(!projection.visible(world))return []
      const screen=projection.screen(projection.view(world)),dx=screen[0]-center[0],dy=screen[1]-center[1],length=Math.hypot(dx,dy)
      if(length<8)return []
      for(const offset of [16,24,32]){
        const x=screen[0]+dx/length*offset,y=screen[1]+dy/length*offset
        if(x<9||y<9||x>width-9||y>height-9||vertices.some(v=>Math.hypot(v[0]-x,v[1]-y)<13))continue
        return [{index,world,screen,x,y,depth:screen[2],kind,direction,length:worldLength}]
      }
      return []
    }).sort((a,b)=>(a.kind==='uniform'?1:0)-(b.kind==='uniform'?1:0)||a.depth-b.depth||a.index-b.index).filter((h,i,all)=>!all.slice(0,i).some(v=>Math.hypot(v.x-h.x,v.y-h.y)<18))
    return {...bounds,lines,handles}
  }catch{return null}
}
