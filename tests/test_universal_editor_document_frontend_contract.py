from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UniversalEditorDocumentFrontendContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        components = ROOT / "frontend/src/components"
        cls.model = (components / "universalEditorDocument.ts").read_text(encoding="utf-8")
        cls.adapter = (components / "universalEditorDocumentAdapter.ts").read_text(encoding="utf-8")
        cls.editor = (components / "AdminQuestionEditor.tsx").read_text(encoding="utf-8")

    def test_document_model_is_a_discriminated_high_level_node_union(self) -> None:
        self.assertIn("export type UniversalEditorDocument", self.model)
        self.assertIn("export type UniversalDocumentNode", self.model)
        for discriminator in (
            "type: 'paragraph'", "type: 'display_formula'", "type: 'geometry'",
            "type: 'image'", "type: 'graph'", "type: 'table'",
            "type: 'diagram'", "type: 'unsupported'",
        ):
            self.assertIn(discriminator, self.model)
        self.assertIn("id: UUID", self.model)
        self.assertIn("order: number", self.model)

    def test_paragraph_supports_typed_text_and_inline_formula_without_guessing(self) -> None:
        self.assertIn("type: 'text'", self.model)
        self.assertIn("type: 'inline_formula'", self.model)
        self.assertIn("inlineContent: UniversalInlineContent[] | null", self.model)
        self.assertIn("document: StructuredTextDocument", self.model)
        self.assertIn("inline.type === 'inline_math'", self.adapter)
        self.assertNotIn("RegExp", self.adapter)
        self.assertNotIn(".match(", self.adapter)
        self.assertNotIn(".test(", self.adapter)

    def test_visual_placement_foundation_persists_only_versioned_subset(self) -> None:
        for concept in (
            "layoutMode?", "anchor?", "position?", "size?", "rotationDegrees?",
            "zOrder?", "locked?", "parentGroupId?",
        ):
            self.assertIn(concept, self.model)
        for layout_mode in ("'inline'", "'anchored'", "'floating'"):
            self.assertIn(layout_mode, self.model)
        self.assertIn("versioned floating/px subset is persisted", self.model)
        self.assertIn("placement: geometryBlock.visual_placement", self.adapter)

    def test_adapter_is_pure_order_preserving_and_maps_known_blocks(self) -> None:
        self.assertIn("export function adaptContentBlocksToUniversalDocument", self.adapter)
        self.assertIn("nodes: blocks.map(adaptBlock)", self.adapter)
        self.assertIn("id: block.id, order: block.sort_order", self.adapter)
        for case in ("'text'", "'formula'", "'image'", "'geometry'"):
            self.assertIn(f"case {case}", self.adapter)
        for forbidden in (".sort(", ".splice(", ".push(", "structuredClone"):
            self.assertNotIn(forbidden, self.adapter)

    def test_geometry_remains_one_node_with_intrinsic_children_inside_payload(self) -> None:
        self.assertIn("type: 'geometry'", self.adapter)
        self.assertIn("sourceData: geometryBlock.payload.source_data", self.adapter)
        self.assertIn("normalizeGeometrySourceDataV1(geometryBlock.payload.source_data)", self.adapter)
        self.assertNotIn("points.map", self.adapter)
        self.assertNotIn("segments.map", self.adapter)
        self.assertNotIn("polygons.map", self.adapter)
        self.assertNotIn("texts.map", self.adapter)

    def test_reserved_and_unknown_blocks_remain_losslessly_identifiable(self) -> None:
        for reserved in ("case 'graph'", "case 'table'", "case 'diagram'"):
            self.assertIn(reserved, self.adapter)
        self.assertIn("type: 'unsupported'", self.adapter)
        self.assertIn("blockType: block.block_type", self.adapter)
        self.assertIn("sourcePayload: block.payload", self.adapter)

    def test_adapter_has_no_ai_classification_or_unsafe_rendering(self) -> None:
        combined = self.model + self.adapter
        for forbidden in (
            "OpenAI", "planner", "classify", "looksLike", "dangerouslySetInnerHTML",
            "innerHTML", "eval(",
        ):
            self.assertNotIn(forbidden, combined)

    def test_persistence_boundary_does_not_implement_fake_serialization(self) -> None:
        self.assertIn("interface UniversalDocumentPersistenceBoundary", self.model)
        self.assertIn("existing_content_block_crud", self.model)
        self.assertNotIn("serializeUniversal", self.model + self.adapter)
        self.assertNotIn("saveUniversal", self.model + self.adapter)

    def test_admin_editor_derives_document_without_duplicate_rendering(self) -> None:
        self.assertIn("useMemo", self.editor)
        self.assertIn("adaptContentBlocksToUniversalDocument(revision?.blocks ?? [])", self.editor)
        self.assertIn("selectedNodeId={selectedDocumentNodeId}", self.editor)
        self.assertIn("document={universalDocument}", self.editor)
        self.assertIn("onCreateGeometryFrame={createGeometryFrame}", self.editor)
        self.assertIn("<UniversalQuestionCanvas", self.editor)


if __name__ == "__main__":
    unittest.main()
