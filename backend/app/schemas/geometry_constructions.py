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


def validate_constructions(points, constructions, segments=(), lines=()):
    locations = {p.id: p.model_copy() for p in points}
    linear = {s.id: s for s in [*segments, *lines]}
    outputs, pairs = set(), set()

    def owned(c):
        if c.kind in ('midpoint', 'intersection'):
            return [c.output_point_id]
        return [c.output_line_id, c.support_point_id]

    def inputs(c):
        if c.kind in ('midpoint', 'angle_bisector'):
            return c.source_point_ids
        if c.kind == 'intersection':
            return [c.source_a.id, c.source_b.id]
        return [c.source.id, c.through_point_id]

    def typed_source(ref):
        source = linear.get(ref.id)
        if source is None or getattr(source, 'kind', 'segment') != ref.kind:
            raise ValueError('Invalid typed construction source.')
        return source

    for c in constructions:
        if c.kind == 'midpoint':
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

            pair = ('angle_bisector', a, vertex, c_point)

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
            if c.kind == 'midpoint':
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

            elif c.kind == 'angle_bisector':
                a, vertex, c_point = c.source_point_ids
                x, y = angle_bisector_support_coordinates(
                    locations[a],
                    locations[vertex],
                    locations[c_point],
                )
                output = locations[c.support_point_id]

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