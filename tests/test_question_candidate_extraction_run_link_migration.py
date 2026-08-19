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
    / "9b5165810c21_link_question_candidates_to_extraction_.py"
)

SPEC = importlib.util.spec_from_file_location(
    "link_question_candidates_to_extraction_runs_migration",
    MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(
        "Question Candidate extraction-run linkage migration could not be loaded."
    )

MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class QuestionCandidateExtractionRunLinkMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_replaces_document_link_with_extraction_run_link(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "9b5165810c21")
        self.assertEqual(MIGRATION.down_revision, "6047b7650712")

        MIGRATION.op.execute.assert_called_once()
        execute_arg = MIGRATION.op.execute.call_args.args[0]
        self.assertIsInstance(execute_arg, sa.sql.elements.TextClause)
        self.assertIn(
            "question_candidates must be empty before linking candidates "
            "to extraction runs",
            execute_arg.text,
        )

        self.assertEqual(
            [call.args for call in MIGRATION.op.drop_constraint.call_args_list],
            [
                (
                    "uq_question_candidates_document_sequence",
                    "question_candidates",
                ),
                (
                    "question_candidates_source_document_id_fkey",
                    "question_candidates",
                ),
            ],
        )
        self.assertEqual(
            [call.kwargs for call in MIGRATION.op.drop_constraint.call_args_list],
            [
                {"type_": "unique"},
                {"type_": "foreignkey"},
            ],
        )

        MIGRATION.op.add_column.assert_called_once()
        add_column_call = MIGRATION.op.add_column.call_args
        self.assertEqual(add_column_call.args[0], "question_candidates")
        added_column = add_column_call.args[1]
        self.assertIsInstance(added_column, sa.Column)
        self.assertEqual(added_column.name, "question_extraction_run_id")
        self.assertIsInstance(added_column.type, sa.UUID)
        self.assertTrue(added_column.nullable)

        MIGRATION.op.create_foreign_key.assert_called_once_with(
            "question_candidates_question_extraction_run_id_fkey",
            "question_candidates",
            "question_extraction_runs",
            ["question_extraction_run_id"],
            ["id"],
            ondelete="RESTRICT",
        )

        MIGRATION.op.create_unique_constraint.assert_called_once_with(
            "uq_question_candidates_run_sequence",
            "question_candidates",
            ["question_extraction_run_id", "sequence_number"],
        )

        MIGRATION.op.alter_column.assert_called_once_with(
            "question_candidates",
            "question_extraction_run_id",
            existing_type=unittest.mock.ANY,
            nullable=False,
        )
        alter_type = MIGRATION.op.alter_column.call_args.kwargs["existing_type"]
        self.assertIsInstance(alter_type, sa.UUID)

        MIGRATION.op.drop_column.assert_called_once_with(
            "question_candidates",
            "source_document_id",
        )

        MIGRATION.op.create_table.assert_not_called()
        MIGRATION.op.drop_table.assert_not_called()
        MIGRATION.op.create_index.assert_not_called()
        MIGRATION.op.drop_index.assert_not_called()

    def test_downgrade_restores_document_link_and_removes_run_link(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.execute.assert_called_once()
        execute_arg = MIGRATION.op.execute.call_args.args[0]
        self.assertIsInstance(execute_arg, sa.sql.elements.TextClause)
        self.assertIn(
            "question_candidates must be empty before restoring document linkage",
            execute_arg.text,
        )

        MIGRATION.op.add_column.assert_called_once()
        add_column_call = MIGRATION.op.add_column.call_args
        self.assertEqual(add_column_call.args[0], "question_candidates")
        added_column = add_column_call.args[1]
        self.assertIsInstance(added_column, sa.Column)
        self.assertEqual(added_column.name, "source_document_id")
        self.assertIsInstance(added_column.type, sa.UUID)
        self.assertTrue(added_column.nullable)

        MIGRATION.op.create_foreign_key.assert_called_once_with(
            "question_candidates_source_document_id_fkey",
            "question_candidates",
            "source_documents",
            ["source_document_id"],
            ["id"],
            ondelete="RESTRICT",
        )

        MIGRATION.op.create_unique_constraint.assert_called_once_with(
            "uq_question_candidates_document_sequence",
            "question_candidates",
            ["source_document_id", "sequence_number"],
        )

        MIGRATION.op.alter_column.assert_called_once_with(
            "question_candidates",
            "source_document_id",
            existing_type=unittest.mock.ANY,
            nullable=False,
        )
        alter_type = MIGRATION.op.alter_column.call_args.kwargs["existing_type"]
        self.assertIsInstance(alter_type, sa.UUID)

        self.assertEqual(
            [call.args for call in MIGRATION.op.drop_constraint.call_args_list],
            [
                (
                    "uq_question_candidates_run_sequence",
                    "question_candidates",
                ),
                (
                    "question_candidates_question_extraction_run_id_fkey",
                    "question_candidates",
                ),
            ],
        )
        self.assertEqual(
            [call.kwargs for call in MIGRATION.op.drop_constraint.call_args_list],
            [
                {"type_": "unique"},
                {"type_": "foreignkey"},
            ],
        )

        MIGRATION.op.drop_column.assert_called_once_with(
            "question_candidates",
            "question_extraction_run_id",
        )

        MIGRATION.op.create_table.assert_not_called()
        MIGRATION.op.drop_table.assert_not_called()
        MIGRATION.op.create_index.assert_not_called()
        MIGRATION.op.drop_index.assert_not_called()


if __name__ == "__main__":
    unittest.main()
