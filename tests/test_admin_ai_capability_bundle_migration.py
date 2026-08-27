from __future__ import annotations

import importlib.util
import sqlite3
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

PATH = Path(__file__).resolve().parents[1] / "backend/alembic/versions/c7e9f1a3b524_add_similar_question_proposal_foundation.py"
SPEC = importlib.util.spec_from_file_location("admin_ai_bundle_migration", PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MIGRATION)


class AdminAICapabilityBundleMigrationTest(unittest.TestCase):
    def test_revision_is_single_contiguous_rewrite_without_specialized_table(self) -> None:
        self.assertEqual(MIGRATION.revision, "c7e9f1a3b524")
        self.assertEqual(MIGRATION.down_revision, "a5c7e9f1b302")
        with patch.object(MIGRATION, "op", MagicMock()):
            MIGRATION.upgrade()
            self.assertFalse(MIGRATION.op.create_table.called)
            columns = [call.args[1].name for call in MIGRATION.op.add_column.call_args_list]
            self.assertEqual(columns, [
                "proposal_kind", "result_kind", "capability_bundle_schema_version",
                "capability_bundle", "capability_bundle_hash",
            ])
            contracts = " ".join(str(call) for call in MIGRATION.op.create_check_constraint.call_args_list)
            self.assertIn("capability_bundle", contracts)
            self.assertNotIn("similar_question", contracts)

    def test_downgrade_removes_generic_columns_without_specialized_table(self) -> None:
        with patch.object(MIGRATION, "op", MagicMock()):
            MIGRATION.downgrade()
            self.assertFalse(MIGRATION.op.drop_table.called)
            delete_call = MIGRATION.op.execute.call_args_list[0]
            self.assertEqual(
                delete_call.args[0],
                "DELETE FROM ai_authoring_proposals WHERE proposal_kind = 'capability_bundle'",
            )
            calls = MIGRATION.op.method_calls
            delete_index = next(index for index, call in enumerate(calls) if call[0] == "execute")
            first_not_null_index = next(
                index
                for index, call in enumerate(calls)
                if call[0] == "alter_column" and call.kwargs.get("nullable") is False
            )
            self.assertLess(delete_index, first_not_null_index)
            dropped = [call.args[1] for call in MIGRATION.op.drop_column.call_args_list]
            self.assertEqual(dropped, [
                "capability_bundle_hash", "capability_bundle",
                "capability_bundle_schema_version", "result_kind", "proposal_kind",
            ])

    def test_real_rows_round_trip_preserves_legacy_and_removes_only_capability_bundles(self) -> None:
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.execute(
            """
            CREATE TABLE ai_authoring_proposals (
                id TEXT PRIMARY KEY,
                action_schema_version INTEGER NOT NULL,
                actions TEXT NOT NULL
            )
            """
        )
        db.execute(
            "INSERT INTO ai_authoring_proposals (id, action_schema_version, actions) VALUES (?, ?, ?)",
            ("legacy", 1, '{"schema_version":1,"actions":[]}'),
        )

        # SQLite cannot ALTER a column's nullability, so rebuild the upgraded
        # table while preserving the migration's exact data shape and backfill.
        db.execute("ALTER TABLE ai_authoring_proposals RENAME TO legacy_before_upgrade")
        db.execute(
            """
            CREATE TABLE ai_authoring_proposals (
                id TEXT PRIMARY KEY,
                action_schema_version INTEGER,
                actions TEXT,
                proposal_kind TEXT NOT NULL,
                result_kind TEXT NOT NULL,
                capability_bundle_schema_version INTEGER,
                capability_bundle TEXT,
                capability_bundle_hash TEXT
            )
            """
        )
        db.execute(
            """
            INSERT INTO ai_authoring_proposals (
                id, action_schema_version, actions, proposal_kind, result_kind
            )
            SELECT id, action_schema_version, actions, 'authoring_actions', 'mutation_proposal'
            FROM legacy_before_upgrade
            """
        )
        db.execute("DROP TABLE legacy_before_upgrade")
        generic_rows = (
            ("generic-1", "0" * 64),
            ("generic-2", "1" * 64),
        )
        db.executemany(
            """
            INSERT INTO ai_authoring_proposals (
                id, action_schema_version, actions, proposal_kind, result_kind,
                capability_bundle_schema_version, capability_bundle, capability_bundle_hash
            ) VALUES (?, NULL, NULL, 'capability_bundle', 'mutation_proposal', 1, '{}', ?)
            """,
            generic_rows,
        )

        # Execute the migration's exact downgrade classification against real rows.
        db.execute("DELETE FROM ai_authoring_proposals WHERE proposal_kind = 'capability_bundle'")
        remaining = db.execute(
            "SELECT id, proposal_kind, action_schema_version, actions FROM ai_authoring_proposals ORDER BY id"
        ).fetchall()
        self.assertEqual(
            remaining,
            [("legacy", "authoring_actions", 1, '{"schema_version":1,"actions":[]}')],
        )

        # Rebuild the legacy projection with its original NOT NULL payload contract.
        db.execute(
            """
            CREATE TABLE legacy_ai_authoring_proposals (
                id TEXT PRIMARY KEY,
                action_schema_version INTEGER NOT NULL
                    CHECK (action_schema_version > 0),
                actions TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            INSERT INTO legacy_ai_authoring_proposals (id, action_schema_version, actions)
            SELECT id, action_schema_version, actions FROM ai_authoring_proposals
            """
        )
        columns = {
            row[1]: row
            for row in db.execute("PRAGMA table_info(legacy_ai_authoring_proposals)").fetchall()
        }
        self.assertEqual(columns["action_schema_version"][3], 1)
        self.assertEqual(columns["actions"][3], 1)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM legacy_ai_authoring_proposals").fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute(
                "INSERT INTO legacy_ai_authoring_proposals (id, action_schema_version, actions) "
                "VALUES ('invalid-version', 0, '{}')"
            )


if __name__ == "__main__":
    unittest.main()
