from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend"
    / "alembic"
    / "versions"
    / "e6a8c0d2f415_add_question_candidate_timestamp_defaults.py"
)

SPEC = importlib.util.spec_from_file_location(
    "question_candidate_timestamp_default_migration",
    MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(
        "Question Candidate timestamp-default migration could not be loaded."
    )

MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class QuestionCandidateTimestampDefaultMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_adds_only_required_timestamp_defaults(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "e6a8c0d2f415")
        self.assertEqual(MIGRATION.down_revision, "c4e6a8b0d213")
        self.assertEqual(MIGRATION.op.alter_column.call_count, 2)

        calls = MIGRATION.op.alter_column.call_args_list
        self.assertEqual(
            [(call.args[0], call.args[1]) for call in calls],
            [
                ("question_candidates", "created_at"),
                ("question_candidates", "updated_at"),
            ],
        )
        for call in calls:
            self.assertIsInstance(call.kwargs["existing_type"], sa.DateTime)
            self.assertTrue(call.kwargs["existing_type"].timezone)
            self.assertFalse(call.kwargs["existing_nullable"])
            default = call.kwargs["server_default"]
            self.assertIsInstance(default, sa.sql.elements.TextClause)
            self.assertEqual(default.text, "now()")

        MIGRATION.op.create_table.assert_not_called()
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()

    def test_downgrade_removes_only_required_timestamp_defaults(self) -> None:
        MIGRATION.downgrade()

        self.assertEqual(MIGRATION.op.alter_column.call_count, 2)
        calls = MIGRATION.op.alter_column.call_args_list
        self.assertEqual(
            [(call.args[0], call.args[1]) for call in calls],
            [
                ("question_candidates", "updated_at"),
                ("question_candidates", "created_at"),
            ],
        )
        for call in calls:
            self.assertIsInstance(call.kwargs["existing_type"], sa.DateTime)
            self.assertTrue(call.kwargs["existing_type"].timezone)
            self.assertFalse(call.kwargs["existing_nullable"])
            self.assertIsNone(call.kwargs["server_default"])

        MIGRATION.op.drop_table.assert_not_called()
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
