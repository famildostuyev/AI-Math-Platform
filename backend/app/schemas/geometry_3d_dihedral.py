"""Pure authoritative dihedral geometry and topology; no persistence or rendering."""
import math
FEATURES={'v_0':'points','v_1':'points','v_2':'points','v_3':'points','edge':'linear_objects','half_0':'planes','half_1':'planes'}
def dihedral_positions(d):
    o,e,a=(d['frame'][k] for k in ('origin','x_axis','y_axis'));t=d['angle_radians']
    dot=lambda u,v:sum(x*y for x,y in zip(u,v))
    if not 0 <= t <= math.pi or not math.isfinite(t) or any(len(v)!=3 or any(not math.isfinite(x) or abs(x)>1e12 for x in v) for v in (o,e,a)) or abs(dot(e,e)-1)>1e-9 or abs(dot(a,a)-1)>1e-9 or abs(dot(e,a))>1e-9: raise ValueError('Invalid dihedral frame or angle')
    c=[e[1]*a[2]-e[2]*a[1],e[2]*a[0]-e[0]*a[2],e[0]*a[1]-e[1]*a[0]]
    co=-1 if t==math.pi else math.cos(t);si=0 if t in (0,math.pi) else math.sin(t)
    result={'v_0':list(o),'v_1':[o[i]+e[i] for i in range(3)],'v_2':[o[i]+a[i] for i in range(3)],'v_3':[o[i]+co*a[i]+si*c[i] for i in range(3)]}
    if any(not math.isfinite(x) or abs(x)>1e12 for v in result.values() for x in v): raise ValueError('Dihedral coordinate overflow')
    return result

def validate_dihedral(scene,d):
    dihedral_positions(d)
    size=d.get('display',{'edge_length':4,'widths':[2.5,2.5]})
    if any(not math.isfinite(x) or not .05 <= x <= 1e6 for x in [size['edge_length'],*size['widths']]): raise ValueError('Invalid dihedral display size')
    slots={f['slot']:f['entity_id'] for f in d['features']}
    if len(d['features'])!=7 or set(slots)!=set(FEATURES) or len(set(slots.values()))!=7: raise ValueError('Invalid dihedral feature map')
    edge=next((e for e in scene['linear_objects'] if e['id']==slots['edge']),None)
    if not edge or edge['kind']!='line' or edge['a']!=slots['v_0'] or edge['b']!=slots['v_1']: raise ValueError('Invalid dihedral edge')
    for i in (0,1):
        plane=next((p for p in scene['planes'] if p['id']==slots['half_'+str(i)]),None)
        if not plane or plane.get('kind')!='half_plane' or plane['point_ids']!=[slots['v_0'],slots['v_1'],slots['v_'+str(i+2)]]: raise ValueError('Invalid dihedral half-plane')
