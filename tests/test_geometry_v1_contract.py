from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import TypeAdapter, ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.question_editor import (
    ContentBlockRead,
    GeometryBlockCreate,
    GeometryBlockRead,
    GeometryBlockUpdate,
)


NOW = datetime(2026, 8, 29, 12, 0, tzinfo=timezone.utc)


def geometry_v1() -> dict[str, object]:
    return {
        "schema_version": 1,
        "viewport": {"min_x": 0, "min_y": 0, "width": 100, "height": 100},
        "description": "Triangle ABC",
        "points": [
            {"id": "a", "x": 10, "y": 80, "label": "A"},
            {"id": "b", "x": 90, "y": 80, "label": "B"},
            {"id": "c", "x": 50, "y": 10, "label": "C"},
        ],
        "segments": [{"id": "ab", "start_point_id": "a", "end_point_id": "b"}],
        "polygons": [{"id": "abc", "point_ids": ["a", "b", "c"]}],
        "texts": [],
    }


def update(data: dict[str, object]) -> GeometryBlockUpdate:
    return GeometryBlockUpdate.model_validate({
        "source_data": data,
        "format_version": 1,
        "expected_revision_updated_at": NOW,
    })


class GeometryV1ContractTest(unittest.TestCase):
    def test_valid_geometry_v1_create_and_update(self) -> None:
        data = geometry_v1()
        created = GeometryBlockCreate.model_validate({
            "block_type": "geometry",
            "payload": {"source_data": data, "format_version": 1},
            "expected_revision_updated_at": NOW,
        })
        self.assertEqual(created.payload.source_data.model_dump(mode="json"), data)
        self.assertEqual(update(data).source_data.model_dump(mode="json"), data)

    def test_invalid_viewports_are_rejected(self) -> None:
        for key, value in (("width", 0), ("height", -1), ("min_x", float("inf"))):
            data = geometry_v1()
            data["viewport"] = {**data["viewport"], key: value}
            with self.subTest(key=key), self.assertRaises(ValidationError):
                update(data)

    def test_non_finite_coordinates_are_rejected(self) -> None:
        for value in (float("nan"), float("inf"), float("-inf")):
            data = geometry_v1()
            data["points"][0]["x"] = value
            with self.subTest(value=value), self.assertRaises(ValidationError):
                update(data)

    def test_duplicate_object_ids_are_rejected(self) -> None:
        data = geometry_v1()
        data["segments"][0]["id"] = "a"
        with self.assertRaises(ValidationError):
            update(data)

    def test_unresolved_segment_reference_is_rejected(self) -> None:
        data = geometry_v1()
        data["segments"][0]["end_point_id"] = "missing"
        with self.assertRaises(ValidationError):
            update(data)

    def test_invalid_polygon_reference_is_rejected(self) -> None:
        data = geometry_v1()
        data["polygons"][0]["point_ids"] = ["a", "b", "missing"]
        with self.assertRaises(ValidationError):
            update(data)

    def test_polygon_requires_three_distinct_vertices(self) -> None:
        for point_ids in (["a", "b"], ["a", "b", "a"]):
            data = geometry_v1()
            data["polygons"][0]["point_ids"] = point_ids
            with self.subTest(point_ids=point_ids), self.assertRaises(ValidationError):
                update(data)

    def test_unknown_style_color_and_markup_fields_are_rejected(self) -> None:
        for key, value in (
            ("style", {"stroke": "red"}),
            ("color", "red"),
            ("svg", "<svg><script>alert(1)</script></svg>"),
            ("html", "<b>triangle</b>"),
            ("script", "alert(1)"),
        ):
            data = geometry_v1()
            data[key] = value
            with self.subTest(key=key), self.assertRaises(ValidationError):
                update(data)

    def test_nested_unknown_fields_are_rejected(self) -> None:
        data = geometry_v1()
        data["points"][0]["color"] = "red"
        with self.assertRaises(ValidationError):
            update(data)

    def test_valid_plain_text_annotation_is_canonical_data(self) -> None:
        data = geometry_v1()
        data["texts"] = [{"id": "text-1", "x": 40, "y": 30, "content": "AB = 5 sm; a ∥ b"}]
        result = update(data).source_data.model_dump(mode="json")
        self.assertEqual(result["texts"], data["texts"])

    def test_text_id_is_unique_across_all_geometry_objects(self) -> None:
        data = geometry_v1()
        data["texts"] = [{"id": "a", "x": 40, "y": 30, "content": "Verilir"}]
        with self.assertRaises(ValidationError):
            update(data)

    def test_blank_and_non_finite_text_annotations_are_rejected(self) -> None:
        for field, value in (("content", "  "), ("x", float("nan")), ("y", float("inf"))):
            data = geometry_v1()
            annotation = {"id": "text-1", "x": 40, "y": 30, "content": "Verilir"}
            annotation[field] = value
            data["texts"] = [annotation]
            with self.subTest(field=field), self.assertRaises(ValidationError):
                update(data)

    def test_text_style_markup_and_executable_fields_are_rejected(self) -> None:
        for field, value in (
            ("style", {"fontSize": 20}), ("color", "red"),
            ("svg", "<svg />"), ("html", "<b>x</b>"), ("script", "alert(1)"),
        ):
            data = geometry_v1()
            annotation = {"id": "text-1", "x": 40, "y": 30, "content": "Verilir", field: value}
            data["texts"] = [annotation]
            with self.subTest(field=field), self.assertRaises(ValidationError):
                update(data)
        for content in ("<b>AB</b>", "<svg>AB</svg>", "<script>alert(1)</script>", "javascript:alert(1)"):
            data = geometry_v1()
            data["texts"] = [{"id": "text-1", "x": 40, "y": 30, "content": content}]
            with self.subTest(content=content), self.assertRaises(ValidationError):
                update(data)

    def test_empty_geometry_v1_is_valid(self) -> None:
        data = geometry_v1()
        data.update({"points": [], "segments": [], "polygons": [], "texts": []})
        self.assertEqual(update(data).source_data.points, [])

    def test_pre_annotation_geometry_v1_write_defaults_texts_without_rewriting_reads(self) -> None:
        data = geometry_v1()
        data.pop("texts")
        self.assertEqual(update(data).source_data.texts, [])
        read = TypeAdapter(ContentBlockRead).validate_python({
            "id": str(uuid.uuid4()), "block_type": "geometry", "sort_order": 1000,
            "payload": {"source_data": data, "format_version": 1},
        })
        self.assertNotIn("texts", read.payload.source_data)

    def test_legacy_geometry_remains_readable_without_interpretation(self) -> None:
        legacy = {"svg": "<svg><script>alert(1)</script></svg>", "objects": []}
        block = TypeAdapter(ContentBlockRead).validate_python({
            "id": str(uuid.uuid4()),
            "block_type": "geometry",
            "sort_order": 1000,
            "payload": {"source_data": legacy, "format_version": 1},
        })
        self.assertIsInstance(block, GeometryBlockRead)
        self.assertEqual(block.payload.source_data, legacy)
        with self.assertRaises(ValidationError):
            update(legacy)


if __name__ == "__main__":
    unittest.main()
