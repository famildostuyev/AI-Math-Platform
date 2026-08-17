from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Integer, UniqueConstraint
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
                "page_count", "created_at", "updated_at", "deleted_at",
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
                "parser_name", "parser_version", "processor_name",
                "processor_version", "provider", "model_version",
                "prompt_version", "ocr_text", "raw_source_text",
                "source_document_page_id", "question_id", "question_form_id",
                "question_revision_id", "content_block_id",
            }.isdisjoint(table.c.keys())
        )
        self.assertIn("source_pre_analysis_results", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
