from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Integer, Numeric, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import QuestionCandidate, QuestionExtractionRun, SourceDocumentPage


class QuestionCandidateModelMetadataTest(unittest.TestCase):
    def test_columns_types_and_nullability_match_foundation_contract(self) -> None:
        table = QuestionCandidate.__table__

        self.assertEqual(table.name, "question_candidates")
        self.assertEqual(
            set(table.c.keys()),
            {
                "id",
                "created_at",
                "updated_at",
                "deleted_at",
                "question_extraction_run_id",
                "source_document_page_id",
                "sequence_number",
                "extracted_text",
                "confidence",
            },
        )

        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)

        self.assertIsInstance(table.c.created_at.type, DateTime)
        self.assertIsInstance(table.c.updated_at.type, DateTime)
        self.assertIsInstance(table.c.deleted_at.type, DateTime)
        self.assertTrue(table.c.deleted_at.nullable)

        self.assertIsInstance(table.c.question_extraction_run_id.type, UUID)
        self.assertFalse(table.c.question_extraction_run_id.nullable)

        self.assertIsInstance(table.c.source_document_page_id.type, UUID)
        self.assertTrue(table.c.source_document_page_id.nullable)

        self.assertIsInstance(table.c.sequence_number.type, Integer)
        self.assertFalse(table.c.sequence_number.nullable)

        self.assertIsInstance(table.c.extracted_text.type, Text)
        self.assertFalse(table.c.extracted_text.nullable)

        self.assertIsInstance(table.c.confidence.type, Numeric)
        self.assertEqual(table.c.confidence.type.precision, 5)
        self.assertEqual(table.c.confidence.type.scale, 4)
        self.assertTrue(table.c.confidence.nullable)

    def test_constraints_match_foundation_contract(self) -> None:
        table = QuestionCandidate.__table__

        checks = {
            item.name: str(item.sqltext)
            for item in table.constraints
            if isinstance(item, CheckConstraint)
        }

        self.assertEqual(
            checks,
            {
                "ck_question_candidates_sequence_positive":
                    "sequence_number > 0",
                "ck_question_candidates_text_nonblank":
                    "char_length(btrim(extracted_text)) > 0",
                "ck_question_candidates_confidence_range":
                    "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            },
        )

        uniques = {
            item.name: tuple(column.name for column in item.columns)
            for item in table.constraints
            if isinstance(item, UniqueConstraint)
        }

        self.assertEqual(
            uniques,
            {
                "uq_question_candidates_run_sequence": (
                    "question_extraction_run_id",
                    "sequence_number",
                )
            },
        )

    def test_foreign_keys_and_relationships_match_foundation_contract(self) -> None:
        table = QuestionCandidate.__table__

        run_fk = next(iter(table.c.question_extraction_run_id.foreign_keys))
        page_fk = next(iter(table.c.source_document_page_id.foreign_keys))

        self.assertEqual(run_fk.target_fullname, "question_extraction_runs.id")
        self.assertEqual(page_fk.target_fullname, "source_document_pages.id")
        self.assertEqual(run_fk.ondelete, "RESTRICT")
        self.assertEqual(page_fk.ondelete, "RESTRICT")

        relationships = QuestionCandidate.__mapper__.relationships

        self.assertEqual(
            set(relationships.keys()),
            {"question_extraction_run", "source_document_page"},
        )
        self.assertIs(
            relationships.question_extraction_run.mapper.class_,
            QuestionExtractionRun,
        )
        self.assertIs(
            relationships.source_document_page.mapper.class_,
            SourceDocumentPage,
        )

        for relationship in relationships:
            self.assertFalse(relationship.uselist)
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

    def test_scope_excludes_redundant_question_bank_review_and_raw_payload_fields(self) -> None:
        table = QuestionCandidate.__table__

        self.assertFalse(
            any(isinstance(column.type, (JSON, JSONB)) for column in table.columns)
        )

        self.assertTrue(
            {
                "source_document_id",
                "question_family_id",
                "question_form_id",
                "question_revision_id",
                "question_type_id",
                "status",
                "approved_at",
                "reviewed_at",
                "reviewed_by_user_id",
                "rejected_at",
                "raw_payload",
                "ocr_payload",
                "provider",
                "model",
                "prompt",
                "bounding_box",
                "coordinates",
            }.isdisjoint(table.c.keys())
        )

        self.assertIn("question_candidates", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
