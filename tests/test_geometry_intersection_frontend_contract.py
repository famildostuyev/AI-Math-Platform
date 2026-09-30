from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class GeometryIntersectionFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.api = (
            ROOT / "frontend/src/api/questionEditor.ts"
        ).read_text(encoding="utf-8")
        cls.model = (
            ROOT / "frontend/src/components/geometryConstructionModel.ts"
        ).read_text(encoding="utf-8")

    def test_api_exposes_intersection_construction_type(self) -> None:
        for token in (
            "GeometryIntersectionConstructionV1",
            "kind: 'intersection'",
            "source_a: GeometryLinearSourceV1",
            "source_b: GeometryLinearSourceV1",
            "output_point_id: string",
        ):
            self.assertIn(token, self.api)

        self.assertIn(
            "GeometryIntersectionConstructionV1",
            self.api.split(
                "export type GeometryConstructionV1 =",
                1,
            )[1].split(
                "export type GeometrySourceDataV1",
                1,
            )[0],
        )

    def test_construction_model_has_intersection_evaluator(self) -> None:
        for token in (
            "intersection",
            "source_a",
            "source_b",
            "output_point_id",
        ):
            self.assertIn(token, self.model)


if __name__ == "__main__":
    unittest.main()
