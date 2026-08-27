from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import (
    AIAuthoringProposalStatus,
    ContentBlockType,
    QuestionRevisionProvenanceKind,
    QuestionRevisionStatus,
)
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.schemas.structured_text import StructuredTextDocument
from app.services.ai_authoring_proposal_preview_service import (
    AIAuthoringProposalPreviewBlockTypeError,
    AIAuthoringProposalPreviewInvalidEnvelopeError,
    AIAuthoringProposalPreviewInvalidOrderError,
    AIAuthoringProposalPreviewInvalidTargetError,
    AIAuthoringProposalPreviewService,
    AuthoringBlockOrderPreview,
)
from app.services.question_authoring_context import (
    AuthoringFormulaBlockContext,
    AuthoringImageBlockContext,
    AuthoringRevisionContext,
    AuthoringSourceContext,
    AuthoringTextBlockContext,
    AuthoringSolutionContext,
    AuthoringSolutionTextBlockContext,
)


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)
TEXT_ID = uuid.UUID("00000000-0000-0000-0000-000000000011")
FORMULA_ID = uuid.UUID("00000000-0000-0000-0000-000000000012")
IMAGE_ID = uuid.UUID("00000000-0000-0000-0000-000000000013")


def document(text: str) -> dict[str, object]:
    return {
        "type": "document",
        "content": [{
            "type": "paragraph",
            "content": [{"type": "text", "text": text}],
        }],
    }


def revision_context(*, updated_at: datetime = NOW) -> AuthoringRevisionContext:
    text_document = StructuredTextDocument.model_validate(document("Before"))
    return AuthoringRevisionContext(
        revision_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        revision_number=1,
        revision_status=QuestionRevisionStatus.DRAFT,
        revision_updated_at=updated_at,
        provenance_kind=QuestionRevisionProvenanceKind.HUMAN_AUTHORED,
        question_family_id=uuid.uuid4(),
        question_form_id=uuid.uuid4(),
        question_type_id=uuid.uuid4(),
        primary_topic_id=None,
        related_topic_ids=(),
        purpose_ids=(),
        difficulty=None,
        source=AuthoringSourceContext(source_id=None, display_name=None, detail=None),
        blocks=(
            AuthoringTextBlockContext(
                block_type=ContentBlockType.TEXT,
                block_id=TEXT_ID,
                order=1000,
                source_text="Before",
                document=text_document,
                format_version=1,
            ),
            AuthoringFormulaBlockContext(
                block_type=ContentBlockType.FORMULA,
                block_id=FORMULA_ID,
                order=2000,
                source_latex="x",
                format_version=1,
            ),
            AuthoringImageBlockContext(
                block_type=ContentBlockType.IMAGE,
                block_id=IMAGE_ID,
                order=3000,
                media_asset_id=uuid.uuid4(),
                alt_text="Figure",
            ),
        ),
    )


def proposal(actions: list[dict[str, object]], *, snapshot: datetime = NOW):
    return AIAuthoringProposal(
        id=uuid.UUID("00000000-0000-0000-0000-000000000101"),
        source_revision_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        source_revision_updated_at=snapshot,
        status=AIAuthoringProposalStatus.PENDING,
        actions={"schema_version": 1, "actions": actions},
    )


class AIAuthoringProposalPreviewServiceTest(unittest.TestCase):
    def test_create_solution_and_blocks_preview_is_ordered(self) -> None:
        preview, _, _ = self.build(proposal([
            {"action_type": "create_solution"},
            {"action_type": "create_solution_text_block", "payload": {"document": document("First step"), "format_version": 1}},
            {"action_type": "create_solution_formula_block", "payload": {"source_latex": "x=2", "format_version": 1}},
        ]))
        self.assertEqual([change.action_type for change in preview.changes], [
            "create_solution", "create_solution_text_block", "create_solution_formula_block",
        ])
        self.assertEqual(preview.changes[1].after.source_text, "First step")
        self.assertEqual(preview.changes[2].after.source_latex, "x=2")
        self.assertIn("solution_created", preview.warnings)
        self.assertIn("multiple_solution_changes", preview.warnings)

    def test_existing_solution_update_reorder_delete_preview(self) -> None:
        block_id = uuid.uuid4()
        aggregate = revision_context().model_copy(update={"solution": AuthoringSolutionContext(
            solution_id=uuid.uuid4(),
            blocks=(AuthoringSolutionTextBlockContext(
                block_type="text", block_id=block_id, order=1000,
                source_text="Before", document=StructuredTextDocument.model_validate(document("Before")),
                format_version=1,
            ),),
        )})
        preview, _, _ = self.build(proposal([
            {"action_type": "update_solution_text_block", "solution_block_id": str(block_id), "payload": {"document": document("After"), "format_version": 1}},
            {"action_type": "reorder_solution_blocks", "ordered_solution_block_ids": [str(block_id)]},
            {"action_type": "delete_solution_block", "solution_block_id": str(block_id)},
            {"action_type": "delete_solution"},
        ]), aggregate)
        self.assertEqual(preview.changes[0].after.source_text, "After")
        self.assertIn("solution_deleted", preview.warnings)
        self.assertIn("solution_block_deleted", preview.warnings)

    def test_solution_create_block_without_solution_rejects(self) -> None:
        with self.assertRaises(AIAuthoringProposalPreviewInvalidTargetError):
            self.build(proposal([{"action_type": "create_solution_text_block", "payload": {"document": document("Step"), "format_version": 1}}]))

    def build(self, item: AIAuthoringProposal, context=None):
        db = MagicMock()
        db.scalar.return_value = item
        aggregate = context or revision_context()
        context_service = MagicMock()
        context_service.build_for_revision.return_value = aggregate
        result = AIAuthoringProposalPreviewService(
            db, context_service=context_service
        ).build_preview(proposal_id=item.id)
        return result, db, aggregate

    def test_update_text_before_after(self) -> None:
        preview, _, _ = self.build(proposal([{
            "action_type": "update_text_block",
            "block_id": str(TEXT_ID),
            "payload": {"document": document("After"), "format_version": 1},
        }]))
        change = preview.changes[0]
        self.assertEqual((change.change_kind, change.before.source_text, change.after.source_text), (
            "updated", "Before", "After"
        ))

    def test_update_formula_before_after_and_warning(self) -> None:
        preview, _, _ = self.build(proposal([{
            "action_type": "update_formula_block",
            "block_id": str(FORMULA_ID),
            "payload": {"source_latex": "x^2", "format_version": 1},
        }]))
        change = preview.changes[0]
        self.assertEqual((change.before.source_latex, change.after.source_latex), ("x", "x^2"))
        self.assertIn("formula_changed", preview.warnings)

    def test_create_text_and_formula_have_null_before(self) -> None:
        preview, _, _ = self.build(proposal([
            {
                "action_type": "create_text_block",
                "payload": {"document": document("New"), "format_version": 1},
            },
            {
                "action_type": "create_formula_block",
                "payload": {"source_latex": r"\sqrt{x}", "format_version": 1},
            },
        ]))
        self.assertEqual(preview.action_count, 2)
        self.assertTrue(all(change.before is None for change in preview.changes))
        self.assertEqual([change.change_kind for change in preview.changes], ["created", "created"])
        self.assertIn("multiple_actions", preview.warnings)

    def test_delete_has_before_null_after_and_warning(self) -> None:
        preview, _, _ = self.build(proposal([{
            "action_type": "delete_block", "block_id": str(TEXT_ID),
        }]))
        change = preview.changes[0]
        self.assertEqual(change.before.block_id, TEXT_ID)
        self.assertIsNone(change.after)
        self.assertIn("destructive_delete", preview.warnings)

    def test_reorder_includes_image_and_preserves_before_after(self) -> None:
        preview, _, _ = self.build(proposal([{
            "action_type": "reorder_blocks",
            "ordered_block_ids": [str(IMAGE_ID), str(TEXT_ID), str(FORMULA_ID)],
        }]))
        change = preview.changes[0]
        self.assertIsInstance(change.before, AuthoringBlockOrderPreview)
        self.assertEqual(change.before.ordered_block_ids, (TEXT_ID, FORMULA_ID, IMAGE_ID))
        self.assertEqual(change.after.ordered_block_ids, (IMAGE_ID, TEXT_ID, FORMULA_ID))

    def test_create_then_reorder_appends_deterministic_created_block(self) -> None:
        item = proposal([
            {
                "action_type": "create_formula_block",
                "payload": {"source_latex": "y", "format_version": 1},
            },
            {
                "action_type": "reorder_blocks",
                "ordered_block_ids": [str(IMAGE_ID), str(FORMULA_ID), str(TEXT_ID)],
            },
        ])
        first, _, _ = self.build(item)
        second, _, _ = self.build(item)
        created_id = first.changes[0].block_id
        self.assertEqual(created_id, second.changes[0].block_id)
        self.assertEqual(
            first.changes[1].after.ordered_block_ids,
            (IMAGE_ID, FORMULA_ID, TEXT_ID, created_id),
        )

    def test_update_then_reorder_uses_updated_in_memory_block(self) -> None:
        preview, _, _ = self.build(proposal([
            {
                "action_type": "update_text_block",
                "block_id": str(TEXT_ID),
                "payload": {"document": document("After"), "format_version": 1},
            },
            {
                "action_type": "reorder_blocks",
                "ordered_block_ids": [str(FORMULA_ID), str(TEXT_ID), str(IMAGE_ID)],
            },
        ]))
        self.assertEqual(preview.changes[0].after.source_text, "After")
        self.assertEqual(preview.changes[1].after.ordered_block_ids[0], FORMULA_ID)

    def test_stale_preview_warns_without_mutating_any_state(self) -> None:
        item = proposal([{
            "action_type": "delete_block", "block_id": str(TEXT_ID),
        }], snapshot=NOW - timedelta(seconds=1))
        aggregate = revision_context()
        proposal_before = dict(item.__dict__)
        context_before = aggregate.model_dump(mode="json")
        preview, db, _ = self.build(item, aggregate)
        self.assertTrue(preview.is_stale)
        self.assertIn("stale_revision", preview.warnings)
        self.assertEqual(item.__dict__, proposal_before)
        self.assertEqual(aggregate.model_dump(mode="json"), context_before)
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_malformed_target_type_and_order_are_typed_errors(self) -> None:
        cases = (
            (proposal([{"action_type": "unknown"}]), AIAuthoringProposalPreviewInvalidEnvelopeError),
            (proposal([{"action_type": "delete_block", "block_id": str(uuid.uuid4())}]), AIAuthoringProposalPreviewInvalidTargetError),
            (proposal([{
                "action_type": "update_formula_block",
                "block_id": str(TEXT_ID),
                "payload": {"source_latex": "x", "format_version": 1},
            }]), AIAuthoringProposalPreviewBlockTypeError),
            (proposal([{
                "action_type": "reorder_blocks",
                "ordered_block_ids": [str(TEXT_ID)],
            }]), AIAuthoringProposalPreviewInvalidOrderError),
        )
        for item, expected in cases:
            with self.subTest(expected=expected.__name__), self.assertRaises(expected):
                self.build(item)

    def test_preview_has_no_mutation_or_decision_dependencies(self) -> None:
        module = sys.modules[AIAuthoringProposalPreviewService.__module__]
        names = set(vars(module))
        self.assertNotIn("QuestionEditorService", names)
        self.assertNotIn("AIAuthoringProposalService", names)
        self.assertNotIn("OpenAI", names)
        self.assertNotIn("apply_action_set", names)
        self.assertNotIn("accept_proposal", names)
        self.assertNotIn("reject_proposal", names)


if __name__ == "__main__":
    unittest.main()
