from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, JSONB


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions"
    / "f2a4c6e8b013_add_source_pre_analysis_finding_foundation.py"
)
SPEC = importlib.util.spec_from_file_location(
    "source_pre_analysis_finding_foundation_migration", MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Source Pre-Analysis Finding migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SourcePreAnalysisFindingMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_finding_foundation(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "f2a4c6e8b013")
        self.assertEqual(MIGRATION.down_revision, "e7b9c1d3f546")
        MIGRATION.op.create_table.assert_called_once()
        call = MIGRATION.op.create_table.call_args
        self.assertEqual(call.args[0], "source_pre_analysis_findings")
        columns = {
            item.name: item for item in call.args[1:] if isinstance(item, sa.Column)
        }
        self.assertEqual(
            set(columns),
            {
                "id", "created_at", "updated_at", "deleted_at",
                "source_pre_analysis_result_id", "source_document_page_id",
                "sequence_number", "finding_code", "severity", "confidence",
                "message",
            },
        )
        for name in {
            "id", "created_at", "updated_at", "source_pre_analysis_result_id",
            "sequence_number", "finding_code", "severity", "message",
        }:
            self.assertFalse(columns[name].nullable)
        self.assertTrue(columns["source_document_page_id"].nullable)
        self.assertTrue(columns["confidence"].nullable)
        self.assertIsInstance(columns["severity"].type, sa.Enum)
        self.assertFalse(columns["severity"].type.native_enum)
        self.assertEqual(columns["severity"].type.enums, ["info", "warning", "error"])
        self.assertIsInstance(columns["confidence"].type, sa.Numeric)
        self.assertEqual(columns["confidence"].type.precision, 5)
        self.assertEqual(columns["confidence"].type.scale, 4)
        self.assertFalse(
            any(isinstance(column.type, (JSON, JSONB)) for column in columns.values())
        )

        foreign_keys = [
            item for item in call.args[1:]
            if isinstance(item, sa.ForeignKeyConstraint)
        ]
        self.assertEqual(len(foreign_keys), 2)
        self.assertEqual(
            {
                (tuple(item.column_keys),
                 tuple(element.target_fullname for element in item.elements),
                 item.ondelete)
                for item in foreign_keys
            },
            {
                (("source_pre_analysis_result_id",),
                 ("source_pre_analysis_results.id",), "RESTRICT"),
                (("source_document_page_id",),
                 ("source_document_pages.id",), "RESTRICT"),
            },
        )
        checks = {
            item.name: str(item.sqltext) for item in call.args[1:]
            if isinstance(item, sa.CheckConstraint)
        }
        self.assertEqual(
            checks,
            {
                "ck_source_pre_analysis_findings_sequence_positive":
                    "sequence_number > 0",
                "ck_source_pre_analysis_findings_code_nonblank":
                    "char_length(btrim(finding_code)) > 0",
                "ck_source_pre_analysis_findings_message_nonblank":
                    "char_length(btrim(message)) > 0",
                "ck_source_pre_analysis_findings_confidence_range":
                    "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            },
        )
        unique = next(
            item for item in call.args[1:] if isinstance(item, sa.UniqueConstraint)
        )
        self.assertEqual(unique.name, "uq_source_pre_analysis_findings_result_sequence")
        self.assertEqual(
            tuple(unique._pending_colargs),
            ("source_pre_analysis_result_id", "sequence_number"),
        )
        MIGRATION.op.create_index.assert_called_once_with(
            "ix_source_pre_analysis_findings_source_document_page_id",
            "source_pre_analysis_findings",
            ["source_document_page_id"],
            unique=False,
        )
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()

    def test_downgrade_removes_only_finding_objects(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.drop_index.assert_called_once_with(
            "ix_source_pre_analysis_findings_source_document_page_id",
            table_name="source_pre_analysis_findings",
        )
        MIGRATION.op.drop_table.assert_called_once_with(
            "source_pre_analysis_findings"
        )
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
