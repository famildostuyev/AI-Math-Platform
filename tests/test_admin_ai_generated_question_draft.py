from __future__ import annotations

import ast
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock

from pydantic import ValidationError
from sqlalchemy import CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import AdminAIGeneratedQuestionDraftStatus, RoleName
from app.models.admin_ai_generated_question_draft import AdminAIGeneratedQuestionDraft
from app.models.question_revision import QuestionRevision
from app.models.user import User
from app.schemas.admin_ai_generated_question_draft import AdminAIGeneratedQuestionDraftCreate
from app.services.admin_ai_generated_question_draft_service import (
    AdminAIGeneratedQuestionDraftAccessError,
    AdminAIGeneratedQuestionDraftNotFoundError,
    AdminAIGeneratedQuestionDraftService,
    AdminAIGeneratedQuestionDraftSourceNotFoundError,
)
from app.services.admin_ai_orchestrator import AdminAIGeneratedDraft

MIGRATION_PATH = BACKEND_DIR / "alembic/versions/e9f1b3c5d746_add_admin_ai_generated_question_drafts.py"


def generated_draft() -> AdminAIGeneratedDraft:
    return AdminAIGeneratedDraft.model_validate({
        "draft_kind": "question", "format_hint": "multiple_choice", "title": "Structured draft",
        "content": {"format_version": 1, "segments": [
            {"type": "text", "text": "Choose the value:"},
            {"type": "math", "latex": "x^2=4", "source_text": "x²=4", "display_mode": True},
        ]},
        "answer_options": [
            {"label": "A", "text": "2", "content": None},
            {"label": "B", "text": "4", "content": {
                "format_version": 1,
                "segments": [{"type": "math", "latex": "4", "source_text": "4", "display_mode": False}],
            }},
        ],
        "correct_option_labels": ["A"],
        "explanation": {"format_version": 1, "segments": [
            {"type": "text", "text": "Positive value requested."},
        ]},
        "is_canonical": False,
    })


class AdminAIGeneratedQuestionDraftModelTest(unittest.TestCase):
    def test_model_fields_defaults_json_and_constraints(self) -> None:
        table = AdminAIGeneratedQuestionDraft.__table__
        self.assertEqual(table.name, "admin_ai_generated_question_drafts")
        self.assertEqual(set(table.c), {
            table.c.id, table.c.owner_user_id, table.c.source_revision_id, table.c.status,
            table.c.draft_kind, table.c.format_hint, table.c.title, table.c.content,
            table.c.answer_options, table.c.correct_option_labels, table.c.explanation,
            table.c.is_canonical, table.c.created_at, table.c.updated_at, table.c.deleted_at,
        })
        for name in ("content", "answer_options", "correct_option_labels", "explanation"):
            self.assertIsInstance(table.c[name].type, JSONB)
            self.assertTrue(table.c[name].type.none_as_null)
        self.assertEqual(table.c.status.type.enums, ["active", "promoted", "discarded"])
        checks = {item.name: str(item.sqltext) for item in table.constraints if isinstance(item, CheckConstraint)}
        self.assertIn("is_canonical = false", checks["ck_admin_ai_generated_drafts_noncanonical"])
        self.assertIn("jsonb_typeof", checks["ck_admin_ai_generated_drafts_content_object"])
        self.assertEqual(next(iter(table.c.owner_user_id.foreign_keys)).ondelete, "RESTRICT")
        self.assertEqual(next(iter(table.c.source_revision_id.foreign_keys)).ondelete, "SET NULL")

    def test_create_schema_and_domain_reject_canonical_true(self) -> None:
        typed = AdminAIGeneratedQuestionDraftCreate(
            generated_draft=generated_draft(), source_revision_id=None,
        )
        self.assertFalse(typed.generated_draft.is_canonical)
        invalid = generated_draft().model_dump(mode="json")
        invalid["is_canonical"] = True
        with self.assertRaises(ValidationError):
            AdminAIGeneratedDraft.model_validate(invalid)


class AdminAIGeneratedQuestionDraftServiceTest(unittest.TestCase):
    def test_structured_round_trip_with_optional_source_revision(self) -> None:
        owner_id = uuid.uuid4()
        source_id = uuid.uuid4()
        db = MagicMock()
        db.scalar.side_effect = [User(id=owner_id, is_active=True), QuestionRevision(id=source_id)]
        original = generated_draft()
        record = AdminAIGeneratedQuestionDraftService(db).create_from_generated_draft(
            draft=original, owner_user_id=owner_id, actor_role=RoleName.ADMIN,
            source_revision_id=source_id,
        )
        self.assertEqual(record.status, AdminAIGeneratedQuestionDraftStatus.ACTIVE)
        self.assertEqual(record.source_revision_id, source_id)
        self.assertFalse(record.is_canonical)
        self.assertEqual(
            AdminAIGeneratedQuestionDraftService.reconstruct_generated_draft(record), original,
        )
        db.add.assert_called_once_with(record)
        db.commit.assert_called_once()

    def test_source_is_optional_and_missing_source_is_rejected(self) -> None:
        owner_id = uuid.uuid4()
        without_source_db = MagicMock()
        without_source_db.scalar.return_value = User(id=owner_id, is_active=True)
        record = AdminAIGeneratedQuestionDraftService(without_source_db).create_from_generated_draft(
            draft=generated_draft(), owner_user_id=owner_id, actor_role=RoleName.ADMIN,
        )
        self.assertIsNone(record.source_revision_id)

        missing_db = MagicMock()
        missing_db.scalar.side_effect = [User(id=owner_id, is_active=True), None]
        with self.assertRaises(AdminAIGeneratedQuestionDraftSourceNotFoundError):
            AdminAIGeneratedQuestionDraftService(missing_db).create_from_generated_draft(
                draft=generated_draft(), owner_user_id=owner_id,
                actor_role=RoleName.ADMIN, source_revision_id=uuid.uuid4(),
            )
        missing_db.add.assert_not_called()

    def test_admin_ownership_is_required_for_fetch(self) -> None:
        owner_id = uuid.uuid4()
        record = AdminAIGeneratedQuestionDraft(
            id=uuid.uuid4(), owner_user_id=owner_id,
            status=AdminAIGeneratedQuestionDraftStatus.ACTIVE,
        )
        owned_db = MagicMock()
        owned_db.scalar.return_value = record
        fetched = AdminAIGeneratedQuestionDraftService(owned_db).get_draft(
            draft_id=record.id, actor_user_id=owner_id, actor_role=RoleName.ADMIN,
        )
        self.assertIs(fetched, record)
        statement = owned_db.scalar.call_args.args[0]
        self.assertIn("owner_user_id", str(statement))

        missing_db = MagicMock()
        missing_db.scalar.return_value = None
        with self.assertRaises(AdminAIGeneratedQuestionDraftNotFoundError):
            AdminAIGeneratedQuestionDraftService(missing_db).get_draft(
                draft_id=record.id, actor_user_id=uuid.uuid4(), actor_role=RoleName.ADMIN,
            )
        denied_db = MagicMock()
        with self.assertRaises(AdminAIGeneratedQuestionDraftAccessError):
            AdminAIGeneratedQuestionDraftService(denied_db).get_draft(
                draft_id=record.id, actor_user_id=owner_id, actor_role=RoleName.TEACHER,
            )
        denied_db.scalar.assert_not_called()


class AdminAIGeneratedQuestionDraftMigrationTest(unittest.TestCase):
    def test_migration_chain_and_table_contract(self) -> None:
        source = MIGRATION_PATH.read_text(encoding="utf-8")
        tree = ast.parse(source)
        assignments = {
            node.target.id: ast.literal_eval(node.value)
            for node in tree.body
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
            and node.target.id in {"revision", "down_revision"}
        }
        self.assertEqual(assignments, {
            "revision": "e9f1b3c5d746", "down_revision": "c7e9f1a3b524",
        })
        for token in (
            '"admin_ai_generated_question_drafts"', '"owner_user_id"',
            '"source_revision_id"', '"content"', '"answer_options"',
            '"correct_option_labels"', '"explanation"',
            '"ck_admin_ai_generated_drafts_noncanonical"',
            'ondelete="RESTRICT"', 'ondelete="SET NULL"',
        ):
            self.assertIn(token, source)
        self.assertIn('op.drop_table("admin_ai_generated_question_drafts")', source)


if __name__ == "__main__":
    unittest.main()
