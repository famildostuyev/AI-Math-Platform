import copy
import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.schemas.question_editor import GeometrySourceDataV1


class GeometryAngleBisectorConstructionContractTest(unittest.TestCase):
    def source(self):
        return {
            "schema_version": 1,
            "description": "Angle bisector construction",
            "viewport": {
                "min_x": 0,
                "min_y": 0,
                "width": 100,
                "height": 100,
            },
            "points": [
                {"id": "a", "x": 10, "y": 0, "label": None},
                {"id": "b", "x": 0, "y": 0, "label": None},
                {"id": "c", "x": 0, "y": 10, "label": None},
                {
                    "id": "support",
                    "x": 0.7071067811865476,
                    "y": 0.7071067811865476,
                    "label": None,
                },
            ],
            "segments": [],
            "polygons": [],
            "texts": [],
            "lines": [
                {
                    "id": "bisector-line",
                    "kind": "line",
                    "start_point_id": "b",
                    "end_point_id": "support",
                },
            ],
            "constructions": [
                {
                    "id": "bisector-1",
                    "kind": "angle_bisector",
                    "source_point_ids": ["a", "b", "c"],
                    "output_line_id": "bisector-line",
                    "support_point_id": "support",
                },
            ],
        }

    def assert_rejected(self, mutate):
        source = copy.deepcopy(self.source())
        mutate(source)
        with self.assertRaises(ValidationError):
            GeometrySourceDataV1.model_validate(source)

    def test_angle_bisector_contract_is_accepted(self):
        source = self.source()
        self.assertEqual(
            GeometrySourceDataV1.model_validate(source).model_dump(),
            source,
        )

    def test_unknown_source_point_is_rejected(self):
        self.assert_rejected(
            lambda g: g["constructions"][0].update(
                source_point_ids=["a", "missing", "c"]
            )
        )

    def test_repeated_source_points_are_rejected(self):
        self.assert_rejected(
            lambda g: g["constructions"][0].update(
                source_point_ids=["a", "b", "a"]
            )
        )

    def test_unknown_output_line_is_rejected(self):
        self.assert_rejected(
            lambda g: g["constructions"][0].update(
                output_line_id="missing"
            )
        )

    def test_unknown_support_point_is_rejected(self):
        self.assert_rejected(
            lambda g: g["constructions"][0].update(
                support_point_id="missing"
            )
        )

    def test_output_line_must_start_at_vertex(self):
        self.assert_rejected(
            lambda g: g["lines"][0].update(start_point_id="a")
        )

    def test_support_coordinates_must_match_angle_bisector(self):
        self.assert_rejected(
            lambda g: g["points"][-1].update(x=1, y=0)
        )

    def test_degenerate_angle_is_rejected(self):
        self.assert_rejected(
            lambda g: g["points"][2].update(x=0, y=0)
        )


if __name__ == "__main__":
    unittest.main()
