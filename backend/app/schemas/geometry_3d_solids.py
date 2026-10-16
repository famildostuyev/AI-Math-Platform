"""M4 deterministic semantic topology; no rendering objects or ID allocation."""
import math

SUPPORTED = ("cube", "cuboid", "prism", "pyramid")
def add(a, b): return [x+y for x,y in zip(a,b)]
def sub(a, b): return [x-y for x,y in zip(a,b)]
def mul(a, t): return [x*t for x in a]
def dot(a, b): return sum(x*y for x,y in zip(a,b))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def unit(a):
    n = math.hypot(*a)
    if n <= 1e-9: raise ValueError("Degenerate basis")
    return mul(a, 1/n)

def polygon_base_geometry(base):
    """Authoritative local polygon validation; never trusts scene point caches."""
    if not 3 <= len(base) <= 128 or any(len(b) != 3 or any(not math.isfinite(x) or abs(x) > 1e12 for x in b) for b in base):
        raise ValueError("Invalid polygon coordinates")
    for i, a in enumerate(base):
        for b in base[i+1:]:
            if math.hypot(*sub(a,b)) <= 1e-9: raise ValueError("Duplicate polygon vertex")
    u = unit(sub(base[1],base[0])); normal = unit(cross(u,sub(base[2],base[0]))); v = cross(normal,u)
    if any(abs(dot(sub(b,base[0]),normal)) > 1e-9*max(1,math.hypot(*sub(b,base[0]))) for b in base): raise ValueError("Nonplanar polygon")
    coords = [[dot(sub(b,base[0]),u),dot(sub(b,base[0]),v)] for b in base]
    n = len(base)
    def turn(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    area = sum(a[0]*coords[(i+1)%n][1]-coords[(i+1)%n][0]*a[1] for i,a in enumerate(coords))
    if abs(area) <= 1e-12: raise ValueError("Zero polygon area")
    for i,a in enumerate(coords):
        b, nxt = coords[(i+1)%n], coords[(i+2)%n]
        if abs(turn(a,b,nxt)) <= 1e-9 and (b[0]-a[0])*(nxt[0]-b[0])+(b[1]-a[1])*(nxt[1]-b[1]) <= 0: raise ValueError("Overlapping adjacent edges")
        for j in range(i+1,n):
            if j == i+1 or i == 0 and j == n-1: continue
            c,d = coords[j],coords[(j+1)%n]
            if max(min(a[0],b[0]),min(c[0],d[0])) > min(max(a[0],b[0]),max(c[0],d[0]))+1e-9 or max(min(a[1],b[1]),min(c[1],d[1])) > min(max(a[1],b[1]),max(c[1],d[1]))+1e-9: continue
            if turn(a,b,c)*turn(a,b,d) <= 1e-18 and turn(c,d,a)*turn(c,d,b) <= 1e-18: raise ValueError("Self-intersecting polygon")
    return dict(u=u,v=v,normal=normal,area=area)

def solid_topology(scene, solid):
    p, frame, kind = solid["parameters"], solid["frame"], solid["kind"]
    origin, source_ids = [0,0,0], []
    if kind in ("cube", "cuboid"):
        w, d, h = (p["side"],)*3 if kind == "cube" else (p["width"],p["depth"],p["height"])
        base = [[0,0,0],[w,0,0],[w,d,0],[0,d,0]]
    else:
        h, n = p["height"], p["sides"]
        if p.get("base", {}).get("kind") == "polygon":
            base = p["base"]["vertices"]
            if kind != "pyramid" or len(base) != n: raise ValueError("Invalid polygon base")
            polygon_base_geometry(base)
        elif p.get("base", {}).get("kind") == "face":
            face = next((f for f in scene["faces"] if f["id"] == p["base"]["face_id"]), None)
            if not face or len(face["boundary"]) != n or face["boundary"] != p["base"]["point_ids"]: raise ValueError("Source topology changed")
            source_ids = face["boundary"]
            points = {p["id"]:p["position"] for p in scene["points"]}
            origin = points[source_ids[0]]
            base = [sub(points[i], origin) for i in source_ids]
        else:
            r = p.get("radius", p.get("base", {}).get("radius"))
            base = [[r*math.cos(2*math.pi*i/n),r*math.sin(2*math.pi*i/n),0] for i in range(n)]
    if (abs(h) if kind == "pyramid" and "base" in p else h) <= 1e-9: raise ValueError("Invalid height")
    u = unit(sub(base[1],base[0])); normal = unit(cross(u,sub(base[2],base[0]))); v = cross(normal,u)
    if any(abs(dot(sub(b,base[0]),normal)) > 1e-9*max(1,math.hypot(*sub(b,base[0]))) for b in base): raise ValueError("Nonplanar base")
    coords = [[dot(sub(b,base[0]),u),dot(sub(b,base[0]),v)] for b in base]
    n = len(base)
    area = sum(a[0]*coords[(i+1)%n][1]-coords[(i+1)%n][0]*a[1] for i,a in enumerate(coords))
    if abs(area) <= 1e-12: raise ValueError("Zero area")
    sign = 1 if area > 0 else -1
    vertices, edges, faces = list(base), [], [list(reversed(range(n)))]
    if kind == "pyramid":
        offset = p.get("apex_offset", [0,0])
        center = [sum(b[i] for b in base)/n for i in range(3)]
        apex = add(center,add(mul(u,offset[0]),add(mul(v,offset[1]),mul(normal,h))))
        def turn(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        concave = any(sign*turn(a,coords[(i+1)%n],coords[(i+2)%n]) < -1e-9 for i,a in enumerate(coords))
        ap = [dot(sub(apex,base[0]),u),dot(sub(apex,base[0]),v)]
        if concave and any(sign*turn(a,coords[(i+1)%n],ap) < -1e-9 for i,a in enumerate(coords)): raise ValueError("Apex outside concave kernel")
        vertices.append(apex)
        if p.get("base", {}).get("kind") == "polygon":
            for i,b in enumerate(base):
                if math.hypot(*cross(sub(base[(i+1)%n],b),sub(apex,b))) <= 1e-9: raise ValueError("Degenerate side face")
        for i in range(n): edges.append([i,(i+1)%n]); faces.append([i,(i+1)%n,n])
        edges.extend([[i,n] for i in range(n)])
    else:
        direction = p.get("direction",[0,0,1])
        if abs(dot(direction,direction)-1) > 1e-9 or abs(direction[2]) <= 1e-9: raise ValueError("Invalid extrusion direction")
        displacement = mul(add(mul(u,direction[0]),add(mul(v,direction[1]),mul(normal,direction[2]))),h/abs(direction[2]))
        vertices.extend([add(b,displacement) for b in base]); faces.append(list(range(n,2*n)))
        for i in range(n): edges.append([i,(i+1)%n]); faces.append([i,(i+1)%n,(i+1)%n+n,i+n])
        edges.extend([[i+n,(i+1)%n+n] for i in range(n)]); edges.extend([[i,i+n] for i in range(n)])
    z = cross(frame["x_axis"],frame["y_axis"])
    world = [add(origin,add(frame["origin"],add(mul(frame["x_axis"],b[0]),add(mul(frame["y_axis"],b[1]),mul(z,b[2]))))) for b in vertices]
    # Direct face-based pyramids preserve the source coordinates bit for bit.
    # Keep explicit legacy placement transforms compatible with existing scenes.
    if kind == "pyramid" and source_ids and frame["origin"] == [0,0,0] and frame["x_axis"] == [1,0,0] and frame["y_axis"] == [0,1,0]:
        for i, source_id in enumerate(source_ids):
            world[i] = list(points[source_id])
    if any(not math.isfinite(x) or abs(x)>1e12 for b in world for x in b): raise ValueError("World coordinate overflow")
    return dict(vertices=world, edges=edges, faces=faces, source_ids=source_ids)

def validate_solid_topology(scene, solid):
    n = solid["parameters"].get("sides",4)
    count = 26 if solid["kind"] in ("cube","cuboid") else 6*n+2 if solid["kind"] == "prism" else 4*n+2
    if len(solid["features"]) != count and "base" not in solid["parameters"]:
        return # Preserve the M0 partial-feature contract; evaluator marks it unavailable.
    topology = solid_topology(scene,solid)
    slots = {f["slot"]:f["entity_id"] for f in solid["features"]}
    if len(slots) != count: raise ValueError("Incomplete topology")
    ids = [[slots.get(f"{prefix}_{i}") for i in range(len(topology[key]))] for prefix,key in (("v","vertices"),("e","edges"),("f","faces"))]
    if any(i is None for group in ids for i in group): raise ValueError("Incomplete feature map")
    points, edges, faces = ({e["id"]:e for e in scene[k]} for k in ("points","edges","faces"))
    for i, eid in enumerate(ids[1]):
        a,b = topology["edges"][i]
        if eid not in edges or [edges[eid]["start"],edges[eid]["end"]] != [ids[0][a],ids[0][b]]: raise ValueError("Changed edge identity")
    for i, eid in enumerate(ids[2]):
        if eid not in faces or faces[eid]["boundary"] != [ids[0][j] for j in topology["faces"][i]]: raise ValueError("Changed face identity")
