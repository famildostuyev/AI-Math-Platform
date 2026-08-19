from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, JSONB


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend"
    / "alembic"
    / "versions"
    / "5b02c5057428_add_question_candidate_foundation.py"
)

SPEC = importlib.util.spec_from_file_location(
    "question_candidate_foundation_migration",
    MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Question Candidate migration could not be loaded.")

MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class QuestionCandidateMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_question_candidate_foundation(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "5b02c5057428")
        self.assertEqual(MIGRATION.down_revision, "c7e9a1b3d502")

        MIGRATION.op.create_table.assert_called_once()
        call = MIGRATION.op.create_table.call_args
        self.assertEqual(call.args[0], "question_candidates")

        columns = {
            item.name: item
            for item in call.args[1:]
            if isinstance(item, sa.Column)
        }

        self.assertEqual(
            set(columns),
            {
                "id",
                "created_at",
                "updated_at",
                "deleted_at",
                "source_document_id",
                "source_document_page_id",
                "sequence_number",
                "extracted_text",
                "confidence",
            },
        )

        for name in {
            "id",
            "created_at",
            "updated_at",
            "source_document_id",
            "sequence_number",
            "extracted_text",
        }:
            self.assertFalse(columns[name].nullable)

        self.assertTrue(columns["deleted_at"].nullable)
        self.assertTrue(columns["source_document_page_id"].nullable)
        self.assertTrue(columns["confidence"].nullable)

        self.assertIsInstance(columns["sequence_number"].type, sa.Integer)
        self.assertIsInstance(columns["extracted_text"].type, sa.Text)
        self.assertIsInstance(columns["confidence"].type, sa.Numeric)
        self.assertEqual(columns["confidence"].type.precision, 5)
        self.assertEqual(columns["confidence"].type.scale, 4)

        self.assertFalse(
            any(isinstance(column.type, (JSON, JSONB)) for column in columns.values())
        )

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
                    ("source_document_page_id",),
                    ("source_document_pages.id",),
                    "RESTRICT",
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
                "ck_question_candidates_sequence_positive":
                    "sequence_number > 0",
                "ck_question_candidates_text_nonblank":
                    "char_length(btrim(extracted_text)) > 0",
                "ck_question_candidates_confidence_range":
                    "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            },
        )

        unique = next(
            item
            for item in call.args[1:]
            if isinstance(item, sa.UniqueConstraint)
        )

        self.assertEqual(
            unique.name,
            "uq_question_candidates_document_sequence",
        )
        self.assertEqual(
            tuple(unique._pending_colargs),
            ("source_document_id", "sequence_number"),
        )

        MIGRATION.op.create_index.assert_not_called()
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()

    def test_downgrade_removes_only_question_candidate_table(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.drop_table.assert_called_once_with("question_candidates")
        MIGRATION.op.drop_index.assert_not_called()
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
