from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import TypeAdapter, ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import ContentBlockType
from app.schemas.question_editor import (
    BlockOrderRequest,
    ContentBlockCreate,
    ContentBlockRead,
    ContentBlockUpdate,
    FormulaBlockCreate,
    FormulaBlockRead,
    FormulaBlockUpdate,
    GeometryBlockRead,
    ImageBlockCreate,
    ImageBlockRead,
    ImageBlockUpdate,
    QuestionDraftCreate,
    QuestionDraftRead,
    QuestionRevisionEditorRead,
    TextBlockCreate,
    TextBlockRead,
    TextBlockUpdate,
)


NOW = datetime(2026, 8, 15, 12, 0, tzinfo=timezone.utc)


def empty_document() -> dict[str, object]:
    return {"type": "document", "content": []}


def block_base(block_type: str, payload: dict[str, object]) -> dict[str, object]:
    return {
        "id": str(uuid.uuid4()),
        "block_type": block_type,
        "sort_order": 0,
        "payload": payload,
    }


class QuestionEditorSchemaTest(unittest.TestCase):
    def test_minimal_draft_create_is_valid(self) -> None:
        value = QuestionDraftCreate(question_type_id=uuid.uuid4())
        self.assertIsNone(value.primary_topic_id)
        self.assertEqual(value.related_topic_ids, [])
        self.assertEqual(value.purpose_ids, [])

    def test_draft_create_rejects_unknown_field(self) -> None:
        with self.assertRaises(ValidationError):
            QuestionDraftCreate.model_validate({
                "question_type_id": str(uuid.uuid4()), "status": "draft",
            })

    def test_draft_create_rejects_invalid_uuid(self) -> None:
        with self.assertRaises(ValidationError):
            QuestionDraftCreate(question_type_id="invalid")

    def test_duplicate_related_topics_are_rejected(self) -> None:
        topic_id = uuid.uuid4()
        with self.assertRaises(ValidationError):
            QuestionDraftCreate(
                question_type_id=uuid.uuid4(),
                related_topic_ids=[topic_id, topic_id],
            )

    def test_duplicate_purposes_are_rejected(self) -> None:
        purpose_id = uuid.uuid4()
        with self.assertRaises(ValidationError):
            QuestionDraftCreate(
                question_type_id=uuid.uuid4(),
                purpose_ids=[purpose_id, purpose_id],
            )

    def test_primary_topic_cannot_be_related(self) -> None:
        topic_id = uuid.uuid4()
        with self.assertRaises(ValidationError):
            QuestionDraftCreate(
                question_type_id=uuid.uuid4(),
                primary_topic_id=topic_id,
                related_topic_ids=[topic_id],
            )

    def test_valid_text_read(self) -> None:
        value = TypeAdapter(ContentBlockRead).validate_python(block_base(
            "text", {"source_text": "Draft", "document": empty_document(), "format_version": 1},
        ))
        self.assertIsInstance(value, TextBlockRead)

    def test_valid_text_create(self) -> None:
        value = TypeAdapter(ContentBlockCreate).validate_python({
            "block_type": "text",
            "payload": {"document": empty_document(), "format_version": 1},
            "expected_revision_updated_at": NOW,
        })
        self.assertIsInstance(value, TextBlockCreate)

    def test_text_create_rejects_source_text(self) -> None:
        with self.assertRaises(ValidationError):
            TextBlockCreate.model_validate({
                "block_type": "text",
                "payload": {"document": empty_document(), "source_text": "conflict"},
                "expected_revision_updated_at": NOW,
            })

    def test_text_create_rejects_invalid_ast(self) -> None:
        with self.assertRaises(ValidationError):
            TextBlockCreate.model_validate({
                "block_type": "text",
                "payload": {"document": {"type": "document", "content": [{"type": "html"}]}},
                "expected_revision_updated_at": NOW,
            })

    def test_text_create_rejects_extra_field(self) -> None:
        with self.assertRaises(ValidationError):
            TextBlockCreate.model_validate({
                "block_type": "text",
                "payload": {"document": empty_document(), "html": "<p>x</p>"},
                "expected_revision_updated_at": NOW,
            })

    def test_valid_formula_read(self) -> None:
        value = TypeAdapter(ContentBlockRead).validate_python(block_base(
            "formula", {"source_latex": "x^2", "format_version": 1},
        ))
        self.assertIsInstance(value, FormulaBlockRead)

    def test_valid_formula_create(self) -> None:
        value = TypeAdapter(ContentBlockCreate).validate_python({
            "block_type": "formula",
            "payload": {"source_latex": "x^2", "format_version": 1},
            "expected_revision_updated_at": NOW,
        })
        self.assertIsInstance(value, FormulaBlockCreate)

    def test_empty_formula_draft_is_valid(self) -> None:
        value = FormulaBlockCreate.model_validate({
            "block_type": "formula",
            "payload": {"source_latex": ""},
            "expected_revision_updated_at": NOW,
        })
        self.assertEqual(value.payload.source_latex, "")

    def test_formula_rejects_unknown_field(self) -> None:
        with self.assertRaises(ValidationError):
            FormulaBlockCreate.model_validate({
                "block_type": "formula",
                "payload": {"source_latex": "x", "rendered_html": "bad"},
                "expected_revision_updated_at": NOW,
            })

    def test_valid_safe_image_read(self) -> None:
        value = TypeAdapter(ContentBlockRead).validate_python(block_base(
            "image", {"media_asset_id": str(uuid.uuid4()), "alt_text": None},
        ))
        self.assertIsInstance(value, ImageBlockRead)

    def test_image_read_rejects_storage_key(self) -> None:
        with self.assertRaises(ValidationError):
            TypeAdapter(ContentBlockRead).validate_python(block_base(
                "image", {
                    "media_asset_id": str(uuid.uuid4()),
                    "alt_text": "Graph",
                    "storage_key": "secret/path",
                },
            ))

    def test_valid_image_create_and_create_union(self) -> None:
        media_asset_id = uuid.uuid4()
        for alt_text in ("Coordinate graph", None, ""):
            with self.subTest(alt_text=alt_text):
                value = TypeAdapter(ContentBlockCreate).validate_python({
                    "block_type": "image",
                    "payload": {
                        "media_asset_id": str(media_asset_id),
                        "alt_text": alt_text,
                    },
                    "expected_revision_updated_at": NOW,
                })
                self.assertIsInstance(value, ImageBlockCreate)
                self.assertEqual(value.block_type, ContentBlockType.IMAGE)
                self.assertEqual(value.payload.media_asset_id, media_asset_id)
                self.assertEqual(value.payload.alt_text, alt_text)
                self.assertEqual(value.expected_revision_updated_at, NOW)

    def test_image_create_rejects_invalid_contract_fields(self) -> None:
        media_asset_id = uuid.uuid4()
        valid = {
            "block_type": "image",
            "payload": {
                "media_asset_id": str(media_asset_id),
                "alt_text": None,
            },
            "expected_revision_updated_at": NOW,
        }
        cases = (
            {**valid, "payload": {"alt_text": None}},
            {**valid, "payload": {"media_asset_id": "bad", "alt_text": None}},
            {**valid, "block_type": "geometry"},
            {**valid, "expected_revision_updated_at": datetime(2026, 8, 15)},
            {**valid, "sort_order": 1000},
            {**valid, "id": str(uuid.uuid4())},
            {**valid, "block_id": str(uuid.uuid4())},
            {**valid, "revision_id": str(uuid.uuid4())},
            {**valid, "deleted_at": None},
            {**valid, "created_at": NOW},
            {**valid, "updated_at": NOW},
            {**valid, "payload": {**valid["payload"], "storage_key": "secret"}},
            {**valid, "payload": {**valid["payload"], "sha256": "hash"}},
            {**valid, "payload": {**valid["payload"], "upload": "bytes"}},
            {**valid, "payload": {**valid["payload"], "url": "https://example.test"}},
        )
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                ImageBlockCreate.model_validate(value)

    def test_valid_geometry_read(self) -> None:
        value = TypeAdapter(ContentBlockRead).validate_python(block_base(
            "geometry", {"source_data": {"objects": []}, "format_version": 1},
        ))
        self.assertIsInstance(value, GeometryBlockRead)

    def test_geometry_write_is_not_supported(self) -> None:
        with self.assertRaises(ValidationError):
            TypeAdapter(ContentBlockCreate).validate_python({
                "block_type": "geometry", "payload": {},
                "expected_revision_updated_at": NOW,
            })

    def test_all_read_variants_discriminate(self) -> None:
        payloads = {
            "text": {"source_text": "x", "document": empty_document(), "format_version": 1},
            "formula": {"source_latex": "x", "format_version": 1},
            "image": {"media_asset_id": str(uuid.uuid4()), "alt_text": "x"},
            "geometry": {"source_data": {}, "format_version": 1},
        }
        expected = (TextBlockRead, FormulaBlockRead, ImageBlockRead, GeometryBlockRead)
        values = [
            TypeAdapter(ContentBlockRead).validate_python(block_base(kind, payload))
            for kind, payload in payloads.items()
        ]
        self.assertEqual(tuple(type(value) for value in values), expected)

    def test_deferred_block_type_is_rejected(self) -> None:
        for block_type in ("graph", "table", "diagram", "unknown"):
            with self.subTest(block_type=block_type), self.assertRaises(ValidationError):
                TypeAdapter(ContentBlockRead).validate_python(
                    block_base(block_type, {})
                )

    def test_valid_text_update(self) -> None:
        value = TypeAdapter(ContentBlockUpdate).validate_python({
            "document": empty_document(), "format_version": 1,
            "expected_revision_updated_at": NOW,
        })
        self.assertIsInstance(value, TextBlockUpdate)

    def test_valid_formula_update(self) -> None:
        value = TypeAdapter(ContentBlockUpdate).validate_python({
            "source_latex": "x", "format_version": 1,
            "expected_revision_updated_at": NOW,
        })
        self.assertIsInstance(value, FormulaBlockUpdate)

    def test_valid_image_update_and_update_union(self) -> None:
        first_asset_id = uuid.uuid4()
        replacement_asset_id = uuid.uuid4()
        first = ImageBlockUpdate.model_validate({
            "media_asset_id": first_asset_id,
            "alt_text": "Original",
            "expected_revision_updated_at": NOW,
        })
        replacement = TypeAdapter(ContentBlockUpdate).validate_python({
            "media_asset_id": str(replacement_asset_id),
            "alt_text": None,
            "expected_revision_updated_at": NOW,
        })
        empty_alt = ImageBlockUpdate.model_validate({
            "media_asset_id": replacement_asset_id,
            "alt_text": "",
            "expected_revision_updated_at": NOW,
        })
        self.assertEqual(first.media_asset_id, first_asset_id)
        self.assertIsInstance(replacement, ImageBlockUpdate)
        self.assertEqual(replacement.media_asset_id, replacement_asset_id)
        self.assertIsNone(replacement.alt_text)
        self.assertEqual(empty_alt.alt_text, "")
        self.assertEqual(replacement.expected_revision_updated_at, NOW)

    def test_image_update_rejects_invalid_contract_fields(self) -> None:
        valid = {
            "media_asset_id": str(uuid.uuid4()),
            "alt_text": None,
            "expected_revision_updated_at": NOW,
        }
        cases = (
            {
                "alt_text": None,
                "expected_revision_updated_at": NOW,
            },
            {**valid, "media_asset_id": "bad"},
            {**valid, "expected_revision_updated_at": datetime(2026, 8, 15)},
            {**valid, "block_type": "image"},
            {**valid, "id": str(uuid.uuid4())},
            {**valid, "block_id": str(uuid.uuid4())},
            {**valid, "revision_id": str(uuid.uuid4())},
            {**valid, "sort_order": 1000},
            {**valid, "deleted_at": None},
            {**valid, "storage_key": "secret"},
            {**valid, "checksum": "hash"},
            {**valid, "file": "bytes"},
            {**valid, "path": "local/path"},
            {**valid, "url": "https://example.test"},
        )
        for value in cases:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                ImageBlockUpdate.model_validate(value)

    def test_geometry_update_remains_unsupported(self) -> None:
        with self.assertRaises(ValidationError):
            TypeAdapter(ContentBlockUpdate).validate_python({
                "source_data": {"objects": []},
                "format_version": 1,
                "expected_revision_updated_at": NOW,
            })

    def test_image_read_public_shape_remains_unchanged(self) -> None:
        media_asset_id = uuid.uuid4()
        value = ImageBlockRead.model_validate(block_base(
            "image",
            {"media_asset_id": media_asset_id, "alt_text": "Graph"},
        ))
        self.assertEqual(
            set(value.model_dump()["payload"]),
            {"media_asset_id", "alt_text"},
        )
        with self.assertRaises(ValidationError):
            ImageBlockRead.model_validate(block_base(
                "image",
                {
                    "media_asset_id": media_asset_id,
                    "alt_text": "Graph",
                    "mime_type": "image/png",
                },
            ))

    def test_update_rejects_block_type(self) -> None:
        with self.assertRaises(ValidationError):
            TextBlockUpdate.model_validate({
                "block_type": ContentBlockType.FORMULA.value,
                "document": empty_document(),
                "expected_revision_updated_at": NOW,
            })

    def test_update_rejects_sort_order(self) -> None:
        with self.assertRaises(ValidationError):
            FormulaBlockUpdate.model_validate({
                "source_latex": "x", "sort_order": 3,
                "expected_revision_updated_at": NOW,
            })

    def test_create_rejects_sort_order(self) -> None:
        with self.assertRaises(ValidationError):
            TextBlockCreate.model_validate({
                "block_type": "text", "payload": {"document": empty_document()},
                "sort_order": 0, "expected_revision_updated_at": NOW,
            })

    def test_empty_block_order_is_valid(self) -> None:
        value = BlockOrderRequest(
            block_ids=[], expected_revision_updated_at=NOW,
        )
        self.assertEqual(value.block_ids, [])

    def test_unique_block_order_is_valid(self) -> None:
        block_ids = [uuid.uuid4(), uuid.uuid4()]
        self.assertEqual(
            BlockOrderRequest(
                block_ids=block_ids, expected_revision_updated_at=NOW,
            ).block_ids,
            block_ids,
        )

    def test_duplicate_block_order_is_rejected(self) -> None:
        block_id = uuid.uuid4()
        with self.assertRaises(ValidationError):
            BlockOrderRequest(
                block_ids=[block_id, block_id],
                expected_revision_updated_at=NOW,
            )

    def test_order_accepts_aware_concurrency_datetime(self) -> None:
        value = BlockOrderRequest(
            block_ids=[], expected_revision_updated_at=NOW,
        )
        self.assertEqual(value.expected_revision_updated_at, NOW)

    def test_order_rejects_naive_concurrency_datetime(self) -> None:
        with self.assertRaises(ValidationError):
            BlockOrderRequest(
                block_ids=[], expected_revision_updated_at=datetime(2026, 8, 15),
            )

    def test_order_rejects_sort_order_payload(self) -> None:
        with self.assertRaises(ValidationError):
            BlockOrderRequest.model_validate({
                "block_ids": [], "sort_order": [],
                "expected_revision_updated_at": NOW,
            })

    def _revision_payload(self) -> dict[str, object]:
        return {
            "question_family_id": str(uuid.uuid4()),
            "question_form_id": str(uuid.uuid4()),
            "revision_id": str(uuid.uuid4()),
            "revision_number": 1,
            "status": "draft",
            "question_type_id": str(uuid.uuid4()),
            "primary_topic_id": None,
            "related_topic_ids": [],
            "purpose_ids": [],
            "difficulty": None,
            "updated_at": NOW,
        }

    def test_draft_read_contains_concurrency_token(self) -> None:
        value = QuestionDraftRead.model_validate(self._revision_payload())
        self.assertEqual(value.updated_at, NOW)

    def test_revision_read_validates_ordered_blocks(self) -> None:
        payload = self._revision_payload()
        payload["blocks"] = [
            block_base("formula", {"source_latex": "x", "format_version": 1}),
            {**block_base("text", {"source_text": "y", "document": empty_document(), "format_version": 1}), "sort_order": 1},
        ]
        value = QuestionRevisionEditorRead.model_validate(payload)
        self.assertEqual([block.sort_order for block in value.blocks], [0, 1])

    def test_revision_read_requires_concurrency_token(self) -> None:
        payload = self._revision_payload()
        del payload["updated_at"]
        payload["blocks"] = []
        with self.assertRaises(ValidationError):
            QuestionRevisionEditorRead.model_validate(payload)

    def test_revision_read_rejects_internal_fields(self) -> None:
        payload = self._revision_payload()
        payload["blocks"] = []
        payload["deleted_at"] = None
        with self.assertRaises(ValidationError):
            QuestionRevisionEditorRead.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
