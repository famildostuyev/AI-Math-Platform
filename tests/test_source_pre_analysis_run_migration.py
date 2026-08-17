from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend" / "alembic" / "versions"
    / "d6a8b0c2e435_add_source_pre_analysis_run_foundation.py"
)
SPEC = importlib.util.spec_from_file_location(
    "source_pre_analysis_run_foundation_migration", MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Source Pre-Analysis Run migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SourcePreAnalysisRunMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()
        MIGRATION.op.f.side_effect = lambda value: value

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_run_lifecycle_foundation(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "d6a8b0c2e435")
        self.assertEqual(MIGRATION.down_revision, "c5f7a9b1d324")
        MIGRATION.op.create_table.assert_called_once()
        create_table = MIGRATION.op.create_table.call_args
        self.assertEqual(create_table.args[0], "source_pre_analysis_runs")
        columns = {
            item.name: item
            for item in create_table.args[1:]
            if isinstance(item, sa.Column)
        }
        self.assertEqual(
            set(columns),
            {
                "source_document_id", "run_number", "status",
                "requested_by_user_id", "started_at", "completed_at",
                "failure_message", "id", "created_at", "updated_at",
                "deleted_at",
            },
        )
        for name in {
            "source_document_id", "run_number", "status", "id",
            "created_at", "updated_at",
        }:
            self.assertFalse(columns[name].nullable)
        for name in {
            "requested_by_user_id", "started_at", "completed_at",
            "failure_message", "deleted_at",
        }:
            self.assertTrue(columns[name].nullable)
        status_type = columns["status"].type
        self.assertIsInstance(status_type, sa.Enum)
        self.assertFalse(status_type.native_enum)
        self.assertTrue(status_type.create_constraint)
        self.assertEqual(
            status_type.enums,
            ["pending", "running", "succeeded", "failed"],
        )

        foreign_keys = {
            tuple(constraint.column_keys): (
                tuple(element.target_fullname for element in constraint.elements),
                constraint.ondelete,
            )
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.ForeignKeyConstraint)
        }
        self.assertEqual(
            foreign_keys,
            {
                ("source_document_id",): (("source_documents.id",), "RESTRICT"),
                ("requested_by_user_id",): (("users.id",), "SET NULL"),
            },
        )
        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.CheckConstraint)
        }
        self.assertEqual(
            set(checks),
            {
                "ck_source_pre_analysis_runs_number_positive",
                "ck_source_pre_analysis_runs_lifecycle_consistent",
                "ck_source_pre_analysis_runs_time_order",
            },
        )
        self.assertIn(
            "char_length(btrim(failure_message)) > 0",
            checks["ck_source_pre_analysis_runs_lifecycle_consistent"],
        )
        uniques = [
            constraint
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.UniqueConstraint)
        ]
        self.assertEqual(len(uniques), 1)
        self.assertEqual(
            uniques[0].name, "uq_source_pre_analysis_runs_document_number",
        )
        self.assertEqual(
            tuple(uniques[0]._pending_colargs),
            ("source_document_id", "run_number"),
        )
        self.assertEqual(
            MIGRATION.op.create_index.call_args_list,
            [call(
                "ix_source_pre_analysis_runs_requested_by_user_id",
                "source_pre_analysis_runs",
                ["requested_by_user_id"],
                unique=False,
            )],
        )
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()

    def test_downgrade_removes_only_run_lifecycle_objects(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.drop_index.assert_called_once_with(
            "ix_source_pre_analysis_runs_requested_by_user_id",
            table_name="source_pre_analysis_runs",
        )
        MIGRATION.op.drop_table.assert_called_once_with(
            "source_pre_analysis_runs"
        )
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
