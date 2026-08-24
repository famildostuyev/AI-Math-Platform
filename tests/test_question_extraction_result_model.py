from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import QuestionExtractionResult, QuestionExtractionRun


class QuestionExtractionResultModelMetadataTest(unittest.TestCase):
    def test_columns_match_immutable_provenance_contract(self) -> None:
        table = QuestionExtractionResult.__table__
        self.assertEqual(table.name, "question_extraction_results")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "question_extraction_run_id", "schema_version",
                "processor_name", "processor_version", "provider_name",
                "model_name", "prompt_version", "created_at", "updated_at",
                "deleted_at", "processing_version", "analysis_data",
            },
        )
        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)
        self.assertIsInstance(table.c.question_extraction_run_id.type, UUID)
        self.assertFalse(table.c.question_extraction_run_id.nullable)
        self.assertIsInstance(table.c.schema_version.type, Integer)
        self.assertFalse(table.c.schema_version.nullable)
        self.assertEqual(table.c.schema_version.default.arg, 1)
        self.assertEqual(str(table.c.schema_version.server_default.arg), "1")
        lengths = {
            "processor_name": 100, "processor_version": 100,
            "provider_name": 100, "model_name": 200, "prompt_version": 100,
            "processing_version": 100,
        }
        for name, length in lengths.items():
            with self.subTest(name=name):
                self.assertIsInstance(table.c[name].type, String)
                self.assertEqual(table.c[name].type.length, length)
        self.assertFalse(table.c.processor_name.nullable)
        self.assertFalse(table.c.processor_version.nullable)
        self.assertTrue(table.c.provider_name.nullable)
        self.assertTrue(table.c.model_name.nullable)
        self.assertTrue(table.c.prompt_version.nullable)
        self.assertFalse(table.c.processing_version.nullable)
        self.assertIsInstance(table.c.analysis_data.type, JSONB)
        self.assertFalse(table.c.analysis_data.nullable)
        for name in ("created_at", "updated_at"):
            self.assertIsInstance(table.c[name].type, DateTime)
            self.assertFalse(table.c[name].nullable)
            self.assertIsNotNone(table.c[name].server_default)
        self.assertTrue(table.c.deleted_at.nullable)

    def test_constraints_relationship_and_scope_are_exact(self) -> None:
        table = QuestionExtractionResult.__table__
        checks = {
            item.name: str(item.sqltext) for item in table.constraints
            if isinstance(item, CheckConstraint)
        }
        self.assertEqual(len(checks), 7)
        self.assertEqual(
            checks["ck_question_extraction_results_schema_version_positive"],
            "schema_version > 0",
        )
        for name in (
            "processor_name", "processor_version", "provider_name",
            "model_name", "prompt_version",
            "processing_version",
        ):
            self.assertIn(
                f"ck_question_extraction_results_{name}_nonblank", checks
            )
        unique = next(
            item for item in table.constraints
            if isinstance(item, UniqueConstraint)
        )
        self.assertEqual(unique.name, "uq_question_extraction_results_run_id")
        self.assertEqual(
            tuple(column.name for column in unique.columns),
            ("question_extraction_run_id",),
        )
        foreign_key = next(iter(table.c.question_extraction_run_id.foreign_keys))
        self.assertEqual(
            foreign_key.target_fullname, "question_extraction_runs.id"
        )
        self.assertEqual(foreign_key.ondelete, "RESTRICT")
        relationship = (
            QuestionExtractionResult.__mapper__.relationships
            .question_extraction_run
        )
        self.assertIs(relationship.mapper.class_, QuestionExtractionRun)
        self.assertFalse(relationship.uselist)
        self.assertNotIn("delete", relationship.cascade)
        self.assertNotIn("delete-orphan", relationship.cascade)
        self.assertNotIn("result", QuestionExtractionRun.__mapper__.relationships)
        self.assertEqual(
            sum(isinstance(column.type, JSONB) for column in table.columns), 1,
        )
        self.assertTrue(
            {
                "raw_provider_request", "raw_provider_response", "api_key",
                "prompt", "prompt_text", "system_prompt", "model_reasoning",
                "source_content", "raw_extracted_text", "normalized_text",
                "question_candidate_id", "source_document_page_id",
            }.isdisjoint(table.columns.keys())
        )
        self.assertIn("question_extraction_results", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
