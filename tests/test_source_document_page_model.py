from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import SourceDocument, SourceDocumentPage


class SourceDocumentPageModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_page_identity_contract(self) -> None:
        table = SourceDocumentPage.__table__

        self.assertEqual(table.name, "source_document_pages")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "source_document_id", "page_number", "created_at",
                "updated_at", "deleted_at",
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
        self.assertIsInstance(table.c.source_document_id.type, UUID)
        self.assertFalse(table.c.source_document_id.nullable)
        self.assertIsInstance(table.c.page_number.type, Integer)
        self.assertFalse(table.c.page_number.nullable)
        self.assertFalse(bool(table.c.page_number.unique))

        foreign_key = next(iter(table.c.source_document_id.foreign_keys))
        self.assertEqual(foreign_key.target_fullname, "source_documents.id")
        self.assertEqual(foreign_key.ondelete, "RESTRICT")

        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            checks,
            {"ck_source_document_pages_number_positive": "page_number > 0"},
        )
        unique_constraints = {
            constraint.name: tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        self.assertEqual(
            unique_constraints,
            {
                "uq_source_document_pages_document_number": (
                    "source_document_id", "page_number",
                ),
            },
        )
        self.assertEqual(set(table.indexes), set())

    def test_relationship_is_scalar_unidirectional_and_non_cascading(self) -> None:
        relationships = SourceDocumentPage.__mapper__.relationships

        self.assertEqual(set(relationships.keys()), {"source_document"})
        relationship = relationships.source_document
        self.assertIs(relationship.mapper.class_, SourceDocument)
        self.assertFalse(relationship.uselist)
        self.assertNotIn("delete", relationship.cascade)
        self.assertNotIn("delete-orphan", relationship.cascade)
        self.assertNotIn("pages", SourceDocument.__mapper__.relationships.keys())

    def test_scope_excludes_processing_media_and_question_bank_fields(self) -> None:
        table = SourceDocumentPage.__table__

        self.assertTrue(
            {
                "media_asset_id", "rendered_media_asset_id", "crop_asset_id",
                "width", "height", "rotation", "printed_page_label",
                "ocr_text", "extracted_text", "quality_score", "status",
                "pre_analysis_data", "formula_count", "image_count",
                "candidate_count", "region_id", "question_id",
                "question_form_id", "question_revision_id",
                "content_block_id", "ai_metadata",
            }.isdisjoint(table.c.keys())
        )
        self.assertIn("source_document_pages", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
