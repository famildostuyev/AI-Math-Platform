"""Pure M6-C analytic calculations; does not activate runtime capabilities or schemas."""
import math
import re
import sys

EPS = sys.float_info.epsilon
TAU = 2 * math.pi


def number(value):
    if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1e12:
        raise ValueError('Invalid analytic number')
    return value


def positive(value):
    number(value)
    if value <= 0:
        raise ValueError('Expected positive dimension')
    return value


def finite_vector(value):
    if not isinstance(value, (list, tuple)) or len(value) != 3 or any(type(x) not in (int, float) or not math.isfinite(x) for x in value):
        raise ValueError('Nonfinite vector')
    return list(value)


def vector(value):
    result = finite_vector(value)
    for x in result:
        number(x)
    return result


def add(a, b): return [x + y for x, y in zip(a, b)]
def sub(a, b): return [x - y for x, y in zip(a, b)]
def scale(a, t): return [x * t for x in a]
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def unit(value):
    length = math.hypot(*value)
    if not math.isfinite(length) or length == 0:
        raise ValueError('Zero direction')
    return [x / length for x in value]


class AnalyticFrame:
    def __init__(self, frame):
        self.origin = vector(frame['origin'])
        self.x = vector(frame['x_axis'])
        self.y = vector(frame['y_axis'])
        self.z = cross(self.x, self.y)
        if abs(dot(self.x, self.x)-1) > 1e-9 or abs(dot(self.y, self.y)-1) > 1e-9 or abs(dot(self.x, self.y)) > 1e-9:
            raise ValueError('Non-orthonormal frame')
        det = dot(self.x, cross(self.y, self.z))
        self.dual = [scale(cross(self.y, self.z), 1/det), scale(cross(self.z, self.x), 1/det), scale(cross(self.x, self.y), 1/det)]

    def vector_to_world(self, value):
        value = finite_vector(value)
        return finite_vector(add(scale(self.x, value[0]), add(scale(self.y, value[1]), scale(self.z, value[2]))))

    def vector_to_local(self, value):
        value = finite_vector(value)
        return finite_vector([dot(value, axis) for axis in self.dual])

    def to_world(self, value):
        return vector(add(self.origin, self.vector_to_world(vector(value))))

    def to_local(self, value):
        return self.vector_to_local(sub(vector(value), self.origin))


def geometry(solid):
    if solid['mode'] != 'parametric' or solid['kind'] not in ('cylinder', 'cone', 'sphere'):
        raise ValueError('Unsupported analytic kind')
    radius = positive(solid['parameters']['radius'])
    height = 0 if solid['kind'] == 'sphere' else positive(solid['parameters']['height'])
    frame = AnalyticFrame(solid['frame'])
    resolution = 16 * EPS * max(map(abs, frame.origin))
    if radius < resolution or height and height < resolution:
        raise ValueError('Dimensions below world-space resolution')
    if solid['kind'] == 'cone' and not math.isfinite(radius / height):
        raise ValueError('Ill-conditioned cone')
    return radius, height, frame


def wrap_surface_azimuth(value):
    number(value)
    result = value - math.floor(value)
    return 0 if result == 0 or result >= 1 else result


def uv_domain(uv):
    if not isinstance(uv, (list, tuple)) or len(uv) != 2:
        raise ValueError('Invalid surface UV')
    for x in uv:
        number(x)
    if not 0 <= uv[0] < 1 or not 0 <= uv[1] <= 1:
        raise ValueError('Surface UV outside domain')


def evaluate_analytic_surface(solid, uv):
    uv_domain(uv)
    r, h, frame = geometry(solid)
    u, v = uv
    theta = TAU * u
    if solid['kind'] == 'sphere':
        phi = math.pi * (v - .5)
        radial = 0 if v in (0, 1) else r * math.cos(phi)
        z = -r if v == 0 else r if v == 1 else r * math.sin(phi)
    else:
        radial = r * (1-v) if solid['kind'] == 'cone' else r
        z = h * v
    return frame.to_world([radial*math.cos(theta), radial*math.sin(theta), z])


def inverse_analytic_surface(solid, world, previous_u=0):
    uv_domain([previous_u, 0])
    r, h, frame = geometry(solid)
    local = frame.to_local(world)
    x, y, z = local
    radial = math.hypot(x, y)
    precision = 4 * EPS * max(*map(abs, world), *map(abs, frame.origin))
    tolerance, axial_tolerance = 1e-9*r+precision, 1e-9*h+precision
    if solid['kind'] == 'sphere':
        if abs(math.hypot(*local)-r) > tolerance:
            return None
        v = math.atan2(z, radial)/math.pi + .5
    else:
        if z < -axial_tolerance or z > h+axial_tolerance:
            return None
        v = max(0, min(1, z/h))
        if abs(radial-(r*(1-v) if solid['kind'] == 'cone' else r)) > tolerance:
            return None
    if radial <= 64*EPS*r:
        if solid['kind'] == 'sphere' and abs(abs(z)-r) <= 64*EPS*r+precision:
            v = 0 if z < 0 else 1
        if solid['kind'] == 'cone' and abs(z-h) <= 64*EPS*h+precision:
            v = 1
    singular = radial <= 64*EPS*r and (solid['kind'] == 'sphere' or solid['kind'] == 'cone' and v == 1)
    return [previous_u if singular else wrap_surface_azimuth(math.atan2(y, x)/TAU), max(0, min(1, v))]


def analytic_bounds(solid):
    r, h, frame = geometry(solid)
    sphere = solid['kind'] == 'sphere'
    tip = frame.to_world([0, 0, h])
    lo, hi = [-r, -r, -r if sphere else 0], [r, r, r if sphere else h]
    world_min, world_max = [], []
    for i, o in enumerate(frame.origin):
        extent = r * math.hypot(frame.x[i], frame.y[i])
        if sphere:
            extent = r * math.hypot(frame.x[i], frame.y[i], frame.z[i])
            world_min.append(o-extent)
            world_max.append(o+extent)
        elif solid['kind'] == 'cone':
            world_min.append(min(o-extent, tip[i]))
            world_max.append(max(o+extent, tip[i]))
        else:
            world_min.append(min(o, tip[i])-extent)
            world_max.append(max(o, tip[i])+extent)
    vector(world_min)
    vector(world_max)
    corners = [frame.to_world([hi[0] if i & 1 else lo[0], hi[1] if i & 2 else lo[1], hi[2] if i & 4 else lo[2]]) for i in range(8)]
    return dict(localMin=lo, localMax=hi, worldMin=world_min, worldMax=world_max, corners=corners, pivot=frame.to_world([0, 0, 0 if sphere else h/2]))


def analytic_feature_positions(solid):
    _, h, frame = geometry(solid)
    slots, ids, output = set(), set(), {}
    allowed = ('v_0', 'surface') if solid['kind'] == 'sphere' else ('v_0', 'v_1', 'v_2', 'v_3', 'surface') if solid['kind'] == 'cone' else ('v_0', 'v_1', 'surface')
    for feature in solid['features']:
        slot, eid = feature['slot'], feature['entity_id']
        if not isinstance(eid, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}', eid) or slot in slots or eid in ids or slot not in allowed:
            raise ValueError('Invalid analytic feature map')
        slots.add(slot)
        ids.add(eid)
        if slot != 'surface':
            r = solid['parameters']['radius']
            output[eid] = frame.to_world([-.6*r, .8*r, 0] if slot == 'v_2' else [.6*r, -.8*r, 0] if slot == 'v_3' else [0, 0, h if slot == 'v_1' else 0])
    return output


def analytic_pointer_ray(camera, width, height, x, y):
    for value in (width, height, x, y):
        number(value)
    positive(width)
    positive(height)
    if not 0 <= x <= width or not 0 <= y <= height:
        raise ValueError('Pointer outside viewport')
    position, target, up = vector(camera['position']), vector(camera['target']), vector(camera['up'])
    if camera['projection'] not in ('perspective', 'orthographic') or abs(dot(up, up)-1) > 1e-9:
        raise ValueError('Invalid camera')
    for key in ('near', 'far', 'vertical_span'):
        positive(camera[key])
    number(camera['fov_degrees'])
    if camera['near'] >= camera['far'] or not 1 <= camera['fov_degrees'] <= 179:
        raise ValueError('Invalid camera range')
    forward = unit(sub(target, position))
    right = unit(cross(forward, up))
    vertical = cross(right, forward)
    nx, ny, aspect = 2*x/width-1, 1-2*y/height, width/height
    slope = math.tan(camera['fov_degrees']*math.pi/360)
    origin = vector(add(position, add(scale(right, nx*camera['vertical_span']*aspect/2), scale(vertical, ny*camera['vertical_span']/2)))) if camera['projection'] == 'orthographic' else position
    direction = forward if camera['projection'] == 'orthographic' else unit(add(forward, add(scale(right, nx*slope*aspect), scale(vertical, ny*slope))))
    return dict(origin=origin, direction=direction, clip=dict(origin=position, forward=forward, near=camera['near'], far=camera['far']))


def quadratic(a, b, c, linear):
    if not all(math.isfinite(v) for v in (a, b, c)):
        raise ValueError('Unsafe intersection coefficients')
    if linear:
        return [] if b == 0 else [-c/b]
    norm = max(abs(a), abs(b), abs(c))
    if norm == 0:
        return []
    a, b, c = a/norm, b/norm, c/norm
    if a == 0:
        return []  # Numerically unresolvable quadratic, not an invented linear root.
    discriminant = b*b-4*a*c
    tolerance = 64*EPS*(b*b+abs(4*a*c))
    if discriminant < -tolerance:
        return []
    if abs(discriminant) <= tolerance:
        return [-b/(2*a)]
    q = -.5*(b+(-1 if b < 0 else 1)*math.sqrt(discriminant))
    return [q/a, c/q]


def intersect_analytic_surface(solid, ray):
    r, h, frame = geometry(solid)
    origin, direction = vector(ray['origin']), unit(vector(ray['direction']))
    o, d = frame.to_local(origin), frame.vector_to_local(direction)
    clip = ray.get('clip')
    if clip is not None:
        vector(clip['origin'])
        vector(clip['forward'])
        positive(clip['near'])
        positive(clip['far'])
        if clip['near'] >= clip['far'] or abs(math.hypot(*clip['forward'])-1) > 1e-9:
            raise ValueError('Invalid ray clip')
    if solid['kind'] == 'cone':
        t0 = -dot(sub(o, [0, 0, h/2]), d)/dot(d, d)
        q, k = add(o, scale(d, t0)), r/h
        k2, w = k*k, h-q[2]
        radial, axial = d[0]*d[0]+d[1]*d[1], k2*d[2]*d[2]
        a, b = radial-axial, 2*(q[0]*d[0]+q[1]*d[1]+k2*w*d[2])
        c = q[0]*q[0]+q[1]*q[1]-k2*w*w
        linear = abs(a) <= 64*EPS*(radial+axial)
        b_error = 64*EPS*2*(abs(q[0]*d[0])+abs(q[1]*d[1])+abs(k2*w*d[2]))
        roots = [] if linear and abs(b) <= b_error else [(t+t0, add(q, scale(d, t))) for t in quadratic(a, b, c, linear)]
    else:
        ro, rd = [o[0], o[1], o[2] if solid['kind'] == 'sphere' else 0], [d[0], d[1], d[2] if solid['kind'] == 'sphere' else 0]
        a = dot(rd, rd)
        if a == 0:
            return []
        center = -dot(ro, rd)/a
        closest = add(ro, scale(rd, center))
        distance, tolerance = math.hypot(*closest), 64*EPS*max(r, math.hypot(*ro))
        if distance > r+tolerance:
            return []
        half = 0 if abs(distance-r) <= tolerance else math.sqrt(max(0, (r-distance)*(r+distance)/a))
        roots = []
        for t in (-half, half):
            local = add(closest, scale(rd, t))
            if solid['kind'] == 'cylinder':
                local[2] = o[2]+d[2]*(center+t)
            roots.append((center+t, local))
    hits = []
    for distance, local in sorted(roots, key=lambda root: root[0]):
        if not math.isfinite(distance) or distance < 0:
            continue
        try:
            position = frame.to_world(local)
        except ValueError:
            continue
        uv = inverse_analytic_surface(solid, position)
        depth = dot(sub(position, clip['origin']), clip['forward']) if clip is not None else distance
        if uv is None or clip is not None and not clip['near'] <= depth <= clip['far']:
            continue
        if any(abs(hit['distance']-distance) <= 64*EPS*max(r, h, distance) for hit in hits):
            continue
        hits.append(dict(position=position, uv=uv, distance=distance, depth=depth))
    return hits


def intersect_closed_cylinder(solid, ray):
    """Positive world-ray distances; cap wins rim ties, cap UV is None.

    Coincident boundary patches return their finite endpoints, not a continuum.
    This transient result does not change persisted surface/face contracts.
    """
    if solid['kind'] != 'cylinder':
        raise ValueError('Expected cylinder')
    r, h, frame = geometry(solid)
    origin, direction = vector(ray['origin']), unit(vector(ray['direction']))
    o, d = frame.to_local(origin), frame.vector_to_local(direction)
    if abs(d[2]) <= 8*EPS*sum(abs(v*z) for v, z in zip(direction, frame.z)):
        d[2] = 0
    clip = ray.get('clip')
    if clip is not None:
        vector(clip['origin'])
        vector(clip['forward'])
        positive(clip['near'])
        positive(clip['far'])
        if clip['near'] >= clip['far'] or abs(math.hypot(*clip['forward'])-1) > 1e-9:
            raise ValueError('Invalid ray clip')
    anchor = -dot(sub(o, [0, 0, h/2]), d)/dot(d, d)
    q = add(o, scale(d, anchor))
    radial_tolerance, axial_tolerance = 64*EPS*r, 64*EPS*h
    if d[2] == 0:
        if abs(q[2]) <= axial_tolerance:
            q[2] = 0
        elif abs(q[2]-h) <= axial_tolerance:
            q[2] = h
    candidates = []
    speed = math.hypot(d[0], d[1])
    if speed > 0:
        ex, ey = d[0]/speed, d[1]/speed
        along, perp = q[0]*ex+q[1]*ey, q[0]*ey-q[1]*ex
        error = 16*EPS*max(r, abs(q[0]*ey)+abs(q[1]*ex))
        if abs(perp) <= r+error:
            tangent = abs(abs(perp)-r) <= error
            p = (-r if perp < 0 else r) if tangent else perp
            ratio = abs(p)/r
            half = 0 if tangent else r*math.sqrt(max(0, (1-ratio)*(1+ratio)))
            for radial in ([0] if half == 0 else [-half, half]):
                offset = (radial-along)/speed
                z = q[2]+d[2]*offset
                if math.isfinite(offset) and 0 <= z <= h:
                    candidates.append(dict(offset=offset, local=[p*ey+radial*ex, -p*ex+radial*ey, z], region='lateral'))
    if d[2] != 0:
        for z in (0, h):
            offset = (z-q[2])/d[2]
            x, y = q[0]+d[0]*offset, q[1]+d[1]*offset
            if math.isfinite(offset) and math.isfinite(x) and math.isfinite(y) and math.hypot(x, y) <= r+radial_tolerance:
                candidates.append(dict(offset=offset, local=[x, y, z], region='bottom_cap' if z == 0 else 'top_cap'))
    for candidate in candidates:
        if candidate['region'] == 'lateral':
            if candidate['local'][2] == 0:
                candidate['region'] = 'bottom_cap'
            elif candidate['local'][2] == h:
                candidate['region'] = 'top_cap'
    def priority(candidate): return 1 if candidate['region'] == 'lateral' else 0
    candidates.sort(key=lambda c: (c['offset'], priority(c)))
    unique = []
    for candidate in candidates:
        duplicate = next((i for i, v in enumerate(unique) if math.hypot(v['local'][0]-candidate['local'][0], v['local'][1]-candidate['local'][1]) <= radial_tolerance and abs(v['local'][2]-candidate['local'][2]) <= axial_tolerance), None)
        if duplicate is None:
            unique.append(candidate)
        elif priority(candidate) < priority(unique[duplicate]):
            unique[duplicate] = candidate
    hits = []
    for candidate in unique:
        distance = anchor+candidate['offset']
        if not math.isfinite(distance) or distance <= 0:
            continue
        world_error = 4*EPS*max(*map(abs, origin), *map(abs, frame.origin))
        if all(abs(v-o[i]) <= world_error+8*EPS*max(abs(o[i]), h if i == 2 else r) for i, v in enumerate(candidate['local'])):
            continue
        try:
            position = frame.to_world(candidate['local'])
        except ValueError:
            continue
        depth = dot(sub(position, clip['origin']), clip['forward']) if clip is not None else distance
        if not math.isfinite(depth) or clip is not None and not clip['near'] <= depth <= clip['far']:
            continue
        local, region = candidate['local'], candidate['region']
        uv = [wrap_surface_azimuth(math.atan2(local[1], local[0])/TAU), local[2]/h] if region == 'lateral' else None
        hits.append(dict(position=position, distance=distance, depth=depth, region=region, uv=uv))
    return sorted(hits, key=lambda hit: hit['distance'])
