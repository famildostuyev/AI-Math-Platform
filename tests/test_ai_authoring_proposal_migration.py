from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
    / "b5d7f9a1c302_add_ai_authoring_proposal_foundation.py"
)
SPEC = importlib.util.spec_from_file_location("ai_authoring_proposal_migration", MIGRATION_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("AI authoring proposal migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class AIAuthoringProposalMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_proposal_table_with_constraints(self) -> None:
        MIGRATION.upgrade()
        self.assertEqual(MIGRATION.revision, "b5d7f9a1c302")
        self.assertEqual(MIGRATION.down_revision, "a1c3e5f7b920")
        call = MIGRATION.op.create_table.call_args
        self.assertEqual(call.args[0], "ai_authoring_proposals")
        columns = {
            item.name: item for item in call.args[1:] if isinstance(item, sa.Column)
        }
        self.assertIsInstance(columns["actions"].type, JSONB)
        self.assertFalse(columns["source_revision_id"].nullable)
        self.assertFalse(columns["source_revision_updated_at"].nullable)
        checks = {
            item.name: str(item.sqltext) for item in call.args[1:]
            if isinstance(item, sa.CheckConstraint)
        }
        self.assertIn("obsolete", checks["ai_authoring_proposal_status"])
        self.assertIn("provider_name", checks["ck_ai_authoring_proposals_provenance_nonblank"])
        fks = {
            tuple(item.column_keys): (
                tuple(element.target_fullname for element in item.elements),
                item.ondelete,
            )
            for item in call.args[1:] if isinstance(item, sa.ForeignKeyConstraint)
        }
        self.assertEqual(
            fks[("source_revision_id",)],
            (("question_revisions.id",), "RESTRICT"),
        )
        self.assertEqual(MIGRATION.op.create_index.call_count, 2)

    def test_downgrade_removes_only_proposal_table_and_indexes(self) -> None:
        MIGRATION.downgrade()
        self.assertEqual(MIGRATION.op.drop_index.call_count, 2)
        MIGRATION.op.drop_table.assert_called_once_with("ai_authoring_proposals")
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
