type Rect={x:number;y:number;width:number;height:number}
const overlap=(a:Rect,b:Rect)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
/** Screen-space placement only; the frame is a conservative, inexpensive geometry bound. */
export function geometryContextMenuPlacement(pointer:{x:number;y:number},menu:{width:number;height:number},viewport:{width:number;height:number},frame?:Rect,protectedAt=pointer){
  const margin=8,gap=20,w=Math.min(menu.width,Math.max(0,viewport.width-2*margin)),h=Math.min(menu.height,Math.max(0,viewport.height-2*margin))
  const {x,y}=pointer
  const candidates=[
    [x+gap,y-h/2],[x-gap-w,y-h/2],[x-w/2,y-gap-h],[x-w/2,y+gap],
    [x+gap,y+gap],[x+gap,y-gap-h],[x-gap-w,y+gap],[x-gap-w,y-gap-h],
    ...(frame?[[frame.x+frame.width+gap,y-h/2],[frame.x-gap-w,y-h/2],[x-w/2,frame.y-gap-h],[x-w/2,frame.y+frame.height+gap]]:[]),
  ]
  // Existing point picking allows 10 px; reserve space for the highlighted marker too.
  const protectedPoint={x:protectedAt.x-18,y:protectedAt.y-18,width:36,height:36}
  return candidates.map(([cx,cy],index)=>{
    const rect={x:Math.max(margin,Math.min(cx,viewport.width-margin-w)),y:Math.max(margin,Math.min(cy,viewport.height-margin-h)),width:w,height:h}
    const distance=Math.hypot(Math.max(rect.x-x,0,x-rect.x-w),Math.max(rect.y-y,0,y-rect.y-h))
    return {...rect,index,protectedOverlap:overlap(rect,protectedPoint),frameOverlap:frame?overlap(rect,frame):0,distance}
  }).sort((a,b)=>a.protectedOverlap-b.protectedOverlap||a.frameOverlap-b.frameOverlap||a.distance-b.distance||a.index-b.index)[0]
}
