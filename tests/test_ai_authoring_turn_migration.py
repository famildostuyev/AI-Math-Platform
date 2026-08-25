from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
    / "d9f1b3c5e706_link_authoring_proposal_message.py"
)
SPEC = importlib.util.spec_from_file_location("ai_authoring_turn_migration", MIGRATION_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("AI authoring turn migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class AIAuthoringTurnMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_adds_nullable_message_provenance_fk(self) -> None:
        MIGRATION.upgrade()
        self.assertEqual(MIGRATION.revision, "d9f1b3c5e706")
        self.assertEqual(MIGRATION.down_revision, "c7e9a1b3d504")
        column = MIGRATION.op.add_column.call_args.args[1]
        self.assertIsInstance(column, sa.Column)
        self.assertEqual(column.name, "request_message_id")
        self.assertTrue(column.nullable)
        fk = MIGRATION.op.create_foreign_key.call_args
        self.assertEqual(fk.args[1:3], (
            "ai_authoring_proposals", "ai_authoring_messages"
        ))
        self.assertEqual(fk.kwargs["ondelete"], "SET NULL")

    def test_downgrade_removes_only_new_relation(self) -> None:
        MIGRATION.downgrade()
        MIGRATION.op.drop_column.assert_called_once_with(
            "ai_authoring_proposals", "request_message_id"
        )
        MIGRATION.op.drop_table.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
