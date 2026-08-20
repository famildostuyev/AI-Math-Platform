from __future__ import annotations
import os, sys, unittest, uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ["DATABASE_URL"]="postgresql+psycopg2://unused:unused@127.0.0.1:1/unused"
os.environ["APP_ENV"]="testing"
os.environ["DEBUG"]="false"
os.environ["JWT_SECRET_KEY"]="test-jwt-secret-key-00000000000001"
os.environ["REFRESH_TOKEN_HASH_KEY"]="test-refresh-token-hash-key-000001"
os.environ["VERIFICATION_CODE_HASH_KEY"]="test-verification-code-hash-key-01"

BACKEND_DIR=Path(__file__).resolve().parents[1]/"backend"
sys.path.insert(0,str(BACKEND_DIR))

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from app.api.deps import get_current_active_user
from app.api.question_extraction import router as question_extraction_router
from app.core.enums import QuestionExtractionRunStatus, RoleName
from app.database.session import get_db
from app.main import app
from app.services.question_extraction_service import (
    QuestionExtractionActiveRunExistsError,
    QuestionExtractionPersistenceConflictError,
    QuestionExtractionRequestedByUserNotFoundError,
    QuestionExtractionSourceDocumentNotFoundError,
    QuestionExtractionValidationError,
)

class QuestionExtractionApiTest(unittest.TestCase):
    def setUp(self):
        self.db=MagicMock()
        self.db.scalar.return_value=RoleName.ADMIN.value
        self.current_user=SimpleNamespace(id=uuid.uuid4(),last_active_role_id=uuid.uuid4())
        def override_db():
            yield self.db
        app.dependency_overrides[get_db]=override_db
        app.dependency_overrides[get_current_active_user]=lambda:self.current_user
        self.client=TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()

    def _run(self, source_id):
        return SimpleNamespace(
            id=uuid.uuid4(),source_document_id=source_id,run_number=1,
            status=QuestionExtractionRunStatus.PENDING,
            requested_by_user_id=self.current_user.id,
            started_at=None,completed_at=None,failure_message=None,
        )

    def test_router_and_openapi_expose_one_post_route(self):
        routes=[r for r in question_extraction_router.routes if isinstance(r,APIRoute)]
        self.assertEqual(
            {(r.path,frozenset(r.methods)) for r in routes},
            {("/sources/{source_document_id}/question-extraction/runs",frozenset({"POST"}))}
        )
        response=self.client.get("/openapi.json")
        self.assertEqual(response.status_code,200)
        paths=response.json()["paths"]
        path="/api/v1/sources/{source_document_id}/question-extraction/runs"
        self.assertIn(path,paths)
        self.assertIn("post",paths[path])
        self.assertNotIn("requestBody",paths[path]["post"])

    @patch("app.api.question_extraction.QuestionExtractionService")
    def test_admin_create_returns_201_and_delegates_identity(self, service_class):
        source_id=uuid.uuid4()
        run=self._run(source_id)
        service_class.return_value.create_run.return_value=run
        response=self.client.post(f"/api/v1/sources/{source_id}/question-extraction/runs")
        self.assertEqual(response.status_code,201)
        self.assertEqual(set(response.json()),{
            "id","source_document_id","run_number","status",
            "requested_by_user_id","started_at","completed_at","failure_message",
        })
        self.assertEqual(response.json()["source_document_id"],str(source_id))
        self.assertEqual(response.json()["status"],"pending")
        service_class.assert_called_once_with(self.db)
        service_class.return_value.create_run.assert_called_once_with(
            source_document_id=source_id,
            requested_by_user_id=self.current_user.id,
        )
        service_class.return_value.start_run.assert_not_called()
        service_class.return_value.finalize_success.assert_not_called()
        service_class.return_value.mark_failed.assert_not_called()

    @patch("app.api.question_extraction.QuestionExtractionService")
    def test_client_body_cannot_control_server_owned_fields(self, service_class):
        source_id=uuid.uuid4()
        service_class.return_value.create_run.return_value=self._run(source_id)
        response=self.client.post(
            f"/api/v1/sources/{source_id}/question-extraction/runs",
            json={"requested_by_user_id":str(uuid.uuid4()),"run_number":999,
                  "status":"succeeded","failure_message":"browser-controlled"},
        )
        self.assertEqual(response.status_code,201)
        service_class.return_value.create_run.assert_called_once_with(
            source_document_id=source_id,
            requested_by_user_id=self.current_user.id,
        )

    @patch("app.api.question_extraction.QuestionExtractionService")
    def test_create_errors_have_stable_http_contracts(self, service_class):
        cases=(
            (QuestionExtractionSourceDocumentNotFoundError("internal"),404,
             "Source document was not found."),
            (QuestionExtractionActiveRunExistsError("internal"),409,
             "Source document already has an active question extraction run."),
            (QuestionExtractionPersistenceConflictError("internal"),409,
             "Question extraction run could not be created due to a persistence conflict."),
            (QuestionExtractionValidationError("internal"),422,
             "Question extraction run request is invalid."),
            (QuestionExtractionRequestedByUserNotFoundError("internal"),409,
             "Authenticated requesting user is unavailable."),
        )
        for exc,status_code,detail in cases:
            with self.subTest(exception=type(exc).__name__):
                service_class.reset_mock()
                service_class.return_value.create_run.side_effect=exc
                response=self.client.post(
                    f"/api/v1/sources/{uuid.uuid4()}/question-extraction/runs"
                )
                self.assertEqual(response.status_code,status_code)
                self.assertEqual(response.json(),{"detail":detail})
                self.assertNotIn("internal",response.text)
                service_class.return_value.create_run.side_effect=None

    @patch("app.api.question_extraction.QuestionExtractionService")
    def test_authentication_and_admin_role_precede_service(self, service_class):
        source_id=uuid.uuid4()
        del app.dependency_overrides[get_current_active_user]
        response=self.client.post(f"/api/v1/sources/{source_id}/question-extraction/runs")
        self.assertEqual(response.status_code,401)
        service_class.assert_not_called()
        app.dependency_overrides[get_current_active_user]=lambda:self.current_user
        self.db.scalar.return_value=RoleName.TEACHER.value
        response=self.client.post(f"/api/v1/sources/{source_id}/question-extraction/runs")
        self.assertEqual(response.status_code,403)
        service_class.assert_not_called()

if __name__=="__main__":
    unittest.main()
