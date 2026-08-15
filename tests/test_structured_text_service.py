from __future__ import annotations

import sys
import unittest
from pathlib import Path

from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.structured_text import StructuredTextDocument
from app.services.structured_text_service import (
    StructuredTextPersistenceValues,
    UnsupportedStructuredTextVersionError,
    normalize_text_content,
    prepare_structured_text_write,
)


def paragraph_document(
    *content: dict[str, object],
    attrs: dict[str, object] | None = None,
) -> dict[str, object]:
    paragraph: dict[str, object] = {
        "type": "paragraph",
        "content": list(content),
    }
    if attrs is not None:
        paragraph["attrs"] = attrs
    return {
        "type": "document",
        "content": [paragraph],
    }


def text(value: str, marks: list[dict[str, object]] | None = None) -> dict[str, object]:
    node: dict[str, object] = {"type": "text", "text": value}
    if marks is not None:
        node["marks"] = marks
    return node


class StructuredTextServiceTest(unittest.TestCase):
    def test_plain_paragraph_produces_expected_document_data(self) -> None:
        result = prepare_structured_text_write(paragraph_document(text("Hello")))
        self.assertEqual(result.document_data, {
            "type": "document",
            "content": [{
                "type": "paragraph",
                "attrs": None,
                "content": [{"type": "text", "text": "Hello", "marks": []}],
            }],
        })

    def test_plain_paragraph_produces_expected_source_text(self) -> None:
        result = prepare_structured_text_write(paragraph_document(text("Hello")))
        self.assertEqual(result.source_text, "Hello")

    def test_inline_math_projection_is_preserved(self) -> None:
        result = prepare_structured_text_write(paragraph_document(
            text("Value: "), {"type": "inline_math", "latex": "x^2"},
        ))
        self.assertEqual(result.source_text, "Value: x^2")

    def test_marks_persist_without_changing_source_text(self) -> None:
        result = prepare_structured_text_write(paragraph_document(text(
            "Important",
            [{"type": "bold"}, {"type": "font_family", "value": "serif"}],
        )))
        marks = result.document_data["content"][0]["content"][0]["marks"]
        self.assertEqual(marks, [
            {"type": "bold"},
            {"type": "font_family", "value": "serif"},
        ])
        self.assertEqual(result.source_text, "Important")

    def test_lists_serialize_and_project_deterministically(self) -> None:
        result = prepare_structured_text_write({
            "type": "document",
            "content": [{
                "type": "ordered_list",
                "content": [
                    {"type": "list_item", "content": [
                        {"type": "paragraph", "content": [text("First")]},
                    ]},
                    {"type": "list_item", "content": [
                        {"type": "paragraph", "content": [text("Second")]},
                    ]},
                ],
            }],
        })
        self.assertEqual(result.document_data["content"][0]["type"], "ordered_list")
        self.assertEqual(result.source_text, "1. First\n2. Second")

    def test_format_version_one_is_accepted(self) -> None:
        result = prepare_structured_text_write(
            {"type": "document", "content": []}, format_version=1,
        )
        self.assertEqual(result.format_version, 1)

    def test_raw_mapping_input_validates_and_succeeds(self) -> None:
        result = prepare_structured_text_write(
            paragraph_document(text("Mapping"))
        )
        self.assertIsInstance(result, StructuredTextPersistenceValues)

    def test_structured_document_input_succeeds(self) -> None:
        document = StructuredTextDocument.model_validate(
            paragraph_document(text("Model"))
        )
        self.assertEqual(
            prepare_structured_text_write(document).source_text,
            "Model",
        )

    def test_empty_document_succeeds(self) -> None:
        result = prepare_structured_text_write(
            {"type": "document", "content": []}
        )
        self.assertEqual(result.source_text, "")
        self.assertEqual(result.document_data, {"type": "document", "content": []})

    def test_format_version_zero_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            prepare_structured_text_write(
                {"type": "document", "content": []}, format_version=0,
            )

    def test_format_version_two_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            prepare_structured_text_write(
                {"type": "document", "content": []}, format_version=2,
            )

    def test_negative_format_version_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            prepare_structured_text_write(
                {"type": "document", "content": []}, format_version=-1,
            )

    def test_boolean_format_version_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            prepare_structured_text_write(
                {"type": "document", "content": []}, format_version=True,
            )

    def test_non_integer_format_version_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            prepare_structured_text_write(
                {"type": "document", "content": []}, format_version=1.0,
            )

    def test_malformed_document_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            prepare_structured_text_write({"type": "document", "content": "bad"})

    def test_invalid_token_is_rejected(self) -> None:
        payload = paragraph_document(text("X", [
            {"type": "font_size", "value": "12px"},
        ]))
        with self.assertRaises(ValidationError):
            prepare_structured_text_write(payload)

    def test_unknown_node_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            prepare_structured_text_write({
                "type": "document", "content": [{"type": "html"}],
            })

    def test_legacy_source_text_converts_to_simple_document(self) -> None:
        document = normalize_text_content(
            source_text="Legacy", document_data=None, format_version=1,
        )
        self.assertEqual(document.content[0].content[0].text, "Legacy")

    def test_empty_legacy_source_text_converts_successfully(self) -> None:
        document = normalize_text_content(
            source_text="", document_data=None, format_version=1,
        )
        self.assertEqual(document.content[0].content[0].text, "")

    def test_legacy_conversion_does_not_parse_latex_delimiters(self) -> None:
        document = normalize_text_content(
            source_text="Keep $x^2$ literal",
            document_data=None,
            format_version=1,
        )
        node = document.content[0].content[0]
        self.assertEqual(node.type, "text")
        self.assertEqual(node.text, "Keep $x^2$ literal")

    def test_legacy_normalization_does_not_mutate_inputs(self) -> None:
        source_text = "Unchanged"
        document_data = None
        normalize_text_content(
            source_text=source_text,
            document_data=document_data,
            format_version=1,
        )
        self.assertEqual(source_text, "Unchanged")
        self.assertIsNone(document_data)

    def test_unsupported_legacy_version_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            normalize_text_content(
                source_text="Legacy", document_data=None, format_version=2,
            )

    def test_stored_document_data_validates_successfully(self) -> None:
        stored = paragraph_document(text("Stored"))
        document = normalize_text_content(
            source_text="ignored", document_data=stored, format_version=1,
        )
        self.assertEqual(document.content[0].content[0].text, "Stored")

    def test_stored_inline_math_survives_round_trip(self) -> None:
        stored = paragraph_document({"type": "inline_math", "latex": "x^2+1"})
        document = normalize_text_content(
            source_text="ignored", document_data=stored, format_version=1,
        )
        self.assertEqual(document.content[0].content[0].latex, "x^2+1")

    def test_stored_marks_survive_round_trip(self) -> None:
        stored = paragraph_document(text("Styled", [{"type": "underline"}]))
        document = normalize_text_content(
            source_text="ignored", document_data=stored, format_version=1,
        )
        self.assertEqual(document.content[0].content[0].marks[0].type, "underline")

    def test_unsupported_stored_version_is_rejected(self) -> None:
        with self.assertRaises(UnsupportedStructuredTextVersionError):
            normalize_text_content(
                source_text="ignored",
                document_data={"type": "document", "content": []},
                format_version=2,
            )

    def test_malformed_stored_document_data_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            normalize_text_content(
                source_text="ignored",
                document_data={"type": "document", "content": [{"type": "html"}]},
                format_version=1,
            )

    def test_serialized_enum_values_are_json_strings(self) -> None:
        result = prepare_structured_text_write(paragraph_document(
            text("X", [
                {"type": "font_family", "value": "math-compatible"},
                {"type": "font_size", "value": "x-large"},
            ]),
            attrs={"alignment": "justify"},
        ))
        paragraph = result.document_data["content"][0]
        self.assertIsInstance(paragraph["attrs"]["alignment"], str)
        for mark in paragraph["content"][0]["marks"]:
            if "value" in mark:
                self.assertIsInstance(mark["value"], str)

    def test_no_editor_library_fields_are_introduced(self) -> None:
        result = prepare_structured_text_write(paragraph_document(text("Safe")))
        serialized = repr(result.document_data)
        for field in ("editor_state", "editor_json", "tiptap", "lexical"):
            self.assertNotIn(field, serialized)

    def test_no_html_css_or_rendered_fields_are_introduced(self) -> None:
        result = prepare_structured_text_write(paragraph_document(text("Safe")))
        serialized = repr(result.document_data)
        for field in ("html", "css", "rendered_html", "style"):
            self.assertNotIn(field, serialized)


if __name__ == "__main__":
    unittest.main()
