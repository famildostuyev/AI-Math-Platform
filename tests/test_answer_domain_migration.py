from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

PATH = Path(__file__).resolve().parents[1] / "backend/alembic/versions/e1f3a5c7d908_add_canonical_answer_domain.py"
SPEC = importlib.util.spec_from_file_location("answer_domain_migration", PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Answer migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class AnswerDomainMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original

    def test_upgrade_creates_both_structured_answer_tables(self) -> None:
        MIGRATION.upgrade()
        self.assertEqual(MIGRATION.revision, "e1f3a5c7d908")
        self.assertEqual(MIGRATION.down_revision, "d9f1b3c5e706")
        calls = {call.args[0]: call for call in MIGRATION.op.create_table.call_args_list}
        self.assertEqual(set(calls), {"answer_options", "accepted_answers"})
        for call in calls.values():
            columns = {item.name: item for item in call.args[1:] if isinstance(item, sa.Column)}
            self.assertIsInstance(columns["document_data"].type, JSONB)
            self.assertFalse(columns["revision_id"].nullable)
            fks = [item for item in call.args[1:] if isinstance(item, sa.ForeignKeyConstraint)]
            self.assertEqual(fks[0].elements[0].target_fullname, "question_revisions.id")
            self.assertEqual(fks[0].ondelete, "RESTRICT")
        option_indexes = [call for call in MIGRATION.op.create_index.call_args_list if call.args[1] == "answer_options"]
        self.assertEqual(len(option_indexes), 3)

    def test_downgrade_drops_only_answer_tables(self) -> None:
        MIGRATION.downgrade()
        self.assertEqual([call.args[0] for call in MIGRATION.op.drop_table.call_args_list], ["accepted_answers", "answer_options"])
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
