from __future__ import annotations

import ast
import unittest
from pathlib import Path


class SolutionMigrationContractTest(unittest.TestCase):
    def test_migration_contract_and_chain(self) -> None:
        path = Path(__file__).resolve().parents[1] / "backend" / "alembic" / "versions" / "a5c7e9f1b302_add_canonical_adf1_solution_domain.py"
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        assignments = {
            node.target.id: ast.literal_eval(node.value)
            for node in tree.body
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
            and node.target.id in {"revision", "down_revision"}
        }
        self.assertEqual(assignments, {
            "revision": "a5c7e9f1b302", "down_revision": "f3a5c7d9e120"
        })
        for token in (
            '"solutions"', '"solution_blocks"',
            '"uq_solutions_active_revision"',
            '"uq_solution_blocks_active_solution_order"',
            '"ck_solution_blocks_payload_matches_type"',
            'postgresql_where=sa.text("deleted_at IS NULL")',
        ):
            self.assertIn(token, source)


if __name__ == "__main__":
    unittest.main()
