from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call

import sqlalchemy as sa


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend"
    / "alembic"
    / "versions"
    / "b4e6f8a0c213_add_source_document_foundation.py"
)
SPEC = importlib.util.spec_from_file_location(
    "source_document_foundation_migration", MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Source Document migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class SourceDocumentMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()
        MIGRATION.op.f.side_effect = lambda value: value

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_only_source_document_foundation(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.revision, "b4e6f8a0c213")
        self.assertEqual(MIGRATION.down_revision, "a2d4f6b8c910")
        MIGRATION.op.create_table.assert_called_once()
        create_table = MIGRATION.op.create_table.call_args
        self.assertEqual(create_table.args[0], "source_documents")

        columns = {
            item.name: item
            for item in create_table.args[1:]
            if isinstance(item, sa.Column)
        }
        self.assertEqual(
            set(columns),
            {
                "media_asset_id", "question_source_id",
                "uploaded_by_user_id", "id", "created_at", "updated_at",
                "deleted_at",
            },
        )
        self.assertFalse(columns["media_asset_id"].nullable)
        self.assertTrue(columns["question_source_id"].nullable)
        self.assertTrue(columns["uploaded_by_user_id"].nullable)
        self.assertFalse(columns["id"].nullable)
        self.assertFalse(columns["created_at"].nullable)
        self.assertFalse(columns["updated_at"].nullable)
        self.assertTrue(columns["deleted_at"].nullable)

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
                ("media_asset_id",): (("media_assets.id",), "RESTRICT"),
                ("question_source_id",): (
                    ("question_sources.id",), "RESTRICT",
                ),
                ("uploaded_by_user_id",): (("users.id",), "SET NULL"),
            },
        )

        unique_constraints = [
            constraint
            for constraint in create_table.args[1:]
            if isinstance(constraint, sa.UniqueConstraint)
        ]
        self.assertEqual(len(unique_constraints), 1)
        self.assertEqual(
            unique_constraints[0].name,
            "uq_source_documents_media_asset_id",
        )
        self.assertEqual(
            tuple(unique_constraints[0]._pending_colargs),
            ("media_asset_id",),
        )
        self.assertEqual(
            MIGRATION.op.create_index.call_args_list,
            [
                call(
                    "ix_source_documents_question_source_id",
                    "source_documents",
                    ["question_source_id"],
                    unique=False,
                ),
                call(
                    "ix_source_documents_uploaded_by_user_id",
                    "source_documents",
                    ["uploaded_by_user_id"],
                    unique=False,
                ),
            ],
        )
        MIGRATION.op.add_column.assert_not_called()
        MIGRATION.op.alter_column.assert_not_called()
        MIGRATION.op.create_foreign_key.assert_not_called()
        MIGRATION.op.execute.assert_not_called()
        MIGRATION.op.bulk_insert.assert_not_called()
        self.assertFalse(
            any(isinstance(item.type, sa.Enum) for item in columns.values())
        )

    def test_downgrade_removes_only_source_document_objects(self) -> None:
        MIGRATION.downgrade()

        self.assertEqual(
            MIGRATION.op.drop_index.call_args_list,
            [
                call(
                    "ix_source_documents_uploaded_by_user_id",
                    table_name="source_documents",
                ),
                call(
                    "ix_source_documents_question_source_id",
                    table_name="source_documents",
                ),
            ],
        )
        MIGRATION.op.drop_table.assert_called_once_with("source_documents")
        MIGRATION.op.drop_column.assert_not_called()
        MIGRATION.op.drop_constraint.assert_not_called()
        MIGRATION.op.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
