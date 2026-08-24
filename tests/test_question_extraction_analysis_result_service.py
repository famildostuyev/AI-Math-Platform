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


os.environ["DEBUG"] = "false"
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.api.question_extraction import _map_successful_result
from app.core.enums import QuestionExtractionRunStatus
from app.models.question_extraction_result import QuestionExtractionResult
from app.services.document_analysis_provider import (
    DocumentAnalysis,
    DocumentAnalysisAnswerOption,
    DocumentAnalysisCorrection,
    DocumentAnalysisPageReference,
    DocumentAnalysisProvenance,
    QuestionAnalysis,
)
from app.services.question_extraction_analysis_result_service import (
    QuestionExtractionAnalysisInvalidRunStateError,
    QuestionExtractionAnalysisResultExistsError,
    QuestionExtractionAnalysisResultService,
    map_document_analysis,
)
from app.services.question_extraction_read_service import (
    QuestionExtractionRunSummary,
    QuestionExtractionSuccessfulResultView,
)


class QuestionExtractionAnalysisResultServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.run_id = uuid.uuid4()
        self.page_id = uuid.uuid4()
        reference = DocumentAnalysisPageReference(
            source_document_page_id=self.page_id, page_number=1,
        )
        self.analysis = DocumentAnalysis(
            schema_version=1,
            detected_language="az",
            questions=(
                QuestionAnalysis(
                    question_number="Variant C / 1",
                    question_text="2x - 3 = 7",
                    answer_options=(
                        DocumentAnalysisAnswerOption(label="A", text="5"),
                    ),
                    source_pages=(reference,),
                    visual_required=True,
                    confidence=Decimal("0.875"),
                    needs_review=True,
                    corrections=(
                        DocumentAnalysisCorrection(
                            original_value="2x + 3",
                            normalized_value="2x - 3",
                            reason="Visual minus sign",
                        ),
                    ),
                ),
                QuestionAnalysis(
                    question_number="Variant D / 1",
                    question_text="Second",
                    answer_options=(),
                    source_pages=(reference,),
                    visual_required=False,
                    confidence=Decimal("1"),
                    needs_review=False,
                    corrections=(),
                ),
            ),
            provenance=DocumentAnalysisProvenance(
                provider_name="openai",
                model_name="gpt-5-mini",
                processor_version="1",
                prompt_version="question-analysis-v1",
                schema_version=1,
            ),
        )
        self.payload = map_document_analysis(
            run_id=self.run_id, analysis=self.analysis,
        )

    def test_document_analysis_maps_to_result_payload(self) -> None:
        self.assertEqual(self.payload["total_questions"], 2)
        self.assertEqual(len(self.payload["questions"]), 2)

    def test_provenance_is_persisted_on_result(self) -> None:
        db = MagicMock()
        db.scalar.side_effect = [SimpleNamespace(
            id=self.run_id,
            status=QuestionExtractionRunStatus.RUNNING,
            completed_at=None,
            failure_message=None,
        ), None]
        result = QuestionExtractionAnalysisResultService(db).create_result(
            run_id=self.run_id, analysis=self.analysis,
        )
        self.assertEqual(result.provider_name, "openai")
        self.assertEqual(result.model_name, "gpt-5-mini")
        self.assertEqual(result.prompt_version, "question-analysis-v1")
        self.assertEqual(result.processing_version, "1")
        db.commit.assert_called_once_with()

    def test_provider_objects_and_credentials_do_not_leak(self) -> None:
        serialized = repr(self.payload)
        for forbidden in ("api_key", "raw_provider", "OpenAI", "response_id"):
            self.assertNotIn(forbidden, serialized)

    def test_persistence_creates_no_question_candidates(self) -> None:
        db = MagicMock()
        db.scalar.side_effect = [SimpleNamespace(
            id=self.run_id,
            status=QuestionExtractionRunStatus.RUNNING,
            completed_at=None,
            failure_message=None,
        ), None]
        QuestionExtractionAnalysisResultService(db).create_result(
            run_id=self.run_id, analysis=self.analysis,
        )
        added = db.add.call_args.args[0]
        self.assertIsInstance(added, QuestionExtractionResult)
        db.add_all.assert_not_called()

    def test_one_to_one_identity_rejects_existing_result(self) -> None:
        db = MagicMock()
        db.scalar.side_effect = [SimpleNamespace(
            id=self.run_id,
            status=QuestionExtractionRunStatus.RUNNING,
            completed_at=None,
            failure_message=None,
        ), object()]
        with self.assertRaises(QuestionExtractionAnalysisResultExistsError):
            QuestionExtractionAnalysisResultService(db).create_result(
                run_id=self.run_id, analysis=self.analysis,
            )
        db.rollback.assert_called_once_with()
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_running_run_result_and_success_are_committed_atomically(self) -> None:
        run = SimpleNamespace(
            id=self.run_id,
            status=QuestionExtractionRunStatus.RUNNING,
            completed_at=None,
            failure_message=None,
        )
        db = MagicMock()
        db.scalar.side_effect = [run, None]

        result = QuestionExtractionAnalysisResultService(db).create_result(
            run_id=self.run_id, analysis=self.analysis,
        )

        self.assertIsInstance(result, QuestionExtractionResult)
        self.assertEqual(run.status, QuestionExtractionRunStatus.SUCCEEDED)
        self.assertIsNotNone(run.completed_at)
        self.assertIsNone(run.failure_message)
        db.add.assert_called_once_with(result)
        db.commit.assert_called_once_with()
        db.rollback.assert_not_called()

    def test_pending_and_failed_runs_are_rejected(self) -> None:
        for status in (
            QuestionExtractionRunStatus.PENDING,
            QuestionExtractionRunStatus.FAILED,
        ):
            with self.subTest(status=status):
                db = MagicMock()
                run = SimpleNamespace(
                    id=self.run_id,
                    status=status,
                    completed_at=None,
                    failure_message=None,
                )
                db.scalar.side_effect = [run, None]
                with self.assertRaises(
                    QuestionExtractionAnalysisInvalidRunStateError
                ):
                    QuestionExtractionAnalysisResultService(db).create_result(
                        run_id=self.run_id, analysis=self.analysis,
                    )
                db.add.assert_not_called()
                db.commit.assert_not_called()
                db.rollback.assert_called_once_with()

    def test_run_query_uses_for_update(self) -> None:
        db = MagicMock()
        db.scalar.return_value = None
        with self.assertRaises(Exception):
            QuestionExtractionAnalysisResultService(db).create_result(
                run_id=self.run_id, analysis=self.analysis,
            )
        statement = db.scalar.call_args.args[0]
        self.assertIn("FOR UPDATE", str(statement))

    def test_integrity_error_rolls_back_result_and_run_transition(self) -> None:
        from sqlalchemy.exc import IntegrityError

        run = SimpleNamespace(
            id=self.run_id,
            status=QuestionExtractionRunStatus.RUNNING,
            completed_at=None,
            failure_message=None,
        )
        db = MagicMock()
        db.scalar.side_effect = [run, None]
        db.commit.side_effect = IntegrityError("insert", {}, Exception("db"))
        with self.assertRaises(QuestionExtractionAnalysisResultExistsError):
            QuestionExtractionAnalysisResultService(db).create_result(
                run_id=self.run_id, analysis=self.analysis,
            )
        db.rollback.assert_called_once_with()
        db.commit.assert_called_once_with()

    def test_generic_commit_error_rolls_back_and_propagates(self) -> None:
        run = SimpleNamespace(
            id=self.run_id,
            status=QuestionExtractionRunStatus.RUNNING,
            completed_at=None,
            failure_message=None,
        )
        db = MagicMock()
        db.scalar.side_effect = [run, None]
        failure = RuntimeError("status update failed")
        db.commit.side_effect = failure
        with self.assertRaises(RuntimeError) as captured:
            QuestionExtractionAnalysisResultService(db).create_result(
                run_id=self.run_id, analysis=self.analysis,
            )
        self.assertIs(captured.exception, failure)
        db.rollback.assert_called_once_with()

    def test_completed_at_is_server_generated_at_finalization(self) -> None:
        run = SimpleNamespace(
            id=self.run_id,
            status=QuestionExtractionRunStatus.RUNNING,
            completed_at=None,
            failure_message=None,
        )
        db = MagicMock()
        db.scalar.side_effect = [run, None]
        completed_at = datetime(2026, 8, 22, 10, 0, tzinfo=timezone.utc)
        with unittest.mock.patch(
            "app.services.question_extraction_analysis_result_service.utc_now",
            return_value=completed_at,
        ):
            QuestionExtractionAnalysisResultService(db).create_result(
                run_id=self.run_id, analysis=self.analysis,
            )
        self.assertEqual(run.completed_at, completed_at)

    def test_read_mapper_returns_public_analysis_shape(self) -> None:
        now = datetime.now(timezone.utc)
        model = SimpleNamespace(
            question_extraction_run_id=self.run_id,
            schema_version=1,
            processor_name="document-analysis",
            processor_version="1",
            provider_name="openai",
            model_name="gpt-5-mini",
            prompt_version="question-analysis-v1",
            processing_version="1",
            analysis_data=self.payload,
        )
        run = QuestionExtractionRunSummary(
            id=self.run_id, run_number=2,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            requested_by_user_id=None, started_at=now,
            completed_at=now, failure_message=None,
        )
        response = _map_successful_result(
            QuestionExtractionSuccessfulResultView(
                run=run, candidate_count=0, candidates=(),
                analysis_result=model,
            ),
            source_document_id=uuid.uuid4(),
        )
        self.assertEqual(response.analysis_result.run_id, self.run_id)
        self.assertEqual(response.analysis_result.analysis.total_questions, 2)

    def test_variant_c_and_d_are_preserved(self) -> None:
        self.assertEqual(
            self.payload["blocks"],
            [
                {"name": "Variant C", "question_count": 1},
                {"name": "Variant D", "question_count": 1},
            ],
        )

    def test_question_number_is_preserved(self) -> None:
        self.assertEqual(
            self.payload["questions"][0]["question_number"], "Variant C / 1",
        )

    def test_source_page_reference_is_preserved(self) -> None:
        reference = self.payload["questions"][0]["source_pages"][0]
        self.assertEqual(reference["source_document_page_id"], str(self.page_id))
        self.assertEqual(reference["page_number"], 1)

    def test_answer_options_are_preserved(self) -> None:
        self.assertEqual(
            self.payload["questions"][0]["answer_options"],
            [{"label": "A", "text": "5"}],
        )

    def test_confidence_is_preserved_exactly(self) -> None:
        self.assertEqual(self.payload["questions"][0]["confidence"], "0.875")

    def test_needs_review_is_preserved(self) -> None:
        self.assertIs(self.payload["questions"][0]["needs_review"], True)
        self.assertEqual(self.payload["needs_review_count"], 1)

    def test_corrections_are_preserved(self) -> None:
        correction = self.payload["questions"][0]["corrections"][0]
        self.assertEqual(correction["normalized_value"], "2x - 3")
        self.assertEqual(self.payload["corrections_count"], 1)

    def test_analysis_summary_is_preserved(self) -> None:
        self.assertEqual(self.payload["visual_required_count"], 1)
        self.assertEqual(self.payload["multi_page_question_count"], 0)

    def test_empty_and_optional_fields_are_safe(self) -> None:
        second = self.payload["questions"][1]
        self.assertEqual(second["answer_options"], [])
        self.assertEqual(second["corrections"], [])
        self.assertIsNotNone(second["id"])


if __name__ == "__main__":
    unittest.main()
