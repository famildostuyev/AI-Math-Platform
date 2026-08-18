from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import SourcePreAnalysisResult, SourcePreAnalysisRun


class SourcePreAnalysisResultModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_result_identity_contract(self) -> None:
        table = SourcePreAnalysisResult.__table__

        self.assertEqual(table.name, "source_pre_analysis_results")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "source_pre_analysis_run_id", "schema_version",
                "page_count", "processor_name", "processor_version",
                "provider_name", "model_name", "prompt_version",
                "created_at", "updated_at", "deleted_at",
            },
        )
        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)
        self.assertFalse(table.c.id.nullable)
        self.assertIsInstance(table.c.created_at.type, DateTime)
        self.assertFalse(table.c.created_at.nullable)
        self.assertIsInstance(table.c.updated_at.type, DateTime)
        self.assertFalse(table.c.updated_at.nullable)
        self.assertIsInstance(table.c.deleted_at.type, DateTime)
        self.assertTrue(table.c.deleted_at.nullable)
        self.assertIsInstance(table.c.source_pre_analysis_run_id.type, UUID)
        self.assertFalse(table.c.source_pre_analysis_run_id.nullable)
        self.assertIsInstance(table.c.schema_version.type, Integer)
        self.assertFalse(table.c.schema_version.nullable)
        self.assertEqual(table.c.schema_version.default.arg, 1)
        self.assertEqual(str(table.c.schema_version.server_default.arg), "1")
        self.assertIsInstance(table.c.page_count.type, Integer)
        self.assertTrue(table.c.page_count.nullable)
        provenance_lengths = {
            "processor_name": 100,
            "processor_version": 100,
            "provider_name": 100,
            "model_name": 200,
            "prompt_version": 100,
        }
        for name, length in provenance_lengths.items():
            with self.subTest(name=name):
                column = table.c[name]
                self.assertIsInstance(column.type, String)
                self.assertEqual(column.type.length, length)
                self.assertTrue(column.nullable)
                self.assertIsNone(column.default)
                self.assertIsNone(column.server_default)

    def test_constraints_and_index_policy_match_result_contract(self) -> None:
        table = SourcePreAnalysisResult.__table__
        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks,
            {
                "ck_source_pre_analysis_results_schema_version_positive":
                    "schema_version > 0",
                "ck_source_pre_analysis_results_page_count_non_negative":
                    "page_count IS NULL OR page_count >= 0",
                "ck_source_pre_analysis_results_processor_identity_paired":
                    "(processor_name IS NULL AND processor_version IS NULL) OR "
                    "(processor_name IS NOT NULL AND processor_version IS NOT NULL)",
                "ck_source_pre_analysis_results_processor_name_nonblank":
                    "processor_name IS NULL OR "
                    "char_length(btrim(processor_name)) > 0",
                "ck_source_pre_analysis_results_processor_version_nonblank":
                    "processor_version IS NULL OR "
                    "char_length(btrim(processor_version)) > 0",
                "ck_source_pre_analysis_results_provider_name_nonblank":
                    "provider_name IS NULL OR "
                    "char_length(btrim(provider_name)) > 0",
                "ck_source_pre_analysis_results_model_name_nonblank":
                    "model_name IS NULL OR char_length(btrim(model_name)) > 0",
                "ck_source_pre_analysis_results_prompt_version_nonblank":
                    "prompt_version IS NULL OR "
                    "char_length(btrim(prompt_version)) > 0",
            },
        )
        uniques = {
            constraint.name: tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        self.assertEqual(
            uniques,
            {"uq_source_pre_analysis_results_run_id": (
                "source_pre_analysis_run_id",
            )},
        )
        self.assertEqual(set(table.indexes), set())

    def test_relationship_and_scope_are_strictly_result_summary_only(self) -> None:
        table = SourcePreAnalysisResult.__table__
        foreign_key = next(
            iter(table.c.source_pre_analysis_run_id.foreign_keys)
        )
        self.assertEqual(
            foreign_key.target_fullname, "source_pre_analysis_runs.id",
        )
        self.assertEqual(foreign_key.ondelete, "RESTRICT")
        relationships = SourcePreAnalysisResult.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()), {"source_pre_analysis_run"},
        )
        relationship = relationships.source_pre_analysis_run
        self.assertIs(relationship.mapper.class_, SourcePreAnalysisRun)
        self.assertFalse(relationship.uselist)
        self.assertNotIn("delete", relationship.cascade)
        self.assertNotIn("delete-orphan", relationship.cascade)
        self.assertNotIn(
            "result", SourcePreAnalysisRun.__mapper__.relationships.keys(),
        )
        self.assertFalse(
            any(isinstance(column.type, (JSON, JSONB)) for column in table.columns)
        )
        self.assertTrue(
            {
                "detected_question_count", "estimated_question_count",
                "image_count", "formula_count", "has_formula",
                "has_possible_answer_section", "warning_count",
                "quality_score", "confidence", "uncertainty", "observations",
                "parser_name", "parser_version", "provider",
                "model_version", "prompt_text", "system_prompt",
                "raw_provider_request", "raw_provider_response", "api_key",
                "secret", "token", "filesystem_path", "storage_key",
                "source_content", "ocr_text", "exception_stack_trace",
                "model_reasoning", "execution_payload", "raw_source_text",
                "source_document_page_id", "question_id", "question_form_id",
                "question_revision_id", "content_block_id",
            }.isdisjoint(table.c.keys())
        )
        self.assertIn("source_pre_analysis_results", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
