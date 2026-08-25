from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import ContentBlockType, QuestionRevisionStatus
from app.models.content_block import ContentBlock
from app.models.formula_block_content import FormulaBlockContent
from app.models.question_revision import QuestionRevision
from app.models.text_block_content import TextBlockContent
from app.services.authoring_action import AuthoringActionEnvelope
from app.services.question_editor_service import (
    BlockOrderSetMismatchError,
    InvalidAuthoringActionTargetError,
    QuestionEditorService,
)


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


def result(values: list[object]) -> MagicMock:
    scalar_result = MagicMock()
    scalar_result.all.return_value = values
    return scalar_result


def text_payload(text: str) -> dict[str, object]:
    return {
        "document": {
            "type": "document",
            "content": [{
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }],
        },
        "format_version": 1,
    }


class QuestionEditorAtomicActionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.revision = QuestionRevision(
            id=uuid.uuid4(),
            updated_at=NOW,
            status=QuestionRevisionStatus.DRAFT,
        )
        self.text_block = ContentBlock(
            id=uuid.uuid4(),
            question_revision_id=self.revision.id,
            block_type=ContentBlockType.TEXT,
            sort_order=1000,
        )
        self.text_block.text_content = TextBlockContent(
            source_text="Before",
            document_data={"type": "document", "content": []},
            format_version=1,
        )
        self.formula_block = ContentBlock(
            id=uuid.uuid4(),
            question_revision_id=self.revision.id,
            block_type=ContentBlockType.FORMULA,
            sort_order=2000,
        )
        self.formula_block.formula_content = FormulaBlockContent(
            source_latex="x", format_version=1
        )
        self.db = MagicMock()
        self.db.scalar.return_value = self.revision
        self.db.scalars.return_value = result([self.text_block, self.formula_block])

    def apply(self, raw_actions: list[dict[str, object]]) -> None:
        actions = AuthoringActionEnvelope.model_validate(
            {"schema_version": 1, "actions": raw_actions}
        ).actions
        QuestionEditorService(self.db).apply_action_set(
            revision_id=self.revision.id,
            expected_revision_updated_at=NOW,
            actions=actions,
        )

    def test_update_delete_and_reorder_use_no_internal_commit(self) -> None:
        self.apply([
            {
                "action_type": "update_text_block",
                "block_id": str(self.text_block.id),
                "payload": text_payload("After"),
            },
            {"action_type": "delete_block", "block_id": str(self.formula_block.id)},
            {
                "action_type": "reorder_blocks",
                "ordered_block_ids": [str(self.text_block.id)],
            },
        ])

        self.assertEqual(self.text_block.text_content.source_text, "After")
        self.assertIsNotNone(self.formula_block.deleted_at)
        self.assertEqual(self.text_block.sort_order, 1000)
        self.db.commit.assert_not_called()

    def test_all_targets_are_validated_before_first_mutation(self) -> None:
        before = self.text_block.text_content.source_text
        with self.assertRaises(InvalidAuthoringActionTargetError):
            self.apply([
                {
                    "action_type": "update_text_block",
                    "block_id": str(self.text_block.id),
                    "payload": text_payload("Must not persist"),
                },
                {"action_type": "delete_block", "block_id": str(uuid.uuid4())},
            ])
        self.assertEqual(self.text_block.text_content.source_text, before)
        self.db.flush.assert_not_called()

    def test_wrong_block_type_and_incomplete_order_are_rejected(self) -> None:
        with self.assertRaises(InvalidAuthoringActionTargetError):
            self.apply([{
                "action_type": "update_formula_block",
                "block_id": str(self.text_block.id),
                "payload": {"source_latex": "y", "format_version": 1},
            }])
        with self.assertRaises(BlockOrderSetMismatchError):
            self.apply([{
                "action_type": "reorder_blocks",
                "ordered_block_ids": [str(self.text_block.id)],
            }])


if __name__ == "__main__":
    unittest.main()
