from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from pydantic import ValidationError


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import (
    AIAuthoringConversationStatus,
    ContentBlockType,
    QuestionRevisionProvenanceKind,
    QuestionRevisionStatus,
)
from app.models.ai_authoring_conversation import AIAuthoringConversation
from app.schemas.question_editor import (
    FormulaBlockPayloadRead,
    FormulaBlockRead,
    GeometryBlockPayloadRead,
    GeometryBlockRead,
    ImageBlockPayloadRead,
    ImageBlockRead,
    QuestionRevisionEditorRead,
    TextBlockPayloadRead,
    TextBlockRead,
)
from app.services.question_authoring_context import (
    AuthoringContextConversationNotFoundError,
    AuthoringContextConversationDeletedError,
    AuthoringContextRevisionInactiveError,
    AuthoringContextRevisionNotFoundError,
    AuthoringContextTooLargeError,
    AuthoringFormulaBlockContext,
    AuthoringGeometryBlockContext,
    AuthoringImageBlockContext,
    AuthoringTextBlockContext,
    QuestionAuthoringContextService,
)
from app.services.question_editor_service import RevisionNotFoundError
from app.schemas.question_solution import SolutionRead, SolutionTextBlockRead, SolutionFormulaBlockRead


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


def document(text: str = "Find x") -> dict[str, object]:
    return {
        "type": "document",
        "content": [{
            "type": "paragraph",
            "content": [{"type": "text", "text": text}],
        }],
    }


def editor_read(*, text: str = "Find x") -> QuestionRevisionEditorRead:
    return QuestionRevisionEditorRead(
        question_family_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        question_form_id=uuid.UUID("00000000-0000-0000-0000-000000000002"),
        revision_id=uuid.UUID("00000000-0000-0000-0000-000000000003"),
        revision_number=2,
        status=QuestionRevisionStatus.DRAFT,
        question_type_id=uuid.UUID("00000000-0000-0000-0000-000000000004"),
        source_id=uuid.UUID("00000000-0000-0000-0000-000000000005"),
        source_detail="Page 4",
        source_display_name="Algebra source",
        primary_topic_id=None,
        related_topic_ids=[],
        purpose_ids=[],
        difficulty=None,
        updated_at=NOW,
        blocks=[
            TextBlockRead(
                id=uuid.UUID("00000000-0000-0000-0000-000000000011"),
                block_type=ContentBlockType.TEXT,
                sort_order=1000,
                payload=TextBlockPayloadRead(
                    source_text=text,
                    document=document(text),
                    format_version=1,
                ),
            ),
            FormulaBlockRead(
                id=uuid.UUID("00000000-0000-0000-0000-000000000012"),
                block_type=ContentBlockType.FORMULA,
                sort_order=2000,
                payload=FormulaBlockPayloadRead(source_latex=r"\frac{1}{2}", format_version=1),
            ),
            ImageBlockRead(
                id=uuid.UUID("00000000-0000-0000-0000-000000000013"),
                block_type=ContentBlockType.IMAGE,
                sort_order=3000,
                payload=ImageBlockPayloadRead(
                    media_asset_id=uuid.UUID("00000000-0000-0000-0000-000000000021"),
                    alt_text="Triangle",
                ),
            ),
            GeometryBlockRead(
                id=uuid.UUID("00000000-0000-0000-0000-000000000014"),
                block_type=ContentBlockType.GEOMETRY,
                sort_order=4000,
                payload=GeometryBlockPayloadRead(
                    source_data={
                        "kind": "triangle",
                        "points": [{"x": 0, "y": 1, "storage_key": "private"}],
                        "api_key": "secret",
                        "raw_provider_response": {"private": True},
                    },
                    format_version=1,
                ),
            ),
        ],
    )


class QuestionAuthoringContextServiceTest(unittest.TestCase):
    def test_solution_context_is_nullable_and_preserves_ordered_typed_blocks(self) -> None:
        service = QuestionAuthoringContextService(MagicMock(), max_chars=100_000)
        base = editor_read()
        self.assertIsNone(service._build(base, QuestionRevisionProvenanceKind.HUMAN_AUTHORED).solution)
        text_id, formula_id = uuid.uuid4(), uuid.uuid4()
        read = base.model_copy(update={"solution": SolutionRead(id=uuid.uuid4(), blocks=[
            SolutionTextBlockRead(id=text_id, block_type="text", sort_order=1000,
                source_text="Step", document=document("Step"), format_version=1),
            SolutionFormulaBlockRead(id=formula_id, block_type="formula", sort_order=2000,
                source_latex="x=2", format_version=1),
        ])})
        solution = service._build(read, QuestionRevisionProvenanceKind.HUMAN_AUTHORED).solution
        self.assertIsNotNone(solution)
        assert solution is not None
        self.assertEqual([item.block_id for item in solution.blocks], [text_id, formula_id])
        self.assertEqual([item.block_type for item in solution.blocks], ["text", "formula"])

    def build(self, read: QuestionRevisionEditorRead | None = None, *, max_chars: int = 100_000):
        aggregate = read or editor_read()
        db = MagicMock()
        db.scalar.return_value = MagicMock(
            deleted_at=None,
            provenance_kind=QuestionRevisionProvenanceKind.AI_TRANSFORMED,
        )
        with patch(
            "app.services.question_authoring_context.QuestionEditorService.get_revision_for_editor",
            return_value=aggregate,
        ):
            return QuestionAuthoringContextService(db, max_chars=max_chars).build_for_revision(
                revision_id=aggregate.revision_id
            )

    def test_revision_context_maps_identity_snapshot_source_and_provenance(self) -> None:
        context = self.build()
        self.assertEqual(context.revision_number, 2)
        self.assertEqual(context.revision_updated_at, NOW)
        self.assertEqual(context.provenance_kind, QuestionRevisionProvenanceKind.AI_TRANSFORMED)
        self.assertEqual(context.source.display_name, "Algebra source")
        self.assertEqual(context.source.detail, "Page 4")

    def test_ordered_typed_blocks_are_preserved(self) -> None:
        context = self.build()
        self.assertEqual([block.order for block in context.blocks], [1000, 2000, 3000, 4000])
        self.assertEqual(
            [type(block) for block in context.blocks],
            [
                AuthoringTextBlockContext,
                AuthoringFormulaBlockContext,
                AuthoringImageBlockContext,
                AuthoringGeometryBlockContext,
            ],
        )
        self.assertEqual(context.blocks[1].source_latex, r"\frac{1}{2}")

    def test_image_has_reference_metadata_only(self) -> None:
        image = self.build().blocks[2]
        serialized = image.model_dump()
        self.assertEqual(set(serialized), {"block_type", "block_id", "order", "media_asset_id", "alt_text"})
        self.assertTrue({"binary", "bytes", "base64", "storage_key", "path"}.isdisjoint(serialized))

    def test_geometry_is_recursively_sanitized(self) -> None:
        geometry = self.build().blocks[3]
        serialized = repr(geometry.model_dump()).casefold()
        self.assertIn("triangle", serialized)
        for forbidden in ("api_key", "storage_key", "raw_provider_response", "secret", "private"):
            self.assertNotIn(forbidden, serialized)

    def test_context_is_frozen_and_deterministic(self) -> None:
        first = self.build()
        second = self.build()
        self.assertEqual(first.model_dump(mode="json"), second.model_dump(mode="json"))
        with self.assertRaises(ValidationError):
            first.revision_number = 3

    def test_budget_passes_whole_context_or_raises_without_truncation(self) -> None:
        context = self.build(max_chars=100_000)
        self.assertEqual(context.blocks[0].source_text, "Find x")
        with self.assertRaises(AuthoringContextTooLargeError):
            self.build(editor_read(text="x" * 500), max_chars=100)

    def test_invalid_revision_is_safely_mapped(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None
        with self.assertRaises(AuthoringContextRevisionNotFoundError):
            QuestionAuthoringContextService(db, max_chars=1000).build_for_revision(
                revision_id=uuid.uuid4()
            )

    def test_deleted_revision_has_distinct_typed_error(self) -> None:
        db = MagicMock()
        db.scalar.return_value = MagicMock(deleted_at=NOW)
        with self.assertRaises(AuthoringContextRevisionInactiveError):
            QuestionAuthoringContextService(db, max_chars=1000).build_for_revision(
                revision_id=uuid.uuid4()
            )

    def test_editor_rejection_is_safely_mapped(self) -> None:
        db = MagicMock()
        db.scalar.return_value = MagicMock(
            deleted_at=None,
            provenance_kind=QuestionRevisionProvenanceKind.AI_TRANSFORMED,
        )
        with patch(
            "app.services.question_authoring_context.QuestionEditorService.get_revision_for_editor",
            side_effect=RevisionNotFoundError("internal"),
        ), self.assertRaises(AuthoringContextRevisionNotFoundError):
            QuestionAuthoringContextService(db, max_chars=1000).build_for_revision(
                revision_id=uuid.uuid4()
            )

    def test_conversation_maps_to_revision_and_closed_remains_readable(self) -> None:
        aggregate = editor_read()
        conversation = AIAuthoringConversation(
            id=uuid.uuid4(),
            active_revision_id=aggregate.revision_id,
            status=AIAuthoringConversationStatus.CLOSED,
        )
        db = MagicMock()
        db.scalar.side_effect = [
            conversation,
            MagicMock(
                deleted_at=None,
                provenance_kind=QuestionRevisionProvenanceKind.AI_TRANSFORMED,
            ),
        ]
        with patch(
            "app.services.question_authoring_context.QuestionEditorService.get_revision_for_editor",
            return_value=aggregate,
        ):
            context = QuestionAuthoringContextService(db, max_chars=100_000).build_for_conversation(
                conversation_id=conversation.id
            )
        self.assertEqual(context.revision_id, conversation.active_revision_id)

    def test_deleted_or_missing_conversation_is_rejected(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None
        with self.assertRaises(AuthoringContextConversationNotFoundError):
            QuestionAuthoringContextService(db, max_chars=1000).build_for_conversation(
                conversation_id=uuid.uuid4()
            )

        deleted_db = MagicMock()
        deleted_db.scalar.return_value = AIAuthoringConversation(
            id=uuid.uuid4(),
            active_revision_id=uuid.uuid4(),
            status=AIAuthoringConversationStatus.CLOSED,
            deleted_at=NOW,
        )
        with self.assertRaises(AuthoringContextConversationDeletedError):
            QuestionAuthoringContextService(
                deleted_db, max_chars=1000
            ).build_for_conversation(conversation_id=uuid.uuid4())

    def test_contract_exposes_no_secret_provider_or_storage_fields(self) -> None:
        serialized = repr(self.build().model_dump()).casefold()
        for forbidden in (
            "api_key", "access_token", "refresh_token", "authorization",
            "storage_key", "storage_path", "raw_provider", "system_prompt",
        ):
            self.assertNotIn(forbidden, serialized)


if __name__ == "__main__":
    unittest.main()
