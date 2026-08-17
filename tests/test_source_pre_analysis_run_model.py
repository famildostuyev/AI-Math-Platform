from __future__ import annotations

import sys
import unittest
from pathlib import Path

from sqlalchemy import CheckConstraint, DateTime, Enum, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import SourcePreAnalysisRunStatus
from app.database.base import Base
from app.models import SourceDocument, SourcePreAnalysisRun, User


class SourcePreAnalysisRunModelMetadataTest(unittest.TestCase):
    def test_metadata_matches_run_lifecycle_contract(self) -> None:
        table = SourcePreAnalysisRun.__table__

        self.assertEqual(table.name, "source_pre_analysis_runs")
        self.assertEqual(
            set(table.columns.keys()),
            {
                "id", "source_document_id", "run_number", "status",
                "requested_by_user_id", "started_at", "completed_at",
                "failure_message", "created_at", "updated_at", "deleted_at",
            },
        )
        self.assertIsInstance(table.c.id.type, UUID)
        self.assertTrue(table.c.id.primary_key)
        self.assertFalse(table.c.id.nullable)
        self.assertFalse(table.c.created_at.nullable)
        self.assertFalse(table.c.updated_at.nullable)
        self.assertTrue(table.c.deleted_at.nullable)
        self.assertIsInstance(table.c.source_document_id.type, UUID)
        self.assertFalse(table.c.source_document_id.nullable)
        self.assertIsInstance(table.c.run_number.type, Integer)
        self.assertFalse(table.c.run_number.nullable)
        self.assertIsInstance(table.c.status.type, Enum)
        self.assertFalse(table.c.status.type.native_enum)
        self.assertTrue(table.c.status.type.create_constraint)
        self.assertEqual(
            table.c.status.type.enums,
            ["pending", "running", "succeeded", "failed"],
        )
        self.assertFalse(table.c.status.nullable)
        self.assertTrue(table.c.requested_by_user_id.nullable)
        self.assertTrue(table.c.requested_by_user_id.index)
        for column in (table.c.started_at, table.c.completed_at):
            self.assertIsInstance(column.type, DateTime)
            self.assertTrue(column.type.timezone)
            self.assertTrue(column.nullable)
        self.assertIsInstance(table.c.failure_message.type, Text)
        self.assertTrue(table.c.failure_message.nullable)

    def test_constraints_and_indexes_match_lifecycle_policy(self) -> None:
        table = SourcePreAnalysisRun.__table__
        checks = {
            constraint.name: str(constraint.sqltext)
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        self.assertEqual(
            set(checks),
            {
                "ck_source_pre_analysis_runs_number_positive",
                "ck_source_pre_analysis_runs_lifecycle_consistent",
                "ck_source_pre_analysis_runs_time_order",
                "source_pre_analysis_run_status",
            },
        )
        self.assertEqual(
            checks["ck_source_pre_analysis_runs_number_positive"],
            "run_number > 0",
        )
        lifecycle = checks["ck_source_pre_analysis_runs_lifecycle_consistent"]
        for value in SourcePreAnalysisRunStatus:
            self.assertIn(f"status = '{value.value}'", lifecycle)
        self.assertIn("char_length(btrim(failure_message)) > 0", lifecycle)
        self.assertEqual(
            checks["ck_source_pre_analysis_runs_time_order"],
            "started_at IS NULL OR completed_at IS NULL "
            "OR completed_at >= started_at",
        )
        uniques = {
            constraint.name: tuple(column.name for column in constraint.columns)
            for constraint in table.constraints
            if isinstance(constraint, UniqueConstraint)
        }
        self.assertEqual(
            uniques,
            {
                "uq_source_pre_analysis_runs_document_number": (
                    "source_document_id", "run_number",
                ),
            },
        )
        indexes = {
            index.name: tuple(column.name for column in index.columns)
            for index in table.indexes
        }
        self.assertEqual(
            indexes,
            {"ix_source_pre_analysis_runs_requested_by_user_id": (
                "requested_by_user_id",
            )},
        )

    def test_relationships_and_scope_are_strictly_lifecycle_only(self) -> None:
        table = SourcePreAnalysisRun.__table__
        foreign_keys = {
            foreign_key.parent.name: (
                foreign_key.target_fullname, foreign_key.ondelete,
            )
            for foreign_key in table.foreign_keys
        }
        self.assertEqual(
            foreign_keys,
            {
                "source_document_id": ("source_documents.id", "RESTRICT"),
                "requested_by_user_id": ("users.id", "SET NULL"),
            },
        )
        relationships = SourcePreAnalysisRun.__mapper__.relationships
        self.assertEqual(
            set(relationships.keys()),
            {"source_document", "requested_by_user"},
        )
        self.assertIs(relationships.source_document.mapper.class_, SourceDocument)
        self.assertIs(relationships.requested_by_user.mapper.class_, User)
        for relationship in relationships:
            self.assertFalse(relationship.uselist)
            self.assertNotIn("delete", relationship.cascade)
            self.assertNotIn("delete-orphan", relationship.cascade)
        self.assertNotIn(
            "pre_analysis_runs", SourceDocument.__mapper__.relationships.keys(),
        )
        self.assertTrue(
            {
                "page_count", "detected_question_count", "image_count",
                "formula_count", "result_data", "schema_version",
                "parser_version", "model_version", "prompt_version",
                "progress", "page_finding_id", "question_id",
                "question_form_id", "question_revision_id", "content_block_id",
            }.isdisjoint(table.c.keys())
        )
        self.assertIn("source_pre_analysis_runs", Base.metadata.tables)


if __name__ == "__main__":
    unittest.main()
