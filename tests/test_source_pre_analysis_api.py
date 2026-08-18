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
os.environ["REFRESH_TOKEN_HASH_KEY"] = (
    "test-refresh-token-hash-key-000001"
)
os.environ["VERIFICATION_CODE_HASH_KEY"] = (
    "test-verification-code-hash-key-01"
)

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.api.source_pre_analysis import router as source_pre_analysis_router
from app.core.enums import (
    RoleName,
    SourcePreAnalysisFindingSeverity,
    SourcePreAnalysisRunStatus,
)
from app.database.session import get_db
from app.main import app
from app.services.source_pre_analysis_read_service import (
    SourcePreAnalysisFindingView,
    SourcePreAnalysisOverview,
    SourcePreAnalysisReadSourceNotFoundError,
    SourcePreAnalysisRunSummary,
    SourcePreAnalysisSuccessfulResultView,
)
from app.services.source_pre_analysis_service import (
    SourcePreAnalysisActiveRunExistsError,
    SourcePreAnalysisPersistenceConflictError,
    SourcePreAnalysisRequestedByUserNotFoundError,
    SourcePreAnalysisSourceDocumentNotFoundError,
    SourcePreAnalysisValidationError,
)


NOW = datetime(2026, 8, 18, 16, 30, tzinfo=timezone.utc)


class SourcePreAnalysisApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.db = MagicMock()
        self.db.scalar.return_value = RoleName.ADMIN.value
        self.current_user = SimpleNamespace(
            id=uuid.uuid4(),
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

    @staticmethod
    def _run(
        *,
        source_document_id: uuid.UUID,
        status: SourcePreAnalysisRunStatus = SourcePreAnalysisRunStatus.PENDING,
        run_number: int = 1,
        requested_by_user_id: uuid.UUID | None = None,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            id=uuid.uuid4(),
            source_document_id=source_document_id,
            run_number=run_number,
            status=status,
            requested_by_user_id=requested_by_user_id,
            started_at=None if status == SourcePreAnalysisRunStatus.PENDING else NOW,
            completed_at=(
                NOW
                if status in {
                    SourcePreAnalysisRunStatus.SUCCEEDED,
                    SourcePreAnalysisRunStatus.FAILED,
                }
                else None
            ),
            failure_message=(
                "Safe failure."
                if status == SourcePreAnalysisRunStatus.FAILED
                else None
            ),
        )

    @staticmethod
    def _summary(
        *,
        status: SourcePreAnalysisRunStatus,
        run_number: int,
    ) -> SourcePreAnalysisRunSummary:
        return SourcePreAnalysisRunSummary(
            id=uuid.uuid4(),
            run_number=run_number,
            status=status,
            requested_by_user_id=uuid.uuid4(),
            started_at=(
                None if status == SourcePreAnalysisRunStatus.PENDING else NOW
            ),
            completed_at=(
                NOW
                if status in {
                    SourcePreAnalysisRunStatus.SUCCEEDED,
                    SourcePreAnalysisRunStatus.FAILED,
                }
                else None
            ),
            failure_message=(
                "Safe failure."
                if status == SourcePreAnalysisRunStatus.FAILED
                else None
            ),
        )

    @staticmethod
    def _overview(
        *,
        source_document_id: uuid.UUID,
        latest_run: SourcePreAnalysisRunSummary | None = None,
        successful: SourcePreAnalysisSuccessfulResultView | None = None,
    ) -> SourcePreAnalysisOverview:
        return SourcePreAnalysisOverview(
            source_document_id=source_document_id,
            media_asset_id=uuid.uuid4(),
            question_source_id=uuid.uuid4(),
            uploaded_by_user_id=uuid.uuid4(),
            latest_run=latest_run,
            latest_successful_result=successful,
        )

    def test_router_and_production_openapi_expose_exactly_two_routes(self) -> None:
        routes = [
            route for route in source_pre_analysis_router.routes
            if isinstance(route, APIRoute)
        ]
        self.assertEqual(
            {(route.path, frozenset(route.methods)) for route in routes},
            {
                ("/sources/{source_document_id}/pre-analysis/runs",
                 frozenset({"POST"})),
                ("/sources/{source_document_id}/pre-analysis",
                 frozenset({"GET"})),
            },
        )

        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        paths = response.json()["paths"]
        source_paths = {
            path: {
                method.upper()
                for method in operations
                if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}
            }
            for path, operations in paths.items()
            if path.startswith("/api/v1/sources/")
        }
        self.assertEqual(source_paths, {
            "/api/v1/sources/{source_document_id}/pre-analysis/runs": {"POST"},
            "/api/v1/sources/{source_document_id}/pre-analysis": {"GET"},
        })
        post_operation = paths[
            "/api/v1/sources/{source_document_id}/pre-analysis/runs"
        ]["post"]
        self.assertNotIn("requestBody", post_operation)

    @patch("app.api.source_pre_analysis.SourcePreAnalysisService")
    def test_admin_create_delegates_identity_and_returns_exact_201_shape(
        self,
        service_class: MagicMock,
    ) -> None:
        source_id = uuid.uuid4()
        run = self._run(
            source_document_id=source_id,
            requested_by_user_id=self.current_user.id,
        )
        service_class.return_value.create_run.return_value = run

        response = self.client.post(
            f"/api/v1/sources/{source_id}/pre-analysis/runs",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.json()), {
            "id", "source_document_id", "run_number", "status",
            "requested_by_user_id", "started_at", "completed_at",
            "failure_message",
        })
        self.assertEqual(response.json()["source_document_id"], str(source_id))
        self.assertEqual(response.json()["status"], "pending")
        service_class.assert_called_once_with(self.db)
        service_class.return_value.create_run.assert_called_once_with(
            source_document_id=source_id,
            requested_by_user_id=self.current_user.id,
        )
        service_class.return_value.start_run.assert_not_called()
        service_class.return_value.finalize_success.assert_not_called()
        service_class.return_value.mark_failed.assert_not_called()

    @patch("app.api.source_pre_analysis.SourcePreAnalysisService")
    def test_client_body_cannot_control_server_owned_run_fields(
        self,
        service_class: MagicMock,
    ) -> None:
        source_id = uuid.uuid4()
        run = self._run(
            source_document_id=source_id,
            requested_by_user_id=self.current_user.id,
        )
        service_class.return_value.create_run.return_value = run

        response = self.client.post(
            f"/api/v1/sources/{source_id}/pre-analysis/runs",
            json={
                "requested_by_user_id": str(uuid.uuid4()),
                "run_number": 999,
                "status": "succeeded",
                "processor_name": "browser-controlled",
                "processor_version": "999",
                "provider_name": "browser-provider",
                "model_name": "browser-model",
                "prompt_version": "browser-prompt",
            },
        )

        self.assertEqual(response.status_code, 201)
        service_class.return_value.create_run.assert_called_once_with(
            source_document_id=source_id,
            requested_by_user_id=self.current_user.id,
        )

    @patch("app.api.source_pre_analysis.SourcePreAnalysisService")
    def test_create_errors_have_exact_stable_http_contracts(
        self,
        service_class: MagicMock,
    ) -> None:
        cases = (
            (SourcePreAnalysisSourceDocumentNotFoundError("internal"), 404,
             "Source document was not found."),
            (SourcePreAnalysisActiveRunExistsError("internal"), 409,
             "Source document already has an active pre-analysis run."),
            (SourcePreAnalysisPersistenceConflictError("internal"), 409,
             "Pre-analysis run could not be created due to a persistence "
             "conflict."),
            (SourcePreAnalysisValidationError("internal"), 422,
             "Pre-analysis run request is invalid."),
            (SourcePreAnalysisRequestedByUserNotFoundError("internal"), 409,
             "Authenticated requesting user is unavailable."),
        )
        for exception, expected_status, expected_detail in cases:
            with self.subTest(exception=type(exception).__name__):
                service_class.reset_mock()
                service_class.return_value.create_run.side_effect = exception
                source_id = uuid.uuid4()

                response = self.client.post(
                    f"/api/v1/sources/{source_id}/pre-analysis/runs",
                )

                self.assertEqual(response.status_code, expected_status)
                self.assertEqual(response.json(), {"detail": expected_detail})
                self.assertNotIn("internal", response.text)
                service_class.return_value.create_run.side_effect = None

    @patch("app.api.source_pre_analysis.SourcePreAnalysisReadService")
    @patch("app.api.source_pre_analysis.SourcePreAnalysisService")
    def test_authentication_and_admin_role_precede_both_services(
        self,
        write_service: MagicMock,
        read_service: MagicMock,
    ) -> None:
        source_id = uuid.uuid4()
        del app.dependency_overrides[get_current_active_user]

        for method, path in (
            (self.client.post,
             f"/api/v1/sources/{source_id}/pre-analysis/runs"),
            (self.client.get,
             f"/api/v1/sources/{source_id}/pre-analysis"),
        ):
            self.assertEqual(method(path).status_code, 401)
        write_service.assert_not_called()
        read_service.assert_not_called()

        app.dependency_overrides[get_current_active_user] = (
            lambda: self.current_user
        )
        self.db.scalar.return_value = RoleName.TEACHER.value
        for method, path in (
            (self.client.post,
             f"/api/v1/sources/{source_id}/pre-analysis/runs"),
            (self.client.get,
             f"/api/v1/sources/{source_id}/pre-analysis"),
        ):
            self.assertEqual(method(path).status_code, 403)
        write_service.assert_not_called()
        read_service.assert_not_called()

    @patch("app.api.source_pre_analysis.SourcePreAnalysisService")
    @patch("app.api.source_pre_analysis.SourcePreAnalysisReadService")
    def test_admin_get_no_run_maps_identity_without_write_service(
        self,
        read_service: MagicMock,
        write_service: MagicMock,
    ) -> None:
        source_id = uuid.uuid4()
        expected = self._overview(source_document_id=source_id)
        read_service.return_value.get_overview.return_value = expected

        response = self.client.get(
            f"/api/v1/sources/{source_id}/pre-analysis",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "source_document_id": str(source_id),
            "media_asset_id": str(expected.media_asset_id),
            "question_source_id": str(expected.question_source_id),
            "uploaded_by_user_id": str(expected.uploaded_by_user_id),
            "latest_run": None,
            "latest_successful_result": None,
        })
        read_service.assert_called_once_with(self.db)
        read_service.return_value.get_overview.assert_called_once_with(
            source_document_id=source_id,
        )
        write_service.assert_not_called()

    @patch("app.api.source_pre_analysis.SourcePreAnalysisReadService")
    def test_overview_injects_source_identity_and_preserves_complete_result(
        self,
        read_service: MagicMock,
    ) -> None:
        source_id = uuid.uuid4()
        latest = self._summary(
            status=SourcePreAnalysisRunStatus.FAILED,
            run_number=5,
        )
        successful_run = self._summary(
            status=SourcePreAnalysisRunStatus.SUCCEEDED,
            run_number=4,
        )
        page_id = uuid.uuid4()
        first = SourcePreAnalysisFindingView(
            id=uuid.uuid4(), sequence_number=1, finding_code="formula",
            severity=SourcePreAnalysisFindingSeverity.WARNING,
            confidence=Decimal("0.7500"), message="Formula found.",
            source_document_page_id=page_id, page_number=2,
        )
        second = SourcePreAnalysisFindingView(
            id=uuid.uuid4(), sequence_number=2, finding_code="document",
            severity=SourcePreAnalysisFindingSeverity.INFO,
            confidence=None, message="Document-level note.",
            source_document_page_id=None, page_number=None,
        )
        successful = SourcePreAnalysisSuccessfulResultView(
            run=successful_run, result_id=uuid.uuid4(), schema_version=3,
            page_count=8, processor_name="pdf-pre-analysis",
            processor_version="1", provider_name="provider",
            model_name="model", prompt_version="prompt-v3",
            finding_count=2, info_count=1,
            warning_count=1, error_count=0, findings=(first, second),
        )
        internal = self._overview(
            source_document_id=source_id,
            latest_run=latest,
            successful=successful,
        )
        read_service.return_value.get_overview.return_value = internal

        response = self.client.get(
            f"/api/v1/sources/{source_id}/pre-analysis",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["latest_run"]["source_document_id"], str(source_id))
        self.assertEqual(body["latest_run"]["status"], "failed")
        result = body["latest_successful_result"]
        self.assertEqual(set(result), {
            "run", "result_id", "schema_version", "page_count",
            "processor_name", "processor_version", "provider_name",
            "model_name", "prompt_version", "finding_count", "info_count",
            "warning_count", "error_count", "findings",
        })
        self.assertEqual(result["run"]["source_document_id"], str(source_id))
        self.assertEqual(result["run"]["status"], "succeeded")
        self.assertEqual(result["schema_version"], 3)
        self.assertEqual(result["page_count"], 8)
        self.assertEqual(result["processor_name"], "pdf-pre-analysis")
        self.assertEqual(result["processor_version"], "1")
        self.assertEqual(result["provider_name"], "provider")
        self.assertEqual(result["model_name"], "model")
        self.assertEqual(result["prompt_version"], "prompt-v3")
        for field_name in (
            "processor_name", "processor_version", "provider_name",
            "model_name", "prompt_version",
        ):
            self.assertNotIn(field_name, body)
            self.assertNotIn(field_name, body["latest_run"])
        self.assertEqual(
            (result["finding_count"], result["info_count"],
             result["warning_count"], result["error_count"]),
            (2, 1, 1, 0),
        )
        self.assertEqual(
            [finding["id"] for finding in result["findings"]],
            [str(first.id), str(second.id)],
        )
        self.assertEqual(result["findings"][0]["confidence"], "0.7500")
        self.assertEqual(result["findings"][0]["severity"], "warning")
        self.assertEqual(
            result["findings"][0]["source_document_page_id"], str(page_id),
        )
        self.assertEqual(result["findings"][0]["page_number"], 2)
        self.assertIsNone(result["findings"][1]["source_document_page_id"])
        self.assertIsNone(result["findings"][1]["page_number"])
        self.assertNotIn("deleted_at", str(body))
        self.assertEqual(internal.latest_run, latest)
        self.assertEqual(internal.latest_successful_result, successful)

    @patch("app.api.source_pre_analysis.SourcePreAnalysisReadService")
    def test_pending_and_running_latest_runs_coexist_with_older_success(
        self,
        read_service: MagicMock,
    ) -> None:
        for status_value in (
            SourcePreAnalysisRunStatus.PENDING,
            SourcePreAnalysisRunStatus.RUNNING,
        ):
            with self.subTest(status=status_value):
                source_id = uuid.uuid4()
                latest = self._summary(status=status_value, run_number=7)
                successful_run = self._summary(
                    status=SourcePreAnalysisRunStatus.SUCCEEDED,
                    run_number=6,
                )
                successful = SourcePreAnalysisSuccessfulResultView(
                    run=successful_run, result_id=uuid.uuid4(),
                    schema_version=1, page_count=None,
                    processor_name=None, processor_version=None,
                    provider_name=None, model_name=None, prompt_version=None,
                    finding_count=0,
                    info_count=0, warning_count=0, error_count=0, findings=(),
                )
                read_service.return_value.get_overview.return_value = (
                    self._overview(
                        source_document_id=source_id,
                        latest_run=latest,
                        successful=successful,
                    )
                )

                response = self.client.get(
                    f"/api/v1/sources/{source_id}/pre-analysis",
                )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["latest_run"]["status"], status_value.value)
                self.assertEqual(
                    response.json()["latest_successful_result"]["run"]["status"],
                    "succeeded",
                )
                result = response.json()["latest_successful_result"]
                for field_name in (
                    "processor_name", "processor_version", "provider_name",
                    "model_name", "prompt_version",
                ):
                    self.assertIsNone(result[field_name])

    @patch("app.api.source_pre_analysis.SourcePreAnalysisReadService")
    def test_overview_missing_source_maps_stable_404(
        self,
        read_service: MagicMock,
    ) -> None:
        read_service.return_value.get_overview.side_effect = (
            SourcePreAnalysisReadSourceNotFoundError("internal detail")
        )

        response = self.client.get(
            f"/api/v1/sources/{uuid.uuid4()}/pre-analysis",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(), {"detail": "Source document was not found."},
        )
        self.assertNotIn("internal detail", response.text)


if __name__ == "__main__":
    unittest.main()
