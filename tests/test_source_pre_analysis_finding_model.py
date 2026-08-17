from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Enum, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core import enums
from app.core.enums import SourcePreAnalysisFindingSeverity
from app.database.base import Base
from app.models import (
    SourceDocumentPage,
    SourcePreAnalysisFinding,
    SourcePreAnalysisResult,
)


class SourcePreAnalysisFindingModelMetadataTest(unittest.TestCase):
    def test_columns_types_and_nullability_match_contract(self) -> None:
        table = SourcePreAnalysisFinding.__table__

        self.assertEqual(table.name, "source_pre_analysis_findings")
        self.assertEqual(
            set(table.c.keys()),
            {
                "id", "created_at", "updated_at", "deleted_at",
                "source_pre_analysis_result_id", "source_document_page_id",
                "sequence_number", "finding_code", "severity", "confidence",
                "message",
            },
        )
        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)
        self.assertIsInstance(table.c.created_at.type, DateTime)
        self.assertIsInstance(table.c.updated_at.type, DateTime)
        self.assertIsInstance(table.c.deleted_at.type, DateTime)
        self.assertTrue(table.c.deleted_at.nullable)
        self.assertIsInstance(table.c.source_pre_analysis_result_id.type, UUID)
        self.assertFalse(table.c.source_pre_analysis_result_id.nullable)
        self.assertIsInstance(table.c.source_document_page_id.type, UUID)
        self.assertTrue(table.c.source_document_page_id.nullable)
        self.assertIsInstance(table.c.sequence_number.type, Integer)
        self.assertFalse(table.c.sequence_number.nullable)
        self.assertIsInstance(table.c.finding_code.type, String)
        self.assertEqual(table.c.finding_code.type.length, 100)
        self.assertFalse(table.c.finding_code.nullable)
        self.assertIsInstance(table.c.severity.type, Enum)
        self.assertFalse(table.c.severity.nullable)
        self.assertFalse(table.c.severity.type.native_enum)
        self.assertTrue(table.c.severity.type.create_constraint)
        self.assertEqual(table.c.severity.type.enums, ["info", "warning", "error"])
        self.assertIsInstance(table.c.confidence.type, Numeric)
        self.assertEqual(table.c.confidence.type.precision, 5)
        self.assertEqual(table.c.confidence.type.scale, 4)
        self.assertTrue(table.c.confidence.nullable)
        self.assertIsInstance(table.c.message.type, Text)
        self.assertFalse(table.c.message.nullable)

    def test_constraints_and_index_match_contract(self) -> None:
        table = SourcePreAnalysisFinding.__table__
        checks = {
            item.name: str(item.sqltext)
            for item in table.constraints
            if isinstance(item, CheckConstraint)
        }
        self.assertEqual(
            checks,
            {
                "ck_source_pre_analysis_findings_sequence_positive":
                    "sequence_number > 0",
                "ck_source_pre_analysis_findings_code_nonblank":
                    "char_length(btrim(finding_code)) > 0",
                "ck_source_pre_analysis_findings_message_nonblank":
                    "char_length(btrim(message)) > 0",
                "ck_source_pre_analysis_findings_confidence_range":
                    "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
                "source_pre_analysis_finding_severity":
                    "source_pre_analysis_findings.severity IN (__[POSTCOMPILE_param_1])",
            },
        )
        uniques = {
            item.name: tuple(column.name for column in item.columns)
            for item in table.constraints
            if isinstance(item, UniqueConstraint)
        }
        self.assertEqual(
            uniques,
            {"uq_source_pre_analysis_findings_result_sequence": (
                "source_pre_analysis_result_id", "sequence_number",
            )},
        )
        self.assertEqual(
            {index.name: tuple(column.name for column in index.columns)
             for index in table.indexes},
            {"ix_source_pre_analysis_findings_source_document_page_id": (
                "source_document_page_id",
            )},
        )

    def test_foreign_keys_relationships_and_service_owned_scope(self) -> None:
        table = SourcePreAnalysisFinding.__table__
        result_fk = next(iter(table.c.source_pre_analysis_result_id.foreign_keys))
        page_fk = next(iter(table.c.source_document_page_id.foreign_keys))
        self.assertEqual(result_fk.target_fullname, "source_pre_analysis_results.id")
        self.assertEqual(page_fk.target_fullname, "source_document_pages.id")
        self.assertEqual(result_fk.ondelete, "RESTRICT")
        self.assertEqual(page_fk.ondelete, "RESTRICT")

        relationships = SourcePreAnalysisFinding.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {"source_pre_analysis_result", "source_document_page"},
        )
        self.assertIs(
            relationships.source_pre_analysis_result.mapper.class_,
            SourcePreAnalysisResult,
        )
        self.assertIs(
            relationships.source_document_page.mapper.class_, SourceDocumentPage,
        )
        for relationship in relationships:
            self.assertFalse(relationship.uselist)
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)
        self.assertNotIn(
            "findings", SourcePreAnalysisResult.__mapper__.relationships.keys(),
        )
        self.assertNotIn(
            "pre_analysis_findings", SourceDocumentPage.__mapper__.relationships.keys(),
        )
        # Same-document result/page consistency is intentionally service-owned.
        self.assertNotIn("source_document_id", table.c)

    def test_scope_excludes_speculative_or_unsafe_fields(self) -> None:
        table = SourcePreAnalysisFinding.__table__
        self.assertFalse(
            any(isinstance(column.type, (JSON, JSONB)) for column in table.columns)
        )
        self.assertTrue(
            {
                "provider", "model", "raw_label", "ocr_text", "raw_source_text",
                "payload", "prompt", "stack_trace", "bounding_box", "coordinates",
                "region", "crop", "question_id", "candidate_question_id",
                "approved_at", "reviewed_at", "reviewed_by_user_id", "resolved_at",
                "finding_count", "warning_count", "error_count",
            }.isdisjoint(table.c.keys())
        )
        self.assertFalse(hasattr(enums, "SourcePreAnalysisFindingCode"))
        self.assertEqual(
            [member.value for member in SourcePreAnalysisFindingSeverity],
            ["info", "warning", "error"],
        )
        self.assertIn("source_pre_analysis_findings", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
