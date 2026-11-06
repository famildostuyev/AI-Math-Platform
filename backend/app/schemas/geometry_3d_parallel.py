"""Shared 3D parallel-direction mathematics; the endpoint is always derived."""
import math
def parallel_geometry(p,a,b,kind='line',direction='forward',length=2):
    if any(len(v)!=3 for v in (p,a,b)) or not all(type(x) in (int,float) and math.isfinite(x) for v in (p,a,b) for x in v) or type(length) not in (int,float) or not math.isfinite(length) or not 0<length<=1e12 or kind not in ('line','ray','segment') or direction not in ('forward','reverse'): raise ValueError('Invalid parallel parameters')
    d=[b[i]-a[i] for i in range(3)];norm=math.hypot(*d)
    if norm<=1e-9: raise ValueError('Invalid reference direction')
    size=(length if kind=='segment' else 1)*(-1 if direction=='reverse' else 1)
    position=[p[i]+size*d[i]/norm for i in range(3)]
    if any(not math.isfinite(x) or abs(x)>1e12 for x in position): raise ValueError('Invalid parallel endpoint')
    t=sum((p[i]-a[i])*d[i] for i in range(3))/(norm*norm)
    distance=math.hypot(*[a[i]+t*d[i]-p[i] for i in range(3)])
    tolerance=1e-9+64*2.220446049250313e-16*max(1,*[abs(x) for v in (p,a,b) for x in v])
    return {'position':position,'coincident':distance<=tolerance}

def plane_parallel_geometry(p,vertices,angle_radians,kind='line',direction='forward',length=2):
    """Reconstruct the chosen direction from the current semantic plane frame."""
    if len(vertices)<3 or any(len(v)!=3 for v in vertices) or not all(type(x) in (int,float) and math.isfinite(x) for v in vertices for x in v) or type(angle_radians) not in (int,float) or not math.isfinite(angle_radians): raise ValueError('Invalid plane-local direction')
    def unit(v):
        norm=math.hypot(*v)
        if norm<=1e-9: raise ValueError('Degenerate plane frame')
        return [x/norm for x in v]
    def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    origin=vertices[0];x=unit([vertices[1][i]-origin[i] for i in range(3)]);normal=unit(cross(x,[vertices[2][i]-origin[i] for i in range(3)]));y=cross(normal,x)
    d=[math.cos(angle_radians)*x[i]+math.sin(angle_radians)*y[i] for i in range(3)]
    result=parallel_geometry(p,[0,0,0],d,kind,direction,length)
    distance=sum((p[i]-origin[i])*normal[i] for i in range(3))
    result['coincident']=abs(distance)<=1e-9+64*2.220446049250313e-16*max(1,*[abs(x) for v in (p,origin) for x in v])
    return result
