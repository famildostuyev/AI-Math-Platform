from __future__ import annotations

import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import AIAuthoringProposalKind
from app.models.question_revision import QuestionRevision
from app.models.question_type import QuestionType
from app.services.admin_ai_result import AdminAIResultKind
from app.services.new_question_capability_handler import NewQuestionCapabilityHandler
from app.services.new_question_preview_handler import NewQuestionPreviewHandler

NOW = datetime(2026, 8, 27, 12, 0, tzinfo=timezone.utc)


def document(text: str) -> dict[str, object]:
    return {"type": "document", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


def payload(revision_id: uuid.UUID, type_id: uuid.UUID) -> dict[str, object]:
    return {
        "schema_version": 1, "generation_mode": "similar",
        "source_revision_id": str(revision_id), "question_type_id": str(type_id),
        "answer_policy": "option_single",
        "content_blocks": [{"block_type": "text", "local_key": "block_1", "payload": {"document": document("New question"), "format_version": 1}}],
        "answer_options": [
            {"local_key": "option_1", "label": "A", "document": document("1")},
            {"local_key": "option_2", "label": "B", "document": document("2")},
        ],
        "correct_option_key": "option_2",
    }


class NewQuestionCapabilityHandlerTest(unittest.TestCase):
    def test_handler_builds_generic_bundle_without_canonical_question_mutation(self) -> None:
        revision = QuestionRevision(id=uuid.uuid4(), question_form_id=uuid.uuid4(), updated_at=NOW)
        question_type = QuestionType(id=uuid.uuid4(), name="multiple_choice", is_active=True)
        db = MagicMock()
        db.scalar.side_effect = [revision, question_type]
        handler = NewQuestionCapabilityHandler(db)
        handler.persistence = MagicMock()
        expected = MagicMock(proposal_kind=AIAuthoringProposalKind.CAPABILITY_BUNDLE)
        handler.persistence.create_pending_proposal.return_value = expected
        result = handler.create_pending_proposal(
            payload=payload(revision.id, question_type.id), expected_revision_updated_at=NOW,
            provider_name="fake", model_name="model", prompt_version="v1",
            provider_schema_version=1, requested_by_user_id=uuid.uuid4(),
        )
        self.assertIs(result, expected)
        envelope = handler.persistence.create_pending_proposal.call_args.kwargs["envelope"]
        self.assertEqual(envelope.result_kind, AdminAIResultKind.MUTATION_PROPOSAL)
        self.assertEqual(envelope.capability_results[0].capability_name, "question.create_new")
        self.assertFalse(db.add.called)

    def test_preview_reads_generic_bundle_and_preserves_order(self) -> None:
        revision_id = uuid.uuid4()
        proposal_id = uuid.uuid4()
        handler = NewQuestionPreviewHandler(MagicMock(), context_service=MagicMock())
        capability_handler = NewQuestionCapabilityHandler(MagicMock())
        # Build the same typed envelope at the capability boundary without persistence.
        generated = payload(revision_id, uuid.uuid4())
        from app.services.admin_ai_result import AdminAICapabilityResult, AdminAIResultEnvelope, AdminAISourceSnapshot
        envelope = AdminAIResultEnvelope(
            schema_version=1, result_kind="mutation_proposal",
            capability_results=(AdminAICapabilityResult(
                capability_name="question.create_new", capability_version=1,
                classification="mutation_preparation", effect_scope="new_question", payload=generated,
            ),), source_snapshots=(AdminAISourceSnapshot(
                entity_type="question_revision", entity_id=revision_id, updated_at=NOW,
            ),), warnings=(),
        )
        proposal = MagicMock(id=proposal_id, source_revision_id=revision_id, source_revision_updated_at=NOW)
        handler.persistence = MagicMock()
        handler.persistence.get_validated_bundle.return_value = (proposal, envelope)
        context = MagicMock(
            revision_id=revision_id, revision_updated_at=NOW,
            blocks=(), answer_options=(),
        )
        handler.context.build_for_revision.return_value = context
        preview = handler.build_preview(proposal_id=proposal_id)
        self.assertEqual([item.label for item in preview.generated.options], ["A", "B"])
        self.assertEqual([item.is_correct for item in preview.generated.options], [False, True])


if __name__ == "__main__":
    unittest.main()
