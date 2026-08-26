from __future__ import annotations
import importlib.util, unittest
from pathlib import Path
from unittest.mock import MagicMock

PATH=Path(__file__).resolve().parents[1]/"backend/alembic/versions/f3a5c7d9e120_add_answer_extraction_provenance.py"
SPEC=importlib.util.spec_from_file_location("answer_extraction_provenance_migration",PATH)
if SPEC is None or SPEC.loader is None: raise RuntimeError("Migration could not be loaded")
MIGRATION=importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MIGRATION)

class AnswerExtractionProvenanceMigrationTest(unittest.TestCase):
    def setUp(self): self.original=MIGRATION.op; MIGRATION.op=MagicMock()
    def tearDown(self): MIGRATION.op=self.original

    def test_upgrade_adds_explicit_nullable_identity_and_unique_mapping(self):
        MIGRATION.upgrade()
        self.assertEqual((MIGRATION.revision,MIGRATION.down_revision),("f3a5c7d9e120","e1f3a5c7d908"))
        self.assertEqual([call.args[1].name for call in MIGRATION.op.add_column.call_args_list],["source_extraction_result_id","source_extraction_question_id","source_option_index","source_provenance"])
        self.assertTrue(all(call.args[1].nullable for call in MIGRATION.op.add_column.call_args_list))
        fk=MIGRATION.op.create_foreign_key.call_args
        self.assertEqual((fk.args[1],fk.args[2]),("answer_options","question_extraction_results")); self.assertEqual(fk.kwargs["ondelete"],"RESTRICT")
        unique=[call for call in MIGRATION.op.create_index.call_args_list if call.args[0]=="uq_answer_options_extraction_mapping"][0]
        self.assertTrue(unique.kwargs["unique"]); self.assertIn("source_extraction_result_id",str(unique.kwargs["postgresql_where"]))

    def test_downgrade_removes_only_new_provenance_contract(self):
        MIGRATION.downgrade()
        self.assertEqual(MIGRATION.op.drop_column.call_count,4)
        MIGRATION.op.drop_table.assert_not_called()

if __name__=="__main__": unittest.main()
