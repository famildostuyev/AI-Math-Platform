// Independent world-space ray/plane oracle; no screen-space depth classification.
export function blockedAt(world,scene,camera,p){
  const forward=p.unit(p.sub(camera.target,camera.position)),depth=p.dot(p.sub(world,camera.position),forward)
  const origin=camera.projection==='perspective'?camera.position:p.sub(world,p.scale(forward,depth)),direction=p.unit(p.sub(world,origin)),distance=Math.hypot(...p.sub(world,origin))
  const points=new Map(scene.points.map(p=>[p.id,p.position]))
  return scene.faces.some(face=>{
    const vertices=face.boundary.map(id=>points.get(id)),n=p.unit(p.cross(p.sub(vertices[1],vertices[0]),p.sub(vertices[2],vertices[0]))),den=p.dot(direction,n)
    if(Math.abs(den)<1e-12)return false
    const t=p.dot(p.sub(vertices[0],origin),n)/den
    if(t<1e-7||t>=distance-1e-7)return false
    const hit=p.add(origin,p.scale(direction,t)),u=p.unit(p.sub(vertices[1],vertices[0])),v=p.cross(n,u),xy=q=>[p.dot(p.sub(q,vertices[0]),u),p.dot(p.sub(q,vertices[0]),v)],q=xy(hit),polygon=vertices.map(xy)
    let inside=false
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j],cross=(b[0]-a[0])*(q[1]-a[1])-(b[1]-a[1])*(q[0]-a[0])
      if(Math.abs(cross)<1e-9&&(q[0]-a[0])*(q[0]-b[0])+(q[1]-a[1])*(q[1]-b[1])<=1e-9){inside=true;break}
      if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside
    }
    return inside
  })
}
