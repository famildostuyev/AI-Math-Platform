from __future__ import annotations

import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "backend/alembic/versions/f1c3e5a7b902_add_solution_presentation_metadata.py"


class SolutionPresentationMetadataMigrationTest(unittest.TestCase):
    def test_migration_extends_current_head_with_legacy_safe_defaults(self) -> None:
        tree = ast.parse(MIGRATION.read_text(encoding="utf-8"))
        assignments = {
            node.target.id: ast.literal_eval(node.value)
            for node in tree.body
            if isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id in {"revision", "down_revision"}
        }
        self.assertEqual(assignments, {
            "revision": "f1c3e5a7b902",
            "down_revision": "e9f1b3c5d746",
        })
        source = MIGRATION.read_text(encoding="utf-8")
        self.assertIn('sa.Column("step_index", sa.Integer(), nullable=True)', source)
        self.assertIn('server_default="reasoning", nullable=False', source)
        for role in (
            "reasoning", "governing_formula", "result", "final_answer",
            "verification", "note", "property",
        ):
            self.assertIn(role, source)


if __name__ == "__main__":
    unittest.main()
