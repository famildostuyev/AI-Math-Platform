import copy
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from pydantic import ValidationError
from app.schemas.geometry_3d import GeometryScene3D, GeometryEditingCamera3D, CONTRACT, normalize_scene_3d
from app.schemas.question_editor import GeometryBlockWritePayload, GeometryBlockUpdate
from tests.test_geometry_v1_contract import geometry_v1, NOW

FIXTURES = json.loads(Path(__file__).with_name("geometry_3d_fixtures.json").read_text(encoding="utf-8"))


def fixtures():
    results = []
    for case in FIXTURES["cases"]:
        data = copy.deepcopy(FIXTURES["scene"])
        for path, value in case["changes"]:
            parts = path.split(".")
            target = data
            for part in parts[:-1]:
                target = target[int(part)] if isinstance(target, list) else target[part]
            target[int(parts[-1]) if isinstance(target, list) else parts[-1]] = copy.deepcopy(value)
        results.append(dict(name=case["name"], valid=case["valid"], data=data))
    # Every parametric solid family uses the same declarative strict parameter shape.
    for kind, spec in CONTRACT["definitions"]["solid"]["variants"].items():
        if kind == "polyhedron":
            continue
        data = copy.deepcopy(FIXTURES["scene"])
        parameter_shape = CONTRACT["definitions"][spec["object"]["parameters"]]
        parameter_spec = parameter_shape.get("anyOf", [parameter_shape])[0]["object"]
        parameters = {k: (3 if v == "side_count" else 1 if isinstance(v, str) else v["enum"][0]) for k, v in parameter_spec.items()}
        solid = dict(id="solid", kind=kind, mode="parametric", frame=dict(origin=[0, 0, 0], x_axis=[1, 0, 0], y_axis=[0, 1, 0]), parameters=parameters, features=[dict(slot="v_0", entity_id="a")])
        data["solids"] = [solid]
        results.append(dict(name=kind, valid=True, data=copy.deepcopy(data)))
        data["solids"][0]["mode"] = "freeform"
        results.append(dict(name=kind + " cannot accidentally become freeform", valid=False, data=copy.deepcopy(data)))
        data["solids"][0]["mode"] = "parametric"
        data["solids"][0]["features"].append(dict(slot="v_1", entity_id="a"))
        results.append(dict(name=kind + " duplicate feature ownership", valid=False, data=data))
    for kind in ("sphere", "cylinder", "cone", "frustum"):
        data = copy.deepcopy(next(c["data"] for c in results if c["name"] == kind))
        data["solids"][0]["features"].append(dict(slot="surface", entity_id="surface"))
        data["surfaces"] = [dict(id="surface", kind=kind, solid_id="solid", slot="surface")]
        data["constructions"] = [dict(id="constraint_d", kind="point_on_surface", surface_id="surface", uv=[0.25, 0.5], output_point_id="d")]
        results.append(dict(name=kind + " curved attachment", valid=True, data=copy.deepcopy(data)))
        data["constructions"][0]["uv"][0] = 1
        results.append(dict(name=kind + " UV seam rejected", valid=False, data=data))
    data = copy.deepcopy(FIXTURES["scene"])
    data["constructions"].append(dict(data["constructions"][0], id="second_owner"))
    results.append(dict(name="multiple construction owners", valid=False, data=data))
    cube = copy.deepcopy(next(c["data"] for c in results if c["name"] == "cube"))
    for name, path, value in (
        ("invalid feature slot", "features", [dict(slot="v_8", entity_id="a")]),
        ("wrong feature category", "features", [dict(slot="e_0", entity_id="a")]),
        ("solid frame nonunit", "frame", dict(origin=[0, 0, 0], x_axis=[2, 0, 0], y_axis=[0, 1, 0])),
        ("negative solid parameter", "parameters", dict(side=-1)),
        ("unknown solid parameter", "parameters", dict(side=1, other=1)),
    ):
        data = copy.deepcopy(cube); data["solids"][0][path] = value
        results.append(dict(name=name, valid=False, data=data))
    data = copy.deepcopy(FIXTURES["scene"])
    data["constructions"][0] = dict(id="constraint_d", kind="point_on_face", face_id="face_abc", uv=[2, 3], output_point_id="d")
    results.append(dict(name="face point outside polygon", valid=False, data=data))
    data = copy.deepcopy(FIXTURES["scene"])
    data["markings"][0] = dict(id="equal_edges", kind="equal_length", point_ids=["a", "b", "a", "c"], label=None)
    results.append(dict(name="equal edges may share a point", valid=True, data=data))
    # A consistently oriented closed tetrahedron exercises the explicit freeform mode.
    tetra = copy.deepcopy(FIXTURES["scene"])
    tetra["points"][0]["position"] = [0, 0, 1]
    tetra["constructions"] = []
    tetra["edges"] = [dict(id="edge_"+a+b, start=a, end=b) for a, b in (("a", "b"), ("a", "c"), ("a", "d"), ("b", "c"), ("b", "d"), ("c", "d"))]
    tetra["faces"] = [dict(id="face_"+str(i), boundary=b) for i, b in enumerate((["a", "c", "b"], ["a", "b", "d"], ["a", "d", "c"], ["b", "c", "d"]))]
    tetra["solids"] = [dict(id="tetra", kind="polyhedron", mode="freeform", point_ids=["a", "b", "c", "d"], edge_ids=[e["id"] for e in tetra["edges"]], face_ids=[f["id"] for f in tetra["faces"]])]
    results.append(dict(name="freeform tetrahedron", valid=True, data=copy.deepcopy(tetra)))
    tetra["faces"][0]["boundary"].reverse()
    results.append(dict(name="inconsistent face orientation", valid=False, data=tetra))
    data = copy.deepcopy(FIXTURES["scene"])
    data["faces"][0]["boundary"] = ["a", "b", "c", "d"]
    data["points"][0]["position"] = [1, 1, 0]
    results.append(dict(name="self-intersecting face", valid=False, data=copy.deepcopy(data)))
    data["points"][0]["position"] = [1, 1, 1]
    results.append(dict(name="nonplanar face", valid=False, data=data))
    data = copy.deepcopy(FIXTURES["scene"])
    data["annotations"] = [dict(id="annotation_"+str(i), content="ə"*4096, format="text", anchor=dict(kind="world", position=[0, 0, 0]), offset_mm=[0, 0]) for i in range(130)]
    results.append(dict(name="UTF8 payload limit", valid=False, data=data))
    empty = copy.deepcopy(FIXTURES["scene"])
    for name in ("points", "linear_objects", "planes", "edges", "faces", "surfaces", "solids", "constructions", "annotations", "markings"):
        empty[name] = []
    results.append(dict(name="empty scene", valid=True, data=empty))
    for kind in ([], {}, None, True, 42):
        data = copy.deepcopy(FIXTURES["scene"])
        data["constructions"][0]["kind"] = kind
        results.append(dict(name="malformed discriminator " + repr(kind), valid=False, data=data))
    translated = copy.deepcopy(next(c["data"] for c in results if c["name"] == "freeform tetrahedron"))
    for p in translated["points"]:
        p["position"] = [v + 1e9 for v in p["position"]]
    results.append(dict(name="translated freeform volume", valid=True, data=translated))
    return results


def evaluated_cases():
    results = []
    for case in fixtures():
        try:
            canonical = GeometryBlockWritePayload(source_data=case["data"]).source_data.model_dump(mode="json")
        except ValidationError:
            canonical = None
        if (canonical is not None) != case["valid"]:
            raise AssertionError(case["name"])
        results.append(dict(case, canonical=canonical))
    return results


class Geometry3DContractTest(unittest.TestCase):
    def test_fixtures_and_write_boundary(self):
        for case in evaluated_cases():
            if case["canonical"] is not None:
                self.assertEqual(normalize_scene_3d(case["canonical"]), case["canonical"])

    def test_nonfinite_and_strict_boundaries(self):
        for value in (float("nan"), float("inf"), -float("inf"), 10**1000):
            data = copy.deepcopy(FIXTURES["scene"])
            data["points"][0]["position"][0] = value
            with self.assertRaises(ValidationError):
                GeometryScene3D.model_validate(data)

    def test_limits_and_missing_fields(self):
        for mutation in (lambda d: d.pop("points"), lambda d: d.update(points=d["points"] * 501), lambda d: d.update(description="x" * 4097)):
            data = copy.deepcopy(FIXTURES["scene"])
            mutation(data)
            with self.assertRaises(ValidationError):
                GeometryScene3D.model_validate(data)

    def test_deterministic_no_mutation_and_ids(self):
        data = copy.deepcopy(FIXTURES["scene"])
        before = copy.deepcopy(data)
        canonical = GeometryScene3D.model_validate(data).model_dump(mode="json")
        self.assertEqual(data, before)
        self.assertEqual([p["id"] for p in canonical["points"]], ["a", "b", "c", "d"])
        data["points"].reverse()
        self.assertEqual(GeometryScene3D.model_validate(data).model_dump(mode="json"), canonical)

    def test_openapi_typed_variants(self):
        schema = GeometryBlockWritePayload.model_json_schema()
        self.assertEqual(schema["properties"]["source_data"]["discriminator"]["propertyName"], "schema_version")
        self.assertIn("Geometry3D_solid_cube", schema["$defs"])

    def test_editing_camera_separate_and_validated(self):
        scene = GeometryScene3D.model_validate(FIXTURES["scene"]).model_dump(mode="json")
        camera = copy.deepcopy(scene["print_camera"])
        camera["position"] = [6, 4, 3]
        GeometryEditingCamera3D.model_validate(camera)
        self.assertEqual(scene["print_camera"], FIXTURES["scene"]["print_camera"])
        camera["near"] = camera["far"]
        with self.assertRaises(ValidationError):
            GeometryEditingCamera3D.model_validate(camera)

    def test_update_read_roundtrip_and_2d_compatibility(self):
        for data in (FIXTURES["scene"], geometry_v1()):
            update = GeometryBlockUpdate.model_validate(dict(source_data=data, expected_revision_updated_at=NOW))
            dumped = update.model_dump(mode="json")
            self.assertEqual(GeometryBlockUpdate.model_validate(dumped).source_data.model_dump(mode="json"), update.source_data.model_dump(mode="json"))
        self.assertEqual(GeometryBlockWritePayload(source_data=geometry_v1()).source_data.model_dump(mode="json"), geometry_v1())

    def test_golden_canonical_fixture(self):
        expected = json.loads(Path(__file__).with_name("geometry_3d_canonical.json").read_text(encoding="utf-8"))
        self.assertEqual(GeometryScene3D.model_validate(FIXTURES["scene"]).model_dump(mode="json"), expected)


if __name__ == "__main__":
    if "--fixtures" in sys.argv:
        print(json.dumps(evaluated_cases(), ensure_ascii=True))
    else:
        unittest.main()
