"""M0 semantic contract only: no renderer, authoring or geometry evaluator.

The declarative shape contract also generates strict, typed Pydantic/OpenAPI
models. Semantic validation runs before coercion and never repairs references.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, create_model, model_validator, model_serializer
from .geometry_3d_solids import SUPPORTED, validate_solid_topology

CONTRACT = json.loads(Path(__file__).with_name("geometry_3d_contract.json").read_text())
COLLECTIONS = ("points", "linear_objects", "planes", "edges", "faces", "surfaces", "solids", "constructions", "annotations", "markings")


def _shape(value, spec, depth=1):
    if depth > CONTRACT["max_depth"]:
        raise ValueError("3D scene exceeds maximum depth")
    if isinstance(spec, str):
        if spec in CONTRACT["definitions"]:
            return _shape(value, CONTRACT["definitions"][spec], depth)
        if spec in ("number", "positive", "side_count"):
            if type(value) not in (int, float) or abs(value) > 1e12 or not math.isfinite(value):
                raise ValueError("3D numbers must be finite, strict and within 1e12")
            if spec == "positive" and value <= 0:
                raise ValueError("Expected positive number")
            if spec == "side_count" and (int(value) != value or not 3 <= value <= 128):
                raise ValueError("Invalid side count")
            if spec == "side_count":
                return int(value)
            return 0 if value == 0 else value
        if type(value) is not str or len(value) > (64 if spec == "id" else 4096):
            raise ValueError("Invalid string")
        if spec == "id" and not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", value):
            raise ValueError("Invalid stable ID")
        if any(0xD800 <= ord(c) <= 0xDFFF for c in value):
            raise ValueError("Invalid Unicode scalar")
        return value
    if "anyOf" in spec:
        for variant in spec["anyOf"]:
            try:
                return _shape(value, variant, depth)
            except ValueError:
                pass
        raise ValueError("Unsupported parameter definition")
    if "nullable" in spec:
        return None if value is None else _shape(value, spec["nullable"], depth)
    if "literal" in spec:
        if (type(value) is not type(spec["literal"]) and not (type(value) in (int, float) and type(spec["literal"]) is int)) or value != spec["literal"]:
            raise ValueError("Unsupported contract version or literal")
        return spec["literal"]
    if "enum" in spec:
        if type(value) is not str or value not in spec["enum"]:
            raise ValueError("Unsupported semantic kind")
        return value
    if "discriminator" in spec:
        if type(value) is not dict or type(value.get(spec["discriminator"])) is not str or value.get(spec["discriminator"]) not in spec["variants"]:
            raise ValueError("Unsupported semantic structure")
        return _shape(value, spec["variants"][value[spec["discriminator"]]], depth)
    if "object" in spec:
        if type(value) is not dict or set(value) != set(spec["object"]):
            raise ValueError("Missing or unknown semantic fields")
        return {k: _shape(value[k], s, depth + 1) for k, s in spec["object"].items()}
    if type(value) is not list:
        raise ValueError("Expected JSON array")
    if "tuple" in spec:
        if len(value) != len(spec["tuple"]):
            raise ValueError("Invalid coordinate arity")
        return [_shape(v, s, depth + 1) for v, s in zip(value, spec["tuple"])]
    if not spec.get("min", 0) <= len(value) <= CONTRACT["max_items"]:
        raise ValueError("Collection limit exceeded")
    return [_shape(v, spec["array"], depth + 1) for v in value]


def _sub(a, b):
    return [x - y for x, y in zip(a, b)]


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def _nonzero(a):
    if _dot(a, a) <= 1e-18:
        raise ValueError("Degenerate geometry")


def _face_coordinates(coords):
    x = _sub(coords[1], coords[0])
    x = [v / math.sqrt(_dot(x, x)) for v in x]
    normal = _cross(x, _sub(coords[2], coords[0]))
    normal = [v / math.sqrt(_dot(normal, normal)) for v in normal]
    y = _cross(normal, x)
    return [[_dot(_sub(p, coords[0]), x), _dot(_sub(p, coords[0]), y)] for p in coords]


def _inside_face(uv, polygon):
    inside = False
    for i, a in enumerate(polygon):
        b = polygon[(i + 1) % len(polygon)]
        cross = (b[0]-a[0])*(uv[1]-a[1])-(b[1]-a[1])*(uv[0]-a[0])
        if abs(cross) <= 1e-9 and min(a[0], b[0])-1e-9 <= uv[0] <= max(a[0], b[0])+1e-9 and min(a[1], b[1])-1e-9 <= uv[1] <= max(a[1], b[1])+1e-9:
            return True
        if (a[1] > uv[1]) != (b[1] > uv[1]) and uv[0] < (b[0]-a[0])*(uv[1]-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside


def _simple_face(polygon):
    def turn(a, b, c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    for i, a in enumerate(polygon):
        b = polygon[(i+1) % len(polygon)]
        _nonzero(_sub(b, a))
        for j in range(i+1, len(polygon)):
            if j == i+1 or (i == 0 and j == len(polygon)-1):
                continue
            c, d = polygon[j], polygon[(j+1) % len(polygon)]
            if max(min(a[0], b[0]), min(c[0], d[0])) > min(max(a[0], b[0]), max(c[0], d[0]))+1e-9 or max(min(a[1], b[1]), min(c[1], d[1])) > min(max(a[1], b[1]), max(c[1], d[1]))+1e-9:
                continue
            if turn(a, b, c)*turn(a, b, d) <= 1e-18 and turn(c, d, a)*turn(c, d, b) <= 1e-18:
                raise ValueError("Self-intersecting face")


def _feature_group(solid, slot):
    if slot == "surface" and solid["kind"] in ("sphere", "cylinder", "cone", "frustum"):
        return "surfaces"
    match = re.fullmatch(r"([vef])_(0|[1-9][0-9]*)", slot)
    if not match:
        raise ValueError("Unsupported semantic feature slot")
    limits = CONTRACT["feature_limits"][solid["kind"]]
    if isinstance(limits, dict):
        limits = limits[solid["parameters"]["family"]]
    offset = "vef".index(match[1])
    limit = limits[offset]
    if isinstance(limit, list):
        limit = limit[0]*solid["parameters"]["sides"] + limit[1]
    if int(match[2]) >= limit:
        raise ValueError("Feature slot outside topology")
    return ("points", "edges", "faces")[offset]


def _validate_camera(camera):
    direction = _sub(camera["target"], camera["position"])
    _nonzero(direction)
    _nonzero(_cross(direction, camera["up"]))
    if abs(_dot(camera["up"], camera["up"])-1) > 1e-9 or camera["near"] >= camera["far"] or not 1 <= camera["fov_degrees"] <= 179:
        raise ValueError("Invalid camera")
    return camera


def _canonical(value):
    if isinstance(value, dict):
        return {k: _canonical(value[k]) for k in sorted(value)}
    if isinstance(value, (list, tuple)):
        return [_canonical(v) for v in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def normalize_scene_3d(value):
    scene = _shape(value, "scene")
    if len(json.dumps(scene, ensure_ascii=False, separators=(",", ":")).encode()) > CONTRACT["max_bytes"]:
        raise ValueError("Scene payload exceeds encoded limit")
    if sum(len(scene[k]) for k in COLLECTIONS) > CONTRACT["max_items"]:
        raise ValueError("Scene entity limit exceeded")
    index, category, graph, owners = {}, {}, {}, {}
    for group in COLLECTIONS:
        for entity in scene[group]:
            eid = entity["id"]
            if eid in index:
                raise ValueError("Duplicate global ID")
            index[eid], category[eid], graph[eid] = entity, group, set()

    def ref(source, target, group):
        if category.get(target) != group:
            raise ValueError("Dangling or mistyped reference")
        graph[source].add(target)
        return index[target]

    def points(source, ids, minimum=2):
        if len(set(ids)) != len(ids) or len(ids) < minimum:
            raise ValueError("Repeated topology vertex")
        return [ref(source, p, "points")["position"] for p in ids]

    def own(output, owner):
        if output in owners:
            raise ValueError("Multiple semantic owners")
        owners[output] = owner
        graph[output].add(owner)

    for e in scene["linear_objects"]:
        a, b = points(e["id"], [e["a"], e["b"]])
        _nonzero(_sub(b, a))
    for e in scene["edges"]:
        a, b = points(e["id"], [e["start"], e["end"]])
        _nonzero(_sub(b, a))
    for e in scene["planes"] + scene["faces"]:
        coords = points(e["id"], e.get("point_ids", e.get("boundary")), 3)
        normal = _cross(_sub(coords[1], coords[0]), _sub(coords[2], coords[0]))
        _nonzero(normal)
        for p in coords[3:]:
            delta = _sub(p, coords[0])
            if abs(_dot(normal, delta)) > 1e-9 * math.sqrt(_dot(normal, normal)) * max(1, math.sqrt(_dot(delta, delta))):
                raise ValueError("Nonplanar face")
        if "boundary" in e:
            _simple_face(_face_coordinates(coords))
    for e in scene["solids"]:
        if e["mode"] == "freeform":
            points(e["id"], e["point_ids"], 4)
            for field, group in (("edge_ids", "edges"), ("face_ids", "faces")):
                if len(set(e[field])) != len(e[field]):
                    raise ValueError("Repeated topology feature")
                for target in e[field]:
                    feature = ref(e["id"], target, group)
                    vertices = [feature["start"], feature["end"]] if group == "edges" else feature["boundary"]
                    if not set(vertices) <= set(e["point_ids"]):
                        raise ValueError("Foreign polyhedron vertex")
            edge_pairs = {}
            for edge_id in e["edge_ids"]:
                edge = index[edge_id]
                pair = tuple(sorted((edge["start"], edge["end"])))
                if pair in edge_pairs:
                    raise ValueError("Duplicate polyhedron edge")
                edge_pairs[pair] = []
            volume = 0
            used_vertices = set()
            origin = index[e["point_ids"][0]]["position"]
            adjacency = {p: set() for p in e["point_ids"]}
            for face_id in e["face_ids"]:
                boundary = index[face_id]["boundary"]
                used_vertices.update(boundary)
                for i, a in enumerate(boundary):
                    b = boundary[(i+1) % len(boundary)]
                    pair = tuple(sorted((a, b)))
                    if pair not in edge_pairs:
                        raise ValueError("Missing boundary edge")
                    edge_pairs[pair].append((a, b))
                    adjacency[a].add(b)
                    adjacency[b].add(a)
                coords = [_sub(index[p]["position"], origin) for p in boundary]
                for i in range(1, len(coords)-1):
                    volume += _dot(coords[0], _cross(coords[i], coords[i+1])) / 6
            if used_vertices != set(e["point_ids"]) or len(e["point_ids"])-len(e["edge_ids"])+len(e["face_ids"]) != 2 or abs(volume) <= 1e-12:
                raise ValueError("Unsupported or degenerate polyhedron topology")
            if any(len(v) != 2 or v[0] != (v[1][1], v[1][0]) for v in edge_pairs.values()):
                raise ValueError("Polyhedron must be closed and consistently oriented")
            reached, queue = set(), [e["point_ids"][0]]
            while queue:
                vertex = queue.pop()
                if vertex not in reached:
                    reached.add(vertex)
                    queue.extend(adjacency[vertex] - reached)
            if reached != used_vertices:
                raise ValueError("Disconnected polyhedron")
            continue
        x, y = e["frame"]["x_axis"], e["frame"]["y_axis"]
        if abs(_dot(x, x)-1) > 1e-9 or abs(_dot(y, y)-1) > 1e-9 or abs(_dot(x, y)) > 1e-9:
            raise ValueError("Solid frame must be orthonormal")
        slots = set()
        if e["parameters"].get("base", {}).get("kind") == "face":
            ref(e["id"], e["parameters"]["base"]["face_id"], "faces")
        for feature in e["features"]:
            slot, target = feature["slot"], feature["entity_id"]
            if slot in slots or category.get(target) != _feature_group(e, slot):
                raise ValueError("Invalid solid feature map")
            slots.add(slot)
            own(target, e["id"])
        if e["kind"] in SUPPORTED:
            validate_solid_topology(scene, e)
    for eid, owner in owners.items():
        if category[eid] in ("edges", "faces"):
            feature = index[eid]
            vertices = [feature["start"], feature["end"]] if category[eid] == "edges" else feature["boundary"]
            if any(owners.get(p) != owner for p in vertices):
                raise ValueError("Solid topology feature references foreign vertex")
    for e in scene["surfaces"]:
        solid = index.get(e["solid_id"])
        if not solid or category[e["solid_id"]] != "solids" or solid["kind"] != e["kind"] or solid["mode"] != "parametric":
            raise ValueError("Invalid analytic surface owner")
        if not any(f["slot"] == e["slot"] and f["entity_id"] == e["id"] for f in solid["features"]):
            raise ValueError("Surface missing stable feature slot")
        ref(e["id"], e["solid_id"], "solids")

    def attachment(source, kind, target, parameter):
        group = {"linear": "linear_objects", "edge": "edges", "face": "faces", "surface": "surfaces"}[kind]
        parent = ref(source, target, group)
        if kind in ("edge", "linear"):
            if (kind == "edge" or parent["kind"] in ("segment", "vector")) and not 0 <= parameter <= 1:
                raise ValueError("Bounded attachment outside domain")
            if kind == "linear" and parent["kind"] == "ray" and parameter < 0:
                raise ValueError("Ray parameter outside domain")
        if kind == "surface":
            u, v = parameter
            if not 0 <= u < 1 or not 0 <= v <= 1:
                raise ValueError("Surface UV outside domain")
        if kind == "face":
            coords = [index[p]["position"] for p in parent["boundary"]]
            if not _inside_face(parameter, _face_coordinates(coords)):
                raise ValueError("Face attachment outside boundary")

    for e in scene["constructions"]:
        ref(e["id"], e["output_point_id"], "points")
        graph[e["id"]].remove(e["output_point_id"])
        own(e["output_point_id"], e["id"])
        if e["kind"] == "midpoint":
            points(e["id"], [e["a"], e["b"]])
        else:
            kind = e["kind"].removeprefix("point_on_")
            attachment(e["id"], kind, e[kind + "_id"], e.get("t", e.get("uv")))
    for e in scene["annotations"]:
        a = e["anchor"]
        if a["kind"] == "point":
            ref(e["id"], a["point_id"], "points")
        elif a["kind"] != "world":
            kind = a["kind"]
            attachment(e["id"], kind, a[kind + "_id"], a.get("t", a.get("uv")))
    for e in scene["markings"]:
        expected = {"length": 2, "angle": 3, "right_angle": 3, "equal_length": 4}[e["kind"]]
        if len(e["point_ids"]) != expected:
            raise ValueError("Invalid marking arity")
        ids = e["point_ids"]
        if e["kind"] == "equal_length":
            points(e["id"], ids[:2])
            points(e["id"], ids[2:])
        else:
            points(e["id"], ids)
    # Iterative topological elimination avoids recursion failures on deep graphs.
    dependents = {eid: [] for eid in graph}
    pending = {eid: len(deps) for eid, deps in graph.items()}
    for eid, deps in graph.items():
        for dependency in deps:
            dependents[dependency].append(eid)
    ready = [eid for eid in graph if pending[eid] == 0]
    count = 0
    while ready:
        eid = ready.pop()
        count += 1
        for child in dependents[eid]:
            pending[child] -= 1
            if pending[child] == 0:
                ready.append(child)
    if count != len(graph):
        raise ValueError("Cyclic semantic graph")
    _validate_camera(scene["print_camera"])
    for group in COLLECTIONS:
        scene[group].sort(key=lambda e: e["id"])
    for solid in scene["solids"]:
        if "features" in solid:
            solid["features"].sort(key=lambda f: f["slot"])
    canonical = _canonical(scene)
    if len(json.dumps(canonical, ensure_ascii=False, separators=(",", ":")).encode()) > CONTRACT["max_bytes"]:
        raise ValueError("Scene payload exceeds encoded limit")
    return canonical


class _Strict3D(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


_models = {}


def _type(spec, name):
    if isinstance(spec, str):
        if spec in CONTRACT["definitions"]:
            if spec not in _models:
                _models[spec] = _type(CONTRACT["definitions"][spec], "Geometry3D_" + spec)
            return _models[spec]
        return {"id": str, "text": str, "number": float, "positive": float, "side_count": int}[spec]
    if "anyOf" in spec:
        return Union[tuple(_type(v, name + "_variant" + str(i)) for i, v in enumerate(spec["anyOf"]))]
    if "literal" in spec:
        return Literal[spec["literal"]]
    if "enum" in spec:
        return Literal[tuple(spec["enum"])]
    if "nullable" in spec:
        return _type(spec["nullable"], name) | None
    if "tuple" in spec:
        # JSON coordinate arrays must remain arrays in strict Python validation.
        return list[_type(spec["tuple"][0], name)]
    if "array" in spec:
        return list[_type(spec["array"], name)]
    if "variants" in spec:
        variants = tuple(_type(v, name + "_" + k) for k, v in spec["variants"].items())
        return Annotated[Union[variants], Field(discriminator=spec["discriminator"])]
    return create_model(name, __base__=_Strict3D, **{k: (_type(v, name + "_" + k), ...) for k, v in spec["object"].items()})


_SceneFields = _type("scene", "scene")


class GeometryScene3D(_SceneFields):
    @model_validator(mode="before")
    @classmethod
    def validate_scene(cls, value):
        return normalize_scene_3d(value)

    @model_serializer(mode="wrap")
    def canonical_dump(self, handler):
        return _canonical(handler(self))


# Runtime editing camera has the same shape but is deliberately outside source_data.
class GeometryEditingCamera3D(_type("camera", "camera")):
    @model_validator(mode="before")
    @classmethod
    def validate_camera(cls, value):
        return _validate_camera(_shape(value, "camera"))


class GeometryAttachmentLoss3D(_type("attachment_loss", "attachment_loss")):
    @model_validator(mode="before")
    @classmethod
    def validate_report(cls, value):
        return _shape(value, "attachment_loss")
