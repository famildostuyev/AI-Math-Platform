from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.exc import IntegrityError

os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = "test-verification-code-hash-key-01"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.enums import AnswerPolicy, QuestionRevisionStatus
from app.models.accepted_answer import AcceptedAnswer
from app.models.ai_authoring_proposal import AIAuthoringProposal
from app.models.answer_option import AnswerOption
from app.schemas.question_answer import (
    AcceptedAnswerCreate, AcceptedAnswerUpdate, AnswerOptionCreate,
    AnswerOptionUpdate, AnswerOrderRequest, SetCorrectOptionsRequest,
)
from app.services.question_answer_service import (
    AnswerIntegrityConflictError, AnswerPolicyService, AnswerRecordNotFoundError,
    AnswerRevisionConflictError, AnswerRevisionNotEditableError,
    CorrectOptionDeleteError, QuestionAnswerService,
)

NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


def document(text: str = "Value", *, math: str | None = None):
    content = [{"type": "text", "text": text, "marks": []}]
    if math is not None:
        content.append({"type": "inline_math", "latex": math})
    return {"type": "document", "content": [{"type": "paragraph", "attrs": None, "content": content}]}


def revision(*, type_name: str = "open_response"):
    return SimpleNamespace(
        id=uuid.uuid4(), status=QuestionRevisionStatus.DRAFT, updated_at=NOW,
        question_form=SimpleNamespace(question_type=SimpleNamespace(name=type_name)),
    )


def option(revision_id, label="A", order=1000, correct=False):
    return AnswerOption(
        id=uuid.uuid4(), revision_id=revision_id, label=label, order_index=order,
        source_text="Value", document_data=document(), format_version=1,
        is_correct=correct,
    )


def accepted(revision_id, order=1000):
    return AcceptedAnswer(
        id=uuid.uuid4(), revision_id=revision_id, order_index=order,
        source_text="Value", document_data=document(), format_version=1,
    )


def scalar_rows(values):
    result = MagicMock()
    result.all.return_value = values
    return result


class QuestionAnswerServiceTest(unittest.TestCase):
    def test_policy_derives_only_explicit_open_response(self) -> None:
        self.assertEqual(AnswerPolicyService.for_question_type_name("open_response"), AnswerPolicy.ACCEPTED_ANSWER)
        self.assertEqual(AnswerPolicyService.for_question_type_name("multiple_choice"), AnswerPolicy.OPTION_SINGLE)

    def test_non_draft_and_stale_revision_mutations_are_rejected(self) -> None:
        non_draft = revision()
        non_draft.status = QuestionRevisionStatus.APPROVED
        db = MagicMock()
        db.scalar.return_value = non_draft
        with self.assertRaises(AnswerRevisionNotEditableError):
            QuestionAnswerService(db).create_option(
                revision_id=non_draft.id,
                request=AnswerOptionCreate(document=document(), expected_revision_updated_at=NOW),
            )
        db.commit.assert_not_called()

        stale = revision()
        stale.updated_at = datetime(2026, 8, 25, 12, 1, tzinfo=timezone.utc)
        db = MagicMock()
        db.scalar.return_value = stale
        with self.assertRaises(AnswerRevisionConflictError):
            QuestionAnswerService(db).create_option(
                revision_id=stale.id,
                request=AnswerOptionCreate(document=document(), expected_revision_updated_at=NOW),
            )
        db.commit.assert_not_called()

    def test_create_option_preserves_nullable_or_lowercase_label_and_inline_math(self) -> None:
        for label in (None, "a"):
            with self.subTest(label=label):
                db, rev = MagicMock(), revision()
                db.scalar.side_effect = [rev, 0]
                def flush():
                    added = db.add.call_args.args[0]
                    added.id = added.id or uuid.uuid4()
                db.flush.side_effect = flush
                response = QuestionAnswerService(db).create_option(
                    revision_id=rev.id,
                    request=AnswerOptionCreate(label=label, document=document("x=", math="\\frac{1}{2}"), expected_revision_updated_at=NOW),
                )
                self.assertEqual(response.label, label)
                self.assertEqual(response.document.content[0].content[1].latex, "\\frac{1}{2}")
                self.assertFalse(response.is_correct)
                self.assertNotEqual(rev.updated_at, NOW)
                self.assertFalse(any(isinstance(call.args[0], AIAuthoringProposal) for call in db.add.call_args_list))

    def test_update_and_delete_option(self) -> None:
        db, rev = MagicMock(), revision()
        item = option(rev.id)
        db.scalar.side_effect = [rev, item]
        updated = QuestionAnswerService(db).update_option(
            revision_id=rev.id, option_id=item.id,
            request=AnswerOptionUpdate(label="b", document=document("New"), expected_revision_updated_at=NOW),
        )
        self.assertEqual((updated.label, updated.source_text), ("b", "New"))

        db, rev = MagicMock(), revision()
        item = option(rev.id)
        db.scalar.side_effect = [rev, item]
        QuestionAnswerService(db).delete_option(revision_id=rev.id, option_id=item.id, expected_revision_updated_at=NOW)
        self.assertIsNotNone(item.deleted_at)

    def test_correct_option_delete_is_rejected_atomically(self) -> None:
        db, rev = MagicMock(), revision()
        item = option(rev.id, correct=True)
        db.scalar.side_effect = [rev, item]
        with self.assertRaises(CorrectOptionDeleteError):
            QuestionAnswerService(db).delete_option(revision_id=rev.id, option_id=item.id, expected_revision_updated_at=NOW)
        db.commit.assert_not_called()
        self.assertIsNone(item.deleted_at)

    def test_reorder_preserves_identity_and_correctness(self) -> None:
        db, rev = MagicMock(), revision()
        first, second = option(rev.id, "A", 1000, True), option(rev.id, "B", 2000)
        db.scalar.return_value = rev
        db.scalars.return_value = scalar_rows([first, second])
        response = QuestionAnswerService(db).reorder_options(
            revision_id=rev.id,
            request=AnswerOrderRequest(answer_ids=[second.id, first.id], expected_revision_updated_at=NOW),
        )
        self.assertEqual([item.id for item in response], [second.id, first.id])
        self.assertEqual([item.order_index for item in response], [1000, 2000])
        self.assertTrue(response[1].is_correct)

    def test_set_correct_supports_single_multiple_and_empty(self) -> None:
        for selected_count in (0, 1, 2):
            db, rev = MagicMock(), revision()
            items = [option(rev.id, "A"), option(rev.id, "B", 2000)]
            db.scalar.return_value = rev
            db.scalars.return_value = scalar_rows(items)
            selected = [item.id for item in items[:selected_count]]
            response = QuestionAnswerService(db).set_correct_options(
                revision_id=rev.id,
                request=SetCorrectOptionsRequest(option_ids=selected, expected_revision_updated_at=NOW),
            )
            self.assertEqual(sum(item.is_correct for item in response), selected_count)

    def test_cross_revision_correct_option_is_rejected(self) -> None:
        db, rev = MagicMock(), revision()
        item = option(rev.id)
        db.scalar.return_value = rev
        db.scalars.return_value = scalar_rows([item])
        with self.assertRaises(AnswerRecordNotFoundError):
            QuestionAnswerService(db).set_correct_options(
                revision_id=rev.id,
                request=SetCorrectOptionsRequest(option_ids=[uuid.uuid4()], expected_revision_updated_at=NOW),
            )
        db.commit.assert_not_called()

    def test_database_label_or_order_conflict_maps_to_domain_error(self) -> None:
        db, rev = MagicMock(), revision()
        db.scalar.side_effect = [rev, 0]
        db.flush.side_effect = lambda: setattr(db.add.call_args.args[0], "id", uuid.uuid4())
        db.commit.side_effect = IntegrityError("statement", {}, Exception())
        with self.assertRaises(AnswerIntegrityConflictError):
            QuestionAnswerService(db).create_option(
                revision_id=rev.id,
                request=AnswerOptionCreate(label="A", document=document(), expected_revision_updated_at=NOW),
            )
        db.rollback.assert_called_once()

    def test_accepted_answer_crud_and_reorder(self) -> None:
        db, rev = MagicMock(), revision()
        db.scalar.side_effect = [rev, 0]
        db.flush.side_effect = lambda: setattr(db.add.call_args.args[0], "id", uuid.uuid4())
        created = QuestionAnswerService(db).create_accepted_answer(
            revision_id=rev.id,
            request=AcceptedAnswerCreate(document=document("42"), expected_revision_updated_at=NOW),
        )
        self.assertEqual(created.source_text, "42")

        db, rev = MagicMock(), revision()
        item = accepted(rev.id)
        db.scalar.side_effect = [rev, item]
        updated = QuestionAnswerService(db).update_accepted_answer(
            revision_id=rev.id, answer_id=item.id,
            request=AcceptedAnswerUpdate(document=document("43"), expected_revision_updated_at=NOW),
        )
        self.assertEqual(updated.source_text, "43")

        db, rev = MagicMock(), revision()
        item = accepted(rev.id)
        db.scalar.side_effect = [rev, item]
        QuestionAnswerService(db).delete_accepted_answer(
            revision_id=rev.id, answer_id=item.id, expected_revision_updated_at=NOW,
        )
        self.assertIsNotNone(item.deleted_at)

        db, rev = MagicMock(), revision()
        first, second = accepted(rev.id), accepted(rev.id, 2000)
        db.scalar.return_value = rev
        db.scalars.return_value = scalar_rows([first, second])
        reordered = QuestionAnswerService(db).reorder_accepted_answers(
            revision_id=rev.id,
            request=AnswerOrderRequest(answer_ids=[second.id, first.id], expected_revision_updated_at=NOW),
        )
        self.assertEqual([item.id for item in reordered], [second.id, first.id])

    def test_read_excludes_deleted_and_returns_policy(self) -> None:
        db, rev = MagicMock(), revision(type_name="open_response")
        db.scalar.return_value = rev
        db.scalars.side_effect = [scalar_rows([option(rev.id)]), scalar_rows([accepted(rev.id)])]
        response = QuestionAnswerService(db).read_answers_for_revision(revision_id=rev.id)
        self.assertEqual(response.answer_policy, AnswerPolicy.ACCEPTED_ANSWER)
        self.assertEqual((len(response.answer_options), len(response.accepted_answers)), (1, 1))
        for call in db.scalars.call_args_list:
            self.assertIn("deleted_at IS NULL", str(call.args[0]))


if __name__ == "__main__":
    unittest.main()
