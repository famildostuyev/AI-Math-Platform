from __future__ import annotations

import os
import sys
import unittest
import uuid
from datetime import datetime, timezone
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
from app.api.question_bank import router as question_bank_router
from app.core.enums import QuestionDifficulty, QuestionRevisionStatus, RoleName
from app.database.session import get_db
from app.main import app
from app.schemas.question_bank import (
    QuestionBankListQuery,
    QuestionBankPageRead,
    QuestionBankSort,
)


NOW = datetime(2026, 8, 16, 12, 0, tzinfo=timezone.utc)


class QuestionBankApiTest(unittest.TestCase):
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
    def _response(*, with_topic: bool = False) -> QuestionBankPageRead:
        primary_topic = None
        if with_topic:
            primary_topic = {
                "id": uuid.uuid4(),
                "name": "algebra",
                "display_name": "Algebra",
            }
        return QuestionBankPageRead.model_validate({
            "items": [{
                "question_family_id": uuid.uuid4(),
                "question_form_id": uuid.uuid4(),
                "revision_id": uuid.uuid4(),
                "revision_number": 3,
                "status": "draft",
                "is_current_approved": False,
                "question_type": {
                    "id": uuid.uuid4(),
                    "name": "open_response",
                    "display_name": "Open response",
                },
                "difficulty": None,
                "primary_topic": primary_topic,
                "block_count": 2,
                "text_preview": "Solve the equation.",
                "updated_at": NOW,
            }],
            "page": 1,
            "page_size": 25,
            "total": 1,
            "total_pages": 1,
        })

    @patch("app.api.question_bank.QuestionBankService")
    def test_admin_list_delegates_once_and_returns_exact_public_shape(
        self,
        service_class: MagicMock,
    ) -> None:
        expected = self._response(with_topic=False)
        service_class.return_value.list_questions.return_value = expected

        response = self.client.get("/api/v1/question-bank/questions")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected.model_dump(mode="json"))
        service_class.assert_called_once_with(self.db)
        service_class.return_value.list_questions.assert_called_once()
        item = response.json()["items"][0]
        self.assertEqual(set(item), {
            "question_family_id", "question_form_id", "revision_id",
            "revision_number", "status", "is_current_approved",
            "question_type", "difficulty", "primary_topic", "block_count",
            "text_preview", "updated_at",
        })
        self.assertEqual(set(item["question_type"]), {
            "id", "name", "display_name",
        })
        self.assertIsNone(item["primary_topic"])

    @patch("app.api.question_bank.QuestionBankService")
    def test_defaults_reach_service_as_typed_query(
        self,
        service_class: MagicMock,
    ) -> None:
        service_class.return_value.list_questions.return_value = self._response()

        self.client.get("/api/v1/question-bank/questions")

        query = service_class.return_value.list_questions.call_args.kwargs["query"]
        self.assertIsInstance(query, QuestionBankListQuery)
        self.assertIsNone(query.q)
        self.assertEqual((query.page, query.page_size), (1, 25))
        self.assertEqual(query.sort, QuestionBankSort.UPDATED_DESC)

    @patch("app.api.question_bank.QuestionBankService")
    def test_explicit_query_parameters_delegate_with_domain_types(
        self,
        service_class: MagicMock,
    ) -> None:
        service_class.return_value.list_questions.return_value = self._response(
            with_topic=True
        )
        question_type_id = uuid.uuid4()
        purpose_id = uuid.uuid4()

        response = self.client.get(
            "/api/v1/question-bank/questions",
            params={
                "q": "quadratic",
                "question_type_id": str(question_type_id),
                "status": "approved",
                "difficulty": "hard",
                "purpose_id": str(purpose_id),
                "page": "2",
                "page_size": "10",
                "sort": "created_desc",
            },
        )

        self.assertEqual(response.status_code, 200)
        query = service_class.return_value.list_questions.call_args.kwargs["query"]
        self.assertEqual(query.q, "quadratic")
        self.assertEqual(query.question_type_id, question_type_id)
        self.assertEqual(query.status, QuestionRevisionStatus.APPROVED)
        self.assertEqual(query.difficulty, QuestionDifficulty.HARD)
        self.assertEqual(query.purpose_id, purpose_id)
        self.assertEqual((query.page, query.page_size), (2, 10))
        self.assertEqual(query.sort, QuestionBankSort.CREATED_DESC)

    @patch("app.api.question_bank.QuestionBankService")
    def test_search_whitespace_is_normalized_by_schema(
        self,
        service_class: MagicMock,
    ) -> None:
        service_class.return_value.list_questions.return_value = self._response()

        self.client.get(
            "/api/v1/question-bank/questions",
            params={"q": "   algebra   "},
        )

        query = service_class.return_value.list_questions.call_args.kwargs["query"]
        self.assertEqual(query.q, "algebra")

    @patch("app.api.question_bank.QuestionBankService")
    def test_invalid_query_parameters_return_422_without_service(
        self,
        service_class: MagicMock,
    ) -> None:
        cases = (
            {"page": "0"},
            {"page_size": "0"},
            {"page_size": "101"},
            {"question_type_id": "not-a-uuid"},
            {"status": "archived"},
            {"difficulty": "extreme"},
            {"sort": "difficulty"},
            {"q": "x" * 201},
        )

        for params in cases:
            with self.subTest(params=params):
                service_class.reset_mock()
                response = self.client.get(
                    "/api/v1/question-bank/questions",
                    params=params,
                )
                self.assertEqual(response.status_code, 422)
                service_class.assert_not_called()

    @patch("app.api.question_bank.QuestionBankService")
    def test_unknown_query_parameter_is_rejected(
        self,
        service_class: MagicMock,
    ) -> None:
        response = self.client.get(
            "/api/v1/question-bank/questions?topic_id=unexpected"
        )

        self.assertEqual(response.status_code, 422)
        service_class.assert_not_called()

    @patch("app.api.question_bank.QuestionBankService")
    def test_authentication_and_admin_role_are_enforced_before_service(
        self,
        service_class: MagicMock,
    ) -> None:
        del app.dependency_overrides[get_current_active_user]

        unauthenticated = self.client.get("/api/v1/question-bank/questions")

        self.assertEqual(unauthenticated.status_code, 401)
        service_class.assert_not_called()

        app.dependency_overrides[get_current_active_user] = (
            lambda: self.current_user
        )
        self.db.scalar.return_value = RoleName.TEACHER.value

        forbidden = self.client.get("/api/v1/question-bank/questions")

        self.assertEqual(forbidden.status_code, 403)
        service_class.assert_not_called()

    def test_router_and_application_inventory_contains_one_question_bank_route(
        self,
    ) -> None:
        router_routes = [
            route for route in question_bank_router.routes
            if isinstance(route, APIRoute)
        ]
        self.assertEqual(len(router_routes), 1)
        self.assertEqual(router_routes[0].path, "/question-bank/questions")
        self.assertEqual(router_routes[0].methods, {"GET"})

        openapi_response = self.client.get("/openapi.json")

        self.assertEqual(openapi_response.status_code, 200)

        question_bank_paths = {
            path: {
                method.upper()
                for method in operations
                if method.upper() in {
                    "GET",
                    "POST",
                    "PUT",
                    "PATCH",
                    "DELETE",
                }
            }
            for path, operations in openapi_response.json()["paths"].items()
            if path.startswith("/api/v1/question-bank")
        }
        self.assertEqual(
            question_bank_paths,
            {
                "/api/v1/question-bank/questions": {"GET"},
            },
        )


if __name__ == "__main__":
    unittest.main()
