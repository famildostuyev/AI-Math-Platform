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
    / "c5f7a9b1d324_add_source_document_page_foundation.py"
)
SPEC = importlib.util.spec_from_file_location(
    "source_document_page_foundation_migration", MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Source Document Page migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SourceDocumentPageMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_page_identity_foundation(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "c5f7a9b1d324")
        self.assertEqual(MIGRATION.down_revision, "b4e6f8a0c213")
        MIGRATION.op.create_table.assert_called_once()
        create_table = MIGRATION.op.create_table.call_args
        self.assertEqual(create_table.args[0], "source_document_pages")
        columns = {
            item.name: item
            for item in create_table.args[1:]
            if isinstance(item, sa.Column)
        }
        self.assertEqual(
            set(columns),
            {
                "source_document_id", "page_number", "id", "created_at",
                "updated_at", "deleted_at",
            },
        )
        self.assertFalse(columns["source_document_id"].nullable)
        self.assertIsInstance(columns["page_number"].type, sa.Integer)
        self.assertFalse(columns["page_number"].nullable)
        self.assertFalse(columns["id"].nullable)
        self.assertFalse(columns["created_at"].nullable)
        self.assertFalse(columns["updated_at"].nullable)
        self.assertTrue(columns["deleted_at"].nullable)

        foreign_keys = [
            constraint
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.ForeignKeyConstraint)
        ]
        self.assertEqual(len(foreign_keys), 1)
        self.assertEqual(
            tuple(foreign_keys[0].column_keys), ("source_document_id",),
        )
        self.assertEqual(
            tuple(
                element.target_fullname for element in foreign_keys[0].elements
            ),
            ("source_documents.id",),
        )
        self.assertEqual(foreign_keys[0].ondelete, "RESTRICT")

        checks = [
            constraint
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.CheckConstraint)
        ]
        self.assertEqual(len(checks), 1)
        self.assertEqual(
            checks[0].name, "ck_source_document_pages_number_positive",
        )
        self.assertEqual(str(checks[0].sqltext), "page_number > 0")
        uniques = [
            constraint
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.UniqueConstraint)
        ]
        self.assertEqual(len(uniques), 1)
        self.assertEqual(
            uniques[0].name,
            "uq_source_document_pages_document_number",
        )
        self.assertEqual(
            tuple(uniques[0]._pending_colargs),
            ("source_document_id", "page_number"),
        )
        MIGRATION.op.create_index.assert_not_called()
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.create_foreign_key.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()
        self.assertFalse(
            any(isinstance(column.type, sa.Enum) for column in columns.values())
        )

    def test_downgrade_removes_only_page_identity_table(self) -> None:
        MIGRATION.downgrade()

        MIGRATION.op.drop_table.assert_called_once_with(
            "source_document_pages"
        )
        MIGRATION.op.drop_index.assert_not_called()
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
