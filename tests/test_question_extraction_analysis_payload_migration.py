from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend/alembic/versions/"
    / "a1c3e5f7b920_add_question_extraction_analysis_payload.py"
)
SPEC = importlib.util.spec_from_file_location(
    "question_extraction_analysis_payload_migration", MIGRATION_PATH,
)
assert SPEC is not None and SPEC.loader is not None
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class QuestionExtractionAnalysisPayloadMigrationTest(unittest.TestCase):
    def test_revision_and_upgrade_are_narrow(self) -> None:
        self.assertEqual(MIGRATION.revision, "a1c3e5f7b920")
        self.assertEqual(MIGRATION.down_revision, "f8b0d2e4a617")
        with patch.object(MIGRATION.op, "add_column") as add_column, patch.object(
            MIGRATION.op, "create_check_constraint"
        ) as create_check:
            MIGRATION.upgrade()
        self.assertEqual(add_column.call_count, 2)
        self.assertEqual(
            [call.args[1].name for call in add_column.call_args_list],
            ["processing_version", "analysis_data"],
        )
        self.assertTrue(all(
            call.args[0] == "question_extraction_results"
            for call in add_column.call_args_list
        ))
        create_check.assert_called_once()

    def test_downgrade_removes_only_added_contract(self) -> None:
        with patch.object(MIGRATION.op, "drop_constraint") as drop_constraint, patch.object(
            MIGRATION.op, "drop_column"
        ) as drop_column:
            MIGRATION.downgrade()
        drop_constraint.assert_called_once_with(
            "ck_question_extraction_results_processing_version_nonblank",
            "question_extraction_results",
            type_="check",
        )
        self.assertEqual(
            [call.args for call in drop_column.call_args_list],
            [
                ("question_extraction_results", "analysis_data"),
                ("question_extraction_results", "processing_version"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
