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
    / "b3d5f7a9c241_add_source_pre_analysis_processor_provenance.py"
)
SPEC = importlib.util.spec_from_file_location(
    "source_pre_analysis_processor_provenance_migration",
    MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Processor provenance migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SourcePreAnalysisProvenanceMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_revision_is_unique_and_follows_actual_previous_head(self) -> None:
        revision_occurrences = 0
        for path in VERSIONS_DIR.glob("*.py"):
            revision_occurrences += path.read_text(
                encoding="utf-8"
            ).count('revision: str = "b3d5f7a9c241"')
        self.assertEqual(revision_occurrences, 1)
        self.assertEqual(MIGRATION.revision, "b3d5f7a9c241")
        self.assertEqual(MIGRATION.down_revision, "f2a4c6e8b013")

    def test_upgrade_adds_only_exact_nullable_provenance_columns(self) -> None:
        MIGRATION.upgrade()

        calls = MIGRATION.op.add_column.call_args_list
        self.assertEqual(len(calls), 5)
        columns = {call.args[1].name: call.args[1] for call in calls}
        self.assertEqual(
            set(columns),
            {
                "processor_name", "processor_version", "provider_name",
                "model_name", "prompt_version",
            },
        )
        expected_lengths = {
            "processor_name": 100,
            "processor_version": 100,
            "provider_name": 100,
            "model_name": 200,
            "prompt_version": 100,
        }
        for call in calls:
            self.assertEqual(call.args[0], "source_pre_analysis_results")
        for name, length in expected_lengths.items():
            column = columns[name]
            self.assertIsInstance(column.type, sa.String)
            self.assertEqual(column.type.length, length)
            self.assertTrue(column.nullable)
            self.assertIsNone(column.default)
            self.assertIsNone(column.server_default)

        MIGRATION.op.create_table.assert_not_called()
        MIGRATION.op.drop_table.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.create_index.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()

    def test_upgrade_adds_exact_pairing_and_nonblank_constraints(self) -> None:
        MIGRATION.upgrade()

        calls = MIGRATION.op.create_check_constraint.call_args_list
        self.assertEqual(len(calls), 6)
        constraints = {
            call.args[0]: (call.args[1], call.args[2]) for call in calls
        }
        self.assertEqual(
            constraints,
            {
                "ck_source_pre_analysis_results_processor_identity_paired": (
                    "source_pre_analysis_results",
                    "(processor_name IS NULL AND processor_version IS NULL) OR "
                    "(processor_name IS NOT NULL AND processor_version IS NOT NULL)",
                ),
                "ck_source_pre_analysis_results_processor_name_nonblank": (
                    "source_pre_analysis_results",
                    "processor_name IS NULL OR "
                    "char_length(btrim(processor_name)) > 0",
                ),
                "ck_source_pre_analysis_results_processor_version_nonblank": (
                    "source_pre_analysis_results",
                    "processor_version IS NULL OR "
                    "char_length(btrim(processor_version)) > 0",
                ),
                "ck_source_pre_analysis_results_provider_name_nonblank": (
                    "source_pre_analysis_results",
                    "provider_name IS NULL OR "
                    "char_length(btrim(provider_name)) > 0",
                ),
                "ck_source_pre_analysis_results_model_name_nonblank": (
                    "source_pre_analysis_results",
                    "model_name IS NULL OR char_length(btrim(model_name)) > 0",
                ),
                "ck_source_pre_analysis_results_prompt_version_nonblank": (
                    "source_pre_analysis_results",
                    "prompt_version IS NULL OR "
                    "char_length(btrim(prompt_version)) > 0",
                ),
            },
        )

    def test_migration_contains_no_backfill_defaults_or_fake_identity(self) -> None:
        source = MIGRATION_PATH.read_text(encoding="utf-8")
        lowered = source.lower()
        self.assertNotIn("server_default", source)
        self.assertNotIn("op.execute", source)
        self.assertNotIn("bulk_insert", source)
        self.assertNotIn("update ", lowered)
        for sentinel in ('"legacy"', '"unknown"', '"pre-migration"',
                         '"system"', '"manual"'):
            self.assertNotIn(sentinel, lowered)

    def test_downgrade_drops_checks_before_exact_columns_only(self) -> None:
        MIGRATION.downgrade()

        constraint_calls = MIGRATION.op.drop_constraint.call_args_list
        column_calls = MIGRATION.op.drop_column.call_args_list
        self.assertEqual(len(constraint_calls), 6)
        self.assertEqual(len(column_calls), 5)
        self.assertEqual(
            {call.args[0] for call in constraint_calls},
            {
                "ck_source_pre_analysis_results_processor_identity_paired",
                "ck_source_pre_analysis_results_processor_name_nonblank",
                "ck_source_pre_analysis_results_processor_version_nonblank",
                "ck_source_pre_analysis_results_provider_name_nonblank",
                "ck_source_pre_analysis_results_model_name_nonblank",
                "ck_source_pre_analysis_results_prompt_version_nonblank",
            },
        )
        for call in constraint_calls:
            self.assertEqual(call.args[1], "source_pre_analysis_results")
            self.assertEqual(call.kwargs, {"type_": "check"})
        self.assertEqual(
            [call.args for call in column_calls],
            [
                ("source_pre_analysis_results", "prompt_version"),
                ("source_pre_analysis_results", "model_name"),
                ("source_pre_analysis_results", "provider_name"),
                ("source_pre_analysis_results", "processor_version"),
                ("source_pre_analysis_results", "processor_name"),
            ],
        )
        method_names = [call[0] for call in MIGRATION.op.method_calls]
        self.assertLess(
            max(i for i, name in enumerate(method_names)
                if name == "drop_constraint"),
            min(i for i, name in enumerate(method_names)
                if name == "drop_column"),
        )
        MIGRATION.op.drop_table.assert_not_called()
        MIGRATION.op.drop_index.assert_not_called()
        MIGRATION.op.execute.assert_not_called()

    def test_model_and_migration_constraint_names_remain_aligned(self) -> None:
        from sqlalchemy import CheckConstraint

        from app.models.source_pre_analysis_result import SourcePreAnalysisResult

        model_names = {
            constraint.name
            for constraint in SourcePreAnalysisResult.__table__.constraints
            if isinstance(constraint, CheckConstraint)
            and "processor" in constraint.name
            or isinstance(constraint, CheckConstraint)
            and constraint.name in {
                "ck_source_pre_analysis_results_provider_name_nonblank",
                "ck_source_pre_analysis_results_model_name_nonblank",
                "ck_source_pre_analysis_results_prompt_version_nonblank",
            }
        }
        MIGRATION.upgrade()
        migration_names = {
            call.args[0]
            for call in MIGRATION.op.create_check_constraint.call_args_list
        }
        self.assertEqual(model_names, migration_names)


if __name__ == "__main__":
    unittest.main()
