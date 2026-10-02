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
        cls.authoring_model = (
            ROOT / "frontend/src/components/geometryAuthoringModel.ts"
        ).read_text(encoding="utf-8")
        cls.ribbon = (
            ROOT / "frontend/src/components/geometryRibbonMenu.ts"
        ).read_text(encoding="utf-8")
        cls.editor = (
            ROOT / "frontend/src/components/GeometryEditor.tsx"
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

    def test_construction_model_exposes_intersection_authoring_helpers(self) -> None:
        for token in (
            "export const findIntersection",
            "export function commitIntersection",
            "GeometryIntersectionConstructionV1",
            "intersectionCoordinates(a1, a2, b1, b2)",
            "findIntersection(g, sourceA, sourceB)",
            "kind: 'intersection'",
            "source_a: { ...sourceA }",
            "source_b: { ...sourceB }",
            "output_point_id: output.id",
        ):
            self.assertIn(token, self.model)

    def test_intersection_authoring_preserves_bounded_source_semantics(self) -> None:
        for token in (
            "['segment', 'vector'].includes(sourceA.kind)",
            "intersection.t >= -tolerance && intersection.t <= 1 + tolerance",
            "['segment', 'vector'].includes(sourceB.kind)",
            "intersection.u >= -tolerance && intersection.u <= 1 + tolerance",
            "CONSTRUCTION_LIMITS.maxConstructions",
            "recomputeConstructions({",
        ):
            self.assertIn(token, self.model)


    def test_intersection_tool_is_wired_through_ribbon(self) -> None:
        self.assertIn("'intersection'", self.authoring_model)
        self.assertIn("action: 'intersection'", self.ribbon)

    def test_editor_commits_intersection_from_two_linear_sources(self) -> None:
        for token in (
            "tool === 'intersection'",
            "commitIntersection",
            "findIntersection",
            "setLinearSource(source)",
            "commitIntersection(value, linearSource, source)",
            "output_point_id",
            "setSelection({ kind: 'point', id })",
            "setTool('select')",
        ):
            self.assertIn(token, self.editor)



if __name__ == "__main__":
    unittest.main()
