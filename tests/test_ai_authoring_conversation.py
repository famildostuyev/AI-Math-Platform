from __future__ import annotations

import importlib.util
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa
from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy.exc import IntegrityError


ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import AIAuthoringConversationStatus, AIAuthoringMessageRole
from app.models.ai_authoring_conversation import AIAuthoringConversation
from app.models.ai_authoring_message import (
    AI_AUTHORING_MESSAGE_MAX_LENGTH,
    AIAuthoringMessage,
)
from app.models.question_revision import QuestionRevision
from app.services.ai_authoring_conversation_service import (
    AIAuthoringConversationClosedError,
    AIAuthoringConversationNotFoundError,
    AIAuthoringConversationRevisionNotFoundError,
    AIAuthoringConversationService,
    AIAuthoringConversationUserNotFoundError,
    AIAuthoringMessageSequenceConflictError,
    AIAuthoringMessageValidationError,
)


MIGRATION_PATH = (
    BACKEND_DIR / "alembic" / "versions"
    / "c7e9a1b3d504_add_ai_authoring_conversations.py"
)
SPEC = importlib.util.spec_from_file_location("ai_authoring_conversation_migration", MIGRATION_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("AI authoring conversation migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def scalar_result(values: list[object]) -> MagicMock:
    result = MagicMock()
    result.all.return_value = values
    return result


class AIAuthoringConversationModelTest(unittest.TestCase):
    def test_conversation_model_has_revision_creator_status_and_soft_delete(self) -> None:
        table = AIAuthoringConversation.__table__
        self.assertEqual(set(table.c.keys()), {
            "id", "active_revision_id", "created_by_user_id", "status",
            "created_at", "updated_at", "deleted_at",
        })
        self.assertEqual(table.c.status.type.enums, ["active", "closed"])
        self.assertEqual(
            next(iter(table.c.active_revision_id.foreign_keys)).target_fullname,
            "question_revisions.id",
        )

    def test_message_contract_is_ordered_bounded_and_safe(self) -> None:
        table = AIAuthoringMessage.__table__
        self.assertEqual(table.c.role.type.enums, ["user", "assistant", "system"])
        self.assertEqual(table.c.content.type.length, 10_000)
        self.assertEqual(AI_AUTHORING_MESSAGE_MAX_LENGTH, 10_000)
        uniques = [item for item in table.constraints if isinstance(item, UniqueConstraint)]
        self.assertTrue(any(
            item.name == "uq_ai_authoring_messages_conversation_sequence"
            for item in uniques
        ))
        checks = {
            item.name: str(item.sqltext) for item in table.constraints
            if isinstance(item, CheckConstraint)
        }
        self.assertIn("> 0", checks["ck_ai_authoring_messages_sequence_positive"])
        self.assertIn("btrim", checks["ck_ai_authoring_messages_content_nonblank"])
        self.assertTrue({"api_key", "raw_request", "raw_response", "system_prompt"}.isdisjoint(table.c.keys()))

    def test_no_proposal_relation_or_revision_schema_extension(self) -> None:
        self.assertNotIn("proposal_id", AIAuthoringMessage.__table__.c)
        self.assertNotIn("ai_authoring_conversations", QuestionRevision.__mapper__.relationships)


class AIAuthoringConversationServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.revision = QuestionRevision(id=uuid.uuid4())
        self.user_id = uuid.uuid4()
        self.conversation = AIAuthoringConversation(
            id=uuid.uuid4(),
            active_revision_id=self.revision.id,
            created_by_user_id=self.user_id,
            status=AIAuthoringConversationStatus.ACTIVE,
        )

    def test_create_conversation_validates_revision_and_user(self) -> None:
        db = MagicMock()
        db.scalar.side_effect = [self.revision, self.user_id]
        created = AIAuthoringConversationService(db).create_conversation(
            active_revision_id=self.revision.id,
            created_by_user_id=self.user_id,
        )
        self.assertEqual(created.status, AIAuthoringConversationStatus.ACTIVE)
        self.assertEqual(created.active_revision_id, self.revision.id)
        db.add.assert_called_once_with(created)
        db.commit.assert_called_once()

    def test_missing_or_soft_deleted_revision_is_rejected(self) -> None:
        for revision in (None, None):
            with self.subTest(revision=revision):
                db = MagicMock()
                db.scalar.return_value = revision
                with self.assertRaises(AIAuthoringConversationRevisionNotFoundError):
                    AIAuthoringConversationService(db).create_conversation(
                        active_revision_id=uuid.uuid4(),
                        created_by_user_id=self.user_id,
                    )
                db.add.assert_not_called()

    def test_inactive_creator_is_rejected(self) -> None:
        db = MagicMock()
        db.scalar.side_effect = [self.revision, None]
        with self.assertRaises(AIAuthoringConversationUserNotFoundError):
            AIAuthoringConversationService(db).create_conversation(
                active_revision_id=self.revision.id,
                created_by_user_id=self.user_id,
            )

    def test_user_and_assistant_messages_have_deterministic_sequences(self) -> None:
        user_db = MagicMock()
        user_db.scalar.side_effect = [self.user_id, self.conversation, None]
        first = AIAuthoringConversationService(user_db).add_user_message(
            conversation_id=self.conversation.id,
            user_id=self.user_id,
            content="Change the numbers",
        )
        self.assertEqual((first.role, first.sequence_number), (AIAuthoringMessageRole.USER, 1))
        self.assertEqual(first.created_by_user_id, self.user_id)

        assistant_db = MagicMock()
        assistant_db.scalar.side_effect = [self.conversation, 1]
        second = AIAuthoringConversationService(assistant_db).add_assistant_message(
            conversation_id=self.conversation.id,
            content="Proposed locally",
        )
        self.assertEqual((second.role, second.sequence_number), (AIAuthoringMessageRole.ASSISTANT, 2))
        self.assertIsNone(second.created_by_user_id)
        statement = assistant_db.scalar.call_args_list[0].args[0]
        self.assertIsNotNone(statement._for_update_arg)

    def test_blank_whitespace_and_oversized_messages_are_rejected(self) -> None:
        for content in ("", "   ", "x" * 10_001):
            with self.subTest(length=len(content)):
                db = MagicMock()
                with self.assertRaises(AIAuthoringMessageValidationError):
                    AIAuthoringConversationService(db).add_user_message(
                        conversation_id=self.conversation.id,
                        user_id=self.user_id,
                        content=content,
                    )
                db.scalar.assert_not_called()

    def test_closed_and_soft_deleted_conversations_reject_messages(self) -> None:
        closed = AIAuthoringConversation(
            id=self.conversation.id,
            status=AIAuthoringConversationStatus.CLOSED,
        )
        db = MagicMock()
        db.scalar.side_effect = [self.user_id, closed]
        with self.assertRaises(AIAuthoringConversationClosedError):
            AIAuthoringConversationService(db).add_user_message(
                conversation_id=closed.id,
                user_id=self.user_id,
                content="Again",
            )
        db.add.assert_not_called()

        missing_db = MagicMock()
        missing_db.scalar.side_effect = [self.user_id, None]
        with self.assertRaises(AIAuthoringConversationNotFoundError):
            AIAuthoringConversationService(missing_db).add_user_message(
                conversation_id=closed.id,
                user_id=self.user_id,
                content="Again",
            )

    def test_close_is_terminal_and_does_not_mutate_revision(self) -> None:
        before = dict(self.revision.__dict__)
        db = MagicMock()
        db.scalar.side_effect = [self.user_id, self.conversation]
        closed = AIAuthoringConversationService(db).close_conversation(
            conversation_id=self.conversation.id,
            closed_by_user_id=self.user_id,
        )
        self.assertEqual(closed.status, AIAuthoringConversationStatus.CLOSED)
        self.assertEqual(self.revision.__dict__, before)
        db.commit.assert_called_once()

        again_db = MagicMock()
        again_db.scalar.side_effect = [self.user_id, closed]
        with self.assertRaises(AIAuthoringConversationClosedError):
            AIAuthoringConversationService(again_db).close_conversation(
                conversation_id=closed.id,
                closed_by_user_id=self.user_id,
            )

    def test_list_messages_orders_by_sequence_and_excludes_soft_deleted(self) -> None:
        messages = [AIAuthoringMessage(sequence_number=1), AIAuthoringMessage(sequence_number=2)]
        db = MagicMock()
        db.scalar.return_value = self.conversation
        db.scalars.return_value = scalar_result(messages)
        listed = AIAuthoringConversationService(db).list_messages(
            conversation_id=self.conversation.id
        )
        self.assertEqual([item.sequence_number for item in listed], [1, 2])
        statement = db.scalars.call_args.args[0]
        self.assertIn("sequence_number", str(statement))
        self.assertIn("deleted_at IS NULL", str(statement))

    def test_unique_sequence_failure_is_safely_mapped(self) -> None:
        db = MagicMock()
        db.scalar.side_effect = [self.conversation, 1]
        db.commit.side_effect = IntegrityError("statement", {}, Exception("detail"))
        with self.assertRaises(AIAuthoringMessageSequenceConflictError):
            AIAuthoringConversationService(db).add_assistant_message(
                conversation_id=self.conversation.id,
                content="Local assistant response",
            )
        db.rollback.assert_called_once()

    def test_user_path_cannot_create_system_role_or_canonical_objects(self) -> None:
        db = MagicMock()
        db.scalar.side_effect = [self.user_id, self.conversation, 0]
        message = AIAuthoringConversationService(db).add_user_message(
            conversation_id=self.conversation.id,
            user_id=self.user_id,
            content="Review this question",
        )
        self.assertEqual(message.role, AIAuthoringMessageRole.USER)
        added = db.add.call_args.args[0]
        self.assertIsInstance(added, AIAuthoringMessage)


class AIAuthoringConversationMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_ordered_conversation_message_contract(self) -> None:
        MIGRATION.upgrade()
        self.assertEqual(MIGRATION.revision, "c7e9a1b3d504")
        self.assertEqual(MIGRATION.down_revision, "b5d7f9a1c302")
        self.assertEqual(MIGRATION.op.create_table.call_count, 2)
        message_call = MIGRATION.op.create_table.call_args_list[1]
        constraints = [item for item in message_call.args if isinstance(item, sa.Constraint)]
        self.assertTrue(any(
            isinstance(item, sa.UniqueConstraint)
            and item.name == "uq_ai_authoring_messages_conversation_sequence"
            for item in constraints
        ))
        self.assertEqual(MIGRATION.op.create_index.call_count, 4)

    def test_downgrade_removes_messages_before_conversations(self) -> None:
        MIGRATION.downgrade()
        self.assertEqual(
            [call.args[0] for call in MIGRATION.op.drop_table.call_args_list],
            ["ai_authoring_messages", "ai_authoring_conversations"],
        )
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
