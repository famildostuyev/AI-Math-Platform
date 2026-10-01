import copy
import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.schemas.question_editor import GeometrySourceDataV1


class GeometryIntersectionConstructionContractTest(unittest.TestCase):
    def source(self):
        return {
            "schema_version": 1,
            "description": "F3 intersection",
            "viewport": {"min_x": 0, "min_y": 0, "width": 100, "height": 100},
            "points": [
                {"id": "a", "x": 0, "y": 0, "label": None},
                {"id": "b", "x": 10, "y": 10, "label": None},
                {"id": "c", "x": 0, "y": 10, "label": None},
                {"id": "d", "x": 10, "y": 0, "label": None},
                {"id": "x", "x": 5, "y": 5, "label": None},
            ],
            "segments": [
                {"id": "s1", "start_point_id": "a", "end_point_id": "b"},
                {"id": "s2", "start_point_id": "c", "end_point_id": "d"},
            ],
            "polygons": [],
            "texts": [],
            "constructions": [{
                "id": "i1",
                "kind": "intersection",
                "source_a": {"kind": "segment", "id": "s1"},
                "source_b": {"kind": "segment", "id": "s2"},
                "output_point_id": "x",
            }],
        }

    def assert_rejected(self, mutate):
        source = copy.deepcopy(self.source())
        mutate(source)
        with self.assertRaises(ValidationError):
            GeometrySourceDataV1.model_validate(source)

    def test_intersection_contract_is_accepted(self):
        source = self.source()
        self.assertEqual(
            GeometrySourceDataV1.model_validate(source).model_dump(),
            source,
        )

    def test_unknown_output_point_is_rejected(self):
        self.assert_rejected(
            lambda g: g["constructions"][0].update(output_point_id="missing")
        )

    def test_unknown_or_wrong_typed_sources_are_rejected(self):
        patches = [
            {"source_a": {"kind": "segment", "id": "missing"}},
            {"source_b": {"kind": "segment", "id": "missing"}},
            {"source_a": {"kind": "line", "id": "s1"}},
            {"source_b": {"kind": "vector", "id": "s2"}},
        ]
        for patch in patches:
            with self.subTest(patch=patch):
                self.assert_rejected(
                    lambda g, patch=patch: g["constructions"][0].update(patch)
                )

    def test_same_source_is_rejected(self):
        self.assert_rejected(
            lambda g: g["constructions"][0].update(
                source_b={"kind": "segment", "id": "s1"}
            )
        )

    def test_output_coordinates_must_match_intersection(self):
        self.assert_rejected(
            lambda g: g["points"][-1].update(x=6)
        )

    def test_parallel_sources_are_rejected(self):
        def mutate(g):
            g["points"][2].update(x=0, y=2)
            g["points"][3].update(x=10, y=12)

        self.assert_rejected(mutate)

    def test_line_and_directed_line_intersections_allow_extended_bounds(self):
        for kind in ("line", "directed_line"):
            with self.subTest(kind=kind):
                source = copy.deepcopy(self.source())
                source["points"][2].update(x=20, y=10)
                source["points"][3].update(x=30, y=0)
                source["points"][-1].update(x=15, y=15)
                source["lines"] = [
                    {
                        "id": "base-line",
                        "kind": "line",
                        "start_point_id": "a",
                        "end_point_id": "b",
                    },
                    {
                        "id": "extended",
                        "kind": kind,
                        "start_point_id": "c",
                        "end_point_id": "d",
                    },
                ]
                source["constructions"][0]["source_a"] = {
                    "kind": "line",
                    "id": "base-line",
                }
                source["constructions"][0]["source_b"] = {
                    "kind": kind,
                    "id": "extended",
                }
                GeometrySourceDataV1.model_validate(source)

    def test_vector_intersection_outside_vector_bounds_is_rejected(self):
        source = copy.deepcopy(self.source())
        source["points"][2].update(x=20, y=10)
        source["points"][3].update(x=30, y=0)
        source["points"][-1].update(x=15, y=15)
        source["lines"] = [
            {
                "id": "base-line",
                "kind": "line",
                "start_point_id": "a",
                "end_point_id": "b",
            },
            {
                "id": "v1",
                "kind": "vector",
                "start_point_id": "c",
                "end_point_id": "d",
            },
        ]
        source["constructions"][0]["source_a"] = {
            "kind": "line",
            "id": "base-line",
        }
        source["constructions"][0]["source_b"] = {
            "kind": "vector",
            "id": "v1",
        }
        with self.assertRaises(ValidationError):
            GeometrySourceDataV1.model_validate(source)
    def test_dependency_chain_accepts_reverse_construction_order(self):
        source = {
            "schema_version": 1,
            "description": "F3 reverse-order dependency chain",
            "viewport": {
                "min_x": 0,
                "min_y": 0,
                "width": 100,
                "height": 100,
            },
            "points": [
                {"id": "a", "x": 0, "y": 0, "label": None},
                {"id": "b", "x": 10, "y": 0, "label": None},
                {"id": "p", "x": 0, "y": 5, "label": None},
                {"id": "q", "x": 1, "y": 5, "label": None},
                {"id": "c", "x": 5, "y": 0, "label": None},
                {"id": "d", "x": 5, "y": 10, "label": None},
                {"id": "x", "x": 5, "y": 5, "label": None},
            ],
            "segments": [
                {
                    "id": "base",
                    "start_point_id": "a",
                    "end_point_id": "b",
                },
                {
                    "id": "cross",
                    "start_point_id": "c",
                    "end_point_id": "d",
                },
            ],
            "polygons": [],
            "texts": [],
            "lines": [
                {
                    "id": "derived",
                    "kind": "line",
                    "start_point_id": "p",
                    "end_point_id": "q",
                },
            ],
            "constructions": [
                {
                    "id": "intersection-first",
                    "kind": "intersection",
                    "source_a": {
                        "kind": "line",
                        "id": "derived",
                    },
                    "source_b": {
                        "kind": "segment",
                        "id": "cross",
                    },
                    "output_point_id": "x",
                },
                {
                    "id": "parallel-second",
                    "kind": "parallel",
                    "source": {
                        "kind": "segment",
                        "id": "base",
                    },
                    "through_point_id": "p",
                    "output_line_id": "derived",
                    "support_point_id": "q",
                },
            ],
        }

        parsed = GeometrySourceDataV1.model_validate(source)
        self.assertEqual(parsed.model_dump(), source)
    def test_disjoint_segments_are_rejected(self):
        def mutate(g):
            g["points"][2].update(x=20, y=10)
            g["points"][3].update(x=30, y=0)
            g["points"][-1].update(x=15, y=15)

        self.assert_rejected(mutate)


if __name__ == "__main__":
    unittest.main()