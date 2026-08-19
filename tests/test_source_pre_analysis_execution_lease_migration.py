from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa


VERSIONS_DIR = (
    Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
)
MIGRATION_PATH = (
    VERSIONS_DIR
    / "c7e9a1b3d502_add_source_pre_analysis_execution_lease.py"
)
SPEC = importlib.util.spec_from_file_location(
    "source_pre_analysis_execution_lease_migration",
    MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Execution lease migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SourcePreAnalysisExecutionLeaseMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_revision_is_unique_and_follows_actual_head(self) -> None:
        occurrences = sum(
            path.read_text(encoding="utf-8").count(
                'revision: str = "c7e9a1b3d502"'
            )
            for path in VERSIONS_DIR.glob("*.py")
        )
        self.assertEqual(occurrences, 1)
        self.assertEqual(MIGRATION.revision, "c7e9a1b3d502")
        self.assertEqual(MIGRATION.down_revision, "b3d5f7a9c241")

    def test_upgrade_adds_exact_nullable_fields_and_recovery_index(self) -> None:
        MIGRATION.upgrade()

        column_calls = MIGRATION.op.add_column.call_args_list
        self.assertEqual(len(column_calls), 2)
        columns = {call.args[1].name: call.args[1] for call in column_calls}
        self.assertEqual(
            set(columns),
            {"execution_lease_id", "last_heartbeat_at"},
        )
        for call in column_calls:
            self.assertEqual(call.args[0], "source_pre_analysis_runs")
            self.assertTrue(call.args[1].nullable)
            self.assertIsNone(call.args[1].server_default)
        self.assertIsInstance(columns["execution_lease_id"].type, sa.UUID)
        self.assertIsInstance(columns["last_heartbeat_at"].type, sa.DateTime)
        self.assertTrue(columns["last_heartbeat_at"].type.timezone)
        MIGRATION.op.create_index.assert_called_once_with(
            "ix_source_pre_analysis_runs_recovery",
            "source_pre_analysis_runs",
            ["status", "deleted_at", "last_heartbeat_at"],
            unique=False,
        )
        MIGRATION.op.create_table.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()

    def test_upgrade_reconciles_only_running_without_fabricating_lease(self) -> None:
        MIGRATION.upgrade()

        MIGRATION.op.execute.assert_called_once()
        statement = MIGRATION.op.execute.call_args.args[0]
        sql = str(statement)
        self.assertIn("UPDATE source_pre_analysis_runs", sql)
        self.assertIn("SET status = 'failed'", sql)
        self.assertIn("completed_at = CURRENT_TIMESTAMP", sql)
        self.assertIn("failure_message = :failure_message", sql)
        self.assertIn("WHERE status = 'running'", sql)
        self.assertNotIn("started_at =", sql)
        self.assertNotIn("execution_lease_id =", sql)
        self.assertNotIn("last_heartbeat_at =", sql)
        self.assertNotIn("pending", sql)
        self.assertNotIn("succeeded", sql)
        params = statement.compile().params
        self.assertEqual(
            params,
            {"failure_message": (
                "Pre-analysis execution was interrupted before completion."
            )},
        )

    def test_upgrade_replaces_lifecycle_and_adds_heartbeat_constraint(self) -> None:
        MIGRATION.upgrade()

        MIGRATION.op.drop_constraint.assert_called_once_with(
            "ck_source_pre_analysis_runs_lifecycle_consistent",
            "source_pre_analysis_runs",
            type_="check",
        )
        checks = {
            call.args[0]: (call.args[1], call.args[2])
            for call in MIGRATION.op.create_check_constraint.call_args_list
        }
        self.assertEqual(
            set(checks),
            {
                "ck_source_pre_analysis_runs_lifecycle_consistent",
                "ck_source_pre_analysis_runs_heartbeat_order",
            },
        )
        lifecycle = checks[
            "ck_source_pre_analysis_runs_lifecycle_consistent"
        ][1]
        self.assertIn("execution_lease_id IS NULL", lifecycle)
        self.assertIn("execution_lease_id IS NOT NULL", lifecycle)
        self.assertIn("last_heartbeat_at IS NULL", lifecycle)
        self.assertIn("last_heartbeat_at IS NOT NULL", lifecycle)
        self.assertIn("char_length(btrim(failure_message)) > 0", lifecycle)
        failed_clause = lifecycle.split("OR (status = 'failed'", 1)[1]
        self.assertNotIn("started_at IS NOT NULL", failed_clause)
        self.assertEqual(
            checks["ck_source_pre_analysis_runs_heartbeat_order"],
            (
                "source_pre_analysis_runs",
                "last_heartbeat_at IS NULL OR "
                "(started_at IS NOT NULL AND "
                "last_heartbeat_at >= started_at)",
            ),
        )
        method_names = [call[0] for call in MIGRATION.op.method_calls]
        self.assertLess(method_names.index("add_column"), method_names.index("execute"))
        self.assertLess(method_names.index("execute"), method_names.index("drop_constraint"))
        self.assertLess(method_names.index("drop_constraint"), method_names.index("create_check_constraint"))
        self.assertLess(method_names.index("create_check_constraint"), method_names.index("create_index"))

    def test_downgrade_removes_new_objects_in_safe_order(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.drop_index.assert_called_once_with(
            "ix_source_pre_analysis_runs_recovery",
            table_name="source_pre_analysis_runs",
        )
        self.assertEqual(
            [call.args[0] for call in MIGRATION.op.drop_constraint.call_args_list],
            [
                "ck_source_pre_analysis_runs_heartbeat_order",
                "ck_source_pre_analysis_runs_lifecycle_consistent",
            ],
        )
        for call in MIGRATION.op.drop_constraint.call_args_list:
            self.assertEqual(call.args[1], "source_pre_analysis_runs")
            self.assertEqual(call.kwargs, {"type_": "check"})
        MIGRATION.op.create_check_constraint.assert_called_once_with(
            "ck_source_pre_analysis_runs_lifecycle_consistent",
            "source_pre_analysis_runs",
            MIGRATION.OLD_LIFECYCLE_CONDITION,
        )
        self.assertEqual(
            [call.args for call in MIGRATION.op.drop_column.call_args_list],
            [
                ("source_pre_analysis_runs", "last_heartbeat_at"),
                ("source_pre_analysis_runs", "execution_lease_id"),
            ],
        )
        names = [call[0] for call in MIGRATION.op.method_calls]
        self.assertLess(names.index("drop_index"), names.index("drop_constraint"))
        self.assertLess(names.index("drop_constraint"), names.index("create_check_constraint"))
        self.assertLess(names.index("create_check_constraint"), names.index("drop_column"))
        MIGRATION.op.drop_table.assert_not_called()
        MIGRATION.op.execute.assert_not_called()

    def test_model_and_migration_constraints_and_index_are_aligned(self) -> None:
        from sqlalchemy import CheckConstraint

        from app.models.source_pre_analysis_run import SourcePreAnalysisRun

        model_checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in SourcePreAnalysisRun.__table__.constraints
            if isinstance(constraint, CheckConstraint)
            and constraint.name in {
                "ck_source_pre_analysis_runs_lifecycle_consistent",
                "ck_source_pre_analysis_runs_heartbeat_order",
            }
        }
        MIGRATION.upgrade()
        migration_checks = {
            call.args[0]: call.args[2]
            for call in MIGRATION.op.create_check_constraint.call_args_list
        }
        self.assertEqual(model_checks, migration_checks)
        recovery_index = next(
            index
            for index in SourcePreAnalysisRun.__table__.indexes
            if index.name == "ix_source_pre_analysis_runs_recovery"
        )
        self.assertEqual(
            tuple(column.name for column in recovery_index.columns),
            ("status", "deleted_at", "last_heartbeat_at"),
        )


if __name__ == "__main__":
    unittest.main()
