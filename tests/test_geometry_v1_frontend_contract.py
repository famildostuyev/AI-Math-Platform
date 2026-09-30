from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class GeometryV1FrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.api = (ROOT / "frontend/src/api/questionEditor.ts").read_text(encoding="utf-8")
        cls.model = (ROOT / "frontend/src/components/geometryV1.ts").read_text(encoding="utf-8")
        cls.renderer = (ROOT / "frontend/src/components/GeometryRenderer.tsx").read_text(encoding="utf-8")
        cls.dispatch = (ROOT / "frontend/src/components/VisualContentRenderer.tsx").read_text(encoding="utf-8")
        cls.editor = (ROOT / "frontend/src/components/GeometryEditor.tsx").read_text(encoding="utf-8")
        cls.question_editor = (ROOT / "frontend/src/components/AdminQuestionEditor.tsx").read_text(encoding="utf-8")
        cls.question_canvas = (ROOT / "frontend/src/components/UniversalQuestionCanvas.tsx").read_text(encoding="utf-8")

    def test_explicit_geometry_v1_types_match_backend_shape(self) -> None:
        for token in (
            "schema_version: 1", "viewport: GeometryViewportV1",
            "description: string", "points: GeometryPointV1[]",
            "segments: GeometrySegmentV1[]", "polygons: GeometryPolygonV1[]",
            "texts: GeometryTextV1[]",
        ):
            self.assertIn(token, self.api)
        self.assertNotIn("any", self.api.split("export type GeometryViewportV1", 1)[1].split("export type BlockDeleteRequest", 1)[0])

    def test_visual_dispatch_reaches_geometry_renderer_and_legacy_fallback(self) -> None:
        self.assertIn("normalizeGeometrySourceDataV1(sourceData)", self.dispatch)
        self.assertIn("<GeometryRenderer geometry={geometry} blockId={blockId} frameSize=", self.dispatch)
        self.assertIn("dəstəklənməyən həndəsə formatıdır", self.dispatch)
        self.assertNotIn("JSON.stringify", self.dispatch)

    def test_triangle_renderer_emits_deterministic_svg_primitives(self) -> None:
        for primitive in ("<svg", "<polygon", "<line", "<circle", "<text"):
            self.assertIn(primitive, self.renderer)
        self.assertIn("geometry.polygons.map", self.renderer)
        self.assertIn("geometry.segments.map", self.renderer)
        self.assertIn("geometry.points.map", self.renderer)

    def test_renderer_uses_viewbox_and_accessibility_semantics(self) -> None:
        self.assertIn("viewBox={viewBox}", self.renderer)
        self.assertIn('role="img"', self.renderer)
        self.assertIn("aria-labelledby={descriptionId}", self.renderer)
        self.assertIn("<title id={descriptionId}>{geometry.description}</title>", self.renderer)

    def test_renderer_has_no_raw_markup_injection_or_payload_styles(self) -> None:
        combined = self.renderer + self.dispatch
        self.assertNotIn("dangerouslySetInnerHTML", combined)
        self.assertNotIn("geometry.style", combined)
        self.assertNotIn("geometry.color", combined)
        stylesheet = (ROOT / "frontend/src/components/VisualContent.css").read_text(encoding="utf-8")
        self.assertIn(".geometry-polygons polygon", stylesheet)
        self.assertIn("@media print", stylesheet)

    def test_question_editor_uses_shared_visual_boundary(self) -> None:
        self.assertIn("import VisualContentRenderer from './VisualContentRenderer'", self.question_canvas)
        self.assertIn("<VisualContentRenderer node={node} />", self.question_canvas)
        self.assertIn("<UniversalQuestionCanvas", self.question_editor)

    def test_create_ui_sends_typed_geometry_v1(self) -> None:
        self.assertIn("createGeometryBlock(token, current.revision_id", self.question_editor)
        self.assertIn("source_data: geometry", self.question_editor)
        self.assertIn("expected_revision_updated_at: current.updated_at", self.question_editor)
        self.assertIn("onCreateGeometryFrame={createGeometryFrame}", self.question_editor)

    def test_edit_ui_initializes_from_existing_geometry_and_updates_it(self) -> None:
        self.assertIn("structuredClone(geometry)", self.question_editor)
        self.assertIn("updateGeometryBlock(token, current.revision_id, block.id", self.question_editor)
        self.assertIn("source_data: editingGeometry", self.question_editor)
        self.assertIn("<GeometryEditor value={editingGeometry}", self.question_canvas)

    def test_editor_uses_visual_board_without_technical_fields(self) -> None:
        self.assertIn("<GeometryAuthoringBoard", self.editor)
        self.assertNotIn('type="number"', self.editor)
        self.assertNotIn('Nöqtə ID-ləri', self.editor)
        self.assertNotIn('<span>ID</span>', self.editor)

    def test_existing_delete_reorder_text_and_formula_paths_remain(self) -> None:
        for token in (
            "deleteBlock(token, current.revision_id, block.id",
            "reorderBlocks(token, current.revision_id",
            "createTextBlock(token, current.revision_id",
            "updateFormulaBlock(token, current.revision_id, block.id",
        ):
            self.assertIn(token, self.question_editor)
        self.assertIn("<MathContent", self.question_canvas)


if __name__ == "__main__":
    unittest.main()
