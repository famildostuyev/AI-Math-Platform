from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.database.base import Base
from app.models import MediaAsset, QuestionSource, SourceDocument, User


class SourceDocumentModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_source_document_identity_contract(self) -> None:
        table = SourceDocument.__table__

        self.assertEqual(table.name, "source_documents")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "media_asset_id", "question_source_id",
                "uploaded_by_user_id", "created_at", "updated_at",
                "deleted_at",
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

        self.assertIsInstance(table.c.media_asset_id.type, UUID)
        self.assertFalse(table.c.media_asset_id.nullable)
        self.assertIsInstance(table.c.question_source_id.type, UUID)
        self.assertTrue(table.c.question_source_id.nullable)
        self.assertTrue(table.c.question_source_id.index)
        self.assertIsInstance(table.c.uploaded_by_user_id.type, UUID)
        self.assertTrue(table.c.uploaded_by_user_id.nullable)
        self.assertTrue(table.c.uploaded_by_user_id.index)

        foreign_keys = {
            foreign_key.parent.name: (
                foreign_key.target_fullname,
                foreign_key.ondelete,
            )
            for foreign_key in table.foreign_keys
        }
        self.assertEqual(
            foreign_keys,
            {
                "media_asset_id": ("media_assets.id", "RESTRICT"),
                "question_source_id": ("question_sources.id", "RESTRICT"),
                "uploaded_by_user_id": ("users.id", "SET NULL"),
            },
        )

        unique_constraints = {
            constraint.name: tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        self.assertEqual(
            unique_constraints,
            {"uq_source_documents_media_asset_id": ("media_asset_id",)},
        )
        indexes = {
            index.name: (
                tuple(column.name for column in index.columns),
                index.unique,
            )
            for index in table.indexes
        }
        self.assertEqual(
            indexes,
            {
                "ix_source_documents_question_source_id": (
                    ("question_source_id",), False,
                ),
                "ix_source_documents_uploaded_by_user_id": (
                    ("uploaded_by_user_id",), False,
                ),
            },
        )

    def test_relationships_are_scalar_unidirectional_and_non_cascading(self) -> None:
        relationships = SourceDocument.__mapper__.relationships

        self.assertEqual(
            set(relationships.keys()),
            {"media_asset", "question_source", "uploaded_by_user"},
        )
        self.assertIs(relationships.media_asset.mapper.class_, MediaAsset)
        self.assertIs(
            relationships.question_source.mapper.class_, QuestionSource,
        )
        self.assertIs(relationships.uploaded_by_user.mapper.class_, User)
        for relationship in relationships:
            self.assertFalse(relationship.uselist)
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)

        self.assertNotIn(
            "source_documents", MediaAsset.__mapper__.relationships.keys(),
        )
        self.assertNotIn(
            "source_documents", QuestionSource.__mapper__.relationships.keys(),
        )
        self.assertNotIn(
            "source_documents", User.__mapper__.relationships.keys(),
        )

    def test_scope_excludes_processing_and_question_bank_ownership(self) -> None:
        table = SourceDocument.__table__

        self.assertTrue(
            {
                "source_type", "status", "processing_status", "ai_status",
                "ocr_status", "title", "page_count", "ocr_text",
                "processing_error", "progress", "detected_question_count",
                "candidate_count", "question_id", "question_form_id",
                "question_revision_id", "content_block_id",
                "original_filename", "mime_type", "storage_key",
                "size_bytes", "sha256", "width", "height",
            }.isdisjoint(table.c.keys())
        )
        self.assertIn("source_documents", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
