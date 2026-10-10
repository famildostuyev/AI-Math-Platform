"""Deterministic, block-local construction validation; no constraint solver."""
import json
import math
from pathlib import Path

LIMITS = json.loads(Path(__file__).with_name('geometry_construction_limits.json').read_text())


def midpoint_coordinates(a, b):
    return a.x / 2 + b.x / 2, a.y / 2 + b.y / 2


def linear_support_coordinates(a, b, p, kind):
    dx, dy = b.x - a.x, b.y - a.y
    length = math.hypot(dx, dy)
    if not math.isfinite(length) or length < LIMITS['minimumSourceDistance']:
        raise ValueError('Degenerate construction source direction.')
    dx, dy = dx / length, dy / length
    if kind == 'perpendicular':
        dx, dy = -dy, dx
    if dx < 0 or (dx == 0 and dy < 0):
        dx, dy = -dx, -dy
    x, y = p.x + dx, p.y + dy
    if not math.isfinite(x) or not math.isfinite(y) or (x == p.x and y == p.y):
        raise ValueError('Unrepresentable construction output.')
    return x, y


def angle_bisector_support_coordinates(a, vertex, c):
    ax, ay = a.x - vertex.x, a.y - vertex.y
    cx, cy = c.x - vertex.x, c.y - vertex.y

    a_length = math.hypot(ax, ay)
    c_length = math.hypot(cx, cy)

    if (
        not math.isfinite(a_length)
        or not math.isfinite(c_length)
        or a_length < LIMITS['minimumSourceDistance']
        or c_length < LIMITS['minimumSourceDistance']
    ):
        raise ValueError('Degenerate angle bisector source.')

    ax, ay = ax / a_length, ay / a_length
    cx, cy = cx / c_length, cy / c_length

    dx, dy = ax + cx, ay + cy
    direction_length = math.hypot(dx, dy)

    if (
        not math.isfinite(direction_length)
        or direction_length < LIMITS['minimumSourceDistance']
    ):
        raise ValueError('Degenerate angle bisector direction.')

    dx, dy = dx / direction_length, dy / direction_length
    x, y = vertex.x + dx, vertex.y + dy

    if not math.isfinite(x) or not math.isfinite(y):
        raise ValueError('Unrepresentable angle bisector output.')

    return x, y


def intersection_coordinates(a1, a2, b1, b2):
    adx, ady = a2.x - a1.x, a2.y - a1.y
    bdx, bdy = b2.x - b1.x, b2.y - b1.y

    if (
        math.hypot(adx, ady) < LIMITS['minimumSourceDistance']
        or math.hypot(bdx, bdy) < LIMITS['minimumSourceDistance']
    ):
        raise ValueError('Degenerate intersection source direction.')

    denominator = adx * bdy - ady * bdx
    if not math.isfinite(denominator) or abs(denominator) <= LIMITS['coordinateTolerance']:
        raise ValueError('Parallel or coincident intersection sources.')

    dx, dy = b1.x - a1.x, b1.y - a1.y
    t = (dx * bdy - dy * bdx) / denominator
    u = (dx * ady - dy * adx) / denominator
    x, y = a1.x + t * adx, a1.y + t * ady

    if not all(math.isfinite(value) for value in (t, u, x, y)):
        raise ValueError('Unrepresentable intersection output.')

    return x, y, t, u


def altitude_foot_coordinates(a, vertex, c):
    length = math.hypot(c.x - a.x, c.y - a.y)
    if not math.isfinite(length) or length < LIMITS['minimumSourceDistance']:
        raise ValueError('Degenerate altitude opposite side.')
    dx, dy = (c.x - a.x) / length, (c.y - a.y) / length
    vx, vy = vertex.x - a.x, vertex.y - a.y
    distance, height = vx * dx + vy * dy, vx * dy - vy * dx
    x, y = a.x + distance * dx, a.y + distance * dy
    if (not all(math.isfinite(value) for value in (distance, height, x, y))
        or abs(height) < LIMITS['minimumSourceDistance'] or (x == vertex.x and y == vertex.y)):
        raise ValueError('Degenerate or unrepresentable altitude.')
    return x, y



def validate_constructions(points, constructions, segments=(), lines=(), polygons=()):
    locations = {p.id: p.model_copy() for p in points}
    linear = {s.id: s for s in [*segments, *lines]}
    outputs, pairs = set(), set()

    def owned(c):
        if c.kind == 'median':
            return [c.output_segment_id]
        if c.kind == 'altitude':
            return [c.output_segment_id, c.foot_point_id]
        if c.kind in ('midpoint', 'intersection', 'point_on_segment', 'point_on_line'):
            return [c.output_point_id]
        return [c.output_line_id, c.support_point_id] + (
            [c.intersection_point_id] if c.kind == 'angle_bisector' and c.intersection_point_id else []
        )

    def inputs(c):
        if c.kind in ('point_on_segment', 'point_on_line'):
            a, b = parent_endpoints(c)
            return [a, b] + ([c.parent.segment_id] if c.parent.kind == 'segment' else [c.parent.line_id] if c.parent.kind == 'line' else [])
        if c.kind == 'median':
            return [c.vertex_point_id, c.midpoint_point_id]
        if c.kind in ('midpoint', 'angle_bisector', 'altitude'):
            return c.source_point_ids
        if c.kind == 'intersection':
            return [c.source_a.id, c.source_b.id]
        return [c.source.id, c.through_point_id]

    def typed_source(ref):
        source = linear.get(ref.id)
        if source is None or getattr(source, 'kind', 'segment') != ref.kind:
            raise ValueError('Invalid typed construction source.')
        return source

    def parent_endpoints(c):
        p = c.parent
        if p.kind == 'line':
            line = next((line for line in lines if line.id == p.line_id and line.kind in ('line', 'directed_line')), None)
            if line is None:
                raise ValueError('Missing or invalid constrained-point infinite line.')
            return line.start_point_id, line.end_point_id
        if p.kind == 'segment':
            s = next((s for s in segments if s.id == p.segment_id), None)
            if s is None:
                raise ValueError('Missing constrained-point segment.')
            return s.start_point_id, s.end_point_id
        polygon = next((s for s in polygons if s.id == p.polygon_id), None)
        a, b = p.start_point_id, p.end_point_id
        if polygon is None or a == b or a not in polygon.point_ids or b not in polygon.point_ids:
            raise ValueError('Missing constrained-point polygon edge.')
        i, j, n = polygon.point_ids.index(a), polygon.point_ids.index(b), len(polygon.point_ids)
        if (i + 1) % n != j and (j + 1) % n != i:
            raise ValueError('Nonadjacent constrained-point edge.')
        return a, b

    for c in constructions:
        if c.kind in ('point_on_segment', 'point_on_line'):
            a, b = parent_endpoints(c)
            if a == b or any(id not in locations for id in (a, b, c.output_point_id)) or c.output_point_id in (a, b):
                raise ValueError('Invalid constrained-point references.')
            pair = (c.kind, c.output_point_id)
        elif c.kind == 'midpoint':
            a, b = c.source_point_ids
            pair = ('midpoint', *sorted((a, b)))
            if (
                a == b
                or a not in locations
                or b not in locations
                or c.output_point_id not in locations
                or c.output_point_id in (a, b)
                or c.output_point_id in outputs
            ):
                raise ValueError('Invalid construction point references.')

        elif c.kind == 'intersection':
            source_a = typed_source(c.source_a)
            source_b = typed_source(c.source_b)

            if (
                c.source_a.id == c.source_b.id
                or c.output_point_id not in locations
                or c.output_point_id in outputs
                or c.output_point_id in (
                    source_a.start_point_id,
                    source_a.end_point_id,
                    source_b.start_point_id,
                    source_b.end_point_id,
                )
            ):
                raise ValueError('Invalid intersection construction references.')

            source_keys = sorted((
                (c.source_a.kind, c.source_a.id),
                (c.source_b.kind, c.source_b.id),
            ))
            pair = ('intersection', *source_keys)

        elif c.kind == 'median':
            output = next((s for s in segments if s.id == c.output_segment_id), None)
            if (
                c.vertex_point_id not in locations
                or c.midpoint_point_id not in locations
                or c.vertex_point_id == c.midpoint_point_id
                or output is None
                or output.start_point_id != c.vertex_point_id
                or output.end_point_id != c.midpoint_point_id
            ):
                raise ValueError('Invalid median references.')
            pair = ('median', c.vertex_point_id, c.midpoint_point_id)

        elif c.kind == 'altitude':
            a, vertex, c_point = c.source_point_ids
            output = next((s for s in segments if s.id == c.output_segment_id), None)
            if (any(id not in locations for id in (a, vertex, c_point))
                or c.foot_point_id not in locations or c.foot_point_id in (a, vertex, c_point)
                or output is None or output.start_point_id != vertex or output.end_point_id != c.foot_point_id):
                raise ValueError('Invalid altitude references.')
            pair = ('altitude', vertex, *sorted((a, c_point)))

        elif c.kind == 'angle_bisector':
            a, vertex, c_point = c.source_point_ids
            output = linear.get(c.output_line_id)

            if (
                any(point_id not in locations for point_id in (a, vertex, c_point))
                or output is None
                or getattr(output, 'kind', 'segment') != 'line'
                or c.support_point_id not in locations
                or c.output_line_id in outputs
                or c.support_point_id in outputs
                or output.start_point_id != vertex
                or output.end_point_id != c.support_point_id
                or c.support_point_id in (a, vertex, c_point)
            ):
                raise ValueError('Invalid angle bisector construction references.')

            if c.intersection_point_id is not None and (
                c.intersection_point_id not in locations
                or c.intersection_point_id in (a, vertex, c_point, c.support_point_id)
            ):
                raise ValueError('Invalid angle bisector intersection references.')
            pair = ('angle_bisector', vertex, *sorted((a, c_point)))

        else:
            source = typed_source(c.source)
            output = linear.get(c.output_line_id)
            if (
                output is None
                or getattr(output, 'kind', 'segment') != 'line'
                or c.source.id == c.output_line_id
                or c.through_point_id not in locations
                or c.support_point_id not in locations
                or c.through_point_id == c.support_point_id
                or output.start_point_id != c.through_point_id
                or output.end_point_id != c.support_point_id
            ):
                raise ValueError('Invalid typed construction source or output.')
            pair = (c.kind, c.source.kind, c.source.id, c.through_point_id)

        if pair in pairs or any(id in outputs for id in owned(c)):
            raise ValueError('Duplicate recipe or output ownership.')

        outputs.update(owned(c))
        pairs.add(pair)

    ready = set(locations) - outputs
    pending = list(constructions)

    while pending:
        for id, line in linear.items():
            if id not in outputs and {line.start_point_id, line.end_point_id} <= ready:
                ready.add(id)

        batch = sorted(
            (c for c in pending if set(inputs(c)) <= ready),
            key=lambda c: c.id,
        )
        if not batch:
            raise ValueError('Construction dependency cycle.')

        for c in batch:
            if c.kind in ('point_on_segment', 'point_on_line'):
                a_id, b_id = parent_endpoints(c)
                a, b = locations[a_id], locations[b_id]
                length = math.hypot(b.x-a.x, b.y-a.y)
                if not math.isfinite(length) or length == 0:
                    raise ValueError('Degenerate constrained-point parent.')
                if c.kind == 'point_on_line':
                    x, y = a.x+c.t*(b.x-a.x), a.y+c.t*(b.y-a.y)
                else:
                    x, y = (1-c.t)*a.x+c.t*b.x, (1-c.t)*a.y+c.t*b.y
                output = locations[c.output_point_id]
            elif c.kind == 'midpoint':
                x, y = midpoint_coordinates(
                    *(locations[id] for id in c.source_point_ids)
                )
                output = locations[c.output_point_id]

            elif c.kind == 'intersection':
                source_a = linear[c.source_a.id]
                source_b = linear[c.source_b.id]
                x, y, t, u = intersection_coordinates(
                    locations[source_a.start_point_id],
                    locations[source_a.end_point_id],
                    locations[source_b.start_point_id],
                    locations[source_b.end_point_id],
                )
                tolerance = LIMITS['coordinateTolerance']
                if (
                    (c.source_a.kind in ('segment', 'vector') and not -tolerance <= t <= 1 + tolerance)
                    or (c.source_b.kind in ('segment', 'vector') and not -tolerance <= u <= 1 + tolerance)
                ):
                    raise ValueError('Intersection lies outside segment bounds.')
                output = locations[c.output_point_id]


            elif c.kind == 'median':
                vertex = locations[c.vertex_point_id]
                midpoint = locations[c.midpoint_point_id]
                if (
                    not all(math.isfinite(v) for v in (vertex.x, vertex.y, midpoint.x, midpoint.y))
                    or math.hypot(vertex.x - midpoint.x, vertex.y - midpoint.y) < LIMITS['minimumSourceDistance']
                ):
                    raise ValueError('Invalid median endpoint distance.')
                ready.update(owned(c))
                ready.add(c.id)
                continue

            elif c.kind == 'altitude':
                x, y = altitude_foot_coordinates(*(locations[id] for id in c.source_point_ids))
                output = locations[c.foot_point_id]

            elif c.kind == 'angle_bisector':
                a, vertex, c_point = c.source_point_ids
                x, y = angle_bisector_support_coordinates(
                    locations[a],
                    locations[vertex],
                    locations[c_point],
                )
                output = locations[c.support_point_id]
                if c.intersection_point_id is not None:
                    support = output.model_copy(update={'x': x, 'y': y})
                    ix, iy, t, u = intersection_coordinates(locations[vertex], support, locations[a], locations[c_point])
                    intersection = locations[c.intersection_point_id]
                    tolerance = LIMITS['coordinateTolerance']
                    if (t < 0 or not -tolerance <= u <= 1 + tolerance
                        or abs(ix - intersection.x) > tolerance or abs(iy - intersection.y) > tolerance):
                        raise ValueError('Angle bisector intersection contradicts its sources.')
                    intersection.x, intersection.y = ix, iy

            else:
                source = linear[c.source.id]
                x, y = linear_support_coordinates(
                    locations[source.start_point_id],
                    locations[source.end_point_id],
                    locations[c.through_point_id],
                    c.kind,
                )
                output = locations[c.support_point_id]

            if (
                not all(math.isfinite(v) for v in (x, y, output.x, output.y))
                or abs(x - output.x) > LIMITS['coordinateTolerance']
                or abs(y - output.y) > LIMITS['coordinateTolerance']
            ):
                raise ValueError('Construction output contradicts its sources.')

            output.x, output.y = x, y
            ready.update(owned(c))
            ready.add(c.id)

        pending = [c for c in pending if c.id not in ready]
