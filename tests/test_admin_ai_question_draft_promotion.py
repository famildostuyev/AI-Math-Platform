from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.api.admin_ai import (
    get_admin_ai_generated_question_draft_service,
    promote_admin_ai_question_draft,
    router,
)
from app.api.deps import get_current_user
from app.core.enums import AdminAIGeneratedQuestionDraftStatus, RoleName
from app.database.session import get_db
from app.models.admin_ai_generated_question_draft import AdminAIGeneratedQuestionDraft
from app.models.question_type import QuestionType
from app.services.admin_ai_generated_question_draft_service import (
    AdminAIGeneratedQuestionDraftNotPromotableError,
    AdminAIGeneratedQuestionDraftService,
)
from app.services.admin_ai_orchestrator import AdminAIGeneratedDraft
from app.services.authoring_action import (
    CreateAnswerOptionAction,
    CreateFormulaBlockAction,
    CreateSolutionAction,
    CreateSolutionTextBlockAction,
    CreateTextBlockAction,
    SetCorrectAnswersAction,
)


def generated_draft() -> AdminAIGeneratedDraft:
    return AdminAIGeneratedDraft.model_validate({
        "draft_kind": "question", "format_hint": "multiple_choice",
        "title": "New question",
        "content": {"format_version": 1, "segments": [
            {"type": "text", "text": "Choose:"},
            {"type": "math", "latex": "x^2=4", "source_text": "x squared is 4", "display_mode": True},
        ]},
        "answer_options": [
            {"label": "A", "text": "2", "content": None},
            {"label": "B", "text": "4", "content": {"format_version": 1, "segments": [
                {"type": "math", "latex": "4", "source_text": "4", "display_mode": False},
            ]}},
        ],
        "correct_option_labels": ["A"],
        "explanation": {"format_version": 1, "segments": [
            {"type": "text", "text": "The positive value is selected."},
        ]},
        "is_canonical": False,
    })


def record(*, status=AdminAIGeneratedQuestionDraftStatus.ACTIVE):
    draft = generated_draft()
    return AdminAIGeneratedQuestionDraft(
        id=uuid.uuid4(), owner_user_id=uuid.uuid4(), source_revision_id=uuid.uuid4(),
        status=status, draft_kind=draft.draft_kind, format_hint=draft.format_hint,
        title=draft.title, content=draft.content.model_dump(mode="json"),
        answer_options=[item.model_dump(mode="json") for item in draft.answer_options],
        correct_option_labels=list(draft.correct_option_labels),
        explanation=draft.explanation.model_dump(mode="json"), is_canonical=False,
    )


class AdminAIQuestionDraftPromotionServiceTest(unittest.TestCase):
    def test_actions_preserve_content_options_correctness_and_explanation(self) -> None:
        actions = AdminAIGeneratedQuestionDraftService._promotion_actions(generated_draft())
        self.assertEqual([type(item) for item in actions], [
            CreateTextBlockAction, CreateFormulaBlockAction,
            CreateAnswerOptionAction, CreateAnswerOptionAction,
            SetCorrectAnswersAction, CreateSolutionAction,
            CreateSolutionTextBlockAction,
        ])
        options = [item for item in actions if isinstance(item, CreateAnswerOptionAction)]
        correct = next(item for item in actions if isinstance(item, SetCorrectAnswersAction))
        self.assertEqual([item.label for item in options], ["A", "B"])
        self.assertEqual(correct.option_ids, [options[0].option_id])
        self.assertEqual(options[1].payload.document.content[0].content[0].latex, "4")

    def test_success_is_new_distinct_draft_and_commits_promotion_atomically(self) -> None:
        db = MagicMock()
        source = record()
        db.scalar.return_value = QuestionType(id=uuid.uuid4(), name="multiple_choice", is_active=True)
        canonical = SimpleNamespace(
            question_family_id=uuid.uuid4(), question_form_id=uuid.uuid4(),
            revision_id=uuid.uuid4(), updated_at=SimpleNamespace(),
        )
        editor = MagicMock()
        editor.create_draft.return_value = canonical
        service = AdminAIGeneratedQuestionDraftService(db)
        with patch.object(service, "get_draft", return_value=source), patch(
            "app.services.admin_ai_generated_question_draft_service.QuestionEditorService",
            return_value=editor,
        ):
            result = service.promote_to_new_question(
                draft_id=source.id, actor_user_id=source.owner_user_id,
                actor_role=RoleName.ADMIN,
            )
        self.assertIs(result, canonical)
        self.assertNotEqual(canonical.revision_id, source.source_revision_id)
        editor.create_draft.assert_called_once()
        self.assertFalse(editor.create_draft.call_args.kwargs["commit"])
        editor.apply_action_set.assert_called_once()
        self.assertEqual(source.status, AdminAIGeneratedQuestionDraftStatus.PROMOTED)
        db.commit.assert_called_once()

    def test_promoted_and_discarded_drafts_cannot_be_promoted(self) -> None:
        for draft_status in (
            AdminAIGeneratedQuestionDraftStatus.PROMOTED,
            AdminAIGeneratedQuestionDraftStatus.DISCARDED,
        ):
            with self.subTest(status=draft_status):
                db = MagicMock()
                source = record(status=draft_status)
                service = AdminAIGeneratedQuestionDraftService(db)
                with patch.object(service, "get_draft", return_value=source):
                    with self.assertRaises(AdminAIGeneratedQuestionDraftNotPromotableError):
                        service.promote_to_new_question(
                            draft_id=source.id, actor_user_id=source.owner_user_id,
                            actor_role=RoleName.ADMIN,
                        )
                db.commit.assert_not_called()
                db.rollback.assert_called_once()

    def test_canonical_failure_rolls_back_and_leaves_draft_active(self) -> None:
        db = MagicMock()
        source = record()
        db.scalar.return_value = QuestionType(id=uuid.uuid4(), name="multiple_choice", is_active=True)
        editor = MagicMock()
        editor.create_draft.return_value = SimpleNamespace(
            revision_id=uuid.uuid4(), updated_at=SimpleNamespace(),
        )
        editor.apply_action_set.side_effect = RuntimeError("canonical failure")
        service = AdminAIGeneratedQuestionDraftService(db)
        with patch.object(service, "get_draft", return_value=source), patch(
            "app.services.admin_ai_generated_question_draft_service.QuestionEditorService",
            return_value=editor,
        ):
            with self.assertRaises(RuntimeError):
                service.promote_to_new_question(
                    draft_id=source.id, actor_user_id=source.owner_user_id,
                    actor_role=RoleName.ADMIN,
                )
        db.commit.assert_not_called()
        db.rollback.assert_called_once()
        self.assertEqual(source.status, AdminAIGeneratedQuestionDraftStatus.ACTIVE)


class AdminAIQuestionDraftPromotionAPITest(unittest.TestCase):
    def setUp(self) -> None:
        self.user = SimpleNamespace(id=uuid.uuid4(), last_active_role_id=uuid.uuid4())
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        self.service = MagicMock()
        app = FastAPI()
        app.include_router(router, prefix="/api/v1")
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_admin_ai_generated_question_draft_service] = lambda: self.service
        self.client = TestClient(app)

    def test_admin_promotes_pending_draft_without_ai_or_proposal(self) -> None:
        draft_id = uuid.uuid4()
        canonical = SimpleNamespace(
            question_family_id=uuid.uuid4(), question_form_id=uuid.uuid4(),
            revision_id=uuid.uuid4(),
        )
        self.service.promote_to_new_question.return_value = canonical
        response = self.client.post(f"/api/v1/admin-ai/question-drafts/{draft_id}/promote")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {
            "draft_id": str(draft_id), "draft_status": "promoted",
            "question_family_id": str(canonical.question_family_id),
            "question_form_id": str(canonical.question_form_id),
            "revision_id": str(canonical.revision_id),
        })
        self.service.promote_to_new_question.assert_called_once_with(
            draft_id=draft_id, actor_user_id=self.user.id, actor_role=RoleName.ADMIN,
        )

    def test_non_admin_is_rejected(self) -> None:
        self.db.scalar.return_value = RoleName.TEACHER.value
        response = self.client.post(
            f"/api/v1/admin-ai/question-drafts/{uuid.uuid4()}/promote"
        )
        self.assertEqual(response.status_code, 403)
        self.service.promote_to_new_question.assert_not_called()


if __name__ == "__main__":
    unittest.main()
