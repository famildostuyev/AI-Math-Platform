"""Pure 3D supporting-line projection; finite references never clamp the parameter."""
import math
def perpendicular_foot(p,a,b):
    d=[b[i]-a[i] for i in range(3)];length2=sum(x*x for x in d)
    if not all(type(x) in (int,float) and math.isfinite(x) for v in (p,a,b) for x in v) or length2<=1e-18: raise ValueError('Invalid reference direction')
    t=sum((p[i]-a[i])*d[i] for i in range(3))/length2
    h=[a[i]+t*d[i] for i in range(3)]
    if math.dist(p,h)<=1e-9+64*2.220446049250313e-16*max(1,*[abs(x) for v in (p,a,b) for x in v]): raise ValueError('Point is already on the supporting line')
    if any(not math.isfinite(x) or abs(x)>1e12 for x in h): raise ValueError('Invalid perpendicular foot')
    return {'position':h,'t':t}

def plane_perpendicular_foot(p,vertices):
    """Project onto the infinite supporting plane, without polygon clamping."""
    if len(p)!=3 or len(vertices)<3 or any(len(v)!=3 for v in vertices) or not all(type(x) in (int,float) and math.isfinite(x) for v in [p,*vertices] for x in v):
        raise ValueError('Invalid supporting plane')
    def unit(v):
        n=math.sqrt(sum(x*x for x in v))
        if n<=1e-9: raise ValueError('Degenerate face frame')
        return [x/n for x in v]
    a=vertices[0];x=unit([vertices[1][i]-a[i] for i in range(3)]);v=[vertices[2][i]-a[i] for i in range(3)]
    normal=unit([x[1]*v[2]-x[2]*v[1],x[2]*v[0]-x[0]*v[2],x[0]*v[1]-x[1]*v[0]])
    distance=sum((p[i]-a[i])*normal[i] for i in range(3))
    if abs(distance)<=1e-9+64*2.220446049250313e-16*max(1,*[abs(x) for v in [p,*vertices] for x in v]):
        raise ValueError('Point lies on the supporting plane')
    h=[p[i]-distance*normal[i] for i in range(3)]
    if any(not math.isfinite(x) or abs(x)>1e12 for x in h): raise ValueError('Invalid perpendicular foot')
    return {'position':h,'normal':normal,'tangent':x,'distance':distance}
