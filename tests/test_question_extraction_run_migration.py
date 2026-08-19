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
    / "6047b7650712_add_question_extraction_run_foundation.py"
)

SPEC = importlib.util.spec_from_file_location(
    "question_extraction_run_foundation_migration",
    MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Question Extraction Run migration could not be loaded.")

MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class QuestionExtractionRunMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_question_extraction_run_foundation(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "6047b7650712")
        self.assertEqual(MIGRATION.down_revision, "5b02c5057428")

        MIGRATION.op.create_table.assert_called_once()
        call = MIGRATION.op.create_table.call_args
        self.assertEqual(call.args[0], "question_extraction_runs")

        columns = {
            item.name: item
            for item in call.args[1:]
            if isinstance(item, sa.Column)
        }

        self.assertEqual(
            set(columns),
            {
                "id",
                "source_document_id",
                "run_number",
                "status",
                "requested_by_user_id",
                "started_at",
                "completed_at",
                "failure_message",
                "created_at",
                "updated_at",
                "deleted_at",
            },
        )

        for name in {
            "id",
            "source_document_id",
            "run_number",
            "status",
            "created_at",
            "updated_at",
        }:
            self.assertFalse(columns[name].nullable)

        for name in {
            "requested_by_user_id",
            "started_at",
            "completed_at",
            "failure_message",
            "deleted_at",
        }:
            self.assertTrue(columns[name].nullable)

        self.assertIsInstance(columns["run_number"].type, sa.Integer)
        self.assertIsInstance(columns["status"].type, sa.Enum)
        self.assertFalse(columns["status"].type.native_enum)
        self.assertTrue(columns["status"].type.create_constraint)
        self.assertEqual(
            columns["status"].type.enums,
            ["pending", "running", "succeeded", "failed"],
        )
        self.assertIsInstance(columns["started_at"].type, sa.DateTime)
        self.assertTrue(columns["started_at"].type.timezone)
        self.assertIsInstance(columns["completed_at"].type, sa.DateTime)
        self.assertTrue(columns["completed_at"].type.timezone)
        self.assertIsInstance(columns["failure_message"].type, sa.Text)

        foreign_keys = [
            item
            for item in call.args[1:]
            if isinstance(item, sa.ForeignKeyConstraint)
        ]
        self.assertEqual(len(foreign_keys), 2)
        self.assertEqual(
            {
                (
                    tuple(item.column_keys),
                    tuple(element.target_fullname for element in item.elements),
                    item.ondelete,
                )
                for item in foreign_keys
            },
            {
                (
                    ("source_document_id",),
                    ("source_documents.id",),
                    "RESTRICT",
                ),
                (
                    ("requested_by_user_id",),
                    ("users.id",),
                    "SET NULL",
                ),
            },
        )

        checks = {
            item.name: str(item.sqltext)
            for item in call.args[1:]
            if isinstance(item, sa.CheckConstraint)
        }
        self.assertEqual(
            checks,
            {
                "ck_question_extraction_runs_number_positive":
                    "run_number > 0",
                "ck_question_extraction_runs_lifecycle_consistent":
                    "(status = 'pending' AND started_at IS NULL "
                    "AND completed_at IS NULL AND failure_message IS NULL) "
                    "OR (status = 'running' AND started_at IS NOT NULL "
                    "AND completed_at IS NULL AND failure_message IS NULL) "
                    "OR (status = 'succeeded' AND started_at IS NOT NULL "
                    "AND completed_at IS NOT NULL AND failure_message IS NULL) "
                    "OR (status = 'failed' AND completed_at IS NOT NULL "
                    "AND failure_message IS NOT NULL "
                    "AND char_length(btrim(failure_message)) > 0)",
                "ck_question_extraction_runs_time_order":
                    "started_at IS NULL OR completed_at IS NULL "
                    "OR completed_at >= started_at",
            },
        )

        unique = next(
            item
            for item in call.args[1:]
            if isinstance(item, sa.UniqueConstraint)
        )
        self.assertEqual(
            unique.name,
            "uq_question_extraction_runs_document_number",
        )
        self.assertEqual(
            tuple(unique._pending_colargs),
            ("source_document_id", "run_number"),
        )

        MIGRATION.op.create_index.assert_called_once_with(
            "ix_question_extraction_runs_requested_by_user_id",
            "question_extraction_runs",
            ["requested_by_user_id"],
            unique=False,
        )

        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()

    def test_downgrade_removes_only_question_extraction_run_objects(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.drop_index.assert_called_once_with(
            "ix_question_extraction_runs_requested_by_user_id",
            table_name="question_extraction_runs",
        )
        MIGRATION.op.drop_table.assert_called_once_with(
            "question_extraction_runs"
        )
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
