"""Deterministic parallel/perpendicular plane bases through a point."""
import math

def guided_perpendicular_plane(a,b,vertices):
    def sub(a,b): return [x-y for x,y in zip(a,b)]
    def dot(a,b): return sum(x*y for x,y in zip(a,b))
    def unit(v):
        length=math.hypot(*v)
        if not math.isfinite(length) or length<=1e-9: raise ValueError('Degenerate guide')
        return [x/length for x in v]
    def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    if any(len(v)!=3 or any(type(x) not in (int,float) or not math.isfinite(x) for x in v) for v in [a,b,*vertices]) or len(vertices)<3: raise ValueError('Invalid guide geometry')
    x=unit(sub(vertices[1],vertices[0]));n=unit(cross(x,sub(vertices[2],vertices[0])));d=unit(sub(b,a))
    y=cross(n,x);dx=dot(d,x);dy=dot(d,y);tangent=[dx*x[i]+dy*y[i] for i in range(3)];length=math.hypot(dx,dy);ambiguous=length<=64*2.220446049250313e-16
    t=x if ambiguous else [v/length for v in tangent]
    if abs(dot(d,cross(t,n)))>1e-9: raise ValueError('Unstable direction')
    distance=dot(sub(a,vertices[0]),n);q=[a[i]-distance*n[i] for i in range(3)];shift=dot(sub(vertices[0],q),t);origin=[q[i]+shift*t[i] for i in range(3)]
    positions=[origin,[origin[i]+t[i] for i in range(3)],[origin[i]+n[i] for i in range(3)]]
    if any(not math.isfinite(v) or abs(v)>1e12 for p in positions for v in p) or math.dist(sub(positions[1],origin),t)>1e-9 or math.dist(sub(positions[2],origin),n)>1e-9: raise ValueError('Unrepresentable plane')
    normal=unit(cross(sub(positions[1],origin),sub(positions[2],origin)))
    if any(abs(dot(sub(point,origin),normal))>1e-9 for point in [a,b]): raise ValueError('Unstable guide at these coordinates')
    return {'positions':positions,'ambiguous':ambiguous}

def normalize_plane_angle(angle):
    if type(angle) not in (int,float) or not math.isfinite(angle): raise ValueError('Orientation angle must be finite')
    result=angle%(2*math.pi)
    return 0 if result==0 or result>=2*math.pi else result

def constructed_parallel_plane(point,vertices):
    return _constructed_plane(point,vertices)

def constructed_perpendicular_plane(point,vertices,angle):
    return _constructed_plane(point,vertices,normalize_plane_angle(angle))

def _constructed_plane(point,vertices,angle=None):
    if len(point)!=3 or len(vertices)<3 or any(len(v)!=3 for v in vertices) or not all(type(x) in (int,float) and math.isfinite(x) for v in [point,*vertices] for x in v): raise ValueError('Invalid plane geometry')
    def unit(v):
        norm=math.hypot(*v)
        if norm<=1e-9: raise ValueError('Degenerate plane frame')
        return [x/norm for x in v]
    def cross(a,b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
    origin=vertices[0];x=unit([vertices[1][i]-origin[i] for i in range(3)]);normal=unit(cross(x,[vertices[2][i]-origin[i] for i in range(3)]));y=cross(normal,x)
    if angle is not None:
        x=[math.cos(angle)*x[i]+math.sin(angle)*y[i] for i in range(3)];y=normal
    positions=[list(point),[point[i]+x[i] for i in range(3)],[point[i]+y[i] for i in range(3)]]
    if any(not math.isfinite(v) or abs(v)>1e12 for p in positions for v in p): raise ValueError('Invalid constructed plane basis')
    actual_x=unit([positions[1][i]-positions[0][i] for i in range(3)])
    actual_normal=unit(cross(actual_x,[positions[2][i]-positions[0][i] for i in range(3)]));actual_y=cross(actual_normal,actual_x)
    if math.dist(actual_x,x)>1e-9 or math.dist(actual_y,y)>1e-9: raise ValueError('Constructed plane orientation cannot be represented reliably at these coordinates')
    distance=sum((point[i]-origin[i])*normal[i] for i in range(3))
    return {'positions':positions,'coincident':angle is None and abs(distance)<=1e-9+64*2.220446049250313e-16*max(1,*[abs(x) for v in (point,origin) for x in v])}
