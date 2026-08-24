from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


os.environ["DATABASE_URL"] = (
    "postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
)
os.environ["APP_ENV"] = "testing"
os.environ["DEBUG"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"] = "test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.enums import QuestionExtractionRunStatus
from app.services.question_extraction_read_service import (
    QuestionCandidateView,
    QuestionExtractionOverview,
    QuestionExtractionReadService,
    QuestionExtractionReadSourceNotFoundError,
    QuestionExtractionRunSummary,
    QuestionExtractionSuccessfulResultView,
)


NOW = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)


class QuestionExtractionReadServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.source_id = uuid.uuid4()
        self.media_id = uuid.uuid4()

        self.source = SimpleNamespace(
            id=self.source_id,
            media_asset_id=self.media_id,
            question_source_id=uuid.uuid4(),
            uploaded_by_user_id=uuid.uuid4(),
        )

    @staticmethod
    def _run(
        *,
        source_document_id: uuid.UUID,
        status: QuestionExtractionRunStatus,
        run_number: int,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            source_document_id=source_document_id,
            run_number=run_number,
            status=status,
            requested_by_user_id=uuid.uuid4(),
            started_at=(
                None
                if status == QuestionExtractionRunStatus.PENDING
                else NOW
            ),
            completed_at=(
                NOW
                if status in {
                    QuestionExtractionRunStatus.SUCCEEDED,
                    QuestionExtractionRunStatus.FAILED,
                }
                else None
            ),
            failure_message=(
                "Safe failure."
                if status == QuestionExtractionRunStatus.FAILED
                else None
            ),
        )

    def test_missing_source_raises_typed_error(self) -> None:
        self.db.scalar.return_value = None

        with self.assertRaises(
            QuestionExtractionReadSourceNotFoundError
        ):
            QuestionExtractionReadService(self.db).get_overview(
                source_document_id=self.source_id,
            )

    def test_no_runs_returns_source_identity_with_empty_state(self) -> None:
        self.db.scalar.side_effect = [self.source, None]
        self.db.execute.return_value.first.return_value = None

        overview = QuestionExtractionReadService(self.db).get_overview(
            source_document_id=self.source_id,
        )

        self.assertEqual(
            overview,
            QuestionExtractionOverview(
                source_document_id=self.source_id,
                media_asset_id=self.media_id,
                question_source_id=self.source.question_source_id,
                uploaded_by_user_id=self.source.uploaded_by_user_id,
                latest_run=None,
                latest_successful_result=None,
            ),
        )

    def test_latest_run_is_projected_independently_from_latest_success(self) -> None:
        latest = self._run(
            source_document_id=self.source_id,
            status=QuestionExtractionRunStatus.RUNNING,
            run_number=5,
        )
        successful = self._run(
            source_document_id=self.source_id,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            run_number=4,
        )

        self.db.scalar.side_effect = [self.source, latest]
        self.db.execute.return_value.first.return_value = (successful,)

        # no candidates for the successful run
        self.db.execute.return_value.all.return_value = []

        overview = QuestionExtractionReadService(self.db).get_overview(
            source_document_id=self.source_id,
        )

        self.assertEqual(
            overview.latest_run,
            QuestionExtractionRunSummary(
                id=latest.id,
                run_number=5,
                status=QuestionExtractionRunStatus.RUNNING,
                requested_by_user_id=latest.requested_by_user_id,
                started_at=NOW,
                completed_at=None,
                failure_message=None,
            ),
        )
        self.assertEqual(
            overview.latest_successful_result.run.id,
            successful.id,
        )
        self.assertEqual(
            overview.latest_successful_result.candidates,
            (),
        )

    def test_successful_candidates_are_ordered_and_include_page_number(self) -> None:
        successful = self._run(
            source_document_id=self.source_id,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            run_number=3,
        )
        self.db.scalar.side_effect = [self.source, successful]

        page_1_id = uuid.uuid4()
        page_2_id = uuid.uuid4()
        candidate_1 = SimpleNamespace(
            id=uuid.uuid4(),
            question_extraction_run_id=successful.id,
            source_document_page_id=page_1_id,
            sequence_number=1,
            extracted_text="First question",
            confidence=Decimal("0.9500"),
        )
        candidate_2 = SimpleNamespace(
            id=uuid.uuid4(),
            question_extraction_run_id=successful.id,
            source_document_page_id=page_2_id,
            sequence_number=2,
            extracted_text="Second question",
            confidence=None,
        )

        first_execute = MagicMock()
        first_execute.first.return_value = (successful,)
        candidate_execute = MagicMock()
        candidate_execute.all.return_value = [
            (candidate_1, 2),
            (candidate_2, 5),
        ]
        self.db.execute.side_effect = [
            first_execute,
            candidate_execute,
        ]

        overview = QuestionExtractionReadService(self.db).get_overview(
            source_document_id=self.source_id,
        )

        result = overview.latest_successful_result
        self.assertIsInstance(
            result,
            QuestionExtractionSuccessfulResultView,
        )
        self.assertEqual(result.candidate_count, 2)
        self.assertEqual(
            result.candidates,
            (
                QuestionCandidateView(
                    id=candidate_1.id,
                    sequence_number=1,
                    extracted_text="First question",
                    confidence=Decimal("0.9500"),
                    source_document_page_id=page_1_id,
                    page_number=2,
                ),
                QuestionCandidateView(
                    id=candidate_2.id,
                    sequence_number=2,
                    extracted_text="Second question",
                    confidence=None,
                    source_document_page_id=page_2_id,
                    page_number=5,
                ),
            ),
        )

    def test_successful_run_projects_its_active_analysis_result(self) -> None:
        successful = self._run(
            source_document_id=self.source_id,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            run_number=7,
        )
        analysis_result = SimpleNamespace(
            id=uuid.uuid4(),
            question_extraction_run_id=successful.id,
            analysis_data={"total_questions": 24},
            deleted_at=None,
        )
        self.db.scalar.side_effect = [self.source, successful]
        successful_execute = MagicMock()
        successful_execute.first.return_value = (
            successful,
            analysis_result,
        )
        candidate_execute = MagicMock()
        candidate_execute.all.return_value = []
        self.db.execute.side_effect = [
            successful_execute,
            candidate_execute,
        ]

        overview = QuestionExtractionReadService(self.db).get_overview(
            source_document_id=self.source_id,
        )

        projected = overview.latest_successful_result.analysis_result
        self.assertIs(projected, analysis_result)
        self.assertEqual(projected.id, analysis_result.id)
        self.assertEqual(projected.analysis_data["total_questions"], 24)
        self.assertEqual(overview.latest_successful_result.candidate_count, 0)

        statement = self.db.execute.call_args_list[0].args[0]
        sql = str(statement)
        self.assertIn("LEFT OUTER JOIN question_extraction_results", sql)
        self.assertIn("question_extraction_results.deleted_at IS NULL", sql)

    def test_soft_deleted_analysis_result_is_not_projected(self) -> None:
        successful = self._run(
            source_document_id=self.source_id,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            run_number=7,
        )
        self.db.scalar.side_effect = [self.source, successful]
        successful_execute = MagicMock()
        successful_execute.first.return_value = (successful, None)
        candidate_execute = MagicMock()
        candidate_execute.all.return_value = []
        self.db.execute.side_effect = [
            successful_execute,
            candidate_execute,
        ]

        overview = QuestionExtractionReadService(self.db).get_overview(
            source_document_id=self.source_id,
        )

        self.assertIsNone(
            overview.latest_successful_result.analysis_result
        )
        statement = self.db.execute.call_args_list[0].args[0]
        self.assertIn(
            "question_extraction_results.deleted_at IS NULL",
            str(statement),
        )

    def test_document_level_candidate_preserves_null_page_identity(self) -> None:
        successful = self._run(
            source_document_id=self.source_id,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            run_number=1,
        )
        self.db.scalar.side_effect = [self.source, successful]

        candidate = SimpleNamespace(
            id=uuid.uuid4(),
            question_extraction_run_id=successful.id,
            source_document_page_id=None,
            sequence_number=1,
            extracted_text="Document-level candidate",
            confidence=Decimal("0.5000"),
        )

        first_execute = MagicMock()
        first_execute.first.return_value = (successful,)
        candidate_execute = MagicMock()
        candidate_execute.all.return_value = [(candidate, None)]
        self.db.execute.side_effect = [
            first_execute,
            candidate_execute,
        ]

        overview = QuestionExtractionReadService(self.db).get_overview(
            source_document_id=self.source_id,
        )

        view = overview.latest_successful_result.candidates[0]
        self.assertIsNone(view.source_document_page_id)
        self.assertIsNone(view.page_number)

    def test_queries_are_read_only_and_deterministic(self) -> None:
        latest = self._run(
            source_document_id=self.source_id,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            run_number=2,
        )
        self.db.scalar.side_effect = [self.source, latest]

        successful_execute = MagicMock()
        successful_execute.first.return_value = (latest,)
        candidate_execute = MagicMock()
        candidate_execute.all.return_value = []
        self.db.execute.side_effect = [
            successful_execute,
            candidate_execute,
        ]

        QuestionExtractionReadService(self.db).get_overview(
            source_document_id=self.source_id,
        )

        latest_statement = self.db.scalar.call_args_list[1].args[0]
        latest_sql = str(latest_statement)
        self.assertIn("ORDER BY", latest_sql)
        self.assertIn("question_extraction_runs.run_number DESC", latest_sql)
        self.assertNotIn("FOR UPDATE", latest_sql)

        successful_statement = self.db.execute.call_args_list[0].args[0]
        successful_sql = str(successful_statement)
        self.assertIn("question_extraction_runs.status", successful_sql)
        self.assertIn("ORDER BY", successful_sql)
        self.assertNotIn("FOR UPDATE", successful_sql)

        candidate_statement = self.db.execute.call_args_list[1].args[0]
        candidate_sql = str(candidate_statement)
        self.assertIn("question_candidates.sequence_number", candidate_sql)
        self.assertIn("source_document_pages.page_number", candidate_sql)
        self.assertIn("ORDER BY", candidate_sql)
        self.assertNotIn("FOR UPDATE", candidate_sql)

        self.db.add.assert_not_called()
        self.db.add_all.assert_not_called()
        self.db.flush.assert_not_called()
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()


if __name__ == "__main__":
    unittest.main()
