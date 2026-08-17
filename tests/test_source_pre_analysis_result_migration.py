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
    / "e7b9c1d3f546_add_source_pre_analysis_result_foundation.py"
)
SPEC = importlib.util.spec_from_file_location(
    "source_pre_analysis_result_foundation_migration", MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Source Pre-Analysis Result migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SourcePreAnalysisResultMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_result_summary_foundation(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "e7b9c1d3f546")
        self.assertEqual(MIGRATION.down_revision, "d6a8b0c2e435")
        MIGRATION.op.create_table.assert_called_once()
        create_table = MIGRATION.op.create_table.call_args
        self.assertEqual(create_table.args[0], "source_pre_analysis_results")
        columns = {
            item.name: item
            for item in create_table.args[1:]
            if isinstance(item, sa.Column)
        }
        self.assertEqual(
            set(columns),
            {
                "source_pre_analysis_run_id", "schema_version", "page_count",
                "id", "created_at", "updated_at", "deleted_at",
            },
        )
        for name in {
            "source_pre_analysis_run_id", "schema_version", "id",
            "created_at", "updated_at",
        }:
            self.assertFalse(columns[name].nullable)
        self.assertTrue(columns["page_count"].nullable)
        self.assertTrue(columns["deleted_at"].nullable)
        self.assertEqual(str(columns["schema_version"].server_default.arg), "1")
        self.assertFalse(
            any(isinstance(column.type, (sa.Enum, JSON, JSONB))
                for column in columns.values())
        )

        foreign_keys = [
            constraint
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.ForeignKeyConstraint)
        ]
        self.assertEqual(len(foreign_keys), 1)
        self.assertEqual(
            tuple(foreign_keys[0].column_keys),
            ("source_pre_analysis_run_id",),
        )
        self.assertEqual(
            tuple(
                element.target_fullname for element in foreign_keys[0].elements
            ),
            ("source_pre_analysis_runs.id",),
        )
        self.assertEqual(foreign_keys[0].ondelete, "RESTRICT")
        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.CheckConstraint)
        }
        self.assertEqual(
            checks,
            {
                "ck_source_pre_analysis_results_schema_version_positive":
                    "schema_version > 0",
                "ck_source_pre_analysis_results_page_count_non_negative":
                    "page_count IS NULL OR page_count >= 0",
            },
        )
        uniques = [
            constraint
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.UniqueConstraint)
        ]
        self.assertEqual(len(uniques), 1)
        self.assertEqual(
            uniques[0].name, "uq_source_pre_analysis_results_run_id",
        )
        self.assertEqual(
            tuple(uniques[0]._pending_colargs),
            ("source_pre_analysis_run_id",),
        )
        MIGRATION.op.create_index.assert_not_called()
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()

    def test_downgrade_removes_only_result_summary_table(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.drop_table.assert_called_once_with(
            "source_pre_analysis_results"
        )
        MIGRATION.op.drop_index.assert_not_called()
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
