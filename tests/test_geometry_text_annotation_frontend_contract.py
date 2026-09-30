from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class GeometryTextAnnotationFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        base = ROOT / "frontend/src/components"
        cls.api = (ROOT / "frontend/src/api/questionEditor.ts").read_text(encoding="utf-8")
        cls.model = (base / "geometryAuthoringModel.ts").read_text(encoding="utf-8")
        cls.contract = (base / "geometryV1.ts").read_text(encoding="utf-8")
        cls.board = (base / "GeometryAuthoringBoard.tsx").read_text(encoding="utf-8")
        cls.editor = (base / "GeometryEditor.tsx").read_text(encoding="utf-8")
        cls.renderer = (base / "GeometryRenderer.tsx").read_text(encoding="utf-8")
        cls.question_editor = (base / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")

    def test_typed_annotation_contract_and_legacy_normalization(self) -> None:
        for token in ("export type GeometryTextV1", "id: string", "x: number", "y: number", "content: string", "texts: GeometryTextV1[]"):
            self.assertIn(token, self.api)
        self.assertIn("const hasTexts = Object.hasOwn(value, 'texts')", self.contract)
        self.assertIn("texts,", self.contract)

    def test_text_tool_creates_automatic_geometry_v1_annotation(self) -> None:
        self.assertIn("text: 'Mətn'", self.editor)
        self.assertIn("tool !== 'point' && tool !== 'text'", self.board)
        self.assertIn("addGeometryText(geometry, x", self.board)
        self.assertIn("nextId('text'", self.model)
        self.assertNotIn('<span>ID</span>', self.editor)

    def test_annotation_content_is_react_controlled_and_editable(self) -> None:
        self.assertIn("selectedText.content", self.editor)
        self.assertIn("updateGeometryTextContent(value, selectedText.id", self.editor)
        self.assertIn("Mətn annotasiyası", self.editor)
        self.assertIn("required", self.editor)

    def test_annotation_is_projected_and_moved_without_runtime_serialization(self) -> None:
        self.assertIn("geometry.texts.forEach", self.board)
        self.assertIn("board.create('text'", self.board)
        self.assertIn("display: 'internal'", self.board)
        self.assertIn("parse: false", self.board)
        self.assertIn("moveGeometryText(geometry, text.id, element.X()", self.board)
        self.assertNotIn("element.id", self.model)
        self.assertNotIn("board.id", self.model)

    def test_annotation_deletion_is_independent(self) -> None:
        self.assertIn("texts: geometry.texts.filter", self.model)
        text_delete = self.model.split("return { ...geometry, texts: geometry.texts.filter", 1)[1]
        self.assertNotIn("points:", text_delete)
        self.assertNotIn("segments:", text_delete)
        self.assertNotIn("polygons:", text_delete)

    def test_point_labels_and_annotations_remain_separate(self) -> None:
        self.assertIn("renameGeometryPoint", self.model)
        self.assertIn("updateGeometryTextContent", self.model)
        self.assertIn("point.label", self.renderer)
        self.assertIn("geometry.texts.map", self.renderer)

    def test_canonical_svg_uses_safe_react_text(self) -> None:
        self.assertIn('<g className="geometry-annotations">', self.renderer)
        self.assertIn("<text key={text.id} x={text.x} y={text.y}", self.renderer)
        self.assertIn(">{text.content}</text>", self.renderer)
        combined = self.renderer + self.board + self.editor
        self.assertNotIn("dangerouslySetInnerHTML", combined)
        self.assertNotIn("eval(", combined)
        self.assertNotIn("JessieCode", combined)

    def test_new_sessions_are_empty_and_saved_figures_still_normalize(self) -> None:
        self.assertIn("emptyGeometryV1", self.question_editor)
        for token in ("points: []", "segments: []", "polygons: []", "texts: []"):
            self.assertIn(token, self.contract)
        self.assertNotIn("defaultTriangleGeometry", self.question_editor)
        self.assertIn("structuredClone(geometry)", self.question_editor)

    def test_technical_position_and_id_fields_are_not_exposed(self) -> None:
        self.assertNotIn('type="number"', self.editor)
        self.assertNotIn('<span>ID</span>', self.editor)
        self.assertNotIn("text.x", self.editor)
        self.assertNotIn("text.y", self.editor)


if __name__ == "__main__":
    unittest.main()
