from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class GeometryJSXGraphFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        frontend = ROOT / "frontend"
        cls.package = json.loads((frontend / "package.json").read_text(encoding="utf-8"))
        cls.lock = (frontend / "package-lock.json").read_text(encoding="utf-8")
        cls.board = (frontend / "src/components/GeometryAuthoringBoard.tsx").read_text(encoding="utf-8")
        cls.editor = (frontend / "src/components/GeometryEditor.tsx").read_text(encoding="utf-8")
        cls.model = (frontend / "src/components/geometryAuthoringModel.ts").read_text(encoding="utf-8")
        cls.question_editor = (frontend / "src/components/AdminQuestionEditor.tsx").read_text(encoding="utf-8")
        cls.renderer = (frontend / "src/components/GeometryRenderer.tsx").read_text(encoding="utf-8")

    def test_jsxgraph_is_an_exact_local_production_dependency(self) -> None:
        self.assertEqual(self.package["dependencies"]["jsxgraph"], "1.13.2")
        self.assertIn('"node_modules/jsxgraph"', self.lock)
        self.assertIn("import JXG from 'jsxgraph'", self.board)
        self.assertNotIn("cdn", self.board.lower())

    def test_geometry_v1_remains_controlled_persisted_state(self) -> None:
        self.assertIn("geometry: GeometrySourceDataV1", self.board)
        self.assertIn("onChange: (geometry: GeometrySourceDataV1)", self.board)
        self.assertIn("source_data: newGeometry", self.question_editor)
        self.assertIn("source_data: editingGeometry", self.question_editor)
        for runtime_value in ("board.id", "element.id", "event:"):
            self.assertNotIn(runtime_value, self.model)

    def test_point_tool_creates_automatic_id_and_label(self) -> None:
        self.assertIn("tool !== 'point'", self.board)
        self.assertIn("addGeometryPoint(geometry, x", self.board)
        self.assertIn("nextId('point'", self.model)
        self.assertIn("nextPointLabel(geometry)", self.model)
        self.assertIn("String.fromCharCode(65 + (index % 26))", self.model)

    def test_dragging_updates_geometry_v1_coordinates(self) -> None:
        self.assertIn("element.on('up'", self.board)
        self.assertIn("moveGeometryPoint(geometry, point.id, element.X()", self.board)
        self.assertIn("geometryYFromBoard", self.board)

    def test_segment_tool_uses_two_clicked_points(self) -> None:
        self.assertIn("tool === 'segment'", self.editor)
        self.assertIn("addGeometrySegment(value, current[0], nextSelection.id)", self.editor)
        self.assertIn("start_point_id: startPointId", self.model)
        self.assertIn("end_point_id: endPointId", self.model)

    def test_polygon_tool_requires_three_distinct_points(self) -> None:
        self.assertIn("addGeometryPolygon(value, pendingPointIds)", self.editor)
        self.assertIn("pointIds.length < 3", self.model)
        self.assertIn("new Set(pointIds).size !== pointIds.length", self.model)
        self.assertIn("Çoxbucaqlını tamamla", self.editor)

    def test_point_deletion_cascades_to_dependents(self) -> None:
        self.assertIn("deleteGeometrySelection", self.editor)
        self.assertIn("segment.start_point_id !== selection.id", self.model)
        self.assertIn("!polygon.point_ids.includes(selection.id)", self.model)
        self.assertIn("ona bağlı parçalar/çoxbucaqlılar silindi", self.editor)

    def test_existing_geometry_recreates_jsxgraph_objects(self) -> None:
        self.assertIn("geometry.points.forEach", self.board)
        self.assertIn("geometry.polygons.forEach", self.board)
        self.assertIn("geometry.segments.forEach", self.board)
        self.assertIn("board.create('point'", self.board)
        self.assertIn("board.create('polygon'", self.board)
        self.assertIn("board.create('segment'", self.board)

    def test_viewport_is_internal_and_technical_fields_are_hidden(self) -> None:
        self.assertIn("geometry.viewport", self.board)
        self.assertNotIn('type="number"', self.editor)
        self.assertNotIn('<span>ID</span>', self.editor)
        self.assertNotIn("min_x", self.editor)

    def test_description_legacy_security_and_canonical_renderer_are_preserved(self) -> None:
        self.assertIn("Əlçatan təsvir", self.editor)
        self.assertIn("required", self.editor)
        self.assertIn("normalizeGeometrySourceDataV1(block.payload.source_data)", (ROOT / "frontend/src/components/VisualContentRenderer.tsx").read_text(encoding="utf-8"))
        self.assertIn("<svg", self.renderer)
        combined = self.board + self.editor + self.model
        self.assertNotIn("dangerouslySetInnerHTML", combined)
        self.assertNotIn("eval(", combined)


if __name__ == "__main__":
    unittest.main()
