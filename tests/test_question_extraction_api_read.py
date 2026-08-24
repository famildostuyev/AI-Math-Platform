from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


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

from fastapi import status
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.database.session import get_db
from app.main import app
from app.core.enums import QuestionExtractionRunStatus
from app.models.user import User
from app.schemas.question_extraction import QuestionExtractionOverviewRead
from app.services.question_extraction_read_service import (
    QuestionCandidateView,
    QuestionExtractionOverview,
    QuestionExtractionReadService,
    QuestionExtractionRunSummary,
    QuestionExtractionSuccessfulResultView,
)


NOW = datetime(2026, 8, 20, 12, 0, tzinfo=timezone.utc)


class QuestionExtractionApiReadTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = "admin"
        self.source_id = uuid.uuid4()
        self.user_id = uuid.uuid4()
        self.current_user = SimpleNamespace(
            id=self.user_id,
            last_active_role_id=uuid.uuid4(),
        )

        def override_db():
            yield self.db

        app.dependency_overrides[get_db] = override_db
        app.dependency_overrides[get_current_active_user] = (
            lambda: self.current_user
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _overview(self) -> QuestionExtractionOverview:
        run = QuestionExtractionRunSummary(
            id=uuid.uuid4(),
            run_number=2,
            status=QuestionExtractionRunStatus.SUCCEEDED,
            requested_by_user_id=self.user_id,
            started_at=NOW,
            completed_at=NOW,
            failure_message=None,
        )
        candidate = QuestionCandidateView(
            id=uuid.uuid4(),
            sequence_number=1,
            extracted_text="2x + 3 = 7",
            confidence=Decimal("0.9800"),
            source_document_page_id=uuid.uuid4(),
            page_number=4,
        )
        return QuestionExtractionOverview(
            source_document_id=self.source_id,
            media_asset_id=uuid.uuid4(),
            question_source_id=uuid.uuid4(),
            uploaded_by_user_id=self.user_id,
            latest_run=run,
            latest_successful_result=QuestionExtractionSuccessfulResultView(
                run=run,
                candidate_count=1,
                candidates=(candidate,),
            ),
        )

    def test_admin_get_overview_returns_candidates_in_exact_shape(self) -> None:
        # RED contract test: router endpoint does not exist yet.
        with patch(
            "app.api.question_extraction.QuestionExtractionReadService"
        ) as service_class:
            overview = self._overview()
            service_class.return_value.get_overview.return_value = overview
            response = TestClient(app).get(
                f"/api/v1/sources/{self.source_id}/question-extraction",
                headers={"Authorization": "Bearer test-admin-token"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["source_document_id"], str(self.source_id))
        self.assertEqual(
            body["latest_successful_result"]["candidate_count"],
            1,
        )
        self.assertEqual(
            body["latest_successful_result"]["candidates"][0],
            {
                "id": str(
                    overview.latest_successful_result.candidates[0].id
                ),
                "sequence_number": 1,
                "extracted_text": "2x + 3 = 7",
                "confidence": "0.9800",
                "source_document_page_id": str(
                    overview.latest_successful_result.candidates[0]
                    .source_document_page_id
                ),
                "page_number": 4,
            },
        )

    def test_admin_get_overview_exposes_complete_analysis_result(self) -> None:
        overview = self._overview()
        successful_run = overview.latest_successful_result.run
        questions = []
        for variant in ("C", "D"):
            for number in range(1, 13):
                questions.append({
                    "id": str(uuid.uuid4()),
                    "sequence_number": len(questions) + 1,
                    "question_number": f"Variant {variant} / {number}",
                    "variant": f"Variant {variant}",
                    "source_pages": [{
                        "source_document_page_id": str(uuid.uuid4()),
                        "page_number": 1,
                    }],
                    "question_text": f"Question {variant}/{number}",
                    "content": ({
                        "format_version": 1,
                        "segments": [
                            {"type": "text", "text": "Find "},
                            {
                                "type": "math",
                                "latex": "x^2",
                                "source_text": "x²",
                                "display_mode": False,
                            },
                        ],
                    } if variant == "C" and number == 1 else None),
                    "answer_options": [],
                    "confidence": "0.9",
                    "needs_review": False,
                    "corrections": [],
                    "visual_required": False,
                })
        analysis_result = SimpleNamespace(
            id=uuid.uuid4(),
            question_extraction_run_id=successful_run.id,
            schema_version=1,
            processor_name="openai_document_analysis",
            processor_version="1",
            provider_name="openai",
            model_name="gpt-5-mini",
            prompt_version="question-analysis-v2",
            processing_version="1",
            analysis_data={
                "detected_language": "az",
                "total_questions": 24,
                "blocks": [
                    {"name": "Variant C", "question_count": 12},
                    {"name": "Variant D", "question_count": 12},
                ],
                "needs_review_count": 0,
                "corrections_count": 0,
                "visual_required_count": 0,
                "multi_page_question_count": 0,
                "questions": questions,
            },
        )
        overview = QuestionExtractionOverview(
            source_document_id=overview.source_document_id,
            media_asset_id=overview.media_asset_id,
            question_source_id=overview.question_source_id,
            uploaded_by_user_id=overview.uploaded_by_user_id,
            latest_run=overview.latest_run,
            latest_successful_result=QuestionExtractionSuccessfulResultView(
                run=successful_run,
                candidate_count=0,
                candidates=(),
                analysis_result=analysis_result,
            ),
        )

        with patch(
            "app.api.question_extraction.QuestionExtractionReadService"
        ) as service_class:
            service_class.return_value.get_overview.return_value = overview
            response = self.client.get(
                f"/api/v1/sources/{self.source_id}/question-extraction",
                headers={"Authorization": "Bearer test-admin-token"},
            )

        self.assertEqual(response.status_code, 200)
        result = response.json()["latest_successful_result"]["analysis_result"]
        self.assertIsNotNone(result)
        self.assertEqual(result["run_id"], str(successful_run.id))
        self.assertEqual(result["analysis"]["total_questions"], 24)
        self.assertEqual(
            [block["question_count"] for block in result["analysis"]["blocks"]],
            [12, 12],
        )
        self.assertEqual(
            [question["question_number"] for question in result["analysis"]["questions"]],
            [
                *(f"Variant C / {number}" for number in range(1, 13)),
                *(f"Variant D / {number}" for number in range(1, 13)),
            ],
        )
        first_question = result["analysis"]["questions"][0]
        self.assertEqual(first_question["question_text"], "Question C/1")
        self.assertEqual(
            [segment["type"] for segment in first_question["content"]["segments"]],
            ["text", "math"],
        )
        self.assertIsNone(result["analysis"]["questions"][1]["content"])
        self.assertEqual(
            response.json()["latest_successful_result"]["candidate_count"],
            0,
        )

    def test_admin_get_overview_maps_missing_source_to_404(self) -> None:
        from fastapi.testclient import TestClient
        from app.services.question_extraction_read_service import (
            QuestionExtractionReadSourceNotFoundError,
        )

        with patch(
            "app.api.question_extraction.QuestionExtractionReadService"
        ) as service_class:
            service_class.return_value.get_overview.side_effect = (
                QuestionExtractionReadSourceNotFoundError(
                    "missing"
                )
            )
            response = TestClient(app).get(
                f"/api/v1/sources/{self.source_id}/question-extraction",
                headers={"Authorization": "Bearer test-admin-token"},
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_schema_is_strict_and_from_attributes_enabled(self) -> None:
        self.assertTrue(
            QuestionExtractionOverviewRead.model_config["from_attributes"]
        )
        self.assertEqual(
            QuestionExtractionOverviewRead.model_config["extra"],
            "forbid",
        )


if __name__ == "__main__":
    unittest.main()
