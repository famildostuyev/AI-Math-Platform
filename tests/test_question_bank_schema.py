from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError


os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused",
)
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import QuestionDifficulty, QuestionRevisionStatus
from app.schemas.question_bank import (
    QuestionBankItemRead,
    QuestionBankListQuery,
    QuestionBankPageRead,
    QuestionBankSort,
)


class QuestionBankSchemaTest(unittest.TestCase):
    def _item(self, **overrides: object) -> dict[str, object]:
        value: dict[str, object] = {
            "question_family_id": uuid.uuid4(),
            "question_form_id": uuid.uuid4(),
            "revision_id": uuid.uuid4(),
            "revision_number": 2,
            "status": "draft",
            "is_current_approved": False,
            "question_type": {
                "id": uuid.uuid4(),
                "name": "open_response",
                "display_name": "Open response",
            },
            "difficulty": None,
            "primary_topic": None,
            "source": None,
            "block_count": 0,
            "text_preview": None,
            "updated_at": datetime.now(timezone.utc),
        }
        value.update(overrides)
        return value

    def test_list_query_defaults(self) -> None:
        query = QuestionBankListQuery()

        self.assertIsNone(query.q)
        self.assertEqual(query.page, 1)
        self.assertEqual(query.page_size, 25)
        self.assertEqual(query.sort, QuestionBankSort.UPDATED_DESC)

    def test_page_must_be_positive(self) -> None:
        with self.assertRaises(ValidationError):
            QuestionBankListQuery(page=0)

    def test_page_size_is_bounded(self) -> None:
        for invalid in (0, 101):
            with self.subTest(invalid=invalid), self.assertRaises(ValidationError):
                QuestionBankListQuery(page_size=invalid)

    def test_sort_accepts_only_supported_values(self) -> None:
        self.assertEqual(
            QuestionBankListQuery(sort="created_desc").sort,
            QuestionBankSort.CREATED_DESC,
        )
        with self.assertRaises(ValidationError):
            QuestionBankListQuery(sort="difficulty")

    def test_search_is_trimmed_and_blank_becomes_none(self) -> None:
        self.assertEqual(QuestionBankListQuery(q="  algebra  ").q, "algebra")
        self.assertIsNone(QuestionBankListQuery(q=" \t ").q)

    def test_search_has_deterministic_maximum_length(self) -> None:
        self.assertEqual(len(QuestionBankListQuery(q="x" * 200).q or ""), 200)
        with self.assertRaises(ValidationError):
            QuestionBankListQuery(q="x" * 201)

    def test_uuid_filters_are_typed(self) -> None:
        identifiers = [str(uuid.uuid4()) for _ in range(3)]
        query = QuestionBankListQuery(
            question_type_id=identifiers[0],
            purpose_id=identifiers[1],
            source_id=identifiers[2],
        )

        self.assertEqual(str(query.question_type_id), identifiers[0])
        self.assertEqual(str(query.purpose_id), identifiers[1])
        self.assertEqual(str(query.source_id), identifiers[2])
        with self.assertRaises(ValidationError):
            QuestionBankListQuery(question_type_id="not-a-uuid")

    def test_source_id_defaults_to_none_and_rejects_invalid_uuid(self) -> None:
        self.assertIsNone(QuestionBankListQuery().source_id)
        with self.assertRaises(ValidationError):
            QuestionBankListQuery(source_id="not-a-uuid")

    def test_status_and_difficulty_use_domain_enums(self) -> None:
        query = QuestionBankListQuery(status="approved", difficulty="hard")

        self.assertEqual(query.status, QuestionRevisionStatus.APPROVED)
        self.assertEqual(query.difficulty, QuestionDifficulty.HARD)

    def test_query_and_response_reject_extra_fields(self) -> None:
        with self.assertRaises(ValidationError):
            QuestionBankListQuery.model_validate({"topic_id": str(uuid.uuid4())})
        with self.assertRaises(ValidationError):
            QuestionBankItemRead.model_validate({**self._item(), "provenance": "x"})

    def test_item_shape_supports_nullable_topic_and_preview(self) -> None:
        item = QuestionBankItemRead.model_validate(self._item())

        self.assertIsNone(item.primary_topic)
        self.assertIsNone(item.source)
        self.assertIsNone(item.text_preview)
        self.assertEqual(
            set(item.model_dump()),
            {
                "question_family_id", "question_form_id", "revision_id",
                "revision_number", "status", "is_current_approved",
                "question_type", "difficulty", "primary_topic", "block_count",
                "source", "text_preview", "updated_at",
            },
        )

    def test_item_accepts_nullable_source_and_exact_public_source_shape(self) -> None:
        source_id = uuid.uuid4()
        with_source = QuestionBankItemRead.model_validate(self._item(source={
            "id": source_id,
            "name": "dim",
            "display_name": "DİM",
            "detail": "2025 buraxılış imtahanı",
        }))
        without_detail = QuestionBankItemRead.model_validate(self._item(source={
            "id": source_id,
            "name": "dim",
            "display_name": "DİM",
            "detail": None,
        }))

        self.assertEqual(with_source.source.id, source_id)
        self.assertEqual(with_source.source.detail, "2025 buraxılış imtahanı")
        self.assertIsNone(without_detail.source.detail)
        self.assertEqual(
            set(with_source.source.model_dump()),
            {"id", "name", "display_name", "detail"},
        )
        with self.assertRaises(ValidationError):
            QuestionBankItemRead.model_validate(self._item(source={
                "id": source_id,
                "name": "dim",
                "display_name": "DİM",
                "detail": None,
                "description": "not public",
            }))

    def test_item_accepts_minimal_primary_topic_metadata(self) -> None:
        topic_id = uuid.uuid4()
        item = QuestionBankItemRead.model_validate(self._item(primary_topic={
            "id": topic_id,
            "name": "algebra",
            "display_name": "Algebra",
        }))

        self.assertEqual(item.primary_topic.id, topic_id)

    def test_page_shape_and_zero_total_are_valid(self) -> None:
        page = QuestionBankPageRead(
            items=[], page=1, page_size=25, total=0, total_pages=0
        )

        self.assertEqual(page.model_dump(), {
            "items": [], "page": 1, "page_size": 25,
            "total": 0, "total_pages": 0,
        })


if __name__ == "__main__":
    unittest.main()
