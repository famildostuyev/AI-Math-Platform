from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, JSONB


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend" / "alembic" / "versions"
    / "f8b0d2e4a617_add_question_extraction_result_foundation.py"
)
SPEC = importlib.util.spec_from_file_location(
    "question_extraction_result_foundation_migration", MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Question Extraction Result migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class QuestionExtractionResultMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_result_provenance_foundation(self) -> None:
        MIGRATION.upgrade()
        self.assertEqual(MIGRATION.revision, "f8b0d2e4a617")
        self.assertEqual(MIGRATION.down_revision, "e6a8c0d2f415")
        MIGRATION.op.create_table.assert_called_once()
        call = MIGRATION.op.create_table.call_args
        self.assertEqual(call.args[0], "question_extraction_results")
        columns = {
            item.name: item for item in call.args[1:]
            if isinstance(item, sa.Column)
        }
        self.assertEqual(
            set(columns),
            {
                "question_extraction_run_id", "schema_version",
                "processor_name", "processor_version", "provider_name",
                "model_name", "prompt_version", "id", "created_at",
                "updated_at", "deleted_at",
            },
        )
        for name in {
            "question_extraction_run_id", "schema_version", "processor_name",
            "processor_version", "id", "created_at", "updated_at",
        }:
            self.assertFalse(columns[name].nullable)
        for name in {"provider_name", "model_name", "prompt_version", "deleted_at"}:
            self.assertTrue(columns[name].nullable)
        self.assertEqual(str(columns["schema_version"].server_default.arg), "1")
        self.assertEqual(str(columns["created_at"].server_default.arg), "now()")
        self.assertEqual(str(columns["updated_at"].server_default.arg), "now()")
        self.assertFalse(
            any(isinstance(column.type, (sa.Enum, JSON, JSONB))
                for column in columns.values())
        )
        foreign_key = next(
            item for item in call.args[1:]
            if isinstance(item, sa.ForeignKeyConstraint)
        )
        self.assertEqual(
            tuple(foreign_key.column_keys), ("question_extraction_run_id",)
        )
        self.assertEqual(
            tuple(item.target_fullname for item in foreign_key.elements),
            ("question_extraction_runs.id",),
        )
        self.assertEqual(foreign_key.ondelete, "RESTRICT")
        checks = {
            item.name: str(item.sqltext) for item in call.args[1:]
            if isinstance(item, sa.CheckConstraint)
        }
        self.assertEqual(len(checks), 6)
        self.assertEqual(
            checks["ck_question_extraction_results_schema_version_positive"],
            "schema_version > 0",
        )
        unique = next(
            item for item in call.args[1:]
            if isinstance(item, sa.UniqueConstraint)
        )
        self.assertEqual(unique.name, "uq_question_extraction_results_run_id")
        self.assertEqual(
            tuple(unique._pending_colargs), ("question_extraction_run_id",)
        )
        MIGRATION.op.create_index.assert_not_called()
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()

    def test_downgrade_removes_only_result_provenance_table(self) -> None:
        MIGRATION.downgrade()
        MIGRATION.op.drop_table.assert_called_once_with(
            "question_extraction_results"
        )
        MIGRATION.op.drop_index.assert_not_called()
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
