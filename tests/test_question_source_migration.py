from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import MagicMock, call


MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "backend"
    / "alembic"
    / "versions"
    / "a2d4f6b8c910_add_question_source_metadata.py"
)
SPEC = importlib.util.spec_from_file_location(
    "question_source_metadata_migration",
    MIGRATION_PATH,
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Question Source migration could not be loaded.")
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


class QuestionSourceMigrationContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_op = MIGRATION.op
        MIGRATION.op = MagicMock()
        MIGRATION.op.f.side_effect = lambda value: value

    def tearDown(self) -> None:
        MIGRATION.op = self.original_op

    def test_upgrade_creates_catalog_and_nullable_form_source_fields(self) -> None:
        MIGRATION.upgrade()

        self.assertEqual(MIGRATION.down_revision, "f7c3a9e1b420")
        create_table = MIGRATION.op.create_table.call_args
        self.assertEqual(create_table.args[0], "question_sources")
        columns = {
            item.name: item
            for item in create_table.args[1:]
            if hasattr(item, "name") and item.name is not None
        }
        self.assertEqual(
            set(columns),
            {
                "name", "display_name", "description", "sort_order",
                "is_active", "id", "created_at", "updated_at", "deleted_at",
            },
        )
        self.assertFalse(columns["name"].nullable)
        self.assertFalse(columns["display_name"].nullable)
        self.assertTrue(columns["description"].nullable)
        self.assertTrue(columns["deleted_at"].nullable)

        added = {
            current.args[1].name: current.args[1]
            for current in MIGRATION.op.add_column.call_args_list
        }
        self.assertEqual(set(added), {"source_id", "source_detail"})
        self.assertTrue(added["source_id"].nullable)
        self.assertTrue(added["source_detail"].nullable)
        foreign_key = MIGRATION.op.create_foreign_key.call_args
        self.assertEqual(
            foreign_key,
            call(
                "fk_question_forms_source_id_question_sources",
                "question_forms",
                "question_sources",
                ["source_id"],
                ["id"],
                ondelete="RESTRICT",
            ),
        )

    def test_downgrade_removes_form_fields_before_source_catalog(self) -> None:
        MIGRATION.downgrade()

        self.assertEqual(
            [current.args for current in MIGRATION.op.drop_column.call_args_list],
            [
                ("question_forms", "source_detail"),
                ("question_forms", "source_id"),
            ],
        )
        MIGRATION.op.drop_table.assert_called_once_with("question_sources")


if __name__ == "__main__":
    unittest.main()
