from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.structured_text import (
    STRUCTURED_TEXT_FORMAT_VERSION,
    StructuredTextDocument,
    legacy_source_text_to_document,
    project_source_text,
)


def document(*content: dict[str, object]) -> StructuredTextDocument:
    return StructuredTextDocument.model_validate(
        {"type": "document", "content": list(content)}
    )


def paragraph(*content: dict[str, object], **extra: object) -> dict[str, object]:
    return {"type": "paragraph", "content": list(content), **extra}


def text(value: str, marks: list[dict[str, object]] | None = None) -> dict[str, object]:
    node: dict[str, object] = {"type": "text", "text": value}
    if marks is not None:
        node["marks"] = marks
    return node


class StructuredTextSchemaTest(unittest.TestCase):
    def assert_invalid(self, payload: dict[str, object]) -> None:
        with self.assertRaises(ValidationError):
            StructuredTextDocument.model_validate(payload)

    def test_empty_document_is_valid(self) -> None:
        self.assertEqual(document().content, [])

    def test_plain_paragraph_is_valid(self) -> None:
        self.assertEqual(document(paragraph(text("Hello"))).type, "document")

    def test_multiple_paragraphs_are_valid(self) -> None:
        self.assertEqual(
            len(document(paragraph(text("One")), paragraph(text("Two"))).content),
            2,
        )

    def test_mixed_text_and_inline_math_are_valid(self) -> None:
        value = document(
            paragraph(text("Let "), {"type": "inline_math", "latex": "x^2"})
        )
        self.assertEqual(len(value.content[0].content), 2)

    def test_bold_text_is_valid(self) -> None:
        document(paragraph(text("B", [{"type": "bold"}])))

    def test_italic_text_is_valid(self) -> None:
        document(paragraph(text("I", [{"type": "italic"}])))

    def test_underlined_text_is_valid(self) -> None:
        document(paragraph(text("U", [{"type": "underline"}])))

    def test_font_family_token_is_valid(self) -> None:
        document(
            paragraph(text("S", [{"type": "font_family", "value": "serif"}]))
        )

    def test_font_size_token_is_valid(self) -> None:
        document(
            paragraph(text("L", [{"type": "font_size", "value": "large"}]))
        )

    def test_alignment_is_valid_and_absent_by_default(self) -> None:
        value = document(paragraph(text("C"), attrs={"alignment": "center"}))
        self.assertEqual(value.content[0].attrs.alignment, "center")
        self.assertIsNone(document(paragraph()).content[0].attrs)

    def test_bullet_list_is_valid(self) -> None:
        value = document({
            "type": "bullet_list",
            "content": [{"type": "list_item", "content": [paragraph(text("A"))]}],
        })
        self.assertEqual(value.content[0].type, "bullet_list")

    def test_ordered_list_is_valid(self) -> None:
        value = document({
            "type": "ordered_list",
            "content": [{"type": "list_item", "content": [paragraph(text("A"))]}],
        })
        self.assertEqual(value.content[0].type, "ordered_list")

    def test_empty_list_is_draft_valid(self) -> None:
        self.assertEqual(document({"type": "bullet_list", "content": []}).content[0].content, [])

    def test_hard_break_is_valid(self) -> None:
        document(paragraph(text("A"), {"type": "hard_break"}, text("B")))

    def test_empty_text_is_draft_valid(self) -> None:
        document(paragraph(text("")))

    def test_empty_inline_math_is_draft_valid(self) -> None:
        document(paragraph({"type": "inline_math", "latex": ""}))

    def test_unknown_node_type_is_invalid(self) -> None:
        self.assert_invalid({"type": "document", "content": [{"type": "heading"}]})

    def test_unknown_mark_is_invalid(self) -> None:
        self.assert_invalid({"type": "document", "content": [paragraph(text("X", [{"type": "strike"}]))]})

    def test_invalid_font_family_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [paragraph(text("X", [{"type": "font_family", "value": "Comic Sans"}]))]})

    def test_invalid_font_size_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [paragraph(text("X", [{"type": "font_size", "value": "16px"}]))]})

    def test_invalid_alignment_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [paragraph(attrs={"alignment": "left"})]})

    def test_paragraph_containing_list_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [paragraph({"type": "bullet_list", "content": []})]})

    def test_list_containing_text_directly_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [{"type": "bullet_list", "content": [text("X")]}]})

    def test_document_containing_inline_math_directly_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [{"type": "inline_math", "latex": "x"}]})

    def test_nested_list_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [{"type": "bullet_list", "content": [{"type": "list_item", "content": [{"type": "bullet_list", "content": []}]}]}]})

    def test_list_item_requires_a_paragraph(self) -> None:
        self.assert_invalid({"type": "document", "content": [{"type": "bullet_list", "content": [{"type": "list_item", "content": []}]}]})

    def test_duplicate_font_family_is_rejected(self) -> None:
        marks = [{"type": "font_family", "value": "serif"}, {"type": "font_family", "value": "sans"}]
        self.assert_invalid({"type": "document", "content": [paragraph(text("X", marks))]})

    def test_duplicate_font_size_is_rejected(self) -> None:
        marks = [{"type": "font_size", "value": "small"}, {"type": "font_size", "value": "large"}]
        self.assert_invalid({"type": "document", "content": [paragraph(text("X", marks))]})

    def test_duplicate_simple_mark_is_rejected(self) -> None:
        marks = [{"type": "bold"}, {"type": "bold"}]
        self.assert_invalid({"type": "document", "content": [paragraph(text("X", marks))]})

    def test_extra_structural_field_is_rejected(self) -> None:
        self.assert_invalid({"type": "document", "content": [paragraph(html="<b>X</b>")]})

    def test_plain_text_projection(self) -> None:
        self.assertEqual(project_source_text(document(paragraph(text("Hello")))), "Hello")

    def test_inline_math_projection_uses_raw_latex(self) -> None:
        value = document(paragraph(text("Value: "), {"type": "inline_math", "latex": "x^2"}))
        self.assertEqual(project_source_text(value), "Value: x^2")

    def test_paragraph_projection_uses_newline_boundary(self) -> None:
        self.assertEqual(project_source_text(document(paragraph(text("A")), paragraph(text("B")))), "A\nB")

    def test_hard_break_projection_uses_newline(self) -> None:
        value = document(paragraph(text("A"), {"type": "hard_break"}, text("B")))
        self.assertEqual(project_source_text(value), "A\nB")

    def test_bullet_list_projection(self) -> None:
        value = document({"type": "bullet_list", "content": [
            {"type": "list_item", "content": [paragraph(text("A"))]},
            {"type": "list_item", "content": [paragraph(text("B")), paragraph(text("More"))]},
        ]})
        self.assertEqual(project_source_text(value), "- A\n- B\n  More")

    def test_ordered_list_projection(self) -> None:
        value = document({"type": "ordered_list", "content": [
            {"type": "list_item", "content": [paragraph(text("A"))]},
            {"type": "list_item", "content": [paragraph(text("B"))]},
        ]})
        self.assertEqual(project_source_text(value), "1. A\n2. B")

    def test_marks_do_not_affect_projection(self) -> None:
        value = document(paragraph(text("Same", [{"type": "bold"}, {"type": "font_size", "value": "large"}])))
        self.assertEqual(project_source_text(value), "Same")

    def test_legacy_source_text_conversion(self) -> None:
        value = legacy_source_text_to_document("Legacy $x$ text")
        self.assertEqual(value.model_dump(mode="json"), {
            "type": "document",
            "content": [{"type": "paragraph", "attrs": None, "content": [
                {"type": "text", "text": "Legacy $x$ text", "marks": []}
            ]}],
        })

    def test_empty_legacy_source_text_conversion(self) -> None:
        value = legacy_source_text_to_document("")
        self.assertEqual(project_source_text(value), "")

    def test_supported_format_version_is_one(self) -> None:
        self.assertEqual(STRUCTURED_TEXT_FORMAT_VERSION, 1)


if __name__ == "__main__":
    unittest.main()
